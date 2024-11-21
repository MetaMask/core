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
        "KnownWalletRpcMethods",
        "KnownRpcMethods",
        "KnownWalletNamespaceRpcMethods",
        "KnownNotifications",
        "KnownWalletScopeString",
        "parseScopeString",
        "isSupportedScopeString",
        "isSupportedAccount",
        "isSupportedMethod",
        "isSupportedNotification",
        "normalizeScope",
        "mergeScopeObject",
        "mergeScopes",
        "normalizeAndMergeScopes",
        "isValidScope",
        "getValidScopes",
        "Caip25CaveatType",
        "createCaip25Caveat",
        "Caip25EndowmentPermissionName",
        "caip25EndowmentBuilder",
        "Caip25CaveatMutators",
      ]
    `);
  });
});
