import { AuditStrategy, LighthouseProvider } from '../types/audit.type';

export interface LighthouseMetrics {
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  fcp: number | null;
  speedIndex: number | null;
}

export interface LighthouseOpportunity {
  id: string;
  title: string;
  savingsMs: number;
}

export interface LighthouseRunResult {
  provider: LighthouseProvider;

  categories: Record<string, number | null>;
  metrics: LighthouseMetrics;
  opportunities: LighthouseOpportunity[];
  fetchedUrl: string;
}

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
