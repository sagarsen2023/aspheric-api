import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';

interface DataResponse<T> {
  data: T;
}

interface Paginated {
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
        const hasData = hasOwn(body, 'data');
        const paginated = hasOwn(body, 'totalCount');
        const message = hasOwn(body, 'message')
          ? (body as MessageResponse).message
          : undefined;

        return {
          statusCode,
          data: hasData ? (body as DataResponse<unknown>).data : body,
          ...(paginated ? { totalCount: (body as Paginated).totalCount } : {}),
          ...(message ? { message } : {}),
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
