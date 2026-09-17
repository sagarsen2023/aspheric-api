import {
  applyCategoryWeights,
  ScoringService,
  withCategoryWeights,
} from './scoring.service';
import { result } from '../types/check.type';
import {
  AuditCategory,
  CategoryScoreBase,
  CheckStatus,
} from '../types/audit.type';

const check = (
  id: string,
  category: AuditCategory,
  status: CheckStatus,
  weight = 1,
) => result({ id, title: id, category, status, weight });

/** A scored category as stored, without its place in the overall score. */
const base = (category: AuditCategory, score: number | null): CategoryScoreBase => ({
  category,
  score,
  grade: 'N/A',
  passed: 0,
  warned: 0,
  failed: 0,
  skipped: 0,
  coverage: score === null ? 0 : 1,
  reliable: score !== null,
});

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(() => {
    service = new ScoringService();
  });

  it('scores a category of all-passing checks at 100', () => {
    const report = service.score([
      check('a', AuditCategory.SECURITY, CheckStatus.PASS),
      check('b', AuditCategory.SECURITY, CheckStatus.PASS),
    ]);

    expect(report.categories[0].score).toBe(100);
    expect(report.categories[0].grade).toBe('A');
    expect(report.score).toBe(100);
  });

  it('scores a category of all-failing checks at 0', () => {
    const report = service.score([
      check('a', AuditCategory.SECURITY, CheckStatus.FAIL),
    ]);

    expect(report.categories[0].score).toBe(0);
    expect(report.categories[0].grade).toBe('F');
  });

  it('counts a warning as half credit', () => {
    const report = service.score([
      check('a', AuditCategory.SECURITY, CheckStatus.WARN),
    ]);

    expect(report.categories[0].score).toBe(50);
  });

  it('weights heavier checks more', () => {
    // One weight-3 failure against one weight-1 pass => 1/4 of the credit.
    const report = service.score([
      check('heavy', AuditCategory.SECURITY, CheckStatus.FAIL, 3),
      check('light', AuditCategory.SECURITY, CheckStatus.PASS, 1),
    ]);

    expect(report.categories[0].score).toBe(25);
  });

  it('excludes skipped checks from the score rather than counting them as zero', () => {
    const report = service.score([
      check('ran', AuditCategory.SECURITY, CheckStatus.PASS),
      check('skipped', AuditCategory.SECURITY, CheckStatus.SKIPPED, 10),
    ]);

    expect(report.categories[0].score).toBe(100);
    expect(report.categories[0].skipped).toBe(1);
  });

  it('scores a wholly skipped category as null, not zero', () => {
    const report = service.score([
      check('skipped', AuditCategory.PERFORMANCE, CheckStatus.SKIPPED),
    ]);

    const performance = report.categories.find(
      (entry) => entry.category === AuditCategory.PERFORMANCE,
    );
    expect(performance?.score).toBeNull();
    expect(performance?.grade).toBe('N/A');
    // A null category must not drag the overall score down either.
    expect(report.score).toBeNull();
  });

  it('omits categories that had no checks at all', () => {
    const report = service.score([
      check('a', AuditCategory.SECURITY, CheckStatus.PASS),
    ]);

    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].category).toBe(AuditCategory.SECURITY);
  });

  it('weights security above crawlability in the overall score', () => {
    const securityFails = service.score([
      check('s', AuditCategory.SECURITY, CheckStatus.FAIL),
      check('c', AuditCategory.CRAWLABILITY, CheckStatus.PASS),
    ]);
    const crawlabilityFails = service.score([
      check('s', AuditCategory.SECURITY, CheckStatus.PASS),
      check('c', AuditCategory.CRAWLABILITY, CheckStatus.FAIL),
    ]);

    expect(securityFails.score).toBeLessThan(crawlabilityFails.score ?? 0);
  });

  it('marks a category unreliable when most of its weight was skipped', () => {
    // The auramjewellery.com case: accessibility scored 100/A off a single
    // weight-2 check because the weight-5 Lighthouse audit was skipped.
    const report = service.score([
      check('image-alt', AuditCategory.ACCESSIBILITY, CheckStatus.PASS, 2),
      check('lighthouse', AuditCategory.ACCESSIBILITY, CheckStatus.SKIPPED, 5),
    ]);

    const accessibility = report.categories[0];
    expect(accessibility.score).toBe(100);
    expect(accessibility.coverage).toBeCloseTo(0.29, 2);
    expect(accessibility.reliable).toBe(false);
  });

  it('marks a fully-run category reliable', () => {
    const report = service.score([
      check('a', AuditCategory.SECURITY, CheckStatus.PASS),
      check('b', AuditCategory.SECURITY, CheckStatus.FAIL),
    ]);

    expect(report.categories[0].coverage).toBe(1);
    expect(report.categories[0].reliable).toBe(true);
  });

  it('reports a wholly skipped category as unreliable', () => {
    const report = service.score([
      check('skipped', AuditCategory.PERFORMANCE, CheckStatus.SKIPPED),
    ]);

    expect(report.categories[0].coverage).toBe(0);
    expect(report.categories[0].reliable).toBe(false);
  });

  it('tallies pass/warn/fail counts per category', () => {
    const report = service.score([
      check('a', AuditCategory.SEO, CheckStatus.PASS),
      check('b', AuditCategory.SEO, CheckStatus.WARN),
      check('c', AuditCategory.SEO, CheckStatus.FAIL),
      check('d', AuditCategory.SEO, CheckStatus.SKIPPED),
    ]);

    expect(report.categories[0]).toMatchObject({
      passed: 1,
      warned: 1,
      failed: 1,
      skipped: 1,
    });
  });

  describe('place of each category in the overall score', () => {
    it('splits the overall score into whole points that add up exactly', () => {
      // Security 50 (weight 3) and crawlability 100 (weight 1): 37.5 + 25 = 62.5 => 63.
      const report = service.score([
        check('s1', AuditCategory.SECURITY, CheckStatus.PASS),
        check('s2', AuditCategory.SECURITY, CheckStatus.FAIL),
        check('c', AuditCategory.CRAWLABILITY, CheckStatus.PASS),
      ]);

      expect(report.score).toBe(63);
      expect(report.categories).toMatchObject([
        { category: AuditCategory.SECURITY, weight: 3, share: 0.75, points: 38, potentialGain: 38 },
        { category: AuditCategory.CRAWLABILITY, weight: 1, share: 0.25, points: 25, potentialGain: 0 },
      ]);
    });

    it('keeps points summing to the overall score across many categories', () => {
      const categories = applyCategoryWeights([
        base(AuditCategory.SECURITY, 25),
        base(AuditCategory.PERFORMANCE, 51),
        base(AuditCategory.ACCESSIBILITY, null),
        base(AuditCategory.SEO, 67),
        base(AuditCategory.DELIVERY, 75),
        base(AuditCategory.CRAWLABILITY, 0),
      ]);

      // (25×3 + 51×3 + 67×2 + 75×1.5 + 0×1) / 10.5 = 45.19 => 45.
      const points = categories.map((entry) => entry.points ?? 0);
      expect(points.reduce((sum, value) => sum + value, 0)).toBe(45);
      expect(categories.find((entry) => entry.category === AuditCategory.SECURITY)).toMatchObject({
        share: 0.2857,
        potentialGain: 21,
      });
    });

    it('leaves an unscored category out of shares, points and gains, but reports its weight', () => {
      const categories = applyCategoryWeights([
        base(AuditCategory.SECURITY, 80),
        base(AuditCategory.ACCESSIBILITY, null),
      ]);

      expect(categories[1]).toMatchObject({
        weight: 2,
        share: null,
        points: null,
        potentialGain: null,
      });
      expect(categories[0]).toMatchObject({ share: 1, points: 80, potentialGain: 20 });
    });

    it('fills the fields in for reports stored before they existed, and leaves newer ones alone', () => {
      const stored = [base(AuditCategory.SECURITY, 50), base(AuditCategory.CRAWLABILITY, 100)];
      const filled = withCategoryWeights(stored);

      expect(filled.map((entry) => entry.points)).toEqual([38, 25]);
      expect(withCategoryWeights(filled)).toBe(filled);
    });
  });

  it('assigns grades at the documented boundaries', () => {
    // 9 passes + 1 fail = 90 => an A.
    const checks = Array.from({ length: 9 }, (_, index) =>
      check(`p${index}`, AuditCategory.SEO, CheckStatus.PASS),
    );
    checks.push(check('f', AuditCategory.SEO, CheckStatus.FAIL));

    const report = service.score(checks);
    expect(report.categories[0].score).toBe(90);
    expect(report.categories[0].grade).toBe('A');
  });
});
