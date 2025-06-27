import { Messenger } from '@metamask/base-controller';
import { BtcScope, SolScope } from '@metamask/keyring-api';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import {
  RpcEndpointType,
  getDefaultNetworkControllerState,
} from '@metamask/network-controller';
import type {
  NetworkControllerStateChangeEvent,
  NetworkConfiguration,
  NetworkState,
} from '@metamask/network-controller';
import type { CaipChainId } from '@metamask/utils';

import { NetworkOrderController } from '../src/NetworkOrderController';
import type { NetworkOrderControllerMessengerActions } from '../src/NetworkOrderController';

const controllerName = 'NetworkOrderController';

// Test chain IDs that should be filtered out
const TEST_CHAIN_IDS = {
  SEPOLIA: '0xaa36a7',
  LINEA_SEPOLIA: '0xe705',
  LOCALHOST: '0x539',
  MEGAETH_TESTNET: '0x18c6',
  SEI: '0x531',
} as const;

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

describe('NetworkOrderController', () => {
  let messenger: Messenger<
    NetworkOrderControllerMessengerActions,
    NetworkControllerStateChangeEvent
  >;
  let controller: NetworkOrderController;

  beforeEach(() => {
    messenger = new Messenger();
    controller = new NetworkOrderController({
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
    });
  });

  describe('updateNetworksList', () => {
    it('should update the ordered network list', () => {
      const chainIds: CaipChainId[] = [
        toEvmCaipChainId(TEST_CHAIN_IDS.SEPOLIA),
        toEvmCaipChainId(TEST_CHAIN_IDS.LINEA_SEPOLIA),
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
        toEvmCaipChainId(TEST_CHAIN_IDS.SEPOLIA),
        toEvmCaipChainId(TEST_CHAIN_IDS.LINEA_SEPOLIA),
      ];
      controller.updateNetworksList(initialChainIds);

      // Then update with empty list
      controller.updateNetworksList([]);

      const { state } = controller;
      expect(state.orderedNetworkList).toHaveLength(0);
    });
  });

  describe('onNetworkControllerStateChange', () => {
    it('should update orderedNetworkList when new networks are added', () => {
      const mockNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          // Use a non-test network instead of Sepolia
          '0x1': buildNetworkConfig({
            chainId: '0x1',
            name: 'Ethereum Mainnet',
          }),
        },
        networksMetadata: {},
      };

      messenger.publish('NetworkController:stateChange', mockNetworkState, []);

      const { state } = controller;
      const expectedNetworks = [toEvmCaipChainId('0x1')];
      expect(state.orderedNetworkList).toHaveLength(1);
      expectedNetworks.forEach((networkId) => {
        expect(
          state.orderedNetworkList.some(
            (n: { networkId: CaipChainId }) => n.networkId === networkId,
          ),
        ).toBe(true);
      });
    });

    it('should filter out test networks', () => {
      const mockNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          // Add all test networks
          [TEST_CHAIN_IDS.SEPOLIA]: buildNetworkConfig({
            chainId: TEST_CHAIN_IDS.SEPOLIA,
            name: 'Sepolia Test Network',
          }),
          [TEST_CHAIN_IDS.LINEA_SEPOLIA]: buildNetworkConfig({
            chainId: TEST_CHAIN_IDS.LINEA_SEPOLIA,
            name: 'Linea Sepolia Test Network',
          }),
          [TEST_CHAIN_IDS.LOCALHOST]: buildNetworkConfig({
            chainId: TEST_CHAIN_IDS.LOCALHOST,
            name: 'Localhost Test Network',
          }),
          [TEST_CHAIN_IDS.MEGAETH_TESTNET]: buildNetworkConfig({
            chainId: TEST_CHAIN_IDS.MEGAETH_TESTNET,
            name: 'MegaETH Test Network',
          }),
          [TEST_CHAIN_IDS.SEI]: buildNetworkConfig({
            chainId: TEST_CHAIN_IDS.SEI,
            name: 'SEI Test Network',
          }),
          // Add a non-test network
          '0x1': buildNetworkConfig({
            chainId: '0x1',
            name: 'Ethereum Mainnet',
          }),
        },
        networksMetadata: {},
      };

      // First add all networks to the ordered list
      controller.updateNetworksList([
        toEvmCaipChainId(TEST_CHAIN_IDS.SEPOLIA),
        toEvmCaipChainId(TEST_CHAIN_IDS.LINEA_SEPOLIA),
        toEvmCaipChainId(TEST_CHAIN_IDS.LOCALHOST),
        toEvmCaipChainId(TEST_CHAIN_IDS.MEGAETH_TESTNET),
        toEvmCaipChainId(TEST_CHAIN_IDS.SEI),
        toEvmCaipChainId('0x1'),
      ]);

      // Update network state
      messenger.publish('NetworkController:stateChange', mockNetworkState, []);

      const { state } = controller;
      const chainIds = state.orderedNetworkList.map(
        (n: { networkId: CaipChainId }) => n.networkId,
      );

      // Verify that all test networks are filtered out
      expect(chainIds).not.toContain(toEvmCaipChainId(TEST_CHAIN_IDS.SEPOLIA));
      expect(chainIds).not.toContain(
        toEvmCaipChainId(TEST_CHAIN_IDS.LINEA_SEPOLIA),
      );
      expect(chainIds).not.toContain(
        toEvmCaipChainId(TEST_CHAIN_IDS.LOCALHOST),
      );
      expect(chainIds).not.toContain(
        toEvmCaipChainId(TEST_CHAIN_IDS.MEGAETH_TESTNET),
      );

      // Verify that non-test networks are preserved
      expect(chainIds).toContain(toEvmCaipChainId('0x1'));
    });

    it('should preserve non-EVM networks (BTC and SOL)', () => {
      // First add some networks
      const mockNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          // Use a non-test network
          '0x1': buildNetworkConfig({
            chainId: '0x1',
            name: 'Ethereum Mainnet',
          }),
        },
        networksMetadata: {},
      };

      // Add BTC and SOL to the network list
      controller.updateNetworksList([
        toEvmCaipChainId('0x1'),
        BtcScope.Mainnet,
        SolScope.Mainnet,
      ]);

      // Update network state
      messenger.publish('NetworkController:stateChange', mockNetworkState, []);

      const { state } = controller;
      const expectedNetworks = [
        toEvmCaipChainId('0x1'),
        BtcScope.Mainnet,
        SolScope.Mainnet,
      ];
      expect(state.orderedNetworkList).toHaveLength(3);
      expectedNetworks.forEach((networkId) => {
        expect(
          state.orderedNetworkList.some(
            (n: { networkId: CaipChainId }) => n.networkId === networkId,
          ),
        ).toBe(true);
      });
    });

    it('should remove networks that no longer exist', () => {
      // First add some networks
      const initialNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          // Use non-test networks
          '0x1': buildNetworkConfig({
            chainId: '0x1',
            name: 'Ethereum Mainnet',
          }),
          '0x89': buildNetworkConfig({
            chainId: '0x89',
            name: 'Polygon Mainnet',
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
          '0x1': buildNetworkConfig({
            chainId: '0x1',
            name: 'Ethereum Mainnet',
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
        toEvmCaipChainId('0x1'),
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

    it('should filter out all test networks defined in TEST_CHAINS', () => {
      const mockNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          // Add all test networks
          [TEST_CHAIN_IDS.SEPOLIA]: buildNetworkConfig({
            chainId: TEST_CHAIN_IDS.SEPOLIA,
            name: 'Sepolia Test Network',
          }),
          [TEST_CHAIN_IDS.LINEA_SEPOLIA]: buildNetworkConfig({
            chainId: TEST_CHAIN_IDS.LINEA_SEPOLIA,
            name: 'Linea Sepolia Test Network',
          }),
          [TEST_CHAIN_IDS.LOCALHOST]: buildNetworkConfig({
            chainId: TEST_CHAIN_IDS.LOCALHOST,
            name: 'Localhost Test Network',
          }),
          [TEST_CHAIN_IDS.MEGAETH_TESTNET]: buildNetworkConfig({
            chainId: TEST_CHAIN_IDS.MEGAETH_TESTNET,
            name: 'MegaETH Test Network',
          }),
          [TEST_CHAIN_IDS.SEI]: buildNetworkConfig({
            chainId: TEST_CHAIN_IDS.SEI,
            name: 'SEI Test Network',
          }),
          // Add a non-test network
          '0x1': buildNetworkConfig({
            chainId: '0x1',
            name: 'Ethereum Mainnet',
          }),
        },
        networksMetadata: {},
      };

      // First add all networks to the ordered list
      controller.updateNetworksList([
        toEvmCaipChainId(TEST_CHAIN_IDS.SEPOLIA),
        toEvmCaipChainId(TEST_CHAIN_IDS.LINEA_SEPOLIA),
        toEvmCaipChainId(TEST_CHAIN_IDS.LOCALHOST),
        toEvmCaipChainId(TEST_CHAIN_IDS.MEGAETH_TESTNET),
        toEvmCaipChainId(TEST_CHAIN_IDS.SEI),
        toEvmCaipChainId('0x1'),
      ]);

      // Update network state
      messenger.publish('NetworkController:stateChange', mockNetworkState, []);

      const { state } = controller;
      const chainIds = state.orderedNetworkList.map(
        (n: { networkId: CaipChainId }) => n.networkId,
      );

      // Verify that all test networks are filtered out
      expect(chainIds).not.toContain(toEvmCaipChainId(TEST_CHAIN_IDS.SEPOLIA));
      expect(chainIds).not.toContain(
        toEvmCaipChainId(TEST_CHAIN_IDS.LINEA_SEPOLIA),
      );
      expect(chainIds).not.toContain(
        toEvmCaipChainId(TEST_CHAIN_IDS.LOCALHOST),
      );
      expect(chainIds).not.toContain(
        toEvmCaipChainId(TEST_CHAIN_IDS.MEGAETH_TESTNET),
      );

      // Verify that non-test networks are preserved
      expect(chainIds).toContain(toEvmCaipChainId('0x1'));
    });

    it('should preserve non-EVM networks (BTC and SOL) even when they are not in networkConfigurationsByChainId', () => {
      const mockNetworkState: NetworkState = {
        ...getDefaultNetworkControllerState(),
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {
          // Only include EVM networks
          '0x1': buildNetworkConfig({
            chainId: '0x1',
            name: 'Ethereum Mainnet',
          }),
        },
        networksMetadata: {},
      };

      // First add all networks including non-EVM networks
      controller.updateNetworksList([
        toEvmCaipChainId('0x1'),
        BtcScope.Mainnet,
        SolScope.Mainnet,
      ]);

      // Update network state
      messenger.publish('NetworkController:stateChange', mockNetworkState, []);

      const { state } = controller;
      const chainIds = state.orderedNetworkList.map(
        (n: { networkId: CaipChainId }) => n.networkId,
      );

      // Verify that EVM network is preserved
      expect(chainIds).toContain(toEvmCaipChainId('0x1'));

      // Verify that non-EVM networks are preserved even though they're not in networkConfigurationsByChainId
      expect(chainIds).toContain(BtcScope.Mainnet);
      expect(chainIds).toContain(SolScope.Mainnet);

      // Verify the exact order and length
      expect(state.orderedNetworkList).toHaveLength(3);
      expect(state.orderedNetworkList[0].networkId).toBe(
        toEvmCaipChainId('0x1'),
      );
      expect(state.orderedNetworkList[1].networkId).toBe(BtcScope.Mainnet);
      expect(state.orderedNetworkList[2].networkId).toBe(SolScope.Mainnet);
    });
  });
});
