import * as allExports from '.';

describe('@metamask/json-rpc-engine/v2', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "asLegacyMiddleware",
        "getUniqueId",
        "JsonRpcServer",
        "isNotification",
        "isRequest",
        "JsonRpcEngineError",
        "JsonRpcEngineV2",
      ]
    `);
  });
});
