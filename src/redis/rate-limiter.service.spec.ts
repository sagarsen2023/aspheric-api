import type Redis from 'ioredis';
import { RateLimiterService } from './rate-limiter.service';

/** A Redis double whose MULTI resolves to [SET NX, INCR, TTL] results. */
const redisMock = (count: number, ttl: number) => {
  const pipeline = {
    set: vi.fn().mockReturnThis(),
    incr: vi.fn().mockReturnThis(),
    ttl: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([
      [null, count === 1 ? 'OK' : null],
      [null, count],
      [null, ttl],
    ]),
  };
  return { multi: vi.fn(() => pipeline), pipeline };
};

const rule = { limit: 2, windowSeconds: 60 };

describe('RateLimiterService', () => {
  it('allows hits up to the limit', async () => {
    const redis = redisMock(2, 45);
    const limiter = new RateLimiterService(redis as unknown as Redis);

    await expect(limiter.hit('otp:ravi', rule)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 45,
    });
  });

  it('refuses hits past the limit and says when to retry', async () => {
    const redis = redisMock(3, 12);
    const limiter = new RateLimiterService(redis as unknown as Redis);

    await expect(limiter.hit('otp:ravi', rule)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 12,
    });
  });

  it('starts the window on the first hit and hashes the key', async () => {
    const redis = redisMock(1, 60);
    const limiter = new RateLimiterService(redis as unknown as Redis);

    await limiter.hit('registration-otp:ravi@zenpaycart.in', rule);

    const [key, value, mode, seconds, condition] =
      redis.pipeline.set.mock.calls[0];
    expect(key).toMatch(/^ratelimit:[0-9a-f]{64}$/);
    expect(key).not.toContain('ravi');
    expect([value, mode, seconds, condition]).toEqual([0, 'EX', 60, 'NX']);
  });

  it('fails open when Redis is unreachable', async () => {
    const redis = redisMock(1, 60);
    redis.pipeline.exec.mockRejectedValue(new Error('ECONNREFUSED'));
    const limiter = new RateLimiterService(redis as unknown as Redis);

    expect((await limiter.hit('otp:ravi', rule)).allowed).toBe(true);
  });
});
