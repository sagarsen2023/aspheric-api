import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { AuthService } from '../../auth/auth.service';
import { REDIS_CLIENT } from '../../redis/redis.provider';
import { clientIdentifier } from './client-ip';

const FREE_AUDIT_PREFIX = 'audit:free:';
const FREE_AUDIT_WINDOW_SECONDS = 24 * 60 * 60;

export interface AuditAccess {
  clientId: string;
  anonymousKey?: string;
}

@Injectable()
export class AuditAccessService {
  constructor(
    private readonly authService: AuthService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Authenticated users are identified by account; anonymous users get one IP-bound audit. */
  async authorize(request: Request): Promise<AuditAccess> {
    const token = this.bearerToken(request);
    if (token) {
      const user = await this.authService.validateToken(token);
      return { clientId: `user:${user._id}` };
    }

    const ip = clientIdentifier(request);
    const ipHash = createHash('sha256').update(ip).digest('hex');

    const anonymousKey = `${FREE_AUDIT_PREFIX}${ipHash}`;
    let claimed: 'OK' | null;
    try {
      claimed = await this.redis.set(
        anonymousKey,
        '1',
        'EX',
        FREE_AUDIT_WINDOW_SECONDS,
        'NX',
      );
    } catch {
      throw new ServiceUnavailableException(
        'Free website checks are temporarily unavailable. Please try again shortly.',
      );
    }

    if (claimed !== 'OK') {
      throw new HttpException(
        'This network has already used its free website check for today. Try again after 24 hours or sign up to run more checks.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return { clientId: `ip:${ip}`, anonymousKey };
  }

  async release(access: AuditAccess): Promise<void> {
    if (!access.anonymousKey) return;
    await this.redis.del(access.anonymousKey).catch(() => undefined);
  }

  private bearerToken(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
