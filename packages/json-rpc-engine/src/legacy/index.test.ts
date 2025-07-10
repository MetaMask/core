import * as allExports from '.';

describe('@metamask/json-rpc-engine/legacy', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "createAsyncMiddleware",
        "createScaffoldMiddleware",
        "createIdRemapMiddleware",
        "JsonRpcEngine",
        "mergeMiddleware",
      ]
    `);
  });
});
