import { extractSchemaTypes } from './seo.check';

describe('extractSchemaTypes', () => {
  it('reads a plain top-level @type', () => {
    expect(extractSchemaTypes({ '@type': 'Organization' })).toEqual([
      'Organization',
    ]);
  });

  it('reads every node of an @graph', () => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Auram' },
        { '@type': 'WebSite' },
        { '@type': 'BreadcrumbList' },
      ],
    };

    expect(extractSchemaTypes(jsonLd)).toEqual([
      'Organization',
      'WebSite',
      'BreadcrumbList',
    ]);
  });

  it('reads an array of nodes', () => {
    const jsonLd = [{ '@type': 'Product' }, { '@type': 'Offer' }];
    expect(extractSchemaTypes(jsonLd)).toEqual(['Product', 'Offer']);
  });

  it('handles a node declaring multiple types', () => {
    expect(extractSchemaTypes({ '@type': ['Store', 'LocalBusiness'] })).toEqual([
      'Store',
      'LocalBusiness',
    ]);
  });

  it('reports unknown only when there really is no type', () => {
    expect(extractSchemaTypes({ name: 'no type here' })).toEqual(['unknown']);
  });

  it('ignores primitives and null', () => {
    expect(extractSchemaTypes(null)).toEqual([]);
    expect(extractSchemaTypes('string')).toEqual([]);
  });
});
