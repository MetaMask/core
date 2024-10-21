import * as allExports from '.';

describe('@metamask/multichain', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "getEthAccounts",
        "setEthAccounts",
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
        "validateAndNormalizeScopes",
        "bucketScopes",
        "bucketScopesBySupport",
        "filterScopesSupported",
        "isSupportedScopeString",
        "isSupportedAccount",
        "isSupportedMethod",
        "isSupportedNotification",
        "normalizeScope",
        "mergeScopeObject",
        "mergeScopes",
        "normalizeAndMergeScopes",
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
