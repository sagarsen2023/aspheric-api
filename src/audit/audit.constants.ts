import { AuditCategory, CheckStatus } from './types/audit.type';
import type { LighthouseRunResult } from './providers/lighthouse.provider';

export const AUDIT_QUEUE = 'website-audit';
export const AUDIT_JOB = 'run-audit';

export interface AuditJobData {
  auditId: string;
  lockKey: string;
}

// --- Grading ---
export const GRADES: Array<[number, string]> = [
  [90, 'A'],
  [80, 'B'],
  [70, 'C'],
  [60, 'D'],
  [0, 'F'],
];

/** Grade stored on audits that have no score yet (queued, running or failed). */
export const GRADE_NOT_AVAILABLE = 'N/A';

/** Every grade an audit can carry, best first. */
export const AUDIT_GRADES = [
  ...GRADES.map(([, grade]) => grade),
  GRADE_NOT_AVAILABLE,
];

// --- Audit service ---
/** Window the analytics cover when the caller gives no start date. */
export const ANALYTICS_DEFAULT_RANGE_DAYS = 30;

/** User fields populated onto an audit's createdBy. */
export const AUDIT_USER_POPULATED_FIELDS = 'name email';

// --- Runner ---
export const DEFAULT_CHECK_TIMEOUT = 30_000;

// --- Config ---
export const AUDIT_CONFIG_NAMESPACE = 'audit';

// --- Headers check ---
/** Six months, the minimum max-age hstspreload.org will accept. */
export const HSTS_MIN_AGE = 15_768_000;

export const LEAKY_HEADERS = [
  'server',
  'x-powered-by',
  'x-aspnet-version',
  'x-aspnetmvc-version',
  'x-generator',
  'x-drupal-cache',
];

// --- Lighthouse check ---
/** Lighthouse's own thresholds: >=0.9 green, >=0.5 orange, below that red. */
export const LIGHTHOUSE_SCORE_GOOD = 0.9;

export const LIGHTHOUSE_SCORE_AVERAGE = 0.5;

export const LIGHTHOUSE_CATEGORY_MAP: Array<{
  lighthouseId: string;
  category: AuditCategory;
  title: string;
  weight: number;
}> = [
  {
    lighthouseId: 'performance',
    category: AuditCategory.PERFORMANCE,
    title: 'Lighthouse performance',
    weight: 5,
  },
  {
    lighthouseId: 'accessibility',
    category: AuditCategory.ACCESSIBILITY,
    title: 'Lighthouse accessibility',
    weight: 5,
  },
  {
    lighthouseId: 'best-practices',
    category: AuditCategory.SECURITY,
    title: 'Lighthouse best practices',
    weight: 2,
  },
  {
    lighthouseId: 'seo',
    category: AuditCategory.SEO,
    title: 'Lighthouse SEO',
    weight: 3,
  },
];

/** Core Web Vitals "good" thresholds, per web.dev. */
export const LIGHTHOUSE_VITALS: Array<{
  key: keyof LighthouseRunResult['metrics'];
  id: string;
  title: string;
  good: number;
  poor: number;
  unit: string;
}> = [
  {
    key: 'lcp',
    id: 'lighthouse.lcp',
    title: 'Largest Contentful Paint',
    good: 2500,
    poor: 4000,
    unit: 'ms',
  },
  {
    key: 'cls',
    id: 'lighthouse.cls',
    title: 'Cumulative Layout Shift',
    good: 0.1,
    poor: 0.25,
    unit: '',
  },
  {
    key: 'tbt',
    id: 'lighthouse.tbt',
    title: 'Total Blocking Time',
    good: 200,
    poor: 600,
    unit: 'ms',
  },
];

// --- Checks ---
/** DI token for the array of every registered check. */
export const AUDIT_CHECKS = Symbol('AUDIT_CHECKS');

export const DEFAULT_CHECK_SCORE: Record<CheckStatus, number> = {
  [CheckStatus.PASS]: 1,
  [CheckStatus.WARN]: 0.5,
  [CheckStatus.FAIL]: 0,
  [CheckStatus.SKIPPED]: 0,
};

