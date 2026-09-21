import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AuditCheck, result, verdict } from '../types/check.type';
import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from '../types/audit.type';
import { SiteFetcher } from '../providers/site-fetcher';
import {
  SEO_TITLE_MIN,
  SEO_TITLE_MAX,
  SEO_DESCRIPTION_MIN,
  SEO_DESCRIPTION_MAX,
  SEO_ICON_PROBE_TIMEOUT,
} from '../audit.constants';

export const extractSchemaTypes = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(extractSchemaTypes);
  if (!node || typeof node !== 'object') return [];

  const record = node as Record<string, unknown>;
  const types: string[] = [];

  const type = record['@type'];
  if (typeof type === 'string') types.push(type);
  else if (Array.isArray(type)) {
    types.push(
      ...type.filter((entry): entry is string => typeof entry === 'string'),
    );
  }

  if (record['@graph']) types.push(...extractSchemaTypes(record['@graph']));

  return types.length ? types : ['unknown'];
};

export interface SiteIcons {
  favicon: string | null;
  appleTouchIcon: string | null;
  manifest: string | null;
}

/** The icon and manifest links on a page, resolved against its URL. */
export const findSiteIcons = (
  $: cheerio.CheerioAPI,
  pageUrl: string,
): SiteIcons => {
  const href = (selector: string) => {
    const value = $(selector).first().attr('href')?.trim();
    if (!value) return null;
    try {
      return new URL(value, pageUrl).toString();
    } catch {
      return null;
    }
  };

  return {
    favicon: href('link[rel~="icon" i]'),
    appleTouchIcon: href(
      'link[rel~="apple-touch-icon" i], link[rel~="apple-touch-icon-precomposed" i]',
    ),
    manifest: href('link[rel~="manifest" i]'),
  };
};

interface FaviconProbe {
  url: string;
  declared: boolean;
  loaded: boolean;
  statusCode: number | null;
}

@Injectable()
export class SeoCheck implements AuditCheck {
  readonly id = 'seo';
  readonly defaultCategory = AuditCategory.SEO;

  constructor(private readonly fetcher: SiteFetcher) {}

