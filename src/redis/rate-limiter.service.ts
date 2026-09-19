import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

export interface RateLimitRule {
  /** Hits allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Public read endpoints may fail open; sensitive actions should not. */
  failOpen?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
}

/**
 * Counts hits per key in Redis, so a limit holds across every API instance.
 *
 * Each window starts at a key's first hit rather than on a clock boundary, so
 * "one per 30 seconds" cannot be dodged by straddling a boundary. Keys are
 * hashed, which keeps identifiers such as email addresses out of Redis.
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async hit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${createHash('sha256').update(key).digest('hex')}`;

    try {
      const results = await this.redis
        .multi()
        // Starts the window only if it isn't running; INCR keeps the TTL.
        .set(redisKey, 0, 'EX', rule.windowSeconds, 'NX')
        .incr(redisKey)
        .ttl(redisKey)
        .exec();

      const count = Number(results?.[1]?.[1] ?? 0);
      const ttl = Number(results?.[2]?.[1] ?? rule.windowSeconds);

      return {
        allowed: count <= rule.limit,
        retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds,
      };
    } catch (error) {
      this.logger.error(
        `Rate limit check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (rule.failOpen === false) {
        throw new ServiceUnavailableException(
          'Request limiting is temporarily unavailable. Try again shortly.',
        );
      }
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
}
