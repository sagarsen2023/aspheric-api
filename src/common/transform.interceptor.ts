import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';

interface Paginated<T> {
  data: T;
  totalCount: number;
}

interface MessageResponse {
  message: string;
}

const hasOwn = (value: unknown, key: string): boolean =>
  typeof value === 'object' && value !== null && Object.hasOwn(value, key);

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const statusCode = context
      .switchToHttp()
      .getResponse<Response>().statusCode;

    return next.handle().pipe(
      map((body: unknown) => {
        const paginated = hasOwn(body, 'data') && hasOwn(body, 'totalCount');
        const message = hasOwn(body, 'message')
          ? (body as MessageResponse).message
          : undefined;

        return {
          statusCode,
          data: paginated ? (body as Paginated<unknown>).data : body,
          ...(paginated
            ? { totalCount: (body as Paginated<unknown>).totalCount }
            : {}),
          ...(message ? { message } : {}),
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
