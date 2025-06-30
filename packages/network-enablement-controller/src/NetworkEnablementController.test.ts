import { BuiltInNetworkName, ChainId } from '@metamask/controller-utils';
import { SolScope } from '@metamask/keyring-api';
import { KnownCaipNamespace } from '@metamask/utils';

import { NetworkEnablementController } from './NetworkEnablementController';
import type {
  NetworkEnablementControllerMessenger,
  NetworkEnablementControllerState,
} from './NetworkEnablementController';

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

    // Mock the messenger calls for network state
    (messenger.call as jest.Mock).mockImplementation((action: string) => {
      if (action === 'NetworkController:getState') {
        return {
          networkConfigurationsByChainId: {
            '0x1': { chainId: '0x1' },
            '0x2': { chainId: '0x2' },
            '0x2a': { chainId: '0x2a' },
            '0xe708': { chainId: '0xe708' },
            '0x2105': { chainId: '0x2105' },
            '0xa4b1': { chainId: '0xa4b1' },
            '0xa86a': { chainId: '0xa86a' },
            '0x38': { chainId: '0x38' },
            '0xa': { chainId: '0xa' },
            '0x89': { chainId: '0x89' },
            '0x531': { chainId: '0x531' },
            '0x144': { chainId: '0x144' },
          },
        };
      }
      if (action === 'MultichainNetworkController:getState') {
        return {
          multichainNetworkConfigurationsByChainId: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
              chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
            },
            'solana:testnet': { chainId: 'solana:testnet' },
          },
        };
      }
      return {};
    });
  });

  it('should initialize with default state', () => {
    const controller = new NetworkEnablementController({
      messenger: messenger as NetworkEnablementControllerMessenger,
    });
    expect(getControllerState(controller)).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true,
          [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: false,
        },
      },
    });
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

  describe('setEnabledNetwork', () => {
    it('should enable a popular network without clearing others', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Enable a popular network (Ethereum Mainnet)
      controller.setEnabledNetwork('0x1');

      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['0x1'],
      ).toBe(true);
      // Other default networks should still be enabled
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.LineaMainnet]],
      ).toBe(true);
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.BaseMainnet]],
      ).toBe(true);
    });

    it('should enable a non-popular network and clear all others', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Enable a non-popular network
      controller.setEnabledNetwork('0x2');

      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['0x2'],
      ).toBe(true);
      // All other networks should be disabled
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.Mainnet]],
      ).toBe(false);
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.LineaMainnet]],
      ).toBe(false);
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.BaseMainnet]],
      ).toBe(false);
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Solana
        ][SolScope.Mainnet],
      ).toBe(false);
    });

    it('should handle unknown networks gracefully', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Mock unknown network
      (messenger.call as jest.Mock).mockImplementation(() => ({
        networkConfigurationsByChainId: {},
      }));

      expect(() => controller.setEnabledNetwork('0x999')).not.toThrow();
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['eip155:999'],
      ).toBeUndefined();
    });

    it('should handle invalid chain ID gracefully', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      expect(() => controller.setEnabledNetwork('invalid' as never)).toThrow(
        'Value must be a hexadecimal string.',
      );
    });
  });

  describe('setDisabledNetwork', () => {
    it('should disable an EVM network using hex chain ID', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // First enable a network
      controller.setEnabledNetwork('0x1');
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['0x1'],
      ).toBe(true);

      // Then disable it
      controller.setDisabledNetwork('0x1');
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['0x1'],
      ).toBe(false);
    });

    it('should disable a Solana network using CAIP chain ID', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // First enable a network
      controller.setEnabledNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');

      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Solana
        ]['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      ).toBe(true);

      controller.setEnabledNetwork('0x1');

      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Solana
        ]['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      ).toBe(false);
    });

    it('should prevent disabling the last active network', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Clear all networks except one
      controller.setEnabledNetwork('0x1');

      // Try to disable the last network
      controller.setDisabledNetwork('0xe708');
      controller.setDisabledNetwork('0x2105');
      controller.setDisabledNetwork('0x1');

      // Should still be enabled (last network protection)
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['0x1'],
      ).toBe(true);
    });

    it('should handle disabling non-existent network gracefully', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      expect(() => controller.setDisabledNetwork('0x999')).not.toThrow();
    });

    it('should handle invalid chain ID gracefully', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      expect(() => controller.setDisabledNetwork('invalid' as never)).toThrow(
        'Value must be a hexadecimal string.',
      );
    });
  });

  describe('isNetworkEnabled', () => {
    it('should return true for enabled EVM network', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      controller.setEnabledNetwork('0x1');

      expect(controller.isNetworkEnabled('0x1')).toBe(true);
    });

    it('should return true for enabled Solana network', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      controller.setEnabledNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');

      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true);
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
      ).toBe(false);
    });
  });

  describe('network event handling', () => {
    it('should handle network added events by ensuring entry and enabling', () => {
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

      // Should ensure entry exists and enable it
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['0x2a'],
      ).toBe(true);
    });

    it('should handle network removed events by removing entry entirely', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // First add a network
      controller.setEnabledNetwork('0x1');
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['0x1'],
      ).toBe(true);

      // Get the subscription callback
      const subscribeCall = (messenger.subscribe as jest.Mock).mock.calls.find(
        (call) => call[0] === 'NetworkController:networkRemoved',
      );
      const networkRemovedCallback = subscribeCall[1];

      controller.setEnabledNetwork('0x2105');

      // Simulate network removed event
      networkRemovedCallback({ chainId: '0x2105' });

      // Should remove the entry entirely
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['0x2105'],
      ).toBeUndefined();
    });

    it('should enable Ethereum mainnet as failsafe when removing last network', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Clear all default networks except one
      controller.setEnabledNetwork('0x1');
      controller.setDisabledNetwork('0xe708');
      controller.setDisabledNetwork('0x2105');
      controller.setDisabledNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');

      // Get the subscription callback
      const subscribeCall = (messenger.subscribe as jest.Mock).mock.calls.find(
        (call) => call[0] === 'NetworkController:networkRemoved',
      );
      const networkRemovedCallback = subscribeCall[1];

      // Simulate removing the last network
      networkRemovedCallback({ chainId: '0x1' });

      // Should enable Ethereum mainnet as failsafe
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.Mainnet]],
      ).toBe(true);
    });

    it('should handle unknown networks in event callbacks', () => {
      new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Mock unknown network
      (messenger.call as jest.Mock).mockImplementation(() => ({
        networkConfigurationsByChainId: {},
      }));

      // Get the subscription callback
      const subscribeCall = (messenger.subscribe as jest.Mock).mock.calls.find(
        (call) => call[0] === 'NetworkController:networkAdded',
      );
      const networkAddedCallback = subscribeCall[1];

      // Simulate unknown network added event
      expect(() => networkAddedCallback({ chainId: '0x999' })).not.toThrow();
    });
  });

  describe('popular networks behavior', () => {
    it('should not clear other networks when enabling popular networks', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Enable a popular network (Ethereum Mainnet)
      controller.setEnabledNetwork('0x1');

      // Other default networks should still be enabled
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.LineaMainnet]],
      ).toBe(true);
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.BaseMainnet]],
      ).toBe(true);
    });

    it('should clear all networks when enabling non-popular networks', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Enable a non-popular network
      controller.setEnabledNetwork('0x2');

      // All other networks should be disabled
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.Mainnet]],
      ).toBe(false);
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.LineaMainnet]],
      ).toBe(false);
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.BaseMainnet]],
      ).toBe(false);
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Solana
        ][SolScope.Mainnet],
      ).toBe(false);
    });
  });

  describe('entry management', () => {
    it('should ensure network entry exists when adding network', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Get the subscription callback
      const subscribeCall = (messenger.subscribe as jest.Mock).mock.calls.find(
        (call) => call[0] === 'NetworkController:networkAdded',
      );
      const networkAddedCallback = subscribeCall[1];

      // Simulate adding a new network
      networkAddedCallback({ chainId: '0x2a' });

      // Entry should exist and be enabled
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['0x2a'],
      ).toBe(true);
    });

    it('should remove network entry entirely when removing network', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // First add a network
      controller.setEnabledNetwork('0x1');

      // Get the subscription callback
      const subscribeCall = (messenger.subscribe as jest.Mock).mock.calls.find(
        (call) => call[0] === 'NetworkController:networkRemoved',
      );
      const networkRemovedCallback = subscribeCall[1];

      // Simulate removing the network
      networkRemovedCallback({ chainId: '0x1' });

      // Entry should be completely removed
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ]['0x1'],
      ).toBeUndefined();
    });

    it('should handle removing network from non-existent namespace', () => {
      new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Get the subscription callback
      const subscribeCall = (messenger.subscribe as jest.Mock).mock.calls.find(
        (call) => call[0] === 'NetworkController:networkRemoved',
      );
      const networkRemovedCallback = subscribeCall[1];

      // Simulate removing network from non-existent namespace
      expect(() =>
        networkRemovedCallback({ chainId: 'unknown:chain' }),
      ).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle mixed namespace types', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      controller.setEnabledNetwork('0x1');

      expect(controller.isNetworkEnabled('0x1')).toBe(true);

      controller.setEnabledNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');

      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true);
    });

    it('should handle chain ID normalization', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Test hex chain ID
      controller.setEnabledNetwork('0x1');
      expect(controller.isNetworkEnabled('0x1')).toBe(true);

      // Test CAIP chain ID for same network
      expect(controller.isNetworkEnabled('eip155:1')).toBe(true);
    });

    it('should handle failsafe when all networks are disabled', () => {
      const controller = new NetworkEnablementController({
        messenger: messenger as NetworkEnablementControllerMessenger,
      });

      // Disable all default networks
      controller.setDisabledNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
      controller.setDisabledNetwork('0xe708');
      controller.setDisabledNetwork('0x2105');
      controller.setDisabledNetwork('0x1');

      // Should enable Ethereum mainnet as failsafe
      expect(
        getControllerState(controller).enabledNetworkMap[
          KnownCaipNamespace.Eip155
        ][ChainId[BuiltInNetworkName.Mainnet]],
      ).toBe(true);
    });
  });
});
