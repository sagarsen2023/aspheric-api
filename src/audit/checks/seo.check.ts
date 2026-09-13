import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { AuditCheck, result, verdict } from '../types/check.type';
import {
  AuditCategory,
  AuditContext,
  CheckResult,
  CheckStatus,
} from '../types/audit.type';

/**
 * Pulls every @type out of a JSON-LD block. Real-world markup is rarely a flat
 * object with a top-level @type: Next.js, Yoast and friends emit arrays, or a
 * single object wrapping an @graph of nodes. Reading only the root @type
 * reports "unknown" for most sites that are, in fact, marked up correctly.
 */
export const extractSchemaTypes = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(extractSchemaTypes);
  if (!node || typeof node !== 'object') return [];

  const record = node as Record<string, unknown>;
  const types: string[] = [];

  const type = record['@type'];
  if (typeof type === 'string') types.push(type);
  else if (Array.isArray(type)) {
    types.push(...type.filter((entry): entry is string => typeof entry === 'string'));
  }

  if (record['@graph']) types.push(...extractSchemaTypes(record['@graph']));

  return types.length ? types : ['unknown'];
};

const TITLE_MIN = 10;
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 160;

@Injectable()
export class SeoCheck implements AuditCheck {
  readonly id = 'seo';
  readonly defaultCategory = AuditCategory.SEO;

  async run(context: AuditContext): Promise<CheckResult[]> {
    const $ = cheerio.load(context.response.body);
    const category = AuditCategory.SEO;

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
    if (value.length >= TITLE_MIN && value.length <= TITLE_MAX) {
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
      remediation: `Write a unique <title> between ${TITLE_MIN} and ${TITLE_MAX} characters - longer titles get truncated in results pages.`,
    });
  }

  private description(value: string, category: AuditCategory): CheckResult {
    let status = CheckStatus.FAIL;
    if (value.length >= DESCRIPTION_MIN && value.length <= DESCRIPTION_MAX) {
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
      remediation: `Write a meta description between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters summarising the page.`,
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
}
