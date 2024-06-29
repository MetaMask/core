import * as allExports from '.';

describe('@metamask/preferences-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "getDefaultPreferencesState",
        "PreferencesController",
        "ETHERSCAN_SUPPORTED_CHAIN_IDS",
      ]
    `);
  });
});
