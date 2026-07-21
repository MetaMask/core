import * as allExports from './index.js';

describe('@metamask/json-rpc-engine', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "JsonRpcEngine",
        "asV2Middleware",
        "createAsyncMiddleware",
        "createIdRemapMiddleware",
        "createMethodMiddleware",
        "createOriginMiddleware",
        "createScaffoldMiddleware",
        "getUniqueId",
        "mergeMiddleware",
      ]
    `);
  });
});
