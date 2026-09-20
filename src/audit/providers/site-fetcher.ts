import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { assertSafeUrl } from './url-guard';
import { Agent } from 'undici';
import { isIP } from 'node:net';

export interface FetchResult {
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  setCookie: string[];
  body: string;
  ttfb: number;
  totalTime: number;
  redirectChain: string[];
}

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT = 20_000;

const USER_AGENT =
  'Mozilla/5.0 (compatible; AsphericReadinessBot/1.0; +https://aspheric.app)';

@Injectable()
export class SiteFetcher {
  private readonly logger = new Logger(SiteFetcher.name);

  async fetch(
    input: string,
    options: {
      method?: 'GET' | 'HEAD';
      timeout?: number;
      readBody?: boolean;
      headers?: Record<string, string>;
    } = {},
  ): Promise<FetchResult> {
    const {
      method = 'GET',
      timeout = DEFAULT_TIMEOUT,
      readBody = true,
      headers: extraHeaders = {},
    } = options;

    const redirectChain: string[] = [];
    let current = input;
    const startedAt = Date.now();

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const { url, addresses } = await assertSafeUrl(current);
      redirectChain.push(url.toString());

      const entries = addresses.map((address) => ({
        address,
        family: isIP(address),
      }));
      const dispatcher = new Agent({
        connect: {
          lookup: (_hostname, options, callback) =>
            options.all
              ? callback(null, entries)
              : callback(null, entries[0].address, entries[0].family),
        },
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': USER_AGENT,
            accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            ...extraHeaders,
          },
          dispatcher,
        } as RequestInit & { dispatcher: Agent });
      } catch (error) {
        clearTimeout(timer);
        await dispatcher.close().catch(() => undefined);
        const reason = error instanceof Error ? error.message : String(error);
        throw new BadRequestException(
          `Could not reach ${url.toString()}: ${reason}`,
        );
      }

      const ttfb = Date.now() - startedAt;

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        clearTimeout(timer);
        await response.body?.cancel().catch(() => undefined);
        await dispatcher.close().catch(() => undefined);
        if (hop === MAX_REDIRECTS) {
          throw new BadRequestException(
            `Too many redirects (>${MAX_REDIRECTS}) starting at ${input}`,
          );
        }
        current = new URL(location, url).toString();
        continue;
      }

      const body =
        readBody && method !== 'HEAD'
          ? await this.readCapped(response, controller)
          : '';
      clearTimeout(timer);
      await dispatcher.close().catch(() => undefined);

      return {
        finalUrl: url.toString(),
        statusCode: response.status,
        headers: this.flattenHeaders(response.headers),
        setCookie: this.extractSetCookie(response.headers),
        body,
        ttfb,
        totalTime: Date.now() - startedAt,
        redirectChain,
      };
    }

    throw new BadRequestException(`Too many redirects starting at ${input}`);
  }

  private async readCapped(
    response: Response,
    controller: AbortController,
  ): Promise<string> {
    if (!response.body) return '';

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        received += value.byteLength;
        if (received >= MAX_BODY_BYTES) {
          controller.abort();
          break;
        }
      }
    } catch (error) {
      this.logger.debug(
        `Body read ended early for ${response.url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      reader.releaseLock?.();
    }

    return Buffer.concat(chunks).toString('utf8');
  }

  private flattenHeaders(headers: Headers): Record<string, string> {
    const flat: Record<string, string> = {};
    headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'set-cookie') flat[key.toLowerCase()] = value;
    });
    return flat;
  }

  private extractSetCookie(headers: Headers): string[] {
    const getSetCookie = (
      headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie;
    if (typeof getSetCookie === 'function') return getSetCookie.call(headers);
    const single = headers.get('set-cookie');
    return single ? [single] : [];
  }
}
