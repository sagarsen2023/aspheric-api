import { BadRequestException } from '@nestjs/common';

// vi.hoisted keeps the mock fn available to the hoisted vi.mock factory, which
// lets the module under test be imported normally instead of via top-level
// await (illegal in this project's CommonJS output).
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));

vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

import { assertSafeUrl, isBlockedAddress } from './url-guard';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1',
  ])('blocks the private or reserved address %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1'])(
    'allows the public address %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  it.each(['::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1'])(
    'blocks the IPv6 address %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(true);
    },
  );

  it('allows a public IPv6 address', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('blocks anything that is not an IP at all', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

describe('assertSafeUrl', () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it('rejects non-http protocols', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects credentials embedded in the URL', async () => {
    await expect(
      assertSafeUrl('https://user:pass@example.com'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a loopback IP literal without touching DNS', async () => {
    await expect(assertSafeUrl('http://127.0.0.1:27017')).rejects.toThrow(
      /private or reserved/,
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects the cloud metadata endpoint', async () => {
    await expect(
      assertSafeUrl('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow(/private or reserved/);
  });

  it('rejects a public hostname that resolves to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '192.168.0.5', family: 4 }]);
    await expect(assertSafeUrl('https://evil.example.com')).rejects.toThrow(
      /private or reserved/,
    );
  });

  it('rejects when only one address in a round-robin set is private', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.9', family: 4 },
    ]);
    await expect(assertSafeUrl('https://mixed.example.com')).rejects.toThrow(
      /private or reserved/,
    );
  });

  it('accepts a hostname that resolves only to public addresses', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const { url, addresses } = await assertSafeUrl('https://example.com/path');
    expect(url.hostname).toBe('example.com');
    expect(addresses).toEqual(['93.184.216.34']);
  });

  it('rejects a hostname that does not resolve', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertSafeUrl('https://nope.example')).rejects.toThrow(
      /Could not resolve host/,
    );
  });
});
