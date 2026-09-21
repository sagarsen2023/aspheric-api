import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from './audit.type';
import { DEFAULT_CHECK_SCORE } from '../audit.constants';

export interface AuditCheck {
  readonly id: string;
  readonly defaultCategory: AuditCategory;
  readonly timeout?: number;
  run(context: AuditContext): Promise<CheckResult[]>;
}

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
  score: DEFAULT_CHECK_SCORE[input.status],
  ...input,
});

/** `pass` when the predicate holds, otherwise `fail` - the most common shape. */
export const verdict = (ok: boolean, onFail = CheckStatus.FAIL): CheckStatus =>
  ok ? CheckStatus.PASS : onFail;

export type { AuditContext };
