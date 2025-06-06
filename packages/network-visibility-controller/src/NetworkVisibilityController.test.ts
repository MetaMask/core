import { Messenger } from '@metamask/base-controller';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import type { NetworkControllerStateChangeEvent } from '@metamask/network-controller';
import type { CaipChainId } from '@metamask/utils';

import {
  NetworkVisibilityController,
  CHAIN_IDS,
} from './NetworkVisibilityController';
import type {
  NetworkVisibilityControllerMessengerActions,
  NetworkVisibilityControllerMessenger,
} from './NetworkVisibilityController';

const controllerName = 'NetworkVisibilityController';

// Helper type to extract available actions from the messenger
type AvailableAction = NetworkVisibilityControllerMessengerActions['type'];

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
});
