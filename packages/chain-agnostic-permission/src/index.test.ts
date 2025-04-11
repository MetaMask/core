import * as allExports from '.';

describe('@metamask/chain-agnostic-permission', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "getEthAccounts",
        "setEthAccounts",
        "setNonSCACaipAccountIdsInCaip25CaveatValue",
        "getCaipAccountIdsFromScopesObjects",
        "getPermittedEthChainIds",
        "addPermittedEthChainId",
        "setPermittedEthChainIds",
        "overwriteCaipChainIdsInCaip25CaveatValue",
        "addCaipChainIdInCaip25CaveatValue",
        "getAllNonWalletNamespacesFromCaip25CaveatValue",
        "getAllScopesFromPermission",
        "getAllScopesFromCaip25CaveatValue",
        "getInternalScopesObject",
        "getSessionScopes",
        "getPermittedAccountsForScopes",
        "validateAndNormalizeScopes",
        "bucketScopes",
        "isNamespaceInScopesObject",
        "assertIsInternalScopeString",
        "KnownWalletRpcMethods",
        "KnownRpcMethods",
        "KnownWalletNamespaceRpcMethods",
        "KnownNotifications",
        "KnownWalletScopeString",
        "isKnownSessionPropertyValue",
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
        "generateCaip25Caveat",
        "KnownSessionProperties",
        "Caip25Errors",
      ]
    `);
  });
});
