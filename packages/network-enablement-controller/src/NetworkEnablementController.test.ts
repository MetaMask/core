import { Messenger } from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId } from '@metamask/controller-utils';
import { RpcEndpointType } from '@metamask/network-controller';
import { KnownCaipNamespace } from '@metamask/utils';
import { useFakeTimers } from 'sinon';

import { NetworkEnablementController } from './NetworkEnablementController';
import type {
  NetworkEnablementControllerActions,
  NetworkEnablementControllerEvents,
  AllowedEvents,
  AllowedActions,
  NetworkEnablementControllerMessenger,
} from './NetworkEnablementController';
import { SolScope } from './types';
import { advanceTime } from '../../../tests/helpers';

const setupController = ({
  config,
}: {
  config?: Partial<
    ConstructorParameters<typeof NetworkEnablementController>[0]
  >;
} = {}) => {
  const messenger = new Messenger<
    NetworkEnablementControllerActions | AllowedActions,
    NetworkEnablementControllerEvents | AllowedEvents
  >();

  const networkEnablementControllerMessenger: NetworkEnablementControllerMessenger =
    messenger.getRestricted({
      name: 'NetworkEnablementController',
      allowedActions: [
        'NetworkController:getState',
        'MultichainNetworkController:getState',
      ],
      allowedEvents: [
        'NetworkController:networkAdded',
        'NetworkController:networkRemoved',
      ],
    });

  messenger.registerActionHandler(
    'NetworkController:getState',
    jest.fn().mockImplementation(() => ({
      networkConfigurationsByChainId: {
        '0x1': {
          defaultRpcEndpointIndex: 0,
          rpcEndpoints: [{}],
        },
        '0xe708': {
          defaultRpcEndpointIndex: 0,
          rpcEndpoints: [{}],
        },
        '0x2105': {
          defaultRpcEndpointIndex: 0,
          rpcEndpoints: [{}],
        },
      },
    })),
  );

  const controller = new NetworkEnablementController({
    messenger: networkEnablementControllerMessenger,
    ...config,
  });

  return {
    controller,
    messenger,
  };
};

// Helper function to setup controller with init() called
const setupInitializedController = (
  config?: Partial<
    ConstructorParameters<typeof NetworkEnablementController>[0]
  >,
) => {
  const setup = setupController({ config });
  setup.controller.init();
  return setup;
};

