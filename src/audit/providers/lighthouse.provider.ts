import { AuditStrategy, LighthouseProvider } from '../types/audit.type';

export interface LighthouseMetrics {
  /** Largest Contentful Paint, ms. */
  lcp: number | null;
  /** Cumulative Layout Shift, unitless. */
  cls: number | null;
  /** Total Blocking Time, ms. */
  tbt: number | null;
  /** First Contentful Paint, ms. */
  fcp: number | null;
  /** Speed Index, ms. */
  speedIndex: number | null;
}

export interface LighthouseOpportunity {
  id: string;
  title: string;
  savingsMs: number;
}

export interface LighthouseRunResult {
  provider: LighthouseProvider;
  /** Category id -> 0-1 score, exactly as Lighthouse reports it. */
  categories: Record<string, number | null>;
  metrics: LighthouseMetrics;
  opportunities: LighthouseOpportunity[];
  fetchedUrl: string;
}

/** DI token for whichever runner the config selected. */
export const LIGHTHOUSE_RUNNER = Symbol('LIGHTHOUSE_RUNNER');

export interface LighthouseRunner {
  readonly provider: LighthouseProvider;
  run(url: string, strategy: AuditStrategy): Promise<LighthouseRunResult>;
}

/** Shared shape of the Lighthouse JSON both providers ultimately produce. */
export interface RawLighthouseReport {
  requestedUrl?: string;
  finalUrl?: string;
  finalDisplayedUrl?: string;
  categories?: Record<string, { score?: number | null }>;
  audits?: Record<
    string,
    {
      id?: string;
      title?: string;
      numericValue?: number;
      details?: { overallSavingsMs?: number };
    }
  >;
}

const metric = (report: RawLighthouseReport, id: string): number | null =>
  report.audits?.[id]?.numericValue ?? null;

/** Normalises a raw Lighthouse report into our provider-agnostic shape. */
export const normaliseReport = (
  report: RawLighthouseReport,
  provider: LighthouseProvider,
): LighthouseRunResult => {
  const categories: Record<string, number | null> = {};
  for (const [id, category] of Object.entries(report.categories ?? {})) {
    categories[id] = category?.score ?? null;
  }

  const opportunities = Object.values(report.audits ?? {})
    .filter((audit) => (audit.details?.overallSavingsMs ?? 0) > 100)
    .map((audit) => ({
      id: audit.id ?? 'unknown',
      title: audit.title ?? '',
      savingsMs: Math.round(audit.details?.overallSavingsMs ?? 0),
    }))
    .sort((a, b) => b.savingsMs - a.savingsMs)
    .slice(0, 10);

  return {
    provider,
    categories,
    opportunities,
    fetchedUrl:
      report.finalDisplayedUrl ?? report.finalUrl ?? report.requestedUrl ?? '',
    metrics: {
      lcp: metric(report, 'largest-contentful-paint'),
      cls: metric(report, 'cumulative-layout-shift'),
      tbt: metric(report, 'total-blocking-time'),
      fcp: metric(report, 'first-contentful-paint'),
      speedIndex: metric(report, 'speed-index'),
    },
  };
};
