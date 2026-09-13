import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AUDIT_QUEUE, AuditJobData } from './audit.constants';
import { auditConcurrency } from './audit.config';
import { AuditService } from './audit.service';

@Processor(AUDIT_QUEUE, { concurrency: auditConcurrency() })
export class AuditProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(private readonly auditService: AuditService) {
    super();
  }

  async process(job: Job<AuditJobData>): Promise<void> {
    const { auditId, lockKey } = job.data;
    this.logger.log(`Running audit ${auditId} (attempt ${job.attemptsMade + 1})`);

    try {
      await this.auditService.process(auditId);
    } catch (error) {
      // Hold the client's lock across a retry - the same audit is still in
      // flight, so letting a new one in would break the one-at-a-time promise.
      // Once no attempt remains, release it or the client stays blocked until
      // the TTL expires.
      if (this.isFinalAttempt(job)) {
        await this.auditService.releaseInflight(lockKey, auditId);
      }
      throw error;
    }

    await this.auditService.releaseInflight(lockKey, auditId);
  }

  private isFinalAttempt(job: Job<AuditJobData>): boolean {
    return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  }
}
