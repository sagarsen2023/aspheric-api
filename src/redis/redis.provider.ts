import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  db: number;
}

/**
 * Shared by the global client and by BullMQ. BullMQ opens its own connections
 * (it needs blocking commands on dedicated sockets) but takes the same
 * coordinates.
 */
export const redisConnectionOptions = (
  configService: ConfigService,
): RedisConnectionOptions => ({
  host: configService.get<string>('redisHost') ?? '127.0.0.1',
  port: configService.get<number>('redisPort') ?? 6379,
  password: configService.get<string>('redisPassword') || undefined,
  db: configService.get<number>('redisDb') ?? 0,
});

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const logger = new Logger('RedisClient');
    const client = new Redis({
      ...redisConnectionOptions(configService),
      maxRetriesPerRequest: 2,
    });

    client.on('error', (error: Error) => {
      logger.error(`Redis connection error: ${error.message}`);
    });
    client.on('connect', () => {
      logger.log('Connected to Redis');
    });

    return client;
  },
};
