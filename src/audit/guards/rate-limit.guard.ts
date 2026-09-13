import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.provider';
import { clientIdentifier } from '../providers/client-ip';

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'rate-limit-options';

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Fixed-window limiter backed by Redis, so the budget is shared across every
 * API instance. Audits are expensive (a Chrome run, or a slice of a shared
 * PageSpeed quota), and these endpoints are unauthenticated.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const identifier = clientIdentifier(request);
    const window = Math.floor(Date.now() / 1000 / options.windowSeconds);
    const key = `ratelimit:${context.getClass().name}:${context.getHandler().name}:${identifier}:${window}`;

    let used: number;
    try {
      const [incremented] = await this.redis
        .multi()
        .incr(key)
        .expire(key, options.windowSeconds)
        .exec()
        .then((results) => results ?? []);
      used = Number(incremented?.[1] ?? 0);
    } catch (error) {
      // Redis being down must not take the API down with it.
      this.logger.error(
        `Rate limit check failed, allowing request: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return true;
    }

    const remaining = Math.max(options.limit - used, 0);
    response.setHeader('X-RateLimit-Limit', options.limit);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader(
      'X-RateLimit-Reset',
      (window + 1) * options.windowSeconds,
    );

    if (used > options.limit) {
      throw new HttpException(
        `Rate limit exceeded: ${options.limit} requests per ${options.windowSeconds}s. Try again shortly.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

}
