import { Messenger } from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId } from '@metamask/controller-utils';
import { RpcEndpointType } from '@metamask/network-controller';
import {
  TransactionStatus,
  type TransactionMeta,
} from '@metamask/transaction-controller';
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
        'TransactionController:transactionSubmitted',
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

// Helper function to setup controller with default state (no init needed)
const setupInitializedController = (
  config?: Partial<
    ConstructorParameters<typeof NetworkEnablementController>[0]
  >,
) => {
  const setup = setupController({ config });
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

  it('initializes with default state', () => {
    const { controller } = setupController();

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true,
          [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
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
          [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet
          [ChainId[BuiltInNetworkName.LineaMainnet]]: true, // Linea Mainnet
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true, // Base Mainnet
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
          [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true, // Base Mainnet (Linea removed)
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  it('subscribes to TransactionController:transactionSubmitted and enables network', async () => {
    const { controller, messenger } = setupInitializedController();

    // Initially disable Polygon network (it should not exist)
    expect(controller.isNetworkEnabled('0x89')).toBe(false);

    // Publish a transaction submitted event with Polygon chainId
    messenger.publish('TransactionController:transactionSubmitted', {
      transactionMeta: {
        chainId: '0x89', // Polygon
        networkClientId: 'polygon-network',
        id: 'test-tx-id',
        status: TransactionStatus.submitted,
        time: Date.now(),
        txParams: {
          from: '0x123',
          to: '0x456',
          value: '0x0',
        },
      } as TransactionMeta, // Simplified structure for testing
    });

    await advanceTime({ clock, duration: 1 });

    // The Polygon network should now be enabled
    expect(controller.isNetworkEnabled('0x89')).toBe(true);
  });

  it('handles TransactionController:transactionSubmitted with missing chainId gracefully', async () => {
    const { controller, messenger } = setupInitializedController();

    const initialState = { ...controller.state };

    // Publish a transaction submitted event without chainId
    messenger.publish('TransactionController:transactionSubmitted', {
      transactionMeta: {
        networkClientId: 'test-network',
        id: 'test-tx-id',
        status: TransactionStatus.submitted,
        time: Date.now(),
        txParams: {
          from: '0x123',
          to: '0x456',
          value: '0x0',
        },
        // chainId is missing
      } as TransactionMeta, // Simplified structure for testing
    });

    await advanceTime({ clock, duration: 1 });

    // State should remain unchanged
    expect(controller.state).toStrictEqual(initialState);
  });

  it('handles TransactionController:transactionSubmitted with malformed structure gracefully', async () => {
    const { controller, messenger } = setupInitializedController();

    const initialState = { ...controller.state };

    // Publish a transaction submitted event with malformed structure
    // @ts-expect-error - Testing runtime safety for malformed payload
    messenger.publish('TransactionController:transactionSubmitted', {
      // Missing transactionMeta entirely
    });

    await advanceTime({ clock, duration: 1 });

    // State should remain unchanged
    expect(controller.state).toStrictEqual(initialState);
  });

  it('handles TransactionController:transactionSubmitted with null/undefined transactionMeta gracefully', async () => {
    const { controller, messenger } = setupInitializedController();

    const initialState = { ...controller.state };

    // Test with null transactionMeta
    messenger.publish('TransactionController:transactionSubmitted', {
      // @ts-expect-error - Testing runtime safety for null transactionMeta
      transactionMeta: null,
    });

    await advanceTime({ clock, duration: 1 });

    // State should remain unchanged
    expect(controller.state).toStrictEqual(initialState);

    // Test with undefined transactionMeta
    messenger.publish('TransactionController:transactionSubmitted', {
      // @ts-expect-error - Testing runtime safety for undefined transactionMeta
      transactionMeta: undefined,
    });

    await advanceTime({ clock, duration: 1 });

    // State should still remain unchanged
    expect(controller.state).toStrictEqual(initialState);
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
          [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet (fallback enabled)
          [ChainId[BuiltInNetworkName.BaseMainnet]]: false, // Base Mainnet (still disabled)
        },
        [KnownCaipNamespace.Solana]: {
          [SolScope.Mainnet]: true,
        },
      },
    });
  });

  describe('enableAllPopularNetworks', () => {
    it('enables all popular networks that exist in state and Solana mainnet', () => {
      const { controller } = setupInitializedController();

      // Initially disable some networks
      controller.disableNetwork('0xe708'); // Linea
      controller.disableNetwork('0x2105'); // Base

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': true, // Ethereum Mainnet
            '0xe708': false, // Linea Mainnet (disabled)
            '0x2105': false, // Base Mainnet (disabled)
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });

      // Enable all popular networks
      controller.enableAllPopularNetworks();

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': true, // Ethereum Mainnet
            '0xe708': true, // Linea Mainnet
            '0x2105': true, // Base Mainnet
            '0xa4b1': true, // Arbitrum One
            '0xa86a': true, // Avalanche C-Chain
            '0x38': true, // BNB Smart Chain
            '0xa': true, // Optimism
            '0x89': true, // Polygon
            '0x531': true, // Sei
            '0x144': true, // zkSync Era
            '0x2a15c308d': true, // Palm
            '0x3e7': true, // HyperEVM
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true, // Solana
          },
        },
      });
    });

    it('enables all popular networks from constants', () => {
      const { controller } = setupController();

      // The function should enable all popular networks defined in constants
      expect(() => controller.enableAllPopularNetworks()).not.toThrow();

      // Should enable all popular networks and Solana
      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet
            [ChainId[BuiltInNetworkName.LineaMainnet]]: true, // Linea Mainnet
            [ChainId[BuiltInNetworkName.BaseMainnet]]: true, // Base Mainnet
            '0xa4b1': true, // Arbitrum One
            '0xa86a': true, // Avalanche C-Chain
            '0x38': true, // BNB Smart Chain
            '0xa': true, // Optimism
            '0x89': true, // Polygon
            '0x531': true, // Sei
            '0x144': true, // zkSync Era
            '0x2a15c308d': true, // Palm
            '0x3e7': true, // HyperEVM
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true, // Solana Mainnet
          },
        },
      });
    });

    it('does not disable any existing networks', async () => {
      const { controller, messenger } = setupInitializedController();

      // Add a non-popular network
      messenger.publish('NetworkController:networkAdded', {
        chainId: '0x2', // A network not in POPULAR_NETWORKS
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        name: 'Test Network',
        nativeCurrency: 'TEST',
        rpcEndpoints: [
          {
            url: 'https://test.network/rpc',
            networkClientId: 'test-id',
            type: RpcEndpointType.Custom,
          },
        ],
      });

      await advanceTime({ clock, duration: 1 });

      // The added network should be enabled (exclusive behavior of network addition)
      expect(controller.isNetworkEnabled('0x2')).toBe(true);
      // Popular networks should be disabled due to exclusive behavior
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);

      // Enable all popular networks - this should not disable the non-popular network
      controller.enableAllPopularNetworks();

      // All popular networks should now be enabled (no exclusive behavior)
      expect(controller.isNetworkEnabled('0x1')).toBe(true); // Ethereum
      expect(controller.isNetworkEnabled('0xe708')).toBe(true); // Linea
      expect(controller.isNetworkEnabled('0x2105')).toBe(true); // Base
      expect(controller.isNetworkEnabled('0xa4b1')).toBe(true); // Arbitrum One
      expect(controller.isNetworkEnabled('0xa86a')).toBe(true); // Avalanche C-Chain
      expect(controller.isNetworkEnabled('0x38')).toBe(true); // BNB Smart Chain
      expect(controller.isNetworkEnabled('0xa')).toBe(true); // Optimism
      expect(controller.isNetworkEnabled('0x89')).toBe(true); // Polygon
      expect(controller.isNetworkEnabled('0x531')).toBe(true); // Sei
      expect(controller.isNetworkEnabled('0x144')).toBe(true); // zkSync Era
      expect(controller.isNetworkEnabled('0x2a15c308d')).toBe(true); // Palm
      expect(controller.isNetworkEnabled('0x3e7')).toBe(true); // HyperEVM
      expect(controller.isNetworkEnabled('0x2')).toBe(true); // Test network (not disabled)
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true); // Solana
    });
  });

  describe('enableNetwork', () => {
    it('enables a network and clears all others in the same namespace', () => {
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

      // Enable the network again - this should disable all others in the same namespace
      controller.enableNetwork('0x1');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet (re-enabled)
            [ChainId[BuiltInNetworkName.LineaMainnet]]: false, // Linea Mainnet (disabled)
            [ChainId[BuiltInNetworkName.BaseMainnet]]: false, // Base Mainnet (disabled)
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true, // Unaffected (different namespace)
          },
        },
      });
    });

    it('enables any network and clears all others (exclusive behavior)', async () => {
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

      // Enable one of the popular networks - only this one will be enabled
      controller.enableNetwork('0x2105');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': false,
            '0xe708': false,
            '0x2105': true,
            '0x2': false,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true,
          },
        },
      });

      // Enable the non-popular network again - it will disable all others
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
            [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
            [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
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
            [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
            [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
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
