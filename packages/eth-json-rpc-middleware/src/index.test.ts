import * as indexModule from '.';

describe('index module', () => {
  it('exports expected identifiers', () => {
    expect(indexModule).toMatchInlineSnapshot(`
      Object {
        "createBlockCacheMiddleware": [Function],
        "createBlockRefMiddleware": [Function],
        "createBlockRefRewriteMiddleware": [Function],
        "createBlockTrackerInspectorMiddleware": [Function],
        "createFetchMiddleware": [Function],
        "createInflightCacheMiddleware": [Function],
        "createRetryOnEmptyMiddleware": [Function],
        "createWalletMiddleware": [Function],
        "providerAsMiddleware": [Function],
      }
    `);
  });
});
