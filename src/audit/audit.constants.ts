export const AUDIT_QUEUE = 'website-audit';
export const AUDIT_JOB = 'run-audit';

export interface AuditJobData {
  auditId: string;
  /**
   * The per-client in-flight lock to release once this job is finished. Kept
   * on the job rather than the audit document so it disappears with the job
   * and never outlives the thing it guards.
   */
  lockKey: string;
}
