import * as allExports from '.';

describe('@metamask/multichain-api-middleware', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "walletCreateSession",
        "walletGetSession",
        "walletInvokeMethod",
        "walletRevokeSession",
        "multichainMethodCallValidatorMiddleware",
        "MultichainMiddlewareManager",
        "MultichainSubscriptionManager",
        "MultichainApiNotifications",
      ]
    `);
  });
});
