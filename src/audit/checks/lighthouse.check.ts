import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditCheck, result } from '../types/check.type';
import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from '../types/audit.type';
import type {
  LighthouseRunResult,
  LighthouseRunner,
} from '../providers/lighthouse.provider';
import {
  LIGHTHOUSE_SCORE_GOOD,
  LIGHTHOUSE_SCORE_AVERAGE,
  LIGHTHOUSE_CATEGORY_MAP,
  LIGHTHOUSE_RUNNER,
  LIGHTHOUSE_VITALS,
} from '../audit.constants';

@Injectable()
export class LighthouseCheck implements AuditCheck {
  readonly id = 'lighthouse';
  readonly defaultCategory = AuditCategory.PERFORMANCE;
  readonly timeout = 120_000;

  private readonly logger = new Logger(LighthouseCheck.name);

  constructor(
    @Inject(LIGHTHOUSE_RUNNER) private readonly runner: LighthouseRunner,
  ) {}

  async run(context: AuditContext): Promise<CheckResult[]> {
    let report: LighthouseRunResult;

    try {
      report = await this.runner.run(context.url, context.strategy);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Lighthouse unavailable for ${context.url}: ${reason}`);

      return LIGHTHOUSE_CATEGORY_MAP.map((entry) =>
        result({
          id: `lighthouse.${entry.lighthouseId}`,
          title: entry.title,
          category: entry.category,
          status: CheckStatus.SKIPPED,
          weight: entry.weight,
          evidence: { error: reason, provider: this.runner.provider },
        }),
      );
    }

    return [
      ...this.categoryResults(report),
      ...this.vitalResults(report),
      this.opportunities(report),
    ];
  }

  private categoryResults(report: LighthouseRunResult): CheckResult[] {
    return LIGHTHOUSE_CATEGORY_MAP.map((entry) => {
      const score = report.categories[entry.lighthouseId];

      if (score === null || score === undefined) {
        return result({
          id: `lighthouse.${entry.lighthouseId}`,
          title: entry.title,
          category: entry.category,
          status: CheckStatus.SKIPPED,
          weight: entry.weight,
          evidence: { provider: report.provider },
        });
      }

      let status = CheckStatus.FAIL;
      if (score >= LIGHTHOUSE_SCORE_GOOD) status = CheckStatus.PASS;
      else if (score >= LIGHTHOUSE_SCORE_AVERAGE) status = CheckStatus.WARN;

      return result({
        id: `lighthouse.${entry.lighthouseId}`,
        title: entry.title,
        category: entry.category,
        status,
        weight: entry.weight,
        // Lighthouse gives a continuous score, so use it instead of the
        // coarse pass/warn/fail default.
        score,
        evidence: {
          score: Math.round(score * 100),
          provider: report.provider,
          fetchedUrl: report.fetchedUrl,
        },
        remediation: `Lighthouse scored ${entry.lighthouseId} at ${Math.round(
          score * 100,
        )}/100. Open the category in the full report for the specific failing audits.`,
      });
    });
  }

  private vitalResults(report: LighthouseRunResult): CheckResult[] {
    return LIGHTHOUSE_VITALS.map((vital) => {
      const value = report.metrics[vital.key];

      if (value === null) {
        return result({
          id: vital.id,
          title: vital.title,
          category: AuditCategory.PERFORMANCE,
          status: CheckStatus.SKIPPED,
          weight: 2,
        });
      }

      let status = CheckStatus.FAIL;
      if (value <= vital.good) status = CheckStatus.PASS;
      else if (value <= vital.poor) status = CheckStatus.WARN;

      const rounded =
        vital.unit === 'ms' ? Math.round(value) : Number(value.toFixed(3));

      return result({
        id: vital.id,
        title: vital.title,
        category: AuditCategory.PERFORMANCE,
        status,
        weight: 2,
        evidence: {
          value: rounded,
          unit: vital.unit || 'score',
          goodThreshold: vital.good,
          poorThreshold: vital.poor,
        },
        remediation: `${vital.title} was ${rounded}${vital.unit} - aim for ${vital.good}${vital.unit} or less.`,
      });
    });
  }

  private opportunities(report: LighthouseRunResult): CheckResult {
    const { opportunities } = report;
    const totalSavings = opportunities.reduce(
      (sum, item) => sum + item.savingsMs,
      0,
    );

    let status = CheckStatus.PASS;
    if (totalSavings > 3000) status = CheckStatus.FAIL;
    else if (totalSavings > 1000) status = CheckStatus.WARN;

    return result({
      id: 'lighthouse.opportunities',
      title: 'Outstanding performance opportunities',
      category: AuditCategory.PERFORMANCE,
      status,
      weight: 1,
      evidence: { totalSavingsMs: totalSavings, opportunities },
      remediation: opportunities.length
        ? `Lighthouse estimates ${totalSavings}ms of savings, led by "${opportunities[0].title}".`
        : 'No significant opportunities reported.',
    });
  }
}
