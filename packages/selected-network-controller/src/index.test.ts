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

export type {
  SelectedNetworkControllerState,
  SelectedNetworkControllerStateChangeEvent,
  SelectedNetworkControllerGetSelectedNetworkStateAction,
  SelectedNetworkControllerGetNetworkClientIdForDomainAction,
  SelectedNetworkControllerSetNetworkClientIdForDomainAction,
  SelectedNetworkControllerActions,
  SelectedNetworkControllerEvents,
  SelectedNetworkControllerMessenger,
  SelectedNetworkControllerOptions,
  NetworkProxy,
  Domain,
} from './SelectedNetworkController';
export {
  SelectedNetworkControllerActionTypes,
  SelectedNetworkControllerEventTypes,
  SelectedNetworkController,
  METAMASK_DOMAIN,
} from './SelectedNetworkController';
export type { SelectedNetworkMiddlewareJsonRpcRequest } from './SelectedNetworkMiddleware';
export { createSelectedNetworkMiddleware } from './SelectedNetworkMiddleware';
