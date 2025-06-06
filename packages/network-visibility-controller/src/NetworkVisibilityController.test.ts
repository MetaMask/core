import { Messenger } from '@metamask/base-controller';
import { BtcScope, SolScope } from '@metamask/keyring-api';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import {
  RpcEndpointType,
  NetworkStatus,
  getDefaultNetworkControllerState,
} from '@metamask/network-controller';
import type {
  NetworkControllerStateChangeEvent,
  NetworkConfiguration,
  NetworkState,
} from '@metamask/network-controller';
import type { CaipChainId } from '@metamask/utils';

import {
  NetworkVisibilityController,
  CHAIN_IDS,
} from './NetworkVisibilityController';
import type { NetworkVisibilityControllerMessengerActions } from './NetworkVisibilityController';

const controllerName = 'NetworkVisibilityController';

// Helper function to build a network configuration
const buildNetworkConfig = (
  overrides: Partial<NetworkConfiguration> = {},
): NetworkConfiguration => {
  const defaultConfig: NetworkConfiguration = {
    blockExplorerUrls: [],
    chainId: '0x1337',
    defaultRpcEndpointIndex: 0,
    name: 'Test Network',
    nativeCurrency: 'ETH',
    rpcEndpoints: [
      {
        type: RpcEndpointType.Custom,
        networkClientId: 'test-client-id',
        url: 'https://test.endpoint',
        failoverUrls: [],
      },
    ],
  };

  return {
    ...defaultConfig,
    ...overrides,
  };
};

