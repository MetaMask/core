import * as allExports from '.';

describe('@metamask/preferences-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
    Array [
      "Identity",
      "EtherscanSupportedChains",
      "EtherscanSupportedHexChainId",
      "PreferencesState",
      "PreferencesControllerGetStateAction",
      "PreferencesControllerStateChangeEvent",
      "PreferencesControllerActions",
      "PreferencesControllerEvents",
      "AllowedEvents",
      "PreferencesControllerMessenger",
      "getDefaultPreferencesState",
      "PreferencesController",
      "ETHERSCAN_SUPPORTED_CHAIN_IDS"
    ]`);
  });
});
