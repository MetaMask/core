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
        "walletGetSession",
        "walletInvokeMethod",
        "walletRevokeSession",
        "multichainMethodCallValidatorMiddleware",
        "MultichainMiddlewareManager",
        "MultichainSubscriptionManager",
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
        "Caip25CaveatType",
        "Caip25CaveatFactoryFn",
        "Caip25EndowmentPermissionName",
        "caip25EndowmentBuilder",
        "Caip25CaveatMutatorFactories",
        "removeScope",
        "KnownWalletScopeString",
        "KnownWalletRpcMethods",
        "KnownRpcMethods",
        "KnownWalletNamespaceRpcMethods",
        "KnownNotifications",
        "parseScopeString",
      ]
    `);
  });
});
