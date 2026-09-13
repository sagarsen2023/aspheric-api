import { Injectable } from '@nestjs/common';
import {
  AuditCategory,
  AuditReport,
  CategoryScore,
  CheckResult,
  CheckStatus,
} from '../types/audit.type';

/**
 * How much each category contributes to the overall readiness score. Security
 * and performance dominate because they are the two that actually stop a site
 * from being production-ready.
 */
const CATEGORY_WEIGHTS: Record<AuditCategory, number> = {
  [AuditCategory.SECURITY]: 3,
  [AuditCategory.PERFORMANCE]: 3,
  [AuditCategory.ACCESSIBILITY]: 2,
  [AuditCategory.SEO]: 2,
  [AuditCategory.DELIVERY]: 1.5,
  [AuditCategory.CRAWLABILITY]: 1,
};

/**
 * Below this share of a category's weight, the surviving checks are too thin a
 * basis for the score to mean much - e.g. "accessibility 100" resting on an
 * image-alt check alone because Lighthouse was unavailable.
 */
const MIN_RELIABLE_COVERAGE = 0.5;

const GRADES: Array<[number, string]> = [
  [90, 'A'],
  [80, 'B'],
  [70, 'C'],
  [60, 'D'],
  [0, 'F'],
];

export const gradeFor = (score: number | null): string => {
  if (score === null) return 'N/A';
  return GRADES.find(([threshold]) => score >= threshold)?.[1] ?? 'F';
};

@Injectable()
export class ScoringService {
  /**
   * Skipped checks are excluded from both numerator and denominator, so a
   * check that could not run lowers confidence rather than the score. A
   * category where everything was skipped scores null, not zero.
   */
  score(checks: CheckResult[]): AuditReport {
    const categories = Object.values(AuditCategory)
      .map((category) => this.scoreCategory(category, checks))
      .filter((entry) => entry.passed + entry.warned + entry.failed + entry.skipped > 0);

    const scored = categories.filter((entry) => entry.score !== null);

    const totalWeight = scored.reduce(
      (sum, entry) => sum + CATEGORY_WEIGHTS[entry.category],
      0,
    );

    const overall = totalWeight
      ? Math.round(
          scored.reduce(
            (sum, entry) =>
              sum + (entry.score ?? 0) * CATEGORY_WEIGHTS[entry.category],
            0,
          ) / totalWeight,
        )
      : null;

    return {
      score: overall,
      grade: gradeFor(overall),
      categories,
      checks,
    };
  }

  private scoreCategory(
    category: AuditCategory,
    checks: CheckResult[],
  ): CategoryScore {
    const relevant = checks.filter((check) => check.category === category);
    const counted = relevant.filter(
      (check) => check.status !== CheckStatus.SKIPPED,
    );

    const weight = counted.reduce((sum, check) => sum + check.weight, 0);
    const earned = counted.reduce(
      (sum, check) => sum + check.score * check.weight,
      0,
    );
    const totalWeight = relevant.reduce((sum, check) => sum + check.weight, 0);

    const score = weight ? Math.round((earned / weight) * 100) : null;
    const coverage = totalWeight ? weight / totalWeight : 0;

    return {
      category,
      score,
      grade: gradeFor(score),
      coverage: Number(coverage.toFixed(2)),
      reliable: score !== null && coverage >= MIN_RELIABLE_COVERAGE,
      passed: relevant.filter((check) => check.status === CheckStatus.PASS).length,
      warned: relevant.filter((check) => check.status === CheckStatus.WARN).length,
      failed: relevant.filter((check) => check.status === CheckStatus.FAIL).length,
      skipped: relevant.filter((check) => check.status === CheckStatus.SKIPPED)
        .length,
    };
  }
}
