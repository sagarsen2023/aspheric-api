import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import type { ConfigType } from '@nestjs/config';
import { auditConfig } from './audit.config';
import { Queue } from 'bullmq';
import { FlattenMaps, Model, QueryFilter, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { Audit, AuditDocument } from './entities/audit.entity';
import { EnrichedCheckResult, withImpact } from './checks/check-impact';
import { CreateAuditDto, FindAuditsDto } from './dto/audit.dto';
import { AuditRunnerService } from './audit-runner.service';
import { assertSafeUrl } from './providers/url-guard';
import { AUDIT_JOB, AUDIT_QUEUE, AuditJobData } from './audit.constants';
import { AuditStatus, AuditStrategy, CategoryScore } from './types/audit.type';
import { withCategoryWeights } from './scoring/scoring.service';
import { InflightLockService } from './providers/inflight-lock.service';
import { normalizeUrl } from '../../utils/normalize-url';
import { UserDocument } from '../user/entities/user.entity';
import { UserRoles } from '../user/types/user.type';
import { escapeRegExp } from '../../utils/escape-regex-expressions';

export type AuditReportResponse = Omit<
  FlattenMaps<Audit>,
  'checks' | 'categories'
> & {
  _id: Types.ObjectId;
  updatedAt?: Date;
  categories: CategoryScore[];
  checks: EnrichedCheckResult[];
};

export type AuditListItemResponse = Omit<AuditReportResponse, 'checks'>;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly auditUserPopulatedFields = 'name email';

  constructor(
    @InjectModel(Audit.name) private readonly auditModel: Model<Audit>,
    @InjectQueue(AUDIT_QUEUE) private readonly auditQueue: Queue<AuditJobData>,
    private readonly auditRunnerService: AuditRunnerService,
    private readonly inflightLockService: InflightLockService,
    @Inject(auditConfig.KEY)
    private readonly config: ConfigType<typeof auditConfig>,
  ) {}

  async create({
    createAuditDto,
    clientId,
    user,
  }: {
    createAuditDto: CreateAuditDto;
    clientId: string;
    user?: UserDocument;
  }): Promise<AuditDocument> {
    const { url } = await assertSafeUrl(createAuditDto.url);
    const strategy = createAuditDto.strategy ?? AuditStrategy.MOBILE;
    const normalizedUrl = normalizeUrl(url.toString());

    if (!createAuditDto.refresh) {
      const cached = await this.findRecent(normalizedUrl, strategy);
      if (cached) return cached;
    }

    const auditId = randomUUID();
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
      const createdBy =
        user?.role === UserRoles.USER
          ? new Types.ObjectId(user._id)
          : undefined;

      const audit = await this.auditModel.create({
        auditId,
        url: url.toString(),
        normalizedUrl,
        strategy,
        status: AuditStatus.QUEUED,
        createdBy,
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
      await this.inflightLockService.release(lockKey, auditId);
      throw error;
    }
  }

  async releaseInflight(lockKey: string, auditId: string): Promise<void> {
    await this.inflightLockService.release(lockKey, auditId);
  }

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

      throw error;
    }
  }

  async findOne(auditId: string): Promise<AuditReportResponse> {
    const audit = await this.auditModel.findOne({ auditId }).lean();
    if (!audit) throw new NotFoundException(`No audit found for id ${auditId}`);
    return {
      ...audit,
      categories: withCategoryWeights(audit.categories),
      checks: withImpact(audit.checks),
    };
  }

  async findAll({
    findAuditsDto,
    user,
  }: {
    findAuditsDto: FindAuditsDto;
    user?: UserDocument;
  }): Promise<{ data: AuditListItemResponse[]; totalCount: number }> {
    const filter: QueryFilter<Audit> = {};
    const { skip, limit } = findAuditsDto;

    if (findAuditsDto.url) {
      let term: string;
      try {
        term = normalizeUrl(findAuditsDto.url);
      } catch {
        term = findAuditsDto.url;
      }
      filter.normalizedUrl = { $regex: escapeRegExp(term), $options: 'i' };
    }
    if (findAuditsDto.strategy) filter.strategy = findAuditsDto.strategy;

    if (user?.role === UserRoles.USER) {
      filter.createdBy = user._id.toString();
    }

    const [data, totalCount] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip ?? 0)
        .limit(limit ?? 10)
        .select('-checks')
        .populate('createdBy', this.auditUserPopulatedFields)
        .lean(),
      this.auditModel.countDocuments(filter),
    ]);

    return {
      data: data.map(({ checks: _checks, ...audit }) => ({
        ...audit,
        categories: withCategoryWeights(audit.categories),
      })),
      totalCount,
    };
  }

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
        status: {
          $in: [AuditStatus.COMPLETED, AuditStatus.QUEUED, AuditStatus.RUNNING],
        },
        createdAt: { $gte: new Date(Date.now() - ttlSeconds * 1000) },
      })
      .sort({ createdAt: -1 });
  }

  async assignAuditToPerson({
    userId,
    auditId,
  }: {
    auditId: string;
    userId: Types.ObjectId;
  }) {
    const auditsByUser = await this.auditModel
      .countDocuments({
        createdBy: userId,
      })
      .populate('createdBy', this.auditUserPopulatedFields);

    if (auditsByUser > 0) {
      throw new BadRequestException(
        'You cannot assign this audit with your account',
      );
    }

    const audit = await this.auditModel.findOne({
      auditId,
    });

    if (!audit) {
      return;
    }

    audit.createdBy = userId;

    return await audit.save();
  }
}
