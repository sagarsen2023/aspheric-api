import { Injectable } from '@nestjs/common';
import { connect, type PeerCertificate, type TLSSocket } from 'node:tls';
import { AuditCheck, result, verdict } from '../types/check.type';
import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from '../types/audit.type';
import { SiteFetcher } from '../providers/site-fetcher';

interface TlsFacts {
  protocol: string | null;
  cipher: string | null;
  authorized: boolean;
  authorizationError?: string;
  validTo: string;
  validFrom: string;
  issuer: string;
  subject: string;
  daysRemaining: number;
  subjectAltNames?: string;
}

const HANDSHAKE_TIMEOUT = 10_000;
const REDIRECT_PROBE_TIMEOUT = 8_000;
const DAY = 24 * 60 * 60 * 1000;

/** Certificate subject fields are `string | string[]` for repeated RDNs. */
const firstValue = (field: string | string[] | undefined): string => {
  if (Array.isArray(field)) return field[0] ?? '';
  return field ?? '';
};

@Injectable()
export class TlsCheck implements AuditCheck {
  readonly id = 'tls';
  readonly defaultCategory = AuditCategory.SECURITY;
  readonly timeout = 25_000;

  constructor(private readonly fetcher: SiteFetcher) {}

  async run(context: AuditContext): Promise<CheckResult[]> {
    const url = new URL(context.response.finalUrl);
    const results: CheckResult[] = [
      this.httpsInUse(url),
      await this.httpsRedirect(context),
    ];

    if (url.protocol !== 'https:') {
      // Nothing to hand-shake with; the remaining checks would be noise.
      return results;
    }

    let facts: TlsFacts;
    try {
      facts = await this.handshake(
        url.hostname,
        Number(url.port) || 443,
      );
    } catch (error) {
      return [
        ...results,
        result({
          id: 'tls.handshake',
          title: 'TLS handshake',
          category: AuditCategory.SECURITY,
          status: CheckStatus.FAIL,
          weight: 3,
          evidence: {
            error: error instanceof Error ? error.message : String(error),
          },
          remediation:
            'The TLS handshake failed. Check that the certificate chain is complete and the server supports TLS 1.2 or newer.',
        }),
      ];
    }

    return [
      ...results,
      this.certificateValidity(facts),
      this.certificateExpiry(facts),
      this.protocolVersion(facts),
    ];
  }

  /** Whether the audited URL itself ended up on HTTPS. */
  private httpsInUse(url: URL): CheckResult {
    return result({
      id: 'tls.https',
      title: 'Served over HTTPS',
      category: AuditCategory.SECURITY,
      status: verdict(url.protocol === 'https:'),
      weight: 3,
      evidence: { finalProtocol: url.protocol },
      remediation: 'Serve the site over HTTPS.',
    });
  }

