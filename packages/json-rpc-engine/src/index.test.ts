import * as allExports from './index.js';

describe('@metamask/json-rpc-engine', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "asV2Middleware",
        "createAsyncMiddleware",
        "createMethodMiddleware",
        "createOriginMiddleware",
        "createScaffoldMiddleware",
        "getUniqueId",
        "createIdRemapMiddleware",
        "JsonRpcEngine",
        "mergeMiddleware",
      ]
    `);
  });
});
