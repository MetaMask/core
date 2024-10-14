import * as allExports from '.';

describe('@metamask/multichain', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "getEthAccounts",
        "setEthAccounts",
        "caipPermissionAdapterMiddleware",
        "getPermittedEthChainIds",
        "addPermittedEthChainId",
        "setPermittedEthChainIds",
        "walletGetSessionHandler",
        "walletInvokeMethodHandler",
        "walletRevokeSessionHandler",
        "multichainMethodCallValidatorMiddleware",
        "MultichainMiddlewareManager",
        "MultichainSubscriptionManager",
        "Caip25CaveatType",
        "Caip25CaveatFactoryFn",
        "Caip25EndowmentPermissionName",
        "caip25EndowmentBuilder",
        "Caip25CaveatMutatorFactories",
        "removeScope",
        "assertScopeSupported",
        "assertScopesSupported",
        "validateAndFlattenScopes",
        "bucketScopes",
        "bucketScopesBySupport",
        "filterScopesSupported",
        "isSupportedScopeString",
        "isSupportedAccount",
        "isSupportedMethod",
        "isSupportedNotification",
        "flattenScope",
        "mergeScopeObject",
        "mergeScopes",
        "flattenMergeScopes",
        "isValidScope",
        "validateScopes",
        "KnownWalletRpcMethods",
        "KnownRpcMethods",
        "KnownWalletNamespaceRpcMethods",
        "KnownNotifications",
        "parseScopeString",
      ]
    `);
  });
});
