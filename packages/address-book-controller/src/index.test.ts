import * as allExports from '.';

describe('@metamask/address-book-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "getDefaultAddressBookControllerState",
        "AddressBookController",
      ]
    `);
  });
});
