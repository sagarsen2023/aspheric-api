import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
// `import type`: emitDecoratorMetadata cannot reference a value-imported type
// from a decorated constructor signature.
import type { ConfigType } from '@nestjs/config';
import { AuditStrategy, LighthouseProvider } from '../types/audit.type';
import { auditConfig } from '../audit.config';
import {
  LighthouseRunResult,
  LighthouseRunner,
  RawLighthouseReport,
  normaliseReport,
} from './lighthouse.provider';

const PSI_ENDPOINT =
  'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

interface PsiResponse {
  lighthouseResult?: RawLighthouseReport;
  error?: { message?: string };
}

/**
 * Runs Lighthouse on Google's infrastructure. No Chrome in our container, but
 * the target must be publicly reachable and we are subject to Google's quota
 * (25k/day with a key, far less without).
 */
@Injectable()
export class PsiProvider implements LighthouseRunner {
  readonly provider = LighthouseProvider.PSI;
  private readonly logger = new Logger(PsiProvider.name);

  constructor(
    @Inject(auditConfig.KEY)
    private readonly config: ConfigType<typeof auditConfig>,
  ) {}

  async run(
    url: string,
    strategy: AuditStrategy,
  ): Promise<LighthouseRunResult> {
    const { psiApiKey: apiKey, lighthouseTimeout: timeout } = this.config;

    const endpoint = new URL(PSI_ENDPOINT);
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('strategy', strategy);
    for (const category of CATEGORIES) {
      endpoint.searchParams.append('category', category);
    }
    if (apiKey) endpoint.searchParams.set('key', apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, { signal: controller.signal });
      const payload = (await response.json()) as PsiResponse;

      if (!response.ok || !payload.lighthouseResult) {
        const reason =
          payload.error?.message ?? `PageSpeed Insights returned ${response.status}`;
        // 429 here means the shared quota is exhausted, which is operational
        // rather than a fault of the audited site.
        throw new ServiceUnavailableException(
          `PageSpeed Insights failed: ${reason}`,
        );
      }

      return normaliseReport(payload.lighthouseResult, this.provider);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`PSI run failed for ${url}: ${reason}`);
      throw new ServiceUnavailableException(
        `PageSpeed Insights failed: ${reason}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
