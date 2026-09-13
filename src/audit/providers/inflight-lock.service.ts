import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.provider';

/**
 * Releases the lock only if we still own it. A plain DEL would let a caller
 * whose lock had already expired delete the *next* caller's lock, which is
 * exactly how a mutex stops being a mutex.
 */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export interface AcquireResult {
  acquired: boolean;
  /** When the lock was already held, the value of the holder (an auditId). */
  heldBy?: string;
}

/**
 * A per-client mutex in Redis, so the limit holds across every API instance
 * rather than per-process.
 */
@Injectable()
export class InflightLockService {
  private readonly logger = new Logger(InflightLockService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  key(identifier: string): string {
    return `audit:inflight:${identifier}`;
  }

  /**
   * Takes the lock if it is free. The TTL is a safety net: if a worker dies
   * mid-audit the lock expires instead of banning the client forever.
   */
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
      // Redis being unreachable must not take the endpoint down. We fail open:
      // losing the concurrency limit is better than losing the service, and
      // the per-minute rate limit still applies.
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
      // The TTL will clear it regardless.
      this.logger.warn(
        `Could not release in-flight lock ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
