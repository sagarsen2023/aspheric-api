import { Injectable } from '@nestjs/common';
import { AuditCheck, result } from '../types/check.type';
import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from '../types/audit.type';
import { SiteFetcher } from '../providers/site-fetcher';

const PROBE_TIMEOUT = 8_000;
/** Beyond these a sitemap is slow or bulky enough that crawlers start skipping it. */
const SITEMAP_WARN_BYTES = 256 * 1024;
const SITEMAP_WARN_MS = 3_000;

interface ProbeResult {
  /** False when the request threw (timeout, DNS, connection refused). */
  reached: boolean;
  statusCode?: number;
  body?: string;
  bytes?: number;
  elapsedMs: number;
  error?: string;
}

/**
 * True only when the wildcard group blocks the whole site. A `Disallow: /`
 * under a *named* agent ("User-agent: BadBot") is a normal, deliberate block
 * and must not be reported - which is why this parses groups rather than
 * grepping the file for the directive.
 */
export const blocksAllCrawlers = (robotsBody: string): boolean => {
  const lines = robotsBody
    .split(/\r?\n/)
    .map((line) => line.split('#')[0].trim())
    .filter(Boolean);

  let agents: string[] = [];
  let collectingAgents = false;
  let wildcardBlocked = false;

  for (const line of lines) {
    const [rawField, ...rest] = line.split(':');
    const field = rawField.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (field === 'user-agent') {
      // Consecutive user-agent lines share one group of rules.
      if (!collectingAgents) agents = [];
      agents.push(value.toLowerCase());
      collectingAgents = true;
      continue;
    }

    collectingAgents = false;

    if (field === 'disallow' && value === '/' && agents.includes('*')) {
      wildcardBlocked = true;
    }

    // An Allow in the same group re-opens part of the site, so the blanket
    // block is not absolute.
    if (field === 'allow' && value && agents.includes('*')) {
      wildcardBlocked = false;
    }
  }

  return wildcardBlocked;
};

/**
 * Fetches the handful of well-known paths every site is expected to expose.
 * All of these are documented conventions (RFC 9309, sitemaps.org, RFC 9116) -
 * we never guess at undocumented paths.
 */
@Injectable()
export class CrawlabilityCheck implements AuditCheck {
  readonly id = 'crawlability';
  readonly defaultCategory = AuditCategory.CRAWLABILITY;
  readonly timeout = 30_000;

  constructor(private readonly fetcher: SiteFetcher) {}

  async run(context: AuditContext): Promise<CheckResult[]> {
    const category = AuditCategory.CRAWLABILITY;
    const { origin } = context;

    const [robots, sitemap, securityTxt, notFound] = await Promise.all([
      this.probe(`${origin}/robots.txt`),
      this.probe(`${origin}/sitemap.xml`),
      this.probe(`${origin}/.well-known/security.txt`),
      this.probe(`${origin}/aspheric-readiness-probe-404`),
    ]);

    const robotsBody = robots.body ?? '';
    const blocksEverything = blocksAllCrawlers(robotsBody);
    const sitemapInRobots = robotsBody
      .split(/\r?\n/)
      .some((line) => line.trim().toLowerCase().startsWith('sitemap:'));

    return [
      result({
        id: 'crawlability.robots',
        title: 'robots.txt present',
        category,
        status:
          robots.statusCode === 200
            ? blocksEverything
              ? CheckStatus.FAIL
              : CheckStatus.PASS
            : CheckStatus.WARN,
        weight: 2,
        evidence: {
          statusCode: robots.statusCode ?? null,
          blocksAllCrawlers: blocksEverything,
          declaresSitemap: sitemapInRobots,
        },
        remediation: blocksEverything
          ? 'robots.txt contains "Disallow: /", which asks every search engine to ignore the whole site. Remove it before launch.'
          : 'Serve a robots.txt at the site root and reference your sitemap from it.',
      }),
      this.sitemapResult(sitemap, sitemapInRobots, category),
      result({
        id: 'crawlability.security-txt',
        title: 'security.txt present',
        category: AuditCategory.SECURITY,
        status:
          securityTxt.statusCode === 200 ? CheckStatus.PASS : CheckStatus.WARN,
        weight: 1,
        evidence: { statusCode: securityTxt.statusCode ?? null },
        remediation:
          'Publish /.well-known/security.txt (RFC 9116) so researchers know where to report vulnerabilities.',
      }),
      result({
        id: 'crawlability.not-found',
        title: 'Missing pages return 404',
        category,
        status:
          notFound.statusCode === 404
            ? CheckStatus.PASS
            : notFound.statusCode === 200
              ? CheckStatus.FAIL
              : CheckStatus.WARN,
        weight: 1,
        evidence: { statusCode: notFound.statusCode ?? null },
        remediation:
          'A non-existent URL returned 200 instead of 404. Soft 404s let search engines index junk pages.',
      }),
    ];
  }

