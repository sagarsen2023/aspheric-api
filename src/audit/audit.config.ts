import { registerAs } from '@nestjs/config';
import { LighthouseProvider } from './types/audit.type';
import { AUDIT_CONFIG_NAMESPACE } from './audit.constants';

export interface AuditConfig {
  lighthouseProvider: LighthouseProvider;
  psiApiKey?: string;
  lighthouseTimeout: number;
  cacheTtl: number;
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

export const auditConcurrency = (): number =>
  toInt(process.env.AUDIT_CONCURRENCY, 2);
