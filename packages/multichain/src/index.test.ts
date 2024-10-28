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
        "validateAndNormalizeScopes",
        "KnownWalletRpcMethods",
        "KnownRpcMethods",
        "KnownWalletNamespaceRpcMethods",
        "KnownNotifications",
        "parseScopeString",
        "KnownWalletScopeString",
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
        "createCaip25Caveat",
        "Caip25EndowmentPermissionName",
        "caip25EndowmentBuilder",
        "Caip25CaveatMutatorFactories",
        "removeScope",
      ]
    `);
  });
});
