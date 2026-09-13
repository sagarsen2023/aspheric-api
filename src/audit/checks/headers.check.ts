import { Injectable } from '@nestjs/common';
import { AuditCheck, result, verdict } from '../types/check.type';
import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from '../types/audit.type';

/** Six months, the minimum max-age hstspreload.org will accept. */
const HSTS_MIN_AGE = 15_768_000;

const LEAKY_HEADERS = [
  'server',
  'x-powered-by',
  'x-aspnet-version',
  'x-aspnetmvc-version',
  'x-generator',
  'x-drupal-cache',
];

@Injectable()
export class HeadersCheck implements AuditCheck {
  readonly id = 'headers';
  readonly defaultCategory = AuditCategory.SECURITY;

  async run(context: AuditContext): Promise<CheckResult[]> {
    const { headers } = context.response;
    const category = AuditCategory.SECURITY;

    return [
      this.hsts(headers, category),
      this.csp(headers, category),
      this.frameAncestors(headers, category),
      this.contentTypeOptions(headers, category),
      this.referrerPolicy(headers, category),
      this.permissionsPolicy(headers, category),
      this.crossOriginOpener(headers, category),
      this.infoLeakage(headers, category),
    ];
  }

  private hsts(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const value = headers['strict-transport-security'];
    const maxAge = value ? Number(/max-age=(\d+)/i.exec(value)?.[1] ?? 0) : 0;

    let status = CheckStatus.FAIL;
    if (value && maxAge >= HSTS_MIN_AGE) status = CheckStatus.PASS;
    else if (value) status = CheckStatus.WARN;

    return result({
      id: 'headers.hsts',
      title: 'HTTP Strict Transport Security',
      category,
      status,
      weight: 3,
      evidence: {
        header: value ?? null,
        maxAge,
        includesSubDomains: /includeSubDomains/i.test(value ?? ''),
        preload: /preload/i.test(value ?? ''),
      },
      remediation: value
        ? `Raise max-age to at least ${HSTS_MIN_AGE} (6 months) and add includeSubDomains.`
        : 'Send "Strict-Transport-Security: max-age=31536000; includeSubDomains" so browsers refuse to talk to your site over plain HTTP.',
    });
  }

  private csp(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const enforced = headers['content-security-policy'];
    const value = enforced ?? headers['content-security-policy-report-only'];
    const reportOnly = !enforced && !!value;

    const weaknesses: string[] = [];
    if (value) {
      if (/'unsafe-inline'/i.test(value)) weaknesses.push('unsafe-inline');
      if (/'unsafe-eval'/i.test(value)) weaknesses.push('unsafe-eval');
      if (/default-src[^;]*\*/i.test(value)) {
        weaknesses.push('wildcard default-src');
      }
      if (reportOnly) weaknesses.push('report-only (not enforced)');
    }

    let status = CheckStatus.FAIL;
    if (value && !weaknesses.length) status = CheckStatus.PASS;
    else if (value) status = CheckStatus.WARN;

    return result({
      id: 'headers.csp',
      title: 'Content Security Policy',
      category,
      status,
      weight: 3,
      evidence: { header: value ?? null, reportOnly, weaknesses },
      remediation: value
        ? `Tighten the policy - found: ${weaknesses.join(', ')}. Replace unsafe-inline with nonces or hashes.`
        : 'Add a Content-Security-Policy header. Start in report-only mode to find violations, then enforce it.',
    });
  }

  private frameAncestors(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const xfo = headers['x-frame-options'];
    const csp = headers['content-security-policy'] ?? '';
    const cspFrameAncestors = /frame-ancestors/i.test(csp);
    const ok =
      cspFrameAncestors || /^(deny|sameorigin)$/i.test((xfo ?? '').trim());

    return result({
      id: 'headers.frame-ancestors',
      title: 'Clickjacking protection',
      category,
      status: verdict(ok),
      weight: 2,
      evidence: { xFrameOptions: xfo ?? null, cspFrameAncestors },
      remediation:
        'Send "Content-Security-Policy: frame-ancestors \'none\'" (or X-Frame-Options: DENY) so your pages cannot be framed by an attacker.',
    });
  }

  private contentTypeOptions(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const value = headers['x-content-type-options'];
    return result({
      id: 'headers.content-type-options',
      title: 'MIME sniffing disabled',
      category,
      status: verdict(value?.trim().toLowerCase() === 'nosniff'),
      weight: 1,
      evidence: { header: value ?? null },
      remediation:
        'Send "X-Content-Type-Options: nosniff" so browsers do not re-interpret a response as a different content type.',
    });
  }

  private referrerPolicy(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const value = headers['referrer-policy']?.trim().toLowerCase();
    const strict = [
      'no-referrer',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
    ];

    let status = CheckStatus.FAIL;
    if (value && strict.includes(value)) status = CheckStatus.PASS;
    else if (value) status = CheckStatus.WARN;

    return result({
      id: 'headers.referrer-policy',
      title: 'Referrer policy',
      category,
      status,
      weight: 1,
      evidence: { header: value ?? null },
      remediation:
        'Send "Referrer-Policy: strict-origin-when-cross-origin" to stop leaking full URLs to third parties.',
    });
  }

  private permissionsPolicy(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const value = headers['permissions-policy'];
    return result({
      id: 'headers.permissions-policy',
      title: 'Permissions policy',
      category,
      status: value ? CheckStatus.PASS : CheckStatus.WARN,
      weight: 1,
      evidence: { header: value ?? null },
      remediation:
        'Send a Permissions-Policy header disabling features you do not use, e.g. "camera=(), microphone=(), geolocation=()".',
    });
  }

  private crossOriginOpener(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const coop = headers['cross-origin-opener-policy'];
    const corp = headers['cross-origin-resource-policy'];
    const ok = /same-origin/i.test(coop ?? '');

    return result({
      id: 'headers.cross-origin-isolation',
      title: 'Cross-origin isolation',
      category,
      status: ok ? CheckStatus.PASS : CheckStatus.WARN,
      weight: 1,
      evidence: { coop: coop ?? null, corp: corp ?? null },
      remediation:
        'Send "Cross-Origin-Opener-Policy: same-origin" to isolate your browsing context from cross-origin popups.',
    });
  }

  private infoLeakage(
    headers: Record<string, string>,
    category: AuditCategory,
  ): CheckResult {
    const leaked = LEAKY_HEADERS.filter((name) => headers[name]).map((name) => ({
      header: name,
      value: headers[name],
    }));

    // A bare product name ("nginx") is common and low risk; a version is not.
    const withVersion = leaked.filter((entry) => /\d+\.\d+/.test(entry.value));

    let status = CheckStatus.PASS;
    if (withVersion.length) status = CheckStatus.FAIL;
    else if (leaked.length) status = CheckStatus.WARN;

    return result({
      id: 'headers.info-leakage',
      title: 'Server software disclosure',
      category,
      status,
      weight: 1,
      evidence: { leaked, versionsExposed: withVersion.map((e) => e.header) },
      remediation:
        'Strip or genericise Server / X-Powered-By headers so scanners cannot match your exact version against a CVE list.',
    });
  }
}
