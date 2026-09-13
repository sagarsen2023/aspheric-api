import { Injectable } from '@nestjs/common';
import { Resolver } from 'node:dns/promises';
import { AuditCheck, result } from '../types/check.type';
import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from '../types/audit.type';

const RESOLVE_TIMEOUT = 5_000;

/**
 * Email-spoofing and certificate-issuance controls. These live in DNS rather
 * than in the HTTP response, so they are invisible to Lighthouse - but a
 * domain without DMARC is trivially spoofable in phishing mail, which is very
 * much a production-readiness problem.
 */
@Injectable()
export class DnsCheck implements AuditCheck {
  readonly id = 'dns';
  readonly defaultCategory = AuditCategory.SECURITY;
  readonly timeout = 20_000;

  async run(context: AuditContext): Promise<CheckResult[]> {
    const domain = context.hostname;
    const category = AuditCategory.SECURITY;

    const [txt, dmarc, caa, mx] = await Promise.all([
      this.txt(domain),
      this.txt(`_dmarc.${domain}`),
      this.caa(domain),
      this.mx(domain),
    ]);

    const spf = txt.find((record) => /^v=spf1/i.test(record));
    const dmarcRecord = dmarc.find((record) => /^v=DMARC1/i.test(record));
    const policy = dmarcRecord
      ? /p=(none|quarantine|reject)/i.exec(dmarcRecord)?.[1]?.toLowerCase()
      : undefined;

    return [
      result({
        id: 'dns.spf',
        title: 'SPF record',
        category,
        status: this.spfStatus(spf),
        weight: 2,
        evidence: { record: spf ?? null, hasMx: mx.length > 0 },
        remediation: spf
          ? 'End the SPF record with -all (hard fail) rather than ~all or ?all.'
          : 'Publish an SPF TXT record listing the servers allowed to send mail for this domain.',
      }),
      result({
        id: 'dns.dmarc',
        title: 'DMARC record',
        category,
        status: this.dmarcStatus(policy),
        weight: 2,
        evidence: { record: dmarcRecord ?? null, policy: policy ?? null },
        remediation: dmarcRecord
          ? 'Move the DMARC policy from p=none to p=quarantine, then p=reject once your reports are clean.'
          : 'Publish a DMARC TXT record at _dmarc.<domain> so receivers know what to do with mail that fails SPF/DKIM.',
      }),
      result({
        id: 'dns.caa',
        title: 'CAA record',
        category,
        status: caa.length ? CheckStatus.PASS : CheckStatus.WARN,
        weight: 1,
        evidence: { records: caa },
        remediation:
          'Publish a CAA record naming the CAs allowed to issue certificates for this domain, so no other CA will.',
      }),
    ];
  }

  private spfStatus(spf?: string): CheckStatus {
    if (!spf) return CheckStatus.FAIL;
    // ~all (softfail) and ?all (neutral) let spoofed mail through.
    return /-all\s*$/.test(spf.trim()) ? CheckStatus.PASS : CheckStatus.WARN;
  }

  private dmarcStatus(policy?: string): CheckStatus {
    if (!policy) return CheckStatus.FAIL;
    if (policy === 'none') return CheckStatus.WARN;
    return CheckStatus.PASS;
  }

  private resolver(): Resolver {
    const resolver = new Resolver({ timeout: RESOLVE_TIMEOUT, tries: 2 });
    return resolver;
  }

  /** DNS lookups fail for perfectly ordinary reasons - absence is the answer. */
  private async txt(name: string): Promise<string[]> {
    try {
      const records = await this.resolver().resolveTxt(name);
      return records.map((chunks) => chunks.join(''));
    } catch {
      return [];
    }
  }

  private async caa(name: string): Promise<string[]> {
    try {
      const records = await this.resolver().resolveCaa(name);
      return records.map((record) => JSON.stringify(record));
    } catch {
      return [];
    }
  }

  private async mx(name: string): Promise<string[]> {
    try {
      const records = await this.resolver().resolveMx(name);
      return records.map((record) => record.exchange);
    } catch {
      return [];
    }
  }
}
