import { HttpException } from '@nestjs/common';
import { ErrorType } from '../types/error.type';

const errorHandler = (e: any): never => {
  const error = e as ErrorType;
  const statusCode: number = error.status || 500;
  const message = error.message || 'Internal Server Error';
  throw new HttpException(message, statusCode);
};

export { errorHandler };
