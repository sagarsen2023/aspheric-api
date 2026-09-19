import { Injectable } from '@nestjs/common';
import {
  AuditCategory,
  AuditReport,
  CategoryScore,
  CategoryScoreBase,
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

const overallScore = (categories: CategoryScoreBase[]): number | null => {
  const scored = categories.filter((entry) => entry.score !== null);
  const totalWeight = scored.reduce(
    (sum, entry) => sum + CATEGORY_WEIGHTS[entry.category],
    0,
  );
  if (!totalWeight) return null;

  return Math.round(
    scored.reduce(
      (sum, entry) =>
        sum + (entry.score ?? 0) * CATEGORY_WEIGHTS[entry.category],
      0,
    ) / totalWeight,
  );
};

export const applyCategoryWeights = (
  categories: CategoryScoreBase[],
): CategoryScore[] => {
  const scored = categories.filter((entry) => entry.score !== null);
  const totalWeight = scored.reduce(
    (sum, entry) => sum + CATEGORY_WEIGHTS[entry.category],
    0,
  );
  const overall = overallScore(categories);

  const exact = scored.map((entry) => ({
    category: entry.category,
    value:
      ((entry.score ?? 0) * CATEGORY_WEIGHTS[entry.category]) / totalWeight,
  }));
  const points = new Map(
    exact.map((entry) => [entry.category, Math.floor(entry.value)]),
  );
  let remainder =
    (overall ?? 0) -
    [...points.values()].reduce((sum, value) => sum + value, 0);

  for (const entry of [...exact].sort(
    (a, b) => (b.value % 1) - (a.value % 1),
  )) {
    if (remainder <= 0) break;
    points.set(entry.category, (points.get(entry.category) ?? 0) + 1);
    remainder -= 1;
  }

  return categories.map((entry) => {
    const weight = CATEGORY_WEIGHTS[entry.category];
    if (entry.score === null || !totalWeight) {
      return {
        ...entry,
        weight,
        share: null,
        points: null,
        potentialGain: null,
      };
    }
    return {
      ...entry,
      weight,
      share: Number((weight / totalWeight).toFixed(4)),
      points: points.get(entry.category) ?? 0,
      potentialGain: Math.round(((100 - entry.score) * weight) / totalWeight),
    };
  });
};

/** Reports stored before weights were recorded get them filled in on read. */
export const withCategoryWeights = (
  categories: Array<CategoryScoreBase | CategoryScore>,
): CategoryScore[] =>
  categories.every(
    (entry) => 'weight' in entry && typeof entry.weight === 'number',
  )
    ? (categories as CategoryScore[])
    : applyCategoryWeights(categories);

@Injectable()
export class ScoringService {
  score(checks: CheckResult[]): AuditReport {
    const categories = Object.values(AuditCategory)
      .map((category) => this.scoreCategory(category, checks))
      .filter(
        (entry) =>
          entry.passed + entry.warned + entry.failed + entry.skipped > 0,
      );

    const overall = overallScore(categories);

    return {
      score: overall,
      grade: gradeFor(overall),
      categories: applyCategoryWeights(categories),
      checks,
    };
  }

  private scoreCategory(
    category: AuditCategory,
    checks: CheckResult[],
  ): CategoryScoreBase {
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
      passed: relevant.filter((check) => check.status === CheckStatus.PASS)
        .length,
      warned: relevant.filter((check) => check.status === CheckStatus.WARN)
        .length,
      failed: relevant.filter((check) => check.status === CheckStatus.FAIL)
        .length,
      skipped: relevant.filter((check) => check.status === CheckStatus.SKIPPED)
        .length,
    };
  }
}
