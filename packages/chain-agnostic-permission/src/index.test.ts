import * as allExports from '.';

describe('@metamask/chain-agnostic-permission', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "getEthAccounts",
        "setEthAccounts",
        "setPermittedAccounts",
        "getPermittedEthChainIds",
        "addPermittedEthChainId",
        "setPermittedEthChainIds",
        "setPermittedChainIds",
        "addPermittedChainId",
        "getInternalScopesObject",
        "getSessionScopes",
        "getPermittedAccountsForScopes",
        "isKnownSessionPropertyValue",
        "validateAndNormalizeScopes",
        "bucketScopes",
        "assertIsInternalScopeString",
        "KnownWalletRpcMethods",
        "KnownRpcMethods",
        "KnownWalletNamespaceRpcMethods",
        "KnownNotifications",
        "KnownWalletScopeString",
        "getSupportedScopeObjects",
        "getCaipAccountIdsFromScopesObjects",
        "getAllScopesFromScopesObjects",
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
        "generateCaip25Caveat",
        "KnownSessionProperties",
        "Caip25Errors",
      ]
    `);
  });
});
