import { Module, Provider } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService, ConfigType } from '@nestjs/config';
import { auditConfig } from './audit.config';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditProcessor } from './audit.processor';
import { AuditRunnerService } from './audit-runner.service';
import { ScoringService } from './scoring/scoring.service';
import { Audit, AuditSchema } from './entities/audit.entity';
import { AUDIT_QUEUE } from './audit.constants';
import { AUDIT_CHECKS, AuditCheck } from './types/check.type';
import { SiteFetcher } from './providers/site-fetcher';
import { InflightLockService } from './providers/inflight-lock.service';
import { redisConnectionOptions } from '../redis/redis.provider';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { LIGHTHOUSE_RUNNER } from './providers/lighthouse.provider';
import { PsiProvider } from './providers/psi.provider';
import { LocalLighthouseProvider } from './providers/local-lighthouse.provider';
import { LighthouseProvider } from './types/audit.type';

import { HeadersCheck } from './checks/headers.check';
import { TlsCheck } from './checks/tls.check';
import { CookiesCheck } from './checks/cookies.check';
import { DnsCheck } from './checks/dns.check';
import { SeoCheck } from './checks/seo.check';
import { CrawlabilityCheck } from './checks/crawlability.check';
import { DeliveryCheck } from './checks/delivery.check';
import { LighthouseCheck } from './checks/lighthouse.check';

const CHECKS = [
  HeadersCheck,
  TlsCheck,
  CookiesCheck,
  DnsCheck,
  SeoCheck,
  CrawlabilityCheck,
  DeliveryCheck,
  LighthouseCheck,
];

/**
 * Collects every registered check into one injectable array, so adding a check
 * means adding it to CHECKS above and nothing else.
 */
const checksProvider: Provider = {
  provide: AUDIT_CHECKS,
  inject: CHECKS,
  useFactory: (...checks: AuditCheck[]) => checks,
};

/** LIGHTHOUSE_PROVIDER picks which runner the LighthouseCheck receives. */
const lighthouseRunnerProvider: Provider = {
  provide: LIGHTHOUSE_RUNNER,
  inject: [auditConfig.KEY, PsiProvider, LocalLighthouseProvider],
  useFactory: (
    config: ConfigType<typeof auditConfig>,
    psi: PsiProvider,
    local: LocalLighthouseProvider,
  ) => (config.lighthouseProvider === LighthouseProvider.LOCAL ? local : psi),
};

@Module({
  imports: [
    // Scopes the audit settings to this module instead of the root appConfig.
    ConfigModule.forFeature(auditConfig),
    MongooseModule.forFeature([{ name: Audit.name, schema: AuditSchema }]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: redisConnectionOptions(configService),
      }),
    }),
    BullModule.registerQueue({ name: AUDIT_QUEUE }),
  ],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditRunnerService,
    AuditProcessor,
    ScoringService,
    SiteFetcher,
    InflightLockService,
    RateLimitGuard,
    PsiProvider,
    LocalLighthouseProvider,
    lighthouseRunnerProvider,
    ...CHECKS,
    checksProvider,
  ],
  exports: [AuditService],
})
export class AuditModule {}
