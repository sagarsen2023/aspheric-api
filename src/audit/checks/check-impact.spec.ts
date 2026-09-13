import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK_IMPACT, withImpact } from './check-impact';
import { AuditCategory, CheckStatus } from '../types/audit.type';

/**
 * The impact copy lives apart from the checks that emit the ids, so nothing
 * stops a new check shipping without it. Scanning the check sources for id
 * literals is ugly, but it is the only thing that makes the two stay in step.
 */
const collectIds = (): string[] => {
  const dir = __dirname;
  const ids = new Set<string>();

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.check.ts')) continue;
    const source = readFileSync(join(dir, file), 'utf8');

    // Static ids: `id: 'headers.hsts'`
    for (const [, id] of source.matchAll(/\bid:\s*'([a-z0-9.-]+)'/g)) {
      ids.add(id);
    }
    // Template ids: `id: \`lighthouse.${entry.lighthouseId}\`` - the prefix is
    // all we can read, so the literal suffixes come from the same file.
    for (const [, prefix] of source.matchAll(
      /\bid:\s*`([a-z0-9.-]+)\$\{/g,
    )) {
      for (const [, suffix] of source.matchAll(
        /lighthouseId:\s*'([a-z0-9.-]+)'/g,
      )) {
        ids.add(`${prefix}${suffix}`);
      }
    }
  }

  return [...ids].sort();
};

describe('CHECK_IMPACT', () => {
  const ids = collectIds();

  it('finds the check ids to cover', () => {
    // Guards the regexes above: a silent zero would make the next test vacuous.
    expect(ids.length).toBeGreaterThan(40);
    expect(ids).toContain('headers.hsts');
    expect(ids).toContain('lighthouse.performance');
  });

  it('covers every id the checks emit', () => {
    const missing = ids.filter((id) => !CHECK_IMPACT[id]);
    expect(missing).toEqual([]);
  });

  it('has no copy for ids no check emits', () => {
    const orphaned = Object.keys(CHECK_IMPACT).filter(
      (id) => !ids.includes(id),
    );
    expect(orphaned).toEqual([]);
  });

  it('attaches copy to results and leaves unknown ids alone', () => {
    const [known, unknown] = withImpact([
      {
        id: 'headers.hsts',
        title: 'HTTP Strict Transport Security',
        category: AuditCategory.SECURITY,
        status: CheckStatus.FAIL,
        weight: 3,
        score: 0,
      },
      {
        id: 'not.a.real.check',
        title: 'Made up',
        category: AuditCategory.SECURITY,
        status: CheckStatus.PASS,
        weight: 1,
        score: 1,
      },
    ]);

    expect(known.impact).toBe(CHECK_IMPACT['headers.hsts']);
    expect(unknown.impact).toBeUndefined();
  });
});
