import * as allExports from '.';

describe('@metamask/keyring-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "KeyringTypes",
        "AccountImportStrategy",
        "SignTypedDataVersion",
        "keyringBuilderFactory",
        "KeyringController",
        "isCustodyKeyring",
        "getDefaultKeyringState",
      ]
    `);
  });
});
