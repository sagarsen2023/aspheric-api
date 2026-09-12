import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
export interface BaseResponse<T> {
    statusCode: number;
    data: T | T[] | {
        data: T | T[];
        totalCount?: number;
    };
    timeStamp: string;
    totalCount?: number;
    message?: string;
}
export declare class TransformInterceptor<T> implements NestInterceptor<T, BaseResponse<T>> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<BaseResponse<T>>;
}
