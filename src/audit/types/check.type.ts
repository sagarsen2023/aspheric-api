import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from './audit.type';

/** DI token for the array of every registered check. */
export const AUDIT_CHECKS = Symbol('AUDIT_CHECKS');

export interface AuditCheck {
  /** Stable identifier, also used to namespace the results it emits. */
  readonly id: string;
  /** Where a failure of the check itself gets reported. */
  readonly defaultCategory: AuditCategory;
  /** How long this check may take before the runner gives up on it. */
  readonly timeout?: number;
  run(context: AuditContext): Promise<CheckResult[]>;
}

const DEFAULT_SCORE: Record<CheckStatus, number> = {
  [CheckStatus.PASS]: 1,
  [CheckStatus.WARN]: 0.5,
  [CheckStatus.FAIL]: 0,
  [CheckStatus.SKIPPED]: 0,
};

/** Builds a CheckResult, defaulting `score` from `status`. */
export const result = (input: {
  id: string;
  title: string;
  category: AuditCategory;
  status: CheckStatus;
  weight?: number;
  score?: number;
  evidence?: Record<string, unknown>;
  remediation?: string;
}): CheckResult => ({
  weight: 1,
  score: DEFAULT_SCORE[input.status],
  ...input,
});

/** `pass` when the predicate holds, otherwise `fail` - the most common shape. */
export const verdict = (ok: boolean, onFail = CheckStatus.FAIL): CheckStatus =>
  ok ? CheckStatus.PASS : onFail;

export type { AuditContext };
