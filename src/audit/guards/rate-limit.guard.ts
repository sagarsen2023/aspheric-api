import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RateLimiterService } from '../../redis/rate-limiter.service';
import { clientIdentifier } from '../providers/client-ip';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'rate-limit-options';

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimiter: RateLimiterService,
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
    const key = `${context.getClass().name}:${context.getHandler().name}:${identifier}`;
    const result = await this.rateLimiter.hit(key, options);

    response.setHeader('X-RateLimit-Limit', options.limit);
    response.setHeader('Retry-After', result.retryAfterSeconds);

    if (!result.allowed) {
      throw new HttpException(
        `Rate limit exceeded: ${options.limit} requests per ${options.windowSeconds}s. Try again shortly.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
