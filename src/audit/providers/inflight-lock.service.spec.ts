import type Redis from 'ioredis';
import { InflightLockService } from './inflight-lock.service';

const redisMock = () => ({
  set: vi.fn(),
  get: vi.fn(),
  eval: vi.fn(),
});

describe('InflightLockService', () => {
  let redis: ReturnType<typeof redisMock>;
  let service: InflightLockService;

  beforeEach(() => {
    redis = redisMock();
    service = new InflightLockService(redis as unknown as Redis);
  });

  it('namespaces the key by client identifier', () => {
    expect(service.key('203.0.113.7')).toBe('audit:inflight:203.0.113.7');
  });

  it('acquires a free lock with NX and a TTL', async () => {
    redis.set.mockResolvedValue('OK');

    const outcome = await service.acquire('k', 'audit-1', 300);

    expect(outcome.acquired).toBe(true);
    expect(redis.set).toHaveBeenCalledWith('k', 'audit-1', 'EX', 300, 'NX');
  });

  it('refuses a held lock and reports who holds it', async () => {
    redis.set.mockResolvedValue(null);
    redis.get.mockResolvedValue('audit-already-running');

    const outcome = await service.acquire('k', 'audit-2', 300);

    expect(outcome.acquired).toBe(false);
    expect(outcome.heldBy).toBe('audit-already-running');
  });

  it('still refuses when the holder value has vanished mid-check', async () => {
    redis.set.mockResolvedValue(null);
    redis.get.mockResolvedValue(null);

    const outcome = await service.acquire('k', 'audit-2', 300);

    expect(outcome.acquired).toBe(false);
    expect(outcome.heldBy).toBeUndefined();
  });

  it('fails open when Redis is unreachable', async () => {
    // Losing the concurrency limit beats losing the endpoint.
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));

    expect((await service.acquire('k', 'audit-3', 300)).acquired).toBe(true);
  });

  it('releases through a compare-and-delete, never a bare DEL', async () => {
    redis.eval.mockResolvedValue(1);

    await service.release('k', 'audit-1');

    const [script, keyCount, key, value] = redis.eval.mock.calls[0];
    expect(script).toMatch(/redis\.call\("get", KEYS\[1\]\) == ARGV\[1\]/);
    expect(script).toMatch(/redis\.call\("del", KEYS\[1\]\)/);
    expect(keyCount).toBe(1);
    expect(key).toBe('k');
    // Passing our own value is what stops us deleting a successor's lock.
    expect(value).toBe('audit-1');
  });

  it('swallows release failures - the TTL is the backstop', async () => {
    redis.eval.mockRejectedValue(new Error('LOADING'));

    await expect(service.release('k', 'audit-1')).resolves.toBeUndefined();
  });
});
