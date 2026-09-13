import { DeliveryCheck } from './delivery.check';
import {
  AuditContext,
  AuditStrategy,
  CheckStatus,
} from '../types/audit.type';

const contextWith = (headers: Record<string, string>): AuditContext => ({
  url: 'https://example.com/',
  origin: 'https://example.com',
  hostname: 'example.com',
  strategy: AuditStrategy.MOBILE,
  response: {
    finalUrl: 'https://example.com/',
    statusCode: 200,
    headers,
    setCookie: [],
    body: '<html></html>',
    ttfb: 100,
    totalTime: 200,
    redirectChain: ['https://example.com/'],
  },
});

const cachingResult = async (cacheControl: string, extra = {}) => {
  const results = await new DeliveryCheck().run(
    contextWith({ 'cache-control': cacheControl, ...extra }),
  );
  return results.find((check) => check.id === 'delivery.caching')!;
};

describe('DeliveryCheck caching', () => {
  it('does not pass a response that forbids caching', async () => {
    // The regression: any Cache-Control header used to score a full pass,
    // including one whose entire purpose is to disable caching.
    const check = await cachingResult(
      'private, no-cache, no-store, max-age=0, must-revalidate',
    );

    expect(check.status).toBe(CheckStatus.WARN);
    expect(check.evidence?.explicitlyUncacheable).toBe(true);
    expect(check.remediation).toMatch(/uncacheable/i);
  });

  it('passes a genuinely cacheable response', async () => {
    const check = await cachingResult('public, max-age=3600');

    expect(check.status).toBe(CheckStatus.PASS);
    expect(check.evidence?.maxAge).toBe(3600);
    expect(check.evidence?.explicitlyUncacheable).toBe(false);
  });

  it('passes when only a validator is present', async () => {
    const results = await new DeliveryCheck().run(
      contextWith({ etag: 'W/"abc123"' }),
    );
    const check = results.find((c) => c.id === 'delivery.caching')!;

    expect(check.status).toBe(CheckStatus.PASS);
  });

  it('warns when there is no caching information at all', async () => {
    const results = await new DeliveryCheck().run(contextWith({}));
    const check = results.find((c) => c.id === 'delivery.caching')!;

    expect(check.status).toBe(CheckStatus.WARN);
  });

  it('treats no-store as uncacheable even alongside a long max-age', async () => {
    const check = await cachingResult('max-age=600, no-store');
    expect(check.status).toBe(CheckStatus.WARN);
  });
});

describe('DeliveryCheck compression', () => {
  const compressionResult = async (encoding?: string) => {
    const results = await new DeliveryCheck().run(
      contextWith(encoding ? { 'content-encoding': encoding } : {}),
    );
    return results.find((check) => check.id === 'delivery.compression')!;
  };

  it('tells a gzip site to add brotli, not to enable gzip', async () => {
    const check = await compressionResult('gzip');

    expect(check.status).toBe(CheckStatus.WARN);
    expect(check.remediation).toMatch(/further/i);
    expect(check.remediation).not.toMatch(/No compression detected/i);
  });

  it('passes brotli outright', async () => {
    expect((await compressionResult('br')).status).toBe(CheckStatus.PASS);
  });

  it('fails when nothing is compressed', async () => {
    const check = await compressionResult();

    expect(check.status).toBe(CheckStatus.FAIL);
    expect(check.remediation).toMatch(/No compression detected/i);
  });
});