describe('NetworkEnablementController', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  it('initializes with minimal default state to avoid race conditions', () => {
    const { controller } = setupController();

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true,
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  it('properly initializes networks from controller states when init() is called', () => {
    const { controller } = setupController();

    // Call init to populate from controller states
    controller.init();

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          '0x1': true, // Ethereum Mainnet
          '0xe708': true, // Linea Mainnet
          '0x2105': true, // Base Mainnet
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  describe('init', () => {
    it('populates enabled networks from NetworkController state', () => {
      const { controller } = setupController();

      // Before init, only minimal state
      expect(
        Object.keys(
          controller.state.enabledNetworkMap[KnownCaipNamespace.Eip155],
        ),
      ).toHaveLength(1);

      controller.init();

      // After init, all networks from NetworkController
      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Eip155],
      ).toStrictEqual({
        '0x1': true,
        '0xe708': true,
        '0x2105': true,
      });
    });

    it('always enables Solana mainnet by default', () => {
      const { controller } = setupController();

      controller.init();

      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Solana],
      ).toStrictEqual({
        [SolScope.Mainnet]: true,
      });
    });

    it('handles NetworkController not being available gracefully', () => {
      // Create a fresh messenger to avoid handler conflicts
      const messenger = new Messenger<
        NetworkEnablementControllerActions | AllowedActions,
        NetworkEnablementControllerEvents | AllowedEvents
      >();

      const networkEnablementControllerMessenger: NetworkEnablementControllerMessenger =
        messenger.getRestricted({
          name: 'NetworkEnablementController',
          allowedActions: ['NetworkController:getState'],
          allowedEvents: [
            'NetworkController:networkAdded',
            'NetworkController:networkRemoved',
          ],
        });

      // Mock NetworkController to throw error
      messenger.registerActionHandler(
        'NetworkController:getState',
        jest.fn().mockImplementation(() => {
          throw new Error('NetworkController not available');
        }),
      );

      const controller = new NetworkEnablementController({
        messenger: networkEnablementControllerMessenger,
      });

      expect(() => controller.init()).not.toThrow();

      // Should fallback to Ethereum mainnet and keep Solana mainnet
      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Eip155],
      ).toStrictEqual({
        [ChainId[BuiltInNetworkName.Mainnet]]: true,
      });
      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Solana],
      ).toStrictEqual({
        [SolScope.Mainnet]: true,
      });
    });

    it('can be called multiple times safely', () => {
      const { controller } = setupController();

      controller.init();
      const firstState = { ...controller.state };

      controller.init();
      const secondState = { ...controller.state };

      expect(firstState).toStrictEqual(secondState);
    });
  });

  it('subscribes to NetworkController:networkAdded', async () => {
    const { controller, messenger } = setupInitializedController();

    // Publish an update with avax network added
    messenger.publish('NetworkController:networkAdded', {
      chainId: '0xa86a',
      blockExplorerUrls: [],
      defaultRpcEndpointIndex: 0,
      name: 'Avalanche',
      nativeCurrency: 'AVAX',
      rpcEndpoints: [
        {
          url: 'https://api.avax.network/ext/bc/C/rpc',
          networkClientId: 'id',
          type: RpcEndpointType.Custom,
        },
      ],
    });

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          '0x1': true, // Ethereum Mainnet
          '0xe708': true, // Linea Mainnet
          '0x2105': true, // Base Mainnet
          '0xa86a': true, // Avalanche network enabled
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  it('subscribes to NetworkController:networkRemoved', async () => {
    const { controller, messenger } = setupInitializedController();

    // Publish an update with linea network removed
    messenger.publish('NetworkController:networkRemoved', {
      chainId: '0xe708', // Linea Mainnet
      blockExplorerUrls: [],
      defaultRpcEndpointIndex: 0,
      name: 'Linea',
      nativeCurrency: 'ETH',
      rpcEndpoints: [
        {
          url: 'https://linea-mainnet.infura.io/v3/1234567890',
          networkClientId: 'id',
          type: RpcEndpointType.Custom,
        },
      ],
    });

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          '0x1': true, // Ethereum Mainnet
          '0x2105': true, // Base Mainnet (Linea removed)
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  it('does fallback to ethereum when removing the last enabled network', async () => {
    const { controller, messenger } = setupInitializedController();

    // disable all networks except linea
    controller.disableNetwork('0x1'); // Ethereum Mainnet
    controller.disableNetwork('0x2105'); // Base Mainnet

    // Publish an update with linea network removed
    messenger.publish('NetworkController:networkRemoved', {
      chainId: '0xe708', // Linea Mainnet
      blockExplorerUrls: [],
      defaultRpcEndpointIndex: 0,
      name: 'Linea',
      nativeCurrency: 'ETH',
      rpcEndpoints: [
        {
          url: 'https://linea-mainnet.infura.io/v3/1234567890',
          networkClientId: 'id',
          type: RpcEndpointType.Custom,
        },
      ],
    });

    await advanceTime({ clock, duration: 1 });

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          '0x1': true, // Ethereum Mainnet (fallback enabled)
          '0x2105': false, // Base Mainnet (still disabled)
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  describe('enableNetwork', () => {
    it('enables a popular network without clearing others', () => {
      const { controller } = setupInitializedController();

      // Disable a popular network (Ethereum Mainnet)
      controller.disableNetwork('0x1');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': false, // Ethereum Mainnet (disabled)
            '0xe708': true, // Linea Mainnet
            '0x2105': true, // Base Mainnet
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });

      // Enable the network again
      controller.enableNetwork('0x1');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': true, // Ethereum Mainnet (re-enabled)
            '0xe708': true, // Linea Mainnet
            '0x2105': true, // Base Mainnet
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });
    });

    it('enables a non-popular network and clears all others', async () => {
      const { controller, messenger } = setupInitializedController();

      // Add a non-popular network
      messenger.publish('NetworkController:networkAdded', {
        chainId: '0x2',
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        name: 'Polygon',
        nativeCurrency: 'MATIC',
        rpcEndpoints: [
          {
            url: 'https://polygon-mainnet.infura.io/v3/1234567890',
            networkClientId: 'id',
            type: RpcEndpointType.Custom,
          },
        ],
      });

      await advanceTime({ clock, duration: 1 });

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': false,
            '0xe708': false,
            '0x2105': false,
            '0x2': true,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });

      // Enable the popular networks again
      controller.enableNetwork('0x1');
      controller.enableNetwork('0xe708');
      controller.enableNetwork('0x2105');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
            '0xe708': true,
            '0x2105': true,
            '0x2': false,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });

      // Enable the non-popular network again
      controller.enableNetwork('0x2');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': false,
            '0xe708': false,
            '0x2105': false,
            '0x2': true,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });
    });

    it('handles invalid chain ID gracefully', () => {
      const { controller } = setupController();

      // @ts-expect-error Intentionally passing an invalid chain ID
      expect(() => controller.enableNetwork('invalid')).toThrow(
        'Value must be a hexadecimal string.',
      );
    });

    it('handles enabling a network that is not added', () => {
      const { controller } = setupController();

      controller.enableNetwork('bip122:000000000019d6689c085ae165831e93');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: true,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });
    });

    it('handle no namespace bucket', async () => {
      const { controller, messenger } = setupController();

      // add new network with no namespace bucket
      messenger.publish('NetworkController:networkAdded', {
        // @ts-expect-error Intentionally passing an invalid chain ID
        chainId: 'bip122:000000000019d6689c085ae165831e93',
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        name: 'Bitcoin',
        nativeCurrency: 'BTC',
        rpcEndpoints: [
          {
            url: 'https://api.blockcypher.com/v1/btc/main',
            networkClientId: 'id',
            type: RpcEndpointType.Custom,
          },
        ],
      });

      await advanceTime({ clock, duration: 1 });

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: true,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
          [KnownCaipNamespace.Bip122]: {
            'bip122:000000000019d6689c085ae165831e93': true,
          },
        },
      });
    });
  });

  describe('disableNetwork', () => {
    it('disables an EVM network using hex chain ID', () => {
      const { controller } = setupInitializedController();

      // Disable a network (but not the last one)
      controller.disableNetwork('0xe708'); // Linea Mainnet

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
            '0xe708': false,
            '0x2105': true,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });
    });

    it('does not disable a Solana network using CAIP chain ID as it is the only enabled network on the namespace', () => {
      const { controller } = setupController();

      // Try to disable a Solana network using CAIP chain ID
      expect(() =>
        controller.disableNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toThrow('Cannot disable the last remaining enabled network');
    });

    it('prevents disabling the last active network for an EVM namespace', () => {
      const { controller } = setupInitializedController();

      // disable all networks except one
      controller.disableNetwork('0xe708'); // Linea Mainnet
      controller.disableNetwork('0x2105'); // Base Mainnet

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
            '0xe708': false,
            '0x2105': false,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });

      // Try to disable the last active network
      expect(() => controller.disableNetwork('0x1')).toThrow(
        'Cannot disable the last remaining enabled network',
      );
    });

    it('handles disabling non-existent network gracefully', () => {
      const { controller } = setupController();

      // Try to disable a non-existent network
      expect(() => controller.disableNetwork('0x999')).not.toThrow();
    });

    it('handles invalid chain ID gracefully', () => {
      const { controller } = setupController();

      // @ts-expect-error Intentionally passing an invalid chain ID
      expect(() => controller.disableNetwork('invalid')).toThrow(
        'Value must be a hexadecimal string.',
      );
    });
  });

  describe('isNetworkEnabled', () => {
    it('returns true for enabled networks using hex chain ID', () => {
      const { controller } = setupInitializedController();

      // Test default enabled networks
      expect(controller.isNetworkEnabled('0x1')).toBe(true); // Ethereum Mainnet
      expect(controller.isNetworkEnabled('0xe708')).toBe(true); // Linea Mainnet
      expect(controller.isNetworkEnabled('0x2105')).toBe(true); // Base Mainnet
    });

    it('returns false for disabled networks using hex chain ID', () => {
      const { controller } = setupInitializedController();

      // Disable a network and test
      controller.disableNetwork('0xe708'); // Linea Mainnet (not the last one)
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);

      // Test networks that were never enabled
      expect(controller.isNetworkEnabled('0x89')).toBe(false); // Polygon
      expect(controller.isNetworkEnabled('0xa86a')).toBe(false); // Avalanche
    });

    it('returns true for enabled networks using CAIP chain ID', () => {
      const { controller } = setupInitializedController();

      // Test EVM networks with CAIP format
      expect(controller.isNetworkEnabled('eip155:1')).toBe(true); // Ethereum Mainnet
      expect(controller.isNetworkEnabled('eip155:59144')).toBe(true); // Linea Mainnet
      expect(controller.isNetworkEnabled('eip155:8453')).toBe(true); // Base Mainnet

      // Test Solana network
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true);
    });

    it('returns false for disabled networks using CAIP chain ID', () => {
      const { controller } = setupInitializedController();

      // Disable a network using hex and test with CAIP
      controller.disableNetwork('0xe708'); // Linea Mainnet (not the last one)
      expect(controller.isNetworkEnabled('eip155:59144')).toBe(false);

      // Test networks that were never enabled
      expect(controller.isNetworkEnabled('eip155:137')).toBe(false); // Polygon
      expect(controller.isNetworkEnabled('eip155:43114')).toBe(false); // Avalanche
    });

    it('handles non-existent networks gracefully', () => {
      const { controller } = setupController();

      // Test networks that don't exist in the state
      expect(controller.isNetworkEnabled('0x999')).toBe(false);
      expect(controller.isNetworkEnabled('eip155:999')).toBe(false);
      expect(
        controller.isNetworkEnabled('bip122:000000000019d6689c085ae165831e93'),
      ).toBe(false);
    });

    it('returns false for networks in non-existent namespaces', () => {
      const { controller } = setupController();

      // Test a network in a namespace that doesn't exist yet
      expect(controller.isNetworkEnabled('cosmos:cosmoshub-4')).toBe(false);
      expect(
        controller.isNetworkEnabled(
          'polkadot:91b171bb158e2d3848fa23a9f1c25182',
        ),
      ).toBe(false);
    });

    it('works correctly after enabling/disabling networks', () => {
      const { controller } = setupInitializedController();

      // Initially enabled
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);

      // Disable and check (not the last network)
      controller.disableNetwork('0xe708');
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);

      // Re-enable and check
      controller.enableNetwork('0xe708');
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
    });

    it('maintains consistency between hex and CAIP formats for same network', () => {
      const { controller } = setupInitializedController();

      // Both formats should return the same result for the same network
      expect(controller.isNetworkEnabled('0x1')).toBe(
        controller.isNetworkEnabled('eip155:1'),
      );
      expect(controller.isNetworkEnabled('0xe708')).toBe(
        controller.isNetworkEnabled('eip155:59144'),
      );
      expect(controller.isNetworkEnabled('0x2105')).toBe(
        controller.isNetworkEnabled('eip155:8453'),
      );

      // Test after disabling (not the last network)
      controller.disableNetwork('0xe708');
      expect(controller.isNetworkEnabled('0xe708')).toBe(
        controller.isNetworkEnabled('eip155:59144'),
      );
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
    });

    it('works with dynamically added networks', async () => {
      const { controller, messenger } = setupController();

      // Initially, Avalanche network should not be enabled (doesn't exist)
      expect(controller.isNetworkEnabled('0xa86a')).toBe(false);

      // Add Avalanche network
      messenger.publish('NetworkController:networkAdded', {
        chainId: '0xa86a',
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        name: 'Avalanche',
        nativeCurrency: 'AVAX',
        rpcEndpoints: [
          {
            url: 'https://api.avax.network/ext/bc/C/rpc',
            networkClientId: 'id',
            type: RpcEndpointType.Custom,
          },
        ],
      });

      await advanceTime({ clock, duration: 1 });

      // Now it should be enabled (auto-enabled when added)
      expect(controller.isNetworkEnabled('0xa86a')).toBe(true);
      expect(controller.isNetworkEnabled('eip155:43114')).toBe(true);
    });

    it('handles networks across different namespaces independently', async () => {
      const { controller, messenger } = setupController();

      // EVM networks should not affect Solana network status
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true);

      // Disable all EVM networks
      controller.disableNetwork('0xe708'); // Linea
      controller.disableNetwork('0x2105'); // Base

      // Solana should still be enabled
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true);

      // Add a Bitcoin network
      messenger.publish('NetworkController:networkAdded', {
        // @ts-expect-error Intentionally testing with Bitcoin network
        chainId: 'bip122:000000000019d6689c085ae165831e93',
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        name: 'Bitcoin',
        nativeCurrency: 'BTC',
        rpcEndpoints: [
          {
            url: 'https://api.blockcypher.com/v1/btc/main',
            networkClientId: 'id',
            type: RpcEndpointType.Custom,
          },
        ],
      });

      await advanceTime({ clock, duration: 1 });

      // Bitcoin should be enabled, others should be unchanged
      expect(
        controller.isNetworkEnabled('bip122:000000000019d6689c085ae165831e93'),
      ).toBe(true);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);
    });

    it('handles invalid chain IDs gracefully', () => {
      const { controller } = setupController();

      // @ts-expect-error Intentionally passing invalid chain IDs
      expect(() => controller.isNetworkEnabled('invalid')).toThrow(
        'Value must be a hexadecimal string.',
      );

      // @ts-expect-error Intentionally passing undefined
      expect(() => controller.isNetworkEnabled(undefined)).toThrow(
        'Value must be a hexadecimal string.',
      );

      // @ts-expect-error Intentionally passing null
      expect(() => controller.isNetworkEnabled(null)).toThrow(
        'Value must be a hexadecimal string.',
      );
    });
  });
});
