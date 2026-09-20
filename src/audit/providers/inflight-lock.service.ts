import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.provider';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export interface AcquireResult {
  acquired: boolean;
  heldBy?: string;
}

@Injectable()
export class InflightLockService {
  private readonly logger = new Logger(InflightLockService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  key(identifier: string): string {
    return `audit:inflight:${identifier}`;
  }

  async acquire(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<AcquireResult> {
    try {
      const stored = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX');
      if (stored === 'OK') return { acquired: true };

      const heldBy = await this.redis.get(key);
      return { acquired: false, heldBy: heldBy ?? undefined };
    } catch (error) {
      this.logger.error(
        `Could not acquire in-flight lock, allowing request: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { acquired: true };
    }
  }

  async release(key: string, value: string): Promise<void> {
    try {
      await this.redis.eval(RELEASE_SCRIPT, 1, key, value);
    } catch (error) {
      this.logger.warn(
        `Could not release in-flight lock ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
