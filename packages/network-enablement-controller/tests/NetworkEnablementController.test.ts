import { SolScope } from '@metamask/keyring-api';

import { NetworkEnablementController } from '../src/NetworkEnablementController';
import type {
  NetworkEnablementControllerMessenger,
  NetworkEnablementControllerState,
} from '../src/NetworkEnablementController';

// Helper function to access controller state
const getControllerState = (
  controller: NetworkEnablementController,
): NetworkEnablementControllerState => {
  return (controller as unknown as { state: NetworkEnablementControllerState })
    .state;
};

describe('NetworkEnablementController', () => {
  let messenger: Partial<NetworkEnablementControllerMessenger>;

  beforeEach(() => {
    messenger = {
      subscribe: jest.fn(),
      publish: jest.fn(),
      clearEventSubscriptions: jest.fn(),
      registerActionHandler: jest.fn(),
      unregisterActionHandler: jest.fn(),
      call: jest.fn(),
      registerInitialEventPayload: jest.fn(),
    };
  });

  it('should initialize with default state', () => {
    const controller = new NetworkEnablementController({
      messenger: messenger as NetworkEnablementControllerMessenger,
    });
    expect(getControllerState(controller)).toStrictEqual({
      enabledNetworkMap: {
        eip155: {
          '0x1': true,
          '0xe708': true,
          '0x2105': true,
        },
        solana: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  it('should merge provided state with default state', () => {
    const customState: Partial<NetworkEnablementControllerState> = {
      enabledNetworkMap: {
        eip155: { '0x2a': true },
        solana: {},
      },
    };
    const controller = new NetworkEnablementController({
      messenger: messenger as NetworkEnablementControllerMessenger,
      state: customState,
    });
    expect(
      getControllerState(controller).enabledNetworkMap.eip155['0x2a'],
    ).toBe(true);
    // Should still have default networks
    expect(getControllerState(controller).enabledNetworkMap.eip155['0x1']).toBe(
      true,
    );
  });

  it('should subscribe to NetworkController:networkAdded', () => {
    new NetworkEnablementController({
      messenger: messenger as NetworkEnablementControllerMessenger,
    });
    expect(messenger.subscribe as jest.Mock).toHaveBeenCalledWith(
      'NetworkController:networkAdded',
      expect.any(Function),
    );
  });

  it('should subscribe to NetworkController:networkRemoved', () => {
    new NetworkEnablementController({
      messenger: messenger as NetworkEnablementControllerMessenger,
    });
    expect(messenger.subscribe as jest.Mock).toHaveBeenCalledWith(
      'NetworkController:networkRemoved',
      expect.any(Function),
    );
  });

  it('setEnabledNetworks should enable only specified networks', () => {
    const controller = new NetworkEnablementController({
      messenger: messenger as NetworkEnablementControllerMessenger,
    });
    controller.setEnabledNetworks([
      'eip155:1',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    ]);
    expect(getControllerState(controller).enabledNetworkMap).toStrictEqual({
      eip155: { '0x1': true },
      solana: { 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': true },
    });
  });

  it('setEnabledNetworks should handle a single chainId', () => {
    const controller = new NetworkEnablementController({
      messenger: messenger as NetworkEnablementControllerMessenger,
    });
    controller.setEnabledNetworks('eip155:1');
    expect(getControllerState(controller).enabledNetworkMap).toStrictEqual({
      eip155: { '0x1': true },
      solana: {},
    });
  });

  it('setEnabledNetworks should handle unknown namespaces gracefully', () => {
    const controller = new NetworkEnablementController({
      messenger: messenger as NetworkEnablementControllerMessenger,
    });
    controller.setEnabledNetworks(['foo:bar']);
    expect(getControllerState(controller).enabledNetworkMap).toStrictEqual({
      eip155: {},
      solana: {},
    });
  });

  it('setEnabledNetworks should clear existing networks before setting new ones', () => {
    const controller = new NetworkEnablementController({
      messenger: messenger as NetworkEnablementControllerMessenger,
    });

    // Initially has default networks
    expect(getControllerState(controller).enabledNetworkMap.eip155['0x1']).toBe(
      true,
    );

    // Set only one network
    controller.setEnabledNetworks(['eip155:2']);

    // Should only have the new network, not the old ones
    expect(
      getControllerState(controller).enabledNetworkMap.eip155['0x1'],
    ).toBeUndefined();
    expect(getControllerState(controller).enabledNetworkMap.eip155['0x2']).toBe(
      true,
    );
  });

  describe('disableNetwork', () => {
    it('should disable an EVM network using hex chain ID', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // First enable a network
      controller.setEnabledNetworks(['eip155:1']);
      expect(
        getControllerState(controller).enabledNetworkMap.eip155['0x1'],
      ).toBe(true);

      // Then disable it
      controller.disableNetwork('0x1');
      expect(
        getControllerState(controller).enabledNetworkMap.eip155['0x1'],
      ).toBe(false);
    });

    it('should disable a Solana network using CAIP chain ID', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // First enable a network
      controller.setSolanaEnabledNetwork('solana:testnet');
      expect(
        getControllerState(controller).enabledNetworkMap.solana[
          'solana:testnet'
        ],
      ).toBe(true);

      // Then disable it
      controller.disableNetwork('solana:testnet');
      expect(
        getControllerState(controller).enabledNetworkMap.solana[
          'solana:testnet'
        ],
      ).toBe(false);
    });

    it('should handle disabling non-existent network gracefully', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      expect(() => controller.disableNetwork('0x999')).not.toThrow();
    });

    it('should handle invalid chain ID gracefully', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      expect(() => controller.disableNetwork('invalid' as never)).not.toThrow();
    });
  });

  describe('isNetworkEnabled', () => {
    it('should return true for enabled EVM network', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      controller.setEnabledNetworks(['eip155:1']);

      expect(controller.isNetworkEnabled('0x1')).toBe(true);
    });

    it('should return true for enabled Solana network', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      controller.setSolanaEnabledNetwork('solana:testnet');

      expect(controller.isNetworkEnabled('solana:testnet')).toBe(true);
    });

    it('should return false for disabled network', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      expect(controller.isNetworkEnabled('0x999')).toBe(false);
    });

    it('should return false for invalid chain ID', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      expect(controller.isNetworkEnabled('invalid' as never)).toBe(false);
    });

    it('should work with default enabled networks', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true);
    });
  });

  describe('getEnabledNetworksForNamespace', () => {
    it('should return enabled networks for eip155 namespace', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      controller.setEnabledNetworks(['eip155:1', 'eip155:2']);

      const enabledNetworks =
        controller.getEnabledNetworksForNamespace('eip155');

      expect(enabledNetworks).toContain('0x1');
      expect(enabledNetworks).toContain('0x2');
    });

    it('should return enabled networks for solana namespace', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      controller.setSolanaEnabledNetwork('solana:testnet');

      const enabledNetworks =
        controller.getEnabledNetworksForNamespace('solana');

      expect(enabledNetworks).toContain(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      ); // default
      expect(enabledNetworks).toContain('solana:testnet');
    });

    it('should return empty array for non-existent namespace', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      const enabledNetworks = controller.getEnabledNetworksForNamespace(
        'nonexistent' as never,
      );

      expect(enabledNetworks).toStrictEqual([]);
    });
  });

  describe('getAllEnabledNetworks', () => {
    it('should return all enabled networks across all namespaces', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      controller.setEnabledNetworks(['eip155:1', 'solana:testnet']);

      const allEnabledNetworks = controller.getAllEnabledNetworks();

      expect(allEnabledNetworks.eip155).toContain('0x1');
      expect(allEnabledNetworks.solana).toContain('solana:testnet');
    });

    it('should return empty arrays for namespaces with no enabled networks', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Clear all networks
      controller.setEnabledNetworks([]);

      const allEnabledNetworks = controller.getAllEnabledNetworks();

      expect(allEnabledNetworks.eip155).toStrictEqual([]);
      expect(allEnabledNetworks.solana).toStrictEqual([]);
    });
  });

  describe('network event handling', () => {
    it('should handle network added events', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Get the subscription callback
      const subscribeCall = (messenger.subscribe as jest.Mock).mock.calls.find(
        (call) => call[0] === 'NetworkController:networkAdded',
      );
      const networkAddedCallback = subscribeCall[1];

      // Simulate network added event
      networkAddedCallback({ chainId: '0x2a' });

      expect(
        getControllerState(controller).enabledNetworkMap.eip155['0x2a'],
      ).toBe(true);
    });

    it('should handle network removed events', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // First add a network
      controller.setEnabledNetworks(['eip155:1']);
      expect(
        getControllerState(controller).enabledNetworkMap.eip155['0x1'],
      ).toBe(true);

      // Get the subscription callback
      const subscribeCall = (messenger.subscribe as jest.Mock).mock.calls.find(
        (call) => call[0] === 'NetworkController:networkRemoved',
      );
      const networkRemovedCallback = subscribeCall[1];

      // Simulate network removed event
      networkRemovedCallback({ chainId: '0x1' });

      expect(
        getControllerState(controller).enabledNetworkMap.eip155['0x1'],
      ).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty array in setEnabledNetworks', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      controller.setEnabledNetworks([]);

      expect(
        getControllerState(controller).enabledNetworkMap.eip155,
      ).toStrictEqual({});
      expect(
        getControllerState(controller).enabledNetworkMap.solana,
      ).toStrictEqual({});
    });

    it('should handle mixed namespace types in setEnabledNetworks', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      controller.setEnabledNetworks([
        'eip155:1',
        'solana:testnet',
        'unknown:chain',
      ]);

      expect(
        getControllerState(controller).enabledNetworkMap.eip155['0x1'],
      ).toBe(true);
      expect(
        getControllerState(controller).enabledNetworkMap.solana[
          'solana:testnet'
        ],
      ).toBe(true);
    });

    it('should handle disabled networks in getEnabledNetworksForNamespace', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Set a network and then disable it
      controller.setEnabledNetworks(['eip155:1']);
      controller.disableNetwork('0x1');

      const enabledNetworks =
        controller.getEnabledNetworksForNamespace('eip155');

      expect(enabledNetworks).not.toContain('0x1');
    });
  });
});
