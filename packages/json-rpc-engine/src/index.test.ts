import * as allExports from '.';

describe('@metamask/json-rpc-engine', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "asV2Middleware",
        "createAsyncMiddleware",
        "createScaffoldMiddleware",
        "getUniqueId",
        "createIdRemapMiddleware",
        "JsonRpcEngine",
        "mergeMiddleware",
      ]
    `);
  });
});
