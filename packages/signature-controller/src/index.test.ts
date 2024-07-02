import * as allExports from '.';

describe('@metamask/signature-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "SignatureController",
      ]
    `);
  });
});
