import { Injectable } from '@nestjs/common';
import { AuditCheck, result, verdict } from '../types/check.type';
import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from '../types/audit.type';
import { TTFB_GOOD, TTFB_POOR, CDN_SIGNATURES } from '../audit.constants';

@Injectable()
export class DeliveryCheck implements AuditCheck {
  readonly id = 'delivery';
  readonly defaultCategory = AuditCategory.DELIVERY;

  async run(context: AuditContext): Promise<CheckResult[]> {
    const { headers, ttfb, statusCode, redirectChain } = context.response;
    const category = AuditCategory.DELIVERY;

    return [
      result({
        id: 'delivery.status',
        title: 'Homepage returns 200',
        category,
        status: verdict(statusCode >= 200 && statusCode < 300),
        weight: 3,
        evidence: { statusCode, redirectChain },
        remediation:
          'The audited URL did not return a success status. Fix this before anything else in the report matters.',
      }),
      this.ttfb(ttfb, category),
      this.compression(headers, category),
      this.caching(headers, category),
      this.cdn(headers, category),
      this.redirects(redirectChain, category),
    ];
  }

  private ttfb(value: number, category: AuditCategory): CheckResult {
    let status = CheckStatus.PASS;
    if (value > TTFB_POOR) status = CheckStatus.FAIL;
    else if (value > TTFB_GOOD) status = CheckStatus.WARN;

    return result({
      id: 'delivery.ttfb',
      title: 'Time to first byte',
      category,
      status,
      weight: 2,
      evidence: { ttfbMs: value, goodMs: TTFB_GOOD, poorMs: TTFB_POOR },
      remediation: `TTFB was ${value}ms. Cache HTML at the edge, or profile slow server-side work, to get under ${TTFB_GOOD}ms.`,
    });
  }

  private compression(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const encoding = headers['content-encoding']?.toLowerCase() ?? '';
    const modern = /br|zstd/.test(encoding);
    const any = /gzip|deflate|br|zstd/.test(encoding);

    let status = CheckStatus.FAIL;
    if (modern) status = CheckStatus.PASS;
    else if (any) status = CheckStatus.WARN;

    return result({
      id: 'delivery.compression',
      title: 'Response compression',
      category,
      status,
      weight: 2,
      evidence: { contentEncoding: encoding || null },
      remediation: any
        ? `Responses use ${encoding}. Adding Brotli typically saves a further 15-20% over gzip on HTML.`
        : 'No compression detected. Enable Brotli (or at minimum gzip) for text responses - it typically cuts HTML transfer size by 70%.',
    });
  }

  private caching(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const cacheControl = headers['cache-control'] ?? '';
    const hasValidator = !!(headers['etag'] ?? headers['last-modified']);

    // Presence of the header is not the question - what it *says* is. A policy
    // of no-store is the strongest possible "do not cache", so treating any
    // Cache-Control as a pass would reward the very thing that costs latency.
    const directives = cacheControl.toLowerCase();
    const uncacheable =
      /\bno-store\b/.test(directives) ||
      /\bmax-age=0\b/.test(directives) ||
      /\bno-cache\b/.test(directives);
    const maxAge = Number(/max-age=(\d+)/.exec(directives)?.[1] ?? 0);

    let status: CheckStatus;
    let remediation: string;

    if (uncacheable) {
      status = CheckStatus.WARN;
      remediation =
        `The page is explicitly uncacheable ("${cacheControl}"), so every visit ` +
        'costs a full origin render. If the HTML is not per-user, serve it with ' +
        'a short max-age plus stale-while-revalidate instead.';
    } else if (maxAge > 0 || hasValidator) {
      status = CheckStatus.PASS;
      remediation = 'Cacheable response with a usable freshness policy.';
    } else {
      status = CheckStatus.WARN;
      remediation =
        'Send Cache-Control (and an ETag) so browsers and CDNs can revalidate instead of refetching.';
    }

    return result({
      id: 'delivery.caching',
      title: 'Response is cacheable',
      category,
      status,
      weight: 1,
      evidence: {
        cacheControl: cacheControl || null,
        explicitlyUncacheable: uncacheable,
        maxAge,
        etag: headers['etag'] ?? null,
        lastModified: headers['last-modified'] ?? null,
      },
      remediation,
    });
  }

  private cdn(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const haystack = Object.entries(headers)
      .map(([key, value]) => `${key}:${value}`)
      .join('\n');
    const detected = CDN_SIGNATURES.filter(([, pattern]) =>
      pattern.test(haystack),
    ).map(([name]) => name);

    return result({
      id: 'delivery.cdn',
      title: 'Served through a CDN',
      category,
      status: detected.length ? CheckStatus.PASS : CheckStatus.WARN,
      weight: 1,
      evidence: { detected },
      remediation:
        'No CDN detected. Putting a CDN in front of the origin cuts latency for distant users and absorbs traffic spikes.',
    });
  }

  private redirects(chain: string[], category: AuditCategory): CheckResult {
    const hops = Math.max(chain.length - 1, 0);

    let status = CheckStatus.PASS;
    if (hops > 2) status = CheckStatus.FAIL;
    else if (hops === 2) status = CheckStatus.WARN;

    return result({
      id: 'delivery.redirects',
      title: 'Redirect chain length',
      category,
      status,
      weight: 1,
      evidence: { hops, chain },
      remediation:
        'Collapse the redirect chain - each hop is a full round trip before the page starts loading.',
    });
  }
}
