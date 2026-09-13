import { CheckResult } from '../types/audit.type';

/**
 * Plain-language consequence copy, keyed by check id.
 *
 * Deliberately separate from `remediation`, which the checks build at run time
 * because it interpolates measured values ("TTFB was 1475ms"). Impact copy
 * never varies with the result, so storing these strings on every report would
 * bloat documents the entity already calls bulky, and would freeze the wording
 * of every report already inside the 30-day window. Merging on read means an
 * edit here reaches the whole backlog.
 *
 * Answers "what breaks if I ignore this", not "what do I type to fix it".
 */
export const CHECK_IMPACT: Record<string, string> = {
  // Response headers
  'headers.hsts':
    'A visitor on public Wi-Fi can have their first request forced down to plain HTTP, where an attacker can read or rewrite the page before it reaches them.',
  'headers.csp':
    'This is the main defence against injected scripts. On pages handling checkout or personal details, it is what stops a compromised third-party script from quietly harvesting what customers type.',
  'headers.frame-ancestors':
    'Anyone can load your pages in a hidden iframe on their own site and stack a fake button over yours, so a visitor clicks something on your site without ever seeing it.',
  'headers.content-type-options':
    'Browsers are left free to guess what a file really is, so a response you serve as an image can be re-interpreted and executed as a script.',
  'headers.referrer-policy':
    'Full URLs, including anything in the query string, leak to every third-party domain your pages link out to or load resources from.',
  'headers.permissions-policy':
    'Browser features you never use stay available to any script on the page, so injected code can ask for camera, microphone or location.',
  'headers.cross-origin-isolation':
    'Windows your pages open, or that open your pages, keep a handle on each other and can interfere through shared browser state.',
  'headers.info-leakage':
    'You advertise your exact software versions, letting an automated scanner match you against a public list of known vulnerabilities and go straight to the ones that apply.',

  // TLS
  'tls.https':
    'Everything a visitor sends and receives, including anything they type, travels in the clear and can be read or altered by anyone on the network path.',
  'tls.https-redirect':
    'A visitor who types the bare domain, or follows an old http:// link, is served over an unencrypted connection instead of being moved to the secure one.',
  'tls.certificate-valid':
    'Browsers show a full-page security warning before anyone can reach the site, and most visitors leave rather than click through it.',
  'tls.certificate-expiry':
    'When the certificate lapses, every visitor hits a security warning and the site is effectively down until it is renewed.',
  'tls.protocol':
    'Old TLS versions have known weaknesses, and anything below TLS 1.2 fails PCI DSS, which matters the moment you handle card details directly.',
  'tls.handshake':
    'Some clients cannot negotiate a connection at all, so the site is intermittently unreachable in ways that are hard to reproduce.',

  // Cookies
  'cookies.flags':
    'Cookies without the right flags can be read by scripts on the page or sent over unencrypted connections, which is how session hijacking usually starts.',
  'cookies.secure':
    'The cookie is sent over plain HTTP as well as HTTPS, so anyone watching the network can copy it and reuse it as the logged-in user.',
  'cookies.http-only':
    'Any script on the page can read the cookie, so a single injected script is enough to steal a live session.',
  'cookies.same-site':
    'The cookie rides along on requests started by other sites, which is what makes cross-site request forgery possible.',

  // DNS and email
  'dns.spf':
    'Anyone can send email that appears to come from your domain. For a shop, that means convincing fake order and delivery messages reaching your own customers.',
  'dns.dmarc':
    'Mail servers have no instruction on what to do with forged mail claiming to be you, so spoofed messages are delivered rather than rejected.',
  'dns.caa':
    'Any certificate authority in the world can issue a valid certificate for your domain to someone else, and browsers will trust it.',

  // SEO
  'seo.title':
    'The title is the clickable line in search results and the label on a browser tab. A missing or over-long one gets truncated or rewritten by the search engine.',
  'seo.description':
    'The search engine writes its own summary by scraping the page, so you lose control of the sales pitch sitting under your link.',
  'seo.canonical':
    'Query strings and trailing-slash variants of the same page compete with each other in search rankings instead of pooling their authority.',
  'seo.viewport':
    'Phones render a shrunken desktop layout that visitors have to pinch and zoom to read, and search engines treat the page as not mobile friendly.',
  'seo.lang':
    'Screen readers guess at pronunciation and browser translation tools pick the wrong source language.',
  'seo.h1':
    'Search engines and screen readers lose the clearest single signal of what the page is about, and heading navigation breaks for assistive technology.',
  'seo.open-graph':
    'Links shared on WhatsApp, Instagram or Slack render as bare URLs with no image or description, which measurably lowers how often people click them.',
  'seo.structured-data':
    'Search engines cannot build rich results for you, so no star ratings, opening hours, prices or business panel beside your listing.',
  'seo.indexable':
    'The page is excluded from search results entirely. Nothing else in this report matters while that is true.',
  'seo.image-alt':
    'Screen reader users get no description of the image, and search engines cannot index it for image search.',

  // Crawlability
  'crawlability.robots':
    'Crawlers fall back to guessing what they may visit, and have no pointer to your sitemap.',
  'crawlability.sitemap':
    'Search engines have to discover pages by following links, so new or deeply nested pages take much longer to get indexed, or are missed entirely.',
  'crawlability.security-txt':
    'A researcher who finds a vulnerability has no documented way to reach you, so it goes unreported or goes public.',
  'crawlability.not-found':
    'Pages that do not exist return a success status, so search engines index empty or junk URLs alongside your real ones.',

  // Delivery
  'delivery.status':
    'The page does not load. Every other finding in this report is moot until it does.',
  'delivery.ttfb':
    'Every visitor waits on a blank screen before anything can start rendering, and this delay is added to every other page timing.',
  'delivery.compression':
    'Pages transfer larger than they need to, which costs the most on the slow mobile connections where speed already hurts most.',
  'delivery.caching':
    'Nothing can be reused between visits, so every page view costs a full origin render and traffic spikes hit your server at full force.',
  'delivery.cdn':
    'Every request travels to your single origin server, so visitors far from it wait longer and a burst of traffic has nothing absorbing it.',
  'delivery.redirects':
    'Each extra hop is a full network round trip before the browser can even begin loading the real page.',

  // Lighthouse
  'lighthouse.performance':
    "Google's composite measure of how quickly the page becomes usable. It feeds search ranking, and slow pages lose visitors before they see anything.",
  'lighthouse.accessibility':
    'Automated checks on contrast, labels and focus order. Failures here are barriers for real users, and carry legal exposure in several markets.',
  'lighthouse.best-practices':
    'General correctness: console errors, deprecated APIs, insecure resource loads. Individually minor, collectively a sign of drift.',
  'lighthouse.seo':
    "Google's own view of whether the page can be crawled and understood.",
  'lighthouse.lcp':
    'How long until the biggest thing on screen finishes drawing. This is the closest measure of when a visitor feels the page has arrived, and it is a ranking signal.',
  'lighthouse.cls':
    'How much the layout jumps while loading. This is the effect where someone goes to tap a button and a late-loading image shoves it somewhere else.',
  'lighthouse.tbt':
    'How long the page is frozen and ignoring taps because JavaScript is busy. The page looks ready but does not respond.',
  'lighthouse.opportunities':
    "Lighthouse's own estimate of the loading time you could recover from waste it can identify.",
};

/** What the API returns: a check result plus its static consequence copy. */
export type EnrichedCheckResult = CheckResult & { impact?: string };

/** Attaches impact copy to each result. An unknown id simply carries none. */
export const withImpact = (checks: CheckResult[]): EnrichedCheckResult[] =>
  checks.map((check) => {
    const impact = CHECK_IMPACT[check.id];
    return impact ? { ...check, impact } : check;
  });
