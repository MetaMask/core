import * as allExports from '.';

describe('@metamask/selected-network-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "SelectedNetworkControllerState",
        "SelectedNetworkControllerStateChangeEvent",
        "SelectedNetworkControllerGetSelectedNetworkStateAction",
        "SelectedNetworkControllerGetNetworkClientIdForDomainAction",
        "SelectedNetworkControllerSetNetworkClientIdForDomainAction",
        "SelectedNetworkControllerActions",
        "SelectedNetworkControllerEvents",
        "SelectedNetworkControllerMessenger",
        "SelectedNetworkControllerOptions",
        "NetworkProxy",
        "Domain",
        "SelectedNetworkControllerActionTypes",
        "SelectedNetworkControllerEventTypes",
        "SelectedNetworkController",
        "METAMASK_DOMAIN",
        "SelectedNetworkMiddlewareJsonRpcRequest",
        "createSelectedNetworkMiddleware",
      ]
    `);
  });
});
