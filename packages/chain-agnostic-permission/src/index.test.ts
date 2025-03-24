import * as allExports from '.';

describe('@metamask/chain-agnostic-permission', () => {
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
        "getPermittedAccountsForScopes",
        "validateAndNormalizeScopes",
        "bucketScopes",
        "assertIsInternalScopeString",
        "KnownWalletRpcMethods",
        "KnownRpcMethods",
        "KnownWalletNamespaceRpcMethods",
        "KnownNotifications",
        "KnownWalletScopeString",
        "getSupportedScopeObjects",
        "parseScopeString",
        "getUniqueArrayItems",
        "normalizeScope",
        "mergeScopeObject",
        "mergeNormalizedScopes",
        "mergeInternalScopes",
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