  async run(context: AuditContext): Promise<CheckResult[]> {
    const $ = cheerio.load(context.response.body);
    const category = AuditCategory.SEO;
    const icons = findSiteIcons($, context.response.finalUrl);
    const favicon = await this.probeFavicon(icons.favicon, context.origin);

    const title = $('head title').first().text().trim();
    const description =
      $('meta[name="description"]').attr('content')?.trim() ?? '';
    const canonical = $('link[rel="canonical"]').attr('href')?.trim() ?? '';
    const viewport = $('meta[name="viewport"]').attr('content')?.trim() ?? '';
    const lang = $('html').attr('lang')?.trim() ?? '';
    const robotsMeta = $('meta[name="robots"]').attr('content')?.trim() ?? '';
    const h1s = $('h1')
      .map((_, element) => $(element).text().trim())
      .get();

    const openGraph = {
      title: $('meta[property="og:title"]').attr('content') ?? null,
      description: $('meta[property="og:description"]').attr('content') ?? null,
      image: $('meta[property="og:image"]').attr('content') ?? null,
      url: $('meta[property="og:url"]').attr('content') ?? null,
    };

    const structuredData = $('script[type="application/ld+json"]')
      .map((_, element) => {
        try {
          return extractSchemaTypes(JSON.parse($(element).text()));
        } catch {
          return ['invalid-json'];
        }
      })
      .get()
      .flat();

    const images = $('img').get();
    const missingAlt = images.filter(
      (image) => $(image).attr('alt') === undefined,
    ).length;

    return [
      this.title(title, category),
      this.description(description, category),
      result({
        id: 'seo.canonical',
        title: 'Canonical URL',
        category,
        status: verdict(!!canonical, CheckStatus.WARN),
        weight: 2,
        evidence: { canonical: canonical || null },
        remediation:
          'Add a <link rel="canonical"> so duplicate URLs (query strings, trailing slashes) do not split your ranking.',
      }),
      result({
        id: 'seo.viewport',
        title: 'Mobile viewport declared',
        category,
        status: verdict(/width=device-width/i.test(viewport)),
        weight: 2,
        evidence: { viewport: viewport || null },
        remediation:
          'Add <meta name="viewport" content="width=device-width, initial-scale=1"> or mobile browsers will render a zoomed-out desktop layout.',
      }),
      result({
        id: 'seo.lang',
        title: 'Document language declared',
        category,
        status: verdict(!!lang, CheckStatus.WARN),
        weight: 1,
        evidence: { lang: lang || null },
        remediation:
          'Set a lang attribute on <html> so screen readers and translators pick the right pronunciation rules.',
      }),
      this.headings(h1s, category),
      this.socialCards(openGraph, category),
      this.siteIcons(icons, favicon, category),
      result({
        id: 'seo.structured-data',
        title: 'Structured data',
        category,
        status: structuredData.length
          ? structuredData.includes('invalid-json')
            ? CheckStatus.WARN
            : CheckStatus.PASS
          : CheckStatus.WARN,
        weight: 1,
        evidence: { types: structuredData },
        remediation:
          'Add JSON-LD structured data (Organization, Product, Article...) so search engines can build rich results.',
      }),
      result({
        id: 'seo.indexable',
        title: 'Page is indexable',
        category,
        status: verdict(!/noindex/i.test(robotsMeta)),
        weight: 3,
        evidence: { robotsMeta: robotsMeta || null },
        remediation:
          'This page carries a noindex directive - remove it unless the page is deliberately hidden from search engines.',
      }),
      result({
        id: 'seo.image-alt',
        title: 'Images have alt text',
        category: AuditCategory.ACCESSIBILITY,
        status:
          missingAlt === 0
            ? CheckStatus.PASS
            : missingAlt > images.length / 2
              ? CheckStatus.FAIL
              : CheckStatus.WARN,
        weight: 2,
        evidence: { totalImages: images.length, missingAlt },
        remediation:
          'Give every <img> an alt attribute. Use alt="" for purely decorative images so screen readers skip them.',
      }),
    ];
  }

  private title(value: string, category: AuditCategory): CheckResult {
    let status = CheckStatus.FAIL;
    if (value.length >= SEO_TITLE_MIN && value.length <= SEO_TITLE_MAX) {
      status = CheckStatus.PASS;
    } else if (value.length) {
      status = CheckStatus.WARN;
    }

    return result({
      id: 'seo.title',
      title: 'Page title',
      category,
      status,
      weight: 3,
      evidence: { title: value || null, length: value.length },
      remediation: `Write a unique <title> between ${SEO_TITLE_MIN} and ${SEO_TITLE_MAX} characters - longer titles get truncated in results pages.`,
    });
  }

  private description(value: string, category: AuditCategory): CheckResult {
    let status = CheckStatus.FAIL;
    if (
      value.length >= SEO_DESCRIPTION_MIN &&
      value.length <= SEO_DESCRIPTION_MAX
    ) {
      status = CheckStatus.PASS;
    } else if (value.length) {
      status = CheckStatus.WARN;
    }

    return result({
      id: 'seo.description',
      title: 'Meta description',
      category,
      status,
      weight: 2,
      evidence: { description: value || null, length: value.length },
      remediation: `Write a meta description between ${SEO_DESCRIPTION_MIN} and ${SEO_DESCRIPTION_MAX} characters summarising the page.`,
    });
  }

  private headings(h1s: string[], category: AuditCategory): CheckResult {
    let status = CheckStatus.PASS;
    if (h1s.length === 0) status = CheckStatus.FAIL;
    else if (h1s.length > 1) status = CheckStatus.WARN;

    return result({
      id: 'seo.h1',
      title: 'Single H1 heading',
      category,
      status,
      weight: 1,
      evidence: { count: h1s.length, headings: h1s.slice(0, 5) },
      remediation:
        'Use exactly one <h1> describing the page, then nest <h2>/<h3> beneath it.',
    });
  }

