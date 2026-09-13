import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
// `import type`: emitDecoratorMetadata cannot reference a value-imported type
// from a decorated constructor signature.
import type { ConfigType } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditStrategy, LighthouseProvider } from '../types/audit.type';
import { auditConfig } from '../audit.config';
import {
  LighthouseRunResult,
  LighthouseRunner,
  RawLighthouseReport,
  normaliseReport,
} from './lighthouse.provider';

/**
 * `lighthouse` and `chrome-launcher` are ESM-only and declared as optional
 * dependencies, so they must not be resolved at build time - a deployment that
 * only ever uses the PSI provider should not need them installed at all.
 *
 * The indirection through `new Function` keeps TypeScript from rewriting this
 * into a `require()` call (which cannot load ESM) and from type-resolving a
 * package that may be absent.
 */
const dynamicImport = new Function(
  'specifier',
  'return import(specifier);',
) as (specifier: string) => Promise<Record<string, unknown>>;

interface ChromeInstance {
  port: number;
  kill: () => void;
}

interface LaunchOptions {
  chromeFlags: string[];
  userDataDir?: string;
}

type LighthouseFn = (
  url: string,
  flags: Record<string, unknown>,
  config?: Record<string, unknown>,
) => Promise<{ lhr: RawLighthouseReport } | undefined>;

const CHROME_FLAGS = [
  '--headless=new',
  '--no-sandbox', // required in most container runtimes
  '--disable-gpu',
  '--disable-dev-shm-usage', // /dev/shm is tiny in Docker; avoids crashes
  '--disable-extensions',
];

const DESKTOP_SCREEN = {
  mobile: false,
  width: 1350,
  height: 940,
  deviceScaleFactor: 1,
  disabled: false,
};

/**
 * Runs Lighthouse in-process against a headless Chrome. Works on internal and
 * staging URLs and has no external quota, but needs a Chrome binary on the host
 * and roughly 1GB of RAM per concurrent run.
 */
@Injectable()
export class LocalLighthouseProvider implements LighthouseRunner {
  readonly provider = LighthouseProvider.LOCAL;
  private readonly logger = new Logger(LocalLighthouseProvider.name);

  constructor(
    @Inject(auditConfig.KEY)
    private readonly config: ConfigType<typeof auditConfig>,
  ) {}

  async run(
    url: string,
    strategy: AuditStrategy,
  ): Promise<LighthouseRunResult> {
    const timeout = this.config.lighthouseTimeout;
    const { lighthouse, launchChrome } = await this.loadDependencies();

    const userDataDir = await mkdtemp(join(tmpdir(), 'aspheric-lighthouse-'));

    let chrome: ChromeInstance | undefined;
    try {
      chrome = await launchChrome({ chromeFlags: CHROME_FLAGS, userDataDir });

      const report = await lighthouse(
        url,
        {
          port: chrome.port,
          output: 'json',
          logLevel: 'error',
          maxWaitForLoad: timeout,
          onlyCategories: [
            'performance',
            'accessibility',
            'best-practices',
            'seo',
          ],
          formFactor: strategy === AuditStrategy.DESKTOP ? 'desktop' : 'mobile',
          screenEmulation:
            strategy === AuditStrategy.DESKTOP ? DESKTOP_SCREEN : undefined,
        },
        undefined,
      );

      if (!report?.lhr) {
        throw new ServiceUnavailableException(
          'Lighthouse returned no report for this URL',
        );
      }

      return normaliseReport(report.lhr, this.provider);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Local Lighthouse run failed for ${url}: ${reason}`);
      throw new ServiceUnavailableException(`Lighthouse failed: ${reason}`);
    } finally {
      try {
        chrome?.kill();
      } catch (error) {
        this.logger.debug(
          `Could not kill Chrome: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      await rm(userDataDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      }).catch((error: unknown) => {
        this.logger.debug(
          `Could not remove ${userDataDir}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }
  }

  private async loadDependencies(): Promise<{
    lighthouse: LighthouseFn;
    launchChrome: (options: LaunchOptions) => Promise<ChromeInstance>;
  }> {
    try {
      const [lighthouseModule, launcherModule] = await Promise.all([
        dynamicImport('lighthouse'),
        dynamicImport('chrome-launcher'),
      ]);

      return {
        lighthouse: lighthouseModule.default as LighthouseFn,
        launchChrome: launcherModule.launch as (
          options: LaunchOptions,
        ) => Promise<ChromeInstance>,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `LIGHTHOUSE_PROVIDER=local requires the optional "lighthouse" and ` +
          `"chrome-launcher" packages plus a Chrome binary on this host (${reason}). ` +
          `Install them, or set LIGHTHOUSE_PROVIDER=psi.`,
      );
    }
  }
}