  /**
   * Confirms plain HTTP is redirected to HTTPS. This has to make its own
   * http:// request: callers almost always submit the https URL, so inspecting
   * the audited response would pass every site that merely *has* TLS, without
   * ever proving that the insecure entry point is closed.
   */
  private async httpsRedirect(context: AuditContext): Promise<CheckResult> {
    const probeUrl = `http://${context.hostname}/`;

    let response: Awaited<ReturnType<SiteFetcher['fetch']>>;
    try {
      response = await this.fetcher.fetch(probeUrl, {
        timeout: REDIRECT_PROBE_TIMEOUT,
        readBody: false,
      });
    } catch (error) {
      // A refused connection on port 80 is a legitimate way to have no
      // insecure entry point at all, so this is not a failure.
      return result({
        id: 'tls.https-redirect',
        title: 'HTTP redirects to HTTPS',
        category: AuditCategory.SECURITY,
        status: CheckStatus.SKIPPED,
        weight: 3,
        evidence: {
          probed: probeUrl,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    const landedOnHttps = response.finalUrl.startsWith('https:');

    return result({
      id: 'tls.https-redirect',
      title: 'HTTP redirects to HTTPS',
      category: AuditCategory.SECURITY,
      status: verdict(landedOnHttps),
      weight: 3,
      evidence: {
        probed: probeUrl,
        finalUrl: response.finalUrl,
        statusCode: response.statusCode,
        redirectChain: response.redirectChain,
      },
      remediation:
        'Plain HTTP served content instead of redirecting. Return a 301 to the https:// URL so no request is ever answered in the clear.',
    });
  }

  private certificateValidity(facts: TlsFacts): CheckResult {
    return result({
      id: 'tls.certificate-valid',
      title: 'Certificate trusted',
      category: AuditCategory.SECURITY,
      status: verdict(facts.authorized),
      weight: 3,
      evidence: {
        authorized: facts.authorized,
        authorizationError: facts.authorizationError ?? null,
        issuer: facts.issuer,
        subject: facts.subject,
      },
      remediation:
        'Browsers will not trust this certificate. Install a certificate from a public CA and serve the full intermediate chain.',
    });
  }

  private certificateExpiry(facts: TlsFacts): CheckResult {
    const { daysRemaining } = facts;

    let status = CheckStatus.PASS;
    if (daysRemaining <= 0) status = CheckStatus.FAIL;
    else if (daysRemaining < 14) status = CheckStatus.FAIL;
    else if (daysRemaining < 30) status = CheckStatus.WARN;

    return result({
      id: 'tls.certificate-expiry',
      title: 'Certificate expiry',
      category: AuditCategory.SECURITY,
      status,
      weight: 2,
      evidence: {
        validFrom: facts.validFrom,
        validTo: facts.validTo,
        daysRemaining,
      },
      remediation:
        daysRemaining <= 0
          ? 'The certificate has expired - renew it immediately.'
          : `The certificate expires in ${daysRemaining} days. Automate renewal (ACME/certbot) so this cannot lapse.`,
    });
  }

  private protocolVersion(facts: TlsFacts): CheckResult {
    const protocol = facts.protocol ?? '';
    const modern = protocol === 'TLSv1.3';
    const acceptable = protocol === 'TLSv1.2';

    let status = CheckStatus.FAIL;
    if (modern) status = CheckStatus.PASS;
    else if (acceptable) status = CheckStatus.WARN;

    return result({
      id: 'tls.protocol',
      title: 'TLS protocol version',
      category: AuditCategory.SECURITY,
      status,
      weight: 2,
      evidence: { protocol: facts.protocol, cipher: facts.cipher },
      remediation:
        'Enable TLS 1.3 and disable TLS 1.0/1.1, which are deprecated and fail PCI DSS.',
    });
  }

  private handshake(hostname: string, port: number): Promise<TlsFacts> {
    return new Promise<TlsFacts>((resolve, reject) => {
      const socket: TLSSocket = connect(
        {
          host: hostname,
          port,
          servername: hostname,
          // We want to inspect an untrusted cert, not refuse it - the
          // `authorized` flag below is what the check actually reports.
          rejectUnauthorized: false,
          timeout: HANDSHAKE_TIMEOUT,
        },
        () => {
          const certificate: PeerCertificate = socket.getPeerCertificate();
          const validTo = certificate.valid_to
            ? new Date(certificate.valid_to)
            : null;

          resolve({
            protocol: socket.getProtocol(),
            cipher: socket.getCipher()?.name ?? null,
            authorized: socket.authorized,
            authorizationError: socket.authorizationError?.message,
            validFrom: certificate.valid_from ?? '',
            validTo: certificate.valid_to ?? '',
            issuer:
              firstValue(certificate.issuer?.O) ||
              firstValue(certificate.issuer?.CN),
            subject: firstValue(certificate.subject?.CN),
            subjectAltNames: certificate.subjectaltname,
            daysRemaining: validTo
              ? Math.floor((validTo.getTime() - Date.now()) / DAY)
              : -1,
          });
          socket.end();
        },
      );

      socket.once('error', (error) => {
        socket.destroy();
        reject(error);
      });

      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error(`TLS handshake timed out after ${HANDSHAKE_TIMEOUT}ms`));
      });
    });
  }
}