// --- SEO check ---
export const SEO_TITLE_MIN = 10;

export const SEO_TITLE_MAX = 60;

export const SEO_DESCRIPTION_MIN = 50;

export const SEO_DESCRIPTION_MAX = 160;

export const SEO_ICON_PROBE_TIMEOUT = 8_000;

// --- Free-audit access ---
export const FREE_AUDIT_PREFIX = 'audit:free:';

export const FREE_AUDIT_WINDOW_SECONDS = 24 * 60 * 60;

// --- DNS check ---
export const DNS_RESOLVE_TIMEOUT = 5_000;

// --- URL guard (SSRF) ---
export const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // RFC1918 private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local / cloud metadata
  ['172.16.0.0', 12], // RFC1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // RFC1918 private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

// --- Local Lighthouse provider ---
export const CHROME_FLAGS = [
  '--headless=new',
  '--no-sandbox', // required in most container runtimes
  '--disable-gpu',
  '--disable-dev-shm-usage', // /dev/shm is tiny in Docker; avoids crashes
  '--disable-extensions',
];

export const DESKTOP_SCREEN = {
  mobile: false,
  width: 1350,
  height: 940,
  deviceScaleFactor: 1,
  disabled: false,
};

// --- Crawlability check ---
export const CRAWLABILITY_PROBE_TIMEOUT = 8_000;

/** Beyond these a sitemap is slow or bulky enough that crawlers start skipping it. */
export const SITEMAP_WARN_BYTES = 256 * 1024;

export const SITEMAP_WARN_MS = 3_000;

// --- Delivery check ---
export const TTFB_GOOD = 800;

export const TTFB_POOR = 1_800;

export const CDN_SIGNATURES: Array<[string, RegExp]> = [
  ['cloudflare', /cloudflare/i],
  ['fastly', /fastly/i],
  ['akamai', /akamai/i],
  ['cloudfront', /cloudfront/i],
  ['vercel', /vercel/i],
  ['netlify', /netlify/i],
];

// --- PageSpeed Insights provider ---
export const PSI_ENDPOINT =
  'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export const PSI_CATEGORIES = [
  'performance',
  'accessibility',
  'best-practices',
  'seo',
];

// --- Lighthouse provider ---
/** DI token for whichever runner the config selected. */
export const LIGHTHOUSE_RUNNER = Symbol('LIGHTHOUSE_RUNNER');

// --- Site fetcher ---
export const FETCH_MAX_REDIRECTS = 5;

export const FETCH_MAX_BODY_BYTES = 5 * 1024 * 1024;

export const FETCH_DEFAULT_TIMEOUT = 20_000;

export const FETCH_USER_AGENT =
  'Mozilla/5.0 (compatible; AsphericReadinessBot/1.0; +https://aspheric.app)';

// --- TLS check ---
export const TLS_HANDSHAKE_TIMEOUT = 10_000;

export const TLS_REDIRECT_PROBE_TIMEOUT = 8_000;

export const DAY_MS = 24 * 60 * 60 * 1000;

// --- In-flight lock ---
export const INFLIGHT_LOCK_RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

// --- Audit entity ---
export const AUDIT_TTL_SECONDS = 2_592_000;

// --- Rate limiting ---
export const RATE_LIMIT_KEY = 'rate-limit-options';

// --- Scoring ---
/**
 * How much each category contributes to the overall readiness score. Security
 * and performance dominate because they are the two that actually stop a site
 * from being production-ready.
 */
export const CATEGORY_WEIGHTS: Record<AuditCategory, number> = {
  [AuditCategory.SECURITY]: 3,
  [AuditCategory.PERFORMANCE]: 3,
  [AuditCategory.ACCESSIBILITY]: 2,
  [AuditCategory.SEO]: 2,
  [AuditCategory.DELIVERY]: 1.5,
  [AuditCategory.CRAWLABILITY]: 1,
};

export const MIN_RELIABLE_COVERAGE = 0.5;
