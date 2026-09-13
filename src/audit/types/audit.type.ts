export enum AuditCategory {
  PERFORMANCE = 'performance',
  ACCESSIBILITY = 'accessibility',
  SECURITY = 'security',
  SEO = 'seo',
  DELIVERY = 'delivery',
  CRAWLABILITY = 'crawlability',
}

export enum AuditStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum CheckStatus {
  PASS = 'pass',
  WARN = 'warn',
  FAIL = 'fail',
  SKIPPED = 'skipped',
}

export enum LighthouseProvider {
  PSI = 'psi',
  LOCAL = 'local',
}

export enum AuditStrategy {
  MOBILE = 'mobile',
  DESKTOP = 'desktop',
}

export interface CheckResult {
  id: string;
  title: string;
  category: AuditCategory;
  status: CheckStatus;
  weight: number;
  score: number;
  evidence?: Record<string, unknown>;
  remediation?: string;
}

export interface CategoryScore {
  category: AuditCategory;
  score: number | null;
  grade: string;
  passed: number;
  warned: number;
  failed: number;
  skipped: number;
  /**
   * Share of this category's total weight that actually ran, 0-1. A score of
   * 100 built from one surviving check is not the same claim as one built from
   * ten, and without this the consumer cannot tell them apart.
   */
  coverage: number;
  /** False when too little of the category ran to trust the score. */
  reliable: boolean;
}

export interface AuditReport {
  score: number | null;
  grade: string;
  categories: CategoryScore[];
  checks: CheckResult[];
}

export interface AuditContext {
  url: string;
  origin: string;
  hostname: string;
  strategy: AuditStrategy;
  response: {
    finalUrl: string;
    statusCode: number;
    headers: Record<string, string>;
    setCookie: string[];
    body: string;
    ttfb: number;
    totalTime: number;
    redirectChain: string[];
  };
}
