import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';

abstract class BaseAuthGuard {
  constructor(protected readonly authService: AuthService) {}

  protected extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  protected async attachUser(request: Request, token: string) {
    const payload = await this.authService.validateToken(token);

    request['user'] = payload;
    request['authToken'] = token;
  }
}

@Injectable()
export class AuthGuard extends BaseAuthGuard implements CanActivate {
  constructor(authService: AuthService) {
    super(authService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      await this.attachUser(request, token);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

@Injectable()
export class OptionalAuthGuard extends BaseAuthGuard implements CanActivate {
  constructor(authService: AuthService) {
    super(authService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      return true;
    }

    try {
      await this.attachUser(request, token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}
