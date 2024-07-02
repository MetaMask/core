import * as allExports from '.';

describe('@metamask/chain-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "ChainController",
      ]
    `);
  });
});
