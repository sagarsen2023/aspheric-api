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
import { RATE_LIMIT_KEY } from '../audit.constants';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

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

    const identifier = request.ip ?? request.socket.remoteAddress ?? 'unknown';
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
