import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_CHECKS, AuditCheck, result } from './types/check.type';
import { SiteFetcher } from './providers/site-fetcher';
import { assertSafeUrl } from './providers/url-guard';
import { ScoringService } from './scoring/scoring.service';
import {
  AuditCategory,
  AuditContext,
  AuditReport,
  AuditStrategy,
  CheckResult,
  CheckStatus,
} from './types/audit.type';

const DEFAULT_CHECK_TIMEOUT = 30_000;

const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

@Injectable()
export class AuditRunnerService {
  private readonly logger = new Logger(AuditRunnerService.name);

  constructor(
    @Inject(AUDIT_CHECKS) private readonly checks: AuditCheck[],
    private readonly fetcher: SiteFetcher,
    private readonly scoringService: ScoringService,
  ) {}

  /**
   * Fetches the page once, then fans every check out over that shared context.
   * One slow or broken check degrades its own results only.
   */
  async run(url: string, strategy: AuditStrategy): Promise<AuditReport> {
    const { url: safeUrl } = await assertSafeUrl(url);
    const response = await this.fetcher.fetch(safeUrl.toString());
    const finalUrl = new URL(response.finalUrl);

    const context: AuditContext = {
      url: safeUrl.toString(),
      origin: finalUrl.origin,
      hostname: finalUrl.hostname,
      strategy,
      response,
    };

    const settled = await Promise.allSettled(
      this.checks.map((check) =>
        withTimeout(
          check.run(context),
          check.timeout ?? DEFAULT_CHECK_TIMEOUT,
          `Check "${check.id}"`,
        ),
      ),
    );

    const checks: CheckResult[] = settled.flatMap((outcome, index) => {
      if (outcome.status === 'fulfilled') return outcome.value;

      const check = this.checks[index];
      const reason =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);

      this.logger.warn(`Check "${check.id}" failed for ${url}: ${reason}`);

      return [
        result({
          id: `${check.id}.unavailable`,
          title: `${check.id} check could not run`,
          category: check.defaultCategory,
          status: CheckStatus.SKIPPED,
          weight: 1,
          evidence: { error: reason },
        }),
      ];
    });

    return this.scoringService.score(checks);
  }

  categories(): AuditCategory[] {
    return Object.values(AuditCategory);
  }
}
