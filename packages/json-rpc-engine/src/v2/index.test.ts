import * as allExports from '.';

describe('@metamask/json-rpc-engine/v2', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports).sort()).toMatchInlineSnapshot(`
      [
        "JsonRpcEngineError",
        "JsonRpcEngineV2",
        "JsonRpcServer",
        "MiddlewareContext",
        "asLegacyMiddleware",
        "createOriginMiddleware",
        "createScaffoldMiddleware",
        "getUniqueId",
        "isNotification",
        "isRequest",
      ]
    `);
  });
});
