/// <reference types="jest" />

import * as allExports from '.';

describe('@metamask/network-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
    Array [
      "Block",
      "NetworkMetadata",
      "NetworkConfiguration",
      "BuiltInNetworkClientId",
      "CustomNetworkClientId",
      "NetworkClientId",
      "NetworksMetadata",
      "NetworkState",
      "BlockTrackerProxy",
      "ProviderProxy",
      "NetworkControllerStateChangeEvent",
      "NetworkControllerNetworkWillChangeEvent",
      "NetworkControllerNetworkDidChangeEvent",
      "NetworkControllerInfuraIsBlockedEvent",
      "NetworkControllerInfuraIsUnblockedEvent",
      "NetworkControllerEvents",
      "NetworkControllerGetStateAction",
      "NetworkControllerGetEthQueryAction",
      "NetworkControllerGetNetworkClientByIdAction",
      "NetworkControllerGetSelectedNetworkClientAction",
      "NetworkControllerGetEIP1559CompatibilityAction",
      "NetworkControllerFindNetworkClientIdByChainIdAction",
      "NetworkControllerSetProviderTypeAction",
      "NetworkControllerSetActiveNetworkAction",
      "NetworkControllerGetNetworkConfigurationByNetworkClientId",
      "NetworkControllerActions",
      "NetworkControllerMessenger",
      "NetworkControllerOptions",
      "knownKeysOf",
      "NetworkController",
      "NetworkStatus",
      "INFURA_BLOCKED_KEY",
      "BlockTracker",
      "Provider",
      "NetworkClientConfiguration",
      "NetworkClientType",
      "NetworkClient",
    ]`);
  });
});
