import * as allExports from '.';

describe('@metamask/json-rpc-engine', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "asV2Middleware",
        "createAsyncMiddleware",
        "createScaffoldMiddleware",
        "createIdRemapMiddleware",
        "JsonRpcEngine",
        "mergeMiddleware",
      ]
    `);
  });
});
