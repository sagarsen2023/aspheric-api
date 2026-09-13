import { registerAs } from '@nestjs/config';
import { LighthouseProvider } from './types/audit.type';

export const AUDIT_CONFIG_NAMESPACE = 'audit';

export interface AuditConfig {
  /** Which Lighthouse runner to use - see LighthouseProvider. */
  lighthouseProvider: LighthouseProvider;
  /** Optional PageSpeed Insights key. Without one you share a tiny anonymous quota. */
  psiApiKey?: string;
  /** Ceiling for a single Lighthouse run, milliseconds. */
  lighthouseTimeout: number;
  /** Repeat audits of the same URL inside this window reuse the last report. */
  cacheTtl: number;
  /**
   * Safety net on the per-client in-flight lock, seconds. Only reached if a
   * worker dies mid-audit; it must comfortably exceed a normal audit or a
   * client could start a second one while the first is still running.
   */
  inflightLockTtl: number;
}

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toProvider = (value: string | undefined): LighthouseProvider =>
  value === LighthouseProvider.LOCAL
    ? LighthouseProvider.LOCAL
    : LighthouseProvider.PSI;

/**
 * Audit settings live with the module rather than in the root appConfig, so
 * the module stays self-contained. Inject it typed:
 *
 *   constructor(
 *     @Inject(auditConfig.KEY) private readonly config: ConfigType<typeof auditConfig>,
 *   ) {}
 */
export const auditConfig = registerAs(
  AUDIT_CONFIG_NAMESPACE,
  (): AuditConfig => ({
    lighthouseProvider: toProvider(process.env.LIGHTHOUSE_PROVIDER),
    psiApiKey: process.env.PSI_API_KEY,
    lighthouseTimeout: toInt(process.env.LIGHTHOUSE_TIMEOUT, 90_000),
    cacheTtl: toInt(process.env.AUDIT_CACHE_TTL, 900), // 15 minutes
    inflightLockTtl: toInt(process.env.AUDIT_INFLIGHT_LOCK_TTL, 300), // 5 minutes
  }),
);

/**
 * Read separately because @Processor evaluates its options at class-decoration
 * time, before the DI container (and therefore ConfigService) exists.
 *
 * Concurrency is deliberately low: a local Lighthouse run costs ~1GB of RAM,
 * and the PSI provider draws on a shared quota. Raise it only alongside the
 * memory to back it.
 */
export const auditConcurrency = (): number =>
  toInt(process.env.AUDIT_CONCURRENCY, 2);