  /**
   * A failed probe is a finding, not an error. The failure *reason* is kept:
   * a timeout and a 404 mean very different things, and collapsing both to
   * null hides slow-but-present resources entirely.
   */
  private async probe(url: string): Promise<ProbeResult> {
    const startedAt = Date.now();
    try {
      const response = await this.fetcher.fetch(url, { timeout: PROBE_TIMEOUT });
      return {
        reached: true,
        statusCode: response.statusCode,
        body: response.body,
        bytes: Buffer.byteLength(response.body),
        elapsedMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        reached: false,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private sitemapResult(
    sitemap: ProbeResult,
    declaredInRobots: boolean,
    category: AuditCategory,
  ): CheckResult {
    const evidence = {
      statusCode: sitemap.statusCode ?? null,
      declaredInRobots,
      elapsedMs: sitemap.elapsedMs,
      bytes: sitemap.bytes ?? null,
      error: sitemap.error ?? null,
    };

    // Unreachable is its own verdict. Being declared in robots.txt does not
    // make an unfetchable sitemap fine - a crawler would hit the same wall.
    if (!sitemap.reached) {
      return result({
        id: 'crawlability.sitemap',
        title: 'XML sitemap reachable',
        category,
        status: CheckStatus.FAIL,
        weight: 2,
        evidence,
        remediation:
          `/sitemap.xml could not be fetched within ${PROBE_TIMEOUT}ms (${sitemap.error}). ` +
          'Crawlers apply similar limits, so a sitemap this slow is effectively missing. Split it with a sitemap index.',
      });
    }

    if (sitemap.statusCode !== 200) {
      return result({
        id: 'crawlability.sitemap',
        title: 'XML sitemap reachable',
        category,
        status: declaredInRobots ? CheckStatus.WARN : CheckStatus.FAIL,
        weight: 2,
        evidence,
        remediation:
          'Publish /sitemap.xml listing your indexable URLs and declare it in robots.txt.',
      });
    }

    // Google rejects sitemaps over 50MB or 50k URLs, and slow ones get dropped.
    const oversized = (sitemap.bytes ?? 0) > SITEMAP_WARN_BYTES;
    const slow = sitemap.elapsedMs > SITEMAP_WARN_MS;

    return result({
      id: 'crawlability.sitemap',
      title: 'XML sitemap reachable',
      category,
      status: oversized || slow ? CheckStatus.WARN : CheckStatus.PASS,
      weight: 2,
      evidence: { ...evidence, oversized, slow },
      remediation:
        oversized || slow
          ? `The sitemap took ${sitemap.elapsedMs}ms and returned ${Math.round((sitemap.bytes ?? 0) / 1024)}KB. ` +
            'Split it into a sitemap index of smaller files so crawlers fetch them in parallel.'
          : 'Sitemap is present and served promptly.',
    });
  }
}
