import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
// `import type`: emitDecoratorMetadata cannot reference a value-imported type
// from a decorated constructor signature.
import type { ConfigType } from '@nestjs/config';
import { auditConfig } from './audit.config';
import { Queue } from 'bullmq';
import { FlattenMaps, Model, Types } from 'mongoose';
import { uuid } from '../../utils/uuid';
import { Audit, AuditDocument } from './entities/audit.entity';
import { EnrichedCheckResult, withImpact } from './checks/check-impact';
import { CreateAuditDto, FindAuditsDto } from './dto/audit.dto';
import { AuditRunnerService } from './audit-runner.service';
import { assertSafeUrl } from './providers/url-guard';
import { AUDIT_JOB, AUDIT_QUEUE, AuditJobData } from './audit.constants';
import { AuditStatus, AuditStrategy } from './types/audit.type';
import { InflightLockService } from './providers/inflight-lock.service';

/**
 * A stored report as the API returns it: the plain document, with each check
 * carrying the static `impact` copy that is merged in on read.
 */
export type AuditReportResponse = Omit<FlattenMaps<Audit>, 'checks'> & {
  _id: Types.ObjectId;
  updatedAt?: Date;
  checks: EnrichedCheckResult[];
};

/** Drops the fragment and lowercases the host so cache keys line up. */
export const normalizeUrl = (input: string): string => {
  const url = new URL(input);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname === '/') url.pathname = '';
  return url.toString();
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(Audit.name) private readonly auditModel: Model<Audit>,
    @InjectQueue(AUDIT_QUEUE) private readonly auditQueue: Queue<AuditJobData>,
    private readonly auditRunnerService: AuditRunnerService,
    private readonly inflightLockService: InflightLockService,
    @Inject(auditConfig.KEY)
    private readonly config: ConfigType<typeof auditConfig>,
  ) {}

  /**
   * Validates the URL up front so an unreachable or private target is a 400 on
   * this request rather than a failed job the caller has to poll for, then
   * hands the slow part to the queue.
   */
  async create(
    createAuditDto: CreateAuditDto,
    clientId: string,
  ): Promise<AuditDocument> {
    const { url } = await assertSafeUrl(createAuditDto.url);
    const strategy = createAuditDto.strategy ?? AuditStrategy.MOBILE;
    const normalizedUrl = normalizeUrl(url.toString());

    // Served from cache before taking the lock: returning an existing report
    // costs nothing, so it should never be blocked by a running audit.
    if (!createAuditDto.refresh) {
      const cached = await this.findRecent(normalizedUrl, strategy);
      if (cached) return cached;
    }

    const auditId = uuid();
    const lockKey = this.inflightLockService.key(clientId);

    const { acquired, heldBy } = await this.inflightLockService.acquire(
      lockKey,
      auditId,
      this.config.inflightLockTtl,
    );

    if (!acquired) {
      throw new ConflictException(
        heldBy
          ? `An audit is already running for this client. Wait for ${heldBy} to finish, or poll GET /audit/${heldBy}.`
          : 'An audit is already running for this client. Only one audit may run at a time.',
      );
    }

    try {
      const audit = await this.auditModel.create({
        auditId,
        url: url.toString(),
        normalizedUrl,
        strategy,
        status: AuditStatus.QUEUED,
      });

      await this.auditQueue.add(
        AUDIT_JOB,
        { auditId, lockKey },
        {
          jobId: auditId,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 3_600, count: 500 },
          removeOnFail: { age: 86_400 },
        },
      );

      return audit;
    } catch (error) {
      // Nothing will ever run to release it, so hand the lock back now rather
      // than leaving the client blocked until the TTL expires.
      await this.inflightLockService.release(lockKey, auditId);
      throw error;
    }
  }

  /** Called by the processor once a job will not be retried again. */
  async releaseInflight(lockKey: string, auditId: string): Promise<void> {
    await this.inflightLockService.release(lockKey, auditId);
  }

  /** Runs the audit and records the outcome. Called by the queue processor. */
  async process(auditId: string): Promise<void> {
    const audit = await this.auditModel.findOne({ auditId });
    if (!audit) {
      this.logger.warn(`Job referenced unknown audit ${auditId}, dropping it`);
      return;
    }

    const startedAt = new Date();
    await this.auditModel.updateOne(
      { auditId },
      { status: AuditStatus.RUNNING, startedAt },
    );

    try {
      const report = await this.auditRunnerService.run(
        audit.url,
        audit.strategy,
      );
      const finishedAt = new Date();

      await this.auditModel.updateOne(
        { auditId },
        {
          status: AuditStatus.COMPLETED,
          score: report.score,
          grade: report.grade,
          categories: report.categories,
          checks: report.checks,
          error: null,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
      );

      this.logger.log(
        `Audit ${auditId} for ${audit.url} scored ${report.score ?? 'n/a'} (${report.grade})`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const finishedAt = new Date();

      await this.auditModel.updateOne(
        { auditId },
        {
          status: AuditStatus.FAILED,
          error: reason,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
      );

      // Rethrow so BullMQ records the failure and applies its retry policy.
      throw error;
    }
  }

  /**
   * Returns a lean object rather than the document so the static impact copy
   * can be merged in without persisting it - see check-impact.ts for why it is
   * attached here instead of at check time.
   */
  async findOne(auditId: string): Promise<AuditReportResponse> {
    const audit = await this.auditModel.findOne({ auditId }).lean();
    if (!audit) throw new NotFoundException(`No audit found for id ${auditId}`);
    return { ...audit, checks: withImpact(audit.checks) };
  }

  async findAll(
    findAuditsDto: FindAuditsDto,
  ): Promise<{ data: AuditDocument[]; totalCount: number }> {
    const filter: Record<string, unknown> = {};

    if (findAuditsDto.url) {
      try {
        filter.normalizedUrl = normalizeUrl(findAuditsDto.url);
      } catch {
        // An unparseable filter matches nothing rather than erroring.
        filter.normalizedUrl = findAuditsDto.url;
      }
    }
    if (findAuditsDto.strategy) filter.strategy = findAuditsDto.strategy;

    const [data, totalCount] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(20)
        // The full check list is large; the summary is enough for a listing.
        .select('-checks'),
      this.auditModel.countDocuments(filter),
    ]);

    return { data, totalCount };
  }

  /** Most recent completed audit still inside the cache window, if any. */
  private async findRecent(
    normalizedUrl: string,
    strategy: AuditStrategy,
  ): Promise<AuditDocument | null> {
    const ttlSeconds = this.config.cacheTtl;
    if (ttlSeconds <= 0) return null;

    return this.auditModel
      .findOne({
        normalizedUrl,
        strategy,
        status: { $in: [AuditStatus.COMPLETED, AuditStatus.QUEUED, AuditStatus.RUNNING] },
        createdAt: { $gte: new Date(Date.now() - ttlSeconds * 1000) },
      })
      .sort({ createdAt: -1 });
  }
}
