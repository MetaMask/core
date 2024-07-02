import * as allExports from '.';

describe('@metamask/selected-network-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "SelectedNetworkControllerActionTypes",
        "SelectedNetworkControllerEventTypes",
        "SelectedNetworkController",
        "METAMASK_DOMAIN",
        "createSelectedNetworkMiddleware",
      ]
    `);
  });
});
