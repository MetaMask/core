import * as allExports from '.';

describe('@metamask/accounts-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "AccountsController",
        "keyringTypeToName",
        "getUUIDFromAddressOfNormalAccount",
      ]
    `);
  });
});
