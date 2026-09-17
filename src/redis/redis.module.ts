import {
  Global,
  Inject,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT, redisProvider } from './redis.provider';
import { RateLimiterService } from './rate-limiter.service';

@Global()
@Module({
  providers: [redisProvider, RateLimiterService],
  exports: [REDIS_CLIENT, RateLimiterService],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.warn(
        `Redis did not close cleanly: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