  private socialCards(
    openGraph: Record<string, string | null>,
    category: AuditCategory,
  ): CheckResult {
    const missing = Object.entries(openGraph)
      .filter(([, value]) => !value)
      .map(([key]) => `og:${key}`);

    let status = CheckStatus.PASS;
    if (missing.length === Object.keys(openGraph).length) {
      status = CheckStatus.FAIL;
    } else if (missing.length) {
      status = CheckStatus.WARN;
    }

    return result({
      id: 'seo.open-graph',
      title: 'Social share cards',
      category,
      status,
      weight: 1,
      evidence: { openGraph, missing },
      remediation:
        'Add og:title, og:description, og:image and og:url so links shared on social platforms render a preview card.',
    });
  }
  /**
   * Browsers fall back to /favicon.ico when a page links no icon, so that is
   * what gets checked then. An HTML answer is a soft 404, not an icon.
   */
  private async probeFavicon(
    declared: string | null,
    origin: string,
  ): Promise<FaviconProbe> {
    const url = declared ?? `${origin}/favicon.ico`;
    // Inline icons need no request. `data:,` is a deliberately empty icon.
    if (url.startsWith('data:')) {
      return {
        url,
        declared: true,
        loaded: url.startsWith('data:image/'),
        statusCode: null,
      };
    }

    try {
      const response = await this.fetcher.fetch(url, {
        timeout: SEO_ICON_PROBE_TIMEOUT,
      });
      const contentType = response.headers['content-type'] ?? '';
      return {
        url,
        declared: declared !== null,
        loaded:
          response.statusCode === 200 && !contentType.startsWith('text/html'),
        statusCode: response.statusCode,
      };
    } catch {
      return {
        url,
        declared: declared !== null,
        loaded: false,
        statusCode: null,
      };
    }
  }

  private siteIcons(
    icons: SiteIcons,
    favicon: FaviconProbe,
    category: AuditCategory,
  ): CheckResult {
    const missing = [
      icons.appleTouchIcon ? null : 'apple-touch-icon',
      icons.manifest ? null : 'manifest',
    ].filter((item): item is string => item !== null);

    let status = CheckStatus.PASS;
    let remediation =
      'Your favicon, Apple touch icon and web app manifest are all in place.';

    if (!favicon.loaded) {
      status = CheckStatus.FAIL;
      if (favicon.url.startsWith('data:')) {
        remediation =
          'The page sets an empty favicon, so browsers and search results show a generic icon. Link a real one with <link rel="icon" href="/favicon.svg" type="image/svg+xml">.';
      } else if (favicon.declared) {
        const reason =
          favicon.statusCode === 200
            ? 'returned a web page instead of an image'
            : `did not load${favicon.statusCode ? ` (status ${favicon.statusCode})` : ''}`;
        remediation = `The favicon linked from the page (${favicon.url}) ${reason}. Point <link rel="icon"> at an image file that exists.`;
      } else {
        remediation =
          'Add a favicon: put a favicon.ico at the site root, or link one with <link rel="icon" href="/favicon.svg" type="image/svg+xml">.';
      }
    } else if (missing.length) {
      status = CheckStatus.WARN;
      remediation = [
        icons.appleTouchIcon
          ? null
          : 'Add <link rel="apple-touch-icon" href="/apple-touch-icon.png"> with a 180×180 PNG for iPhone home screens.',
        icons.manifest
          ? null
          : 'Add <link rel="manifest" href="/site.webmanifest"> listing 192×192 and 512×512 icons for Android.',
      ]
        .filter(Boolean)
        .join(' ');
    }

    return result({
      id: 'seo.icons',
      title: 'Favicon and app icons',
      category,
      status,
      weight: 1,
      evidence: {
        // An inline icon can be kilobytes long; its type is enough.
        favicon: favicon.url.startsWith('data:')
          ? `${favicon.url.split(',')[0]},…`
          : favicon.url,
        faviconLinked: favicon.declared,
        faviconStatus: favicon.statusCode,
        appleTouchIcon: icons.appleTouchIcon,
        manifest: icons.manifest,
        missing: favicon.loaded ? missing : ['favicon', ...missing],
      },
      remediation,
    });
  }
}
