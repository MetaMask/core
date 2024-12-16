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
        "getInternalScopesObject",
        "getSessionScopes",
        "caipPermissionAdapterMiddleware",
        "walletGetSession",
        "walletInvokeMethod",
        "walletRevokeSession",
        "multichainMethodCallValidatorMiddleware",
        "MultichainMiddlewareManager",
        "MultichainSubscriptionManager",
        "validateAndNormalizeScopes",
        "bucketScopes",
        "KnownWalletRpcMethods",
        "KnownRpcMethods",
        "KnownWalletNamespaceRpcMethods",
        "KnownNotifications",
        "KnownWalletScopeString",
        "filterScopeObjectsSupported",
        "parseScopeString",
        "normalizeScope",
        "mergeScopeObject",
        "mergeScopes",
        "normalizeAndMergeScopes",
        "caip25CaveatBuilder",
        "Caip25CaveatType",
        "createCaip25Caveat",
        "Caip25EndowmentPermissionName",
        "caip25EndowmentBuilder",
        "Caip25CaveatMutators",
      ]
    `);
  });
});
