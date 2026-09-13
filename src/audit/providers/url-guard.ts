import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Blocks SSRF. We fetch URLs supplied by anonymous callers, so without this
 * the API is a proxy into whatever the server can reach - cloud metadata
 * endpoints (169.254.169.254), localhost services, the private VPC.
 *
 * Every hostname is resolved and *all* returned addresses are checked, and
 * the guard is re-run on each redirect hop (see SiteFetcher) because a public
 * host can 302 you straight to 127.0.0.1.
 */

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // RFC1918 private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local / cloud metadata
  ['172.16.0.0', 12], // RFC1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // RFC1918 private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

const toInt = (ip: string): number =>
  ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;

const isBlockedV4 = (ip: string): boolean => {
  const value = toInt(ip);
  return BLOCKED_V4.some(([range, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (toInt(range) & mask);
  });
};

const isBlockedV6 = (ip: string): boolean => {
  const address = ip.toLowerCase().split('%')[0];

  // IPv4-mapped (::ffff:127.0.0.1) smuggles a v4 address through a v6 literal.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped) return isBlockedV4(mapped[1]);

  if (address === '::' || address === '::1') return true;
  if (/^f[cd]/.test(address)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(address)) return true; // fe80::/10 link-local
  if (address.startsWith('ff')) return true; // ff00::/8 multicast
  if (address.startsWith('2001:db8')) return true; // documentation
  return false;
};

export const isBlockedAddress = (ip: string): boolean => {
  const family = isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return true; // not an IP at all - refuse rather than guess
};

export interface SafeUrl {
  url: URL;
  addresses: string[];
}

/**
 * Throws unless `input` is an http(s) URL that resolves exclusively to public
 * addresses. Returns the parsed URL plus the resolved IPs.
 */
export const assertSafeUrl = async (input: string): Promise<SafeUrl> => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BadRequestException(`Not a valid URL: ${input}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(
      `Only http and https URLs can be audited, received "${url.protocol}"`,
    );
  }

  if (url.username || url.password) {
    throw new BadRequestException('Credentials in the URL are not allowed');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  // A bare IP literal never needs DNS - check it directly.
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new BadRequestException(
        `Refusing to audit a private or reserved address: ${hostname}`,
      );
    }
    return { url, addresses: [hostname] };
  }

  let resolved: Array<{ address: string }>;
  try {
    resolved = await lookup(hostname, { all: true });
  } catch {
    throw new BadRequestException(`Could not resolve host: ${hostname}`);
  }

  if (!resolved.length) {
    throw new BadRequestException(`Host did not resolve: ${hostname}`);
  }

  // Every address must be public. One private answer in a round-robin set is
  // enough for an attacker to eventually get routed there.
  const blocked = resolved.find((entry) => isBlockedAddress(entry.address));
  if (blocked) {
    throw new BadRequestException(
      `Refusing to audit ${hostname}: it resolves to the private or reserved address ${blocked.address}`,
    );
  }

  return { url, addresses: resolved.map((entry) => entry.address) };
};
