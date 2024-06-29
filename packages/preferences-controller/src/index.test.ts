import * as allExports from '.';

describe('@metamask/preferences-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "PreferencesController",
        "getDefaultPreferencesState",
        "ETHERSCAN_SUPPORTED_CHAIN_IDS",
        "Identity",
        "EtherscanSupportedChains",
        "EtherscanSupportedHexChainId",
        "PreferencesState",
        "PreferencesControllerGetStateAction",
        "PreferencesControllerStateChangeEvent",
        "PreferencesControllerActions",
        "PreferencesControllerEvents",
        "AllowedEvents",
        "PreferencesControllerMessenger"
      ]
    `);
  });
});