describe('NetworkVisibilityController', () => {
  let messenger: Messenger<
    NetworkVisibilityControllerMessengerActions,
    NetworkControllerStateChangeEvent
  >;
  let controller: NetworkVisibilityController;

  beforeEach(() => {
    messenger = new Messenger();
    controller = new NetworkVisibilityController({
      messenger: messenger.getRestricted({
        name: controllerName,
        allowedActions: [],
        allowedEvents: ['NetworkController:stateChange'],
      }),
    });
  });

  it('should instantiate with default state', () => {
    const { state } = controller;
    expect(state).toStrictEqual({
      orderedNetworkList: [],
      enabledNetworkMap: {},
    });
  });

  describe('updateNetworksList', () => {
    it('should update the ordered network list', () => {
      const chainIds: CaipChainId[] = [
        toEvmCaipChainId(CHAIN_IDS.SEPOLIA),
        toEvmCaipChainId(CHAIN_IDS.LINEA_SEPOLIA),
      ];

      controller.updateNetworksList(chainIds);

      const { state } = controller;
      expect(state.orderedNetworkList).toHaveLength(2);
      chainIds.forEach((chainId, index) => {
        expect(state.orderedNetworkList[index].networkId).toBe(chainId);
      });
    });

    it('should handle empty network list', () => {
      // First add some networks
      const initialChainIds: CaipChainId[] = [
        toEvmCaipChainId(CHAIN_IDS.SEPOLIA),
        toEvmCaipChainId(CHAIN_IDS.LINEA_SEPOLIA),
      ];
      controller.updateNetworksList(initialChainIds);

      // Then update with empty list
      controller.updateNetworksList([]);

      const { state } = controller;
      expect(state.orderedNetworkList).toHaveLength(0);
    });
  });

  describe('setEnabledNetworks', () => {
    it('should enable a single network', () => {
      const chainId = toEvmCaipChainId(CHAIN_IDS.SEPOLIA);
      controller.setEnabledNetworks(chainId);

      const { state } = controller;
      expect(state.enabledNetworkMap).toEqual({
        [chainId]: true,
      });
    });

    it('should enable multiple networks', () => {
      const chainIds = [
        toEvmCaipChainId(CHAIN_IDS.SEPOLIA),
        toEvmCaipChainId(CHAIN_IDS.LINEA_SEPOLIA),
      ];
      controller.setEnabledNetworks(chainIds);

      const { state } = controller;
      chainIds.forEach((chainId) => {
        expect(state.enabledNetworkMap[chainId]).toBe(true);
      });
    });

    it('should disable previously enabled networks', () => {
      // First enable some networks
      const initialChainIds = [
        toEvmCaipChainId(CHAIN_IDS.SEPOLIA),
        toEvmCaipChainId(CHAIN_IDS.LINEA_SEPOLIA),
      ];
      controller.setEnabledNetworks(initialChainIds);

      // Then enable a different set
      const newChainIds = [toEvmCaipChainId(CHAIN_IDS.LOCALHOST)];
      controller.setEnabledNetworks(newChainIds);

      const { state } = controller;
      // New networks should be enabled
      newChainIds.forEach((chainId) => {
        expect(state.enabledNetworkMap[chainId]).toBe(true);
      });
      // Previously enabled networks should be disabled
      initialChainIds.forEach((chainId) => {
        expect(state.enabledNetworkMap[chainId]).toBeUndefined();
      });
    });
  });

  describe('onNetworkControllerStateChange', () => {
    it('should update orderedNetworkList when new networks are added', () => {
      const mockNetworkConfig = buildNetworkConfig({
        chainId: CHAIN_IDS.SEPOLIA,
        name: 'Sepolia Test Network',
        nativeCurrency: 'ETH',
        blockExplorerUrls: ['https://sepolia.etherscan.io'],
        rpcEndpoints: [
          {
            type: RpcEndpointType.Custom,
            networkClientId: 'test-client-id',
            url: 'https://sepolia.infura.io/v3/123',
            failoverUrls: [],
          },
        ],
      });

      const mockNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          [CHAIN_IDS.SEPOLIA]: mockNetworkConfig,
        },
        networksMetadata: {
          'test-client-id': {
            EIPS: {
              1559: true,
            },
            status: NetworkStatus.Available,
          },
        },
      };

      messenger.publish('NetworkController:stateChange', mockNetworkState, []);

      const { state } = controller;
      const expectedNetworks = [toEvmCaipChainId(CHAIN_IDS.SEPOLIA)];
      expect(state.orderedNetworkList).toHaveLength(1);
      expectedNetworks.forEach((networkId) => {
        expect(
          state.orderedNetworkList.some((n) => n.networkId === networkId),
        ).toBe(true);
      });
    });

    it('should filter out test networks', () => {
      const mockNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          [CHAIN_IDS.SEPOLIA]: buildNetworkConfig({
            chainId: CHAIN_IDS.SEPOLIA,
            name: 'Sepolia Test Network',
          }),
          [CHAIN_IDS.LINEA_SEPOLIA]: buildNetworkConfig({
            chainId: CHAIN_IDS.LINEA_SEPOLIA,
            name: 'Linea Sepolia Test Network',
          }),
          [CHAIN_IDS.LOCALHOST]: buildNetworkConfig({
            chainId: CHAIN_IDS.LOCALHOST,
            name: 'Localhost Test Network',
          }), // This is a test network
        },
        networksMetadata: {},
      };

      messenger.publish('NetworkController:stateChange', mockNetworkState, []);

      const { state } = controller;
      const chainIds = state.orderedNetworkList.map((n) => n.networkId);
      expect(chainIds).not.toContain(toEvmCaipChainId(CHAIN_IDS.LOCALHOST));
    });

    it('should preserve non-EVM networks (BTC and SOL)', () => {
      // First add some networks
      const mockNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          [CHAIN_IDS.SEPOLIA]: buildNetworkConfig({
            chainId: CHAIN_IDS.SEPOLIA,
            name: 'Sepolia Test Network',
          }),
        },
        networksMetadata: {},
      };

      // Add BTC and SOL to the network list
      controller.updateNetworksList([
        toEvmCaipChainId(CHAIN_IDS.SEPOLIA),
        BtcScope.Mainnet,
        SolScope.Mainnet,
      ]);

      // Update network state
      messenger.publish('NetworkController:stateChange', mockNetworkState, []);

      const { state } = controller;
      const expectedNetworks = [
        toEvmCaipChainId(CHAIN_IDS.SEPOLIA),
        BtcScope.Mainnet,
        SolScope.Mainnet,
      ];
      expectedNetworks.forEach((networkId) => {
        expect(
          state.orderedNetworkList.some((n) => n.networkId === networkId),
        ).toBe(true);
      });
    });

    it('should remove networks that no longer exist', () => {
      // First add some networks
      const initialNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          [CHAIN_IDS.SEPOLIA]: buildNetworkConfig({
            chainId: CHAIN_IDS.SEPOLIA,
            name: 'Sepolia Test Network',
          }),
          [CHAIN_IDS.LINEA_SEPOLIA]: buildNetworkConfig({
            chainId: CHAIN_IDS.LINEA_SEPOLIA,
            name: 'Linea Sepolia Test Network',
          }),
        },
        networksMetadata: {},
      };

      messenger.publish(
        'NetworkController:stateChange',
        initialNetworkState,
        [],
      );

      // Then update with fewer networks
      const updatedNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          [CHAIN_IDS.SEPOLIA]: buildNetworkConfig({
            chainId: CHAIN_IDS.SEPOLIA,
            name: 'Sepolia Test Network',
          }),
        },
        networksMetadata: {},
      };

      messenger.publish(
        'NetworkController:stateChange',
        updatedNetworkState,
        [],
      );

      const { state } = controller;
      expect(state.orderedNetworkList).toHaveLength(1);
      expect(state.orderedNetworkList[0].networkId).toBe(
        toEvmCaipChainId(CHAIN_IDS.SEPOLIA),
      );
    });

    it('should handle empty network configurations', () => {
      const mockNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {},
        networksMetadata: {},
      };

      messenger.publish('NetworkController:stateChange', mockNetworkState, []);

      const { state } = controller;
      expect(state.orderedNetworkList).toHaveLength(0);
    });
  });
});
