import { Injectable } from '@nestjs/common';
import { AuditCheck, result } from '../types/check.type';
import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from '../types/audit.type';

interface ParsedCookie {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
  domain: string | null;
}

const parseCookie = (raw: string): ParsedCookie => {
  const [pair, ...attributes] = raw.split(';');
  const flags = attributes.map((attribute) => attribute.trim().toLowerCase());
  const sameSite = flags
    .find((flag) => flag.startsWith('samesite='))
    ?.split('=')[1];
  const domain = flags
    .find((flag) => flag.startsWith('domain='))
    ?.split('=')[1];

  return {
    name: pair.split('=')[0]?.trim() ?? '',
    secure: flags.includes('secure'),
    httpOnly: flags.includes('httponly'),
    sameSite: sameSite ?? null,
    domain: domain ?? null,
  };
};

@Injectable()
export class CookiesCheck implements AuditCheck {
  readonly id = 'cookies';
  readonly defaultCategory = AuditCategory.SECURITY;

  async run(context: AuditContext): Promise<CheckResult[]> {
    const raw = context.response.setCookie;
    const category = AuditCategory.SECURITY;

    if (!raw.length) {
      return [
        result({
          id: 'cookies.flags',
          title: 'Cookie security flags',
          category,
          status: CheckStatus.SKIPPED,
          weight: 2,
          evidence: {
            reason: 'The page set no cookies on the initial response',
          },
        }),
      ];
    }

    const cookies = raw.map(parseCookie);
    const insecure = cookies.filter((cookie) => !cookie.secure);
    const exposed = cookies.filter((cookie) => !cookie.httpOnly);
    const noSameSite = cookies.filter(
      (cookie) => !cookie.sameSite || cookie.sameSite === 'none',
    );

    return [
      result({
        id: 'cookies.secure',
        title: 'Cookies marked Secure',
        category,
        status: insecure.length ? CheckStatus.FAIL : CheckStatus.PASS,
        weight: 2,
        evidence: {
          total: cookies.length,
          missingSecure: insecure.map((cookie) => cookie.name),
        },
        remediation:
          'Add the Secure attribute so cookies are never sent over plain HTTP.',
      }),
      result({
        id: 'cookies.http-only',
        title: 'Cookies marked HttpOnly',
        category,
        status: exposed.length ? CheckStatus.WARN : CheckStatus.PASS,
        weight: 2,
        evidence: {
          total: cookies.length,
          missingHttpOnly: exposed.map((cookie) => cookie.name),
        },
        remediation:
          'Add HttpOnly to session cookies so injected JavaScript cannot read them. Cookies read intentionally by your own JS are a legitimate exception.',
      }),
      result({
        id: 'cookies.same-site',
        title: 'Cookies constrained by SameSite',
        category,
        status: noSameSite.length ? CheckStatus.WARN : CheckStatus.PASS,
        weight: 1,
        evidence: {
          total: cookies.length,
          weakSameSite: noSameSite.map((cookie) => ({
            name: cookie.name,
            sameSite: cookie.sameSite,
          })),
        },
        remediation:
          'Set SameSite=Lax (or Strict) to blunt cross-site request forgery. SameSite=None requires Secure and should be deliberate.',
      }),
    ];
  }
}
