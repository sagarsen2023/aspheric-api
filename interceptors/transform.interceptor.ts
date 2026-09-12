import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

export interface BaseResponse<T> {
  statusCode: number;
  data: T | T[] | { data: T | T[]; totalCount?: number };
  timeStamp: string;
  totalCount?: number;
  message?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  BaseResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<BaseResponse<T>> {
    const response = context.switchToHttp().getResponse<Response>();
    const statusCode = response.statusCode;
    return next.handle().pipe(
      map((data: T) => ({
        statusCode,
        totalCount: (data as unknown as { totalCount?: number })?.totalCount,
        data:
          (data as unknown as { data?: T; totalCount?: number })?.data ?? data,
        timeStamp: new Date().toLocaleString(),
        message: (data as unknown as { message?: string })?.message,
      })),
    );
  }
}
