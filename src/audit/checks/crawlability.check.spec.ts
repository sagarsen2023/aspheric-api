import { blocksAllCrawlers } from './crawlability.check';

describe('blocksAllCrawlers', () => {
  it('flags a wildcard group that disallows the whole site', () => {
    expect(blocksAllCrawlers('User-agent: *\nDisallow: /')).toBe(true);
  });

  it('ignores a blanket block aimed at one named bot', () => {
    const robots = [
      'User-agent: BadBot',
      'Disallow: /',
      '',
      'User-agent: *',
      'Disallow: /admin',
    ].join('\n');

    expect(blocksAllCrawlers(robots)).toBe(false);
  });

  it('flags the wildcard group even when a named group precedes it', () => {
    const robots = [
      'User-agent: Googlebot',
      'Disallow: /private',
      '',
      'User-agent: *',
      'Disallow: /',
    ].join('\n');

    expect(blocksAllCrawlers(robots)).toBe(true);
  });

  it('treats consecutive user-agent lines as one group', () => {
    const robots = ['User-agent: Googlebot', 'User-agent: *', 'Disallow: /'].join(
      '\n',
    );

    expect(blocksAllCrawlers(robots)).toBe(true);
  });

  it('does not flag a site that only disallows specific paths', () => {
    const robots = [
      'User-agent: *',
      'Disallow: /cgi-bin/',
      'Disallow: /tmp/',
      'Sitemap: https://example.com/sitemap.xml',
    ].join('\n');

    expect(blocksAllCrawlers(robots)).toBe(false);
  });

  it('does not flag when an Allow re-opens part of the site', () => {
    const robots = ['User-agent: *', 'Disallow: /', 'Allow: /public'].join('\n');

    expect(blocksAllCrawlers(robots)).toBe(false);
  });

  it('ignores commented-out directives', () => {
    const robots = ['User-agent: *', '# Disallow: /', 'Disallow: /admin'].join(
      '\n',
    );

    expect(blocksAllCrawlers(robots)).toBe(false);
  });

  it('handles an empty or missing robots.txt', () => {
    expect(blocksAllCrawlers('')).toBe(false);
  });

  it('is case-insensitive about directive names', () => {
    expect(blocksAllCrawlers('USER-AGENT: *\nDISALLOW: /')).toBe(true);
  });
});
