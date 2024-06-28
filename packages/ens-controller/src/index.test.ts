import * as allExports from '.';

describe('@metamask/ens-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "DEFAULT_ENS_NETWORK_MAP",
        "EnsController",
      ]
    `);
  });
});
