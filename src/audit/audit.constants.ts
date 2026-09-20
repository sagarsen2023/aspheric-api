export const AUDIT_QUEUE = 'website-audit';
export const AUDIT_JOB = 'run-audit';

export interface AuditJobData {
  auditId: string;
  lockKey: string;
}
