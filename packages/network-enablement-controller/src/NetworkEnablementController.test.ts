import { Messenger, deriveStateFromMetadata } from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId } from '@metamask/controller-utils';
import { RpcEndpointType } from '@metamask/network-controller';
import {
  TransactionStatus,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import {
  type CaipChainId,
  type CaipNamespace,
  type Hex,
  KnownCaipNamespace,
} from '@metamask/utils';
import { useFakeTimers } from 'sinon';

import { POPULAR_NETWORKS } from './constants';
import { NetworkEnablementController } from './NetworkEnablementController';
import type {
  NetworkEnablementControllerActions,
  NetworkEnablementControllerEvents,
  AllowedEvents,
  AllowedActions,
  NetworkEnablementControllerMessenger,
} from './NetworkEnablementController';
import { BtcScope, SolScope } from './types';
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
          [SolScope.Testnet]: false,
          [SolScope.Devnet]: false,
        },
        [KnownCaipNamespace.Bip122]: {
          [BtcScope.Mainnet]: true,
          [BtcScope.Testnet]: false,
          [BtcScope.Signet]: false,
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
          [SolScope.Testnet]: false,
          [SolScope.Devnet]: false,
        },
        [KnownCaipNamespace.Bip122]: {
          [BtcScope.Mainnet]: true,
          [BtcScope.Testnet]: false,
          [BtcScope.Signet]: false,
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
          [SolScope.Testnet]: false,
          [SolScope.Devnet]: false,
        },
        [KnownCaipNamespace.Bip122]: {
          [BtcScope.Mainnet]: true,
          [BtcScope.Testnet]: false,
          [BtcScope.Signet]: false,
        },
      },
    });
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
          [SolScope.Testnet]: false,
          [SolScope.Devnet]: false,
        },
        [KnownCaipNamespace.Bip122]: {
          [BtcScope.Mainnet]: true,
          [BtcScope.Testnet]: false,
          [BtcScope.Signet]: false,
        },
      },
    });
  });

  describe('init', () => {
    it('initializes network enablement state from controller configurations', () => {
      const { controller } = setupController();

      jest
        // eslint-disable-next-line dot-notation
        .spyOn(controller['messagingSystem'], 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': { chainId: '0x1', name: 'Ethereum Mainnet' },
                '0xe708': { chainId: '0xe708', name: 'Linea Mainnet' },
                '0x2105': { chainId: '0x2105', name: 'Base Mainnet' },
              },
              networksMetadata: {},
            };
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'eip155:1': { chainId: 'eip155:1', name: 'Ethereum Mainnet' },
                'eip155:59144': {
                  chainId: 'eip155:59144',
                  name: 'Linea Mainnet',
                },
                'eip155:8453': { chainId: 'eip155:8453', name: 'Base Mainnet' },
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana Mainnet',
                },
              },
              selectedMultichainNetworkChainId: 'eip155:1',
              isEvmSelected: true,
              networksWithTransactionActivity: {},
            };
          }
          throw new Error(`Unexpected action type: ${actionType}`);
        });

      // Initialize from configurations
      controller.init();

      // Should only enable popular networks that exist in NetworkController config
      // (0x1, 0xe708, 0x2105 exist in default NetworkController mock)
      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet (exists in default config)
            [ChainId[BuiltInNetworkName.LineaMainnet]]: true, // Linea Mainnet (exists in default config)
            [ChainId[BuiltInNetworkName.BaseMainnet]]: true, // Base Mainnet (exists in default config)
            // Other popular networks not enabled because they don't exist in default config
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true, // Solana Mainnet (exists in multichain config)
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: true,
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
          },
        },
      });
    });

    it('only enables popular networks that exist in NetworkController configurations', () => {
      // Create a separate controller setup for this test to avoid handler conflicts
      const { controller, messenger } = setupController({
        config: {
          state: {
            enabledNetworkMap: {
              [KnownCaipNamespace.Eip155]: {},
              [KnownCaipNamespace.Solana]: {},
            },
          },
        },
      });

      jest.spyOn(messenger, 'call').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (actionType: string, ..._args: any[]): any => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': { chainId: '0x1', name: 'Ethereum Mainnet' },
                '0xe708': { chainId: '0xe708', name: 'Linea Mainnet' },
                // Missing other popular networks
              },
              networksMetadata: {},
            };
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana Mainnet',
                },
              },
              selectedMultichainNetworkChainId:
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
              isEvmSelected: false,
              networksWithTransactionActivity: {},
            };
          }
          throw new Error(`Unexpected action type: ${actionType}`);
        },
      );

      // Initialize from configurations
      controller.init();

      // Should only enable networks that exist in configurations
      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': false, // Ethereum Mainnet (exists in config)
            '0xe708': false, // Linea Mainnet (exists in config)
            // Other popular networks not enabled because they don't exist in config
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: false, // Solana Mainnet (exists in config)
          },
        },
      });
    });

    it('handles missing MultichainNetworkController gracefully', () => {
      const { controller, messenger } = setupController();

      jest
        .spyOn(messenger, 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': { chainId: '0x1', name: 'Ethereum Mainnet' },
                '0xe708': { chainId: '0xe708', name: 'Linea Mainnet' },
                '0x2105': { chainId: '0x2105', name: 'Base Mainnet' },
              },
              networksMetadata: {},
            };
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {},
              selectedMultichainNetworkChainId: 'eip155:1',
              isEvmSelected: true,
              networksWithTransactionActivity: {},
            };
          }
          throw new Error(`Unexpected action type: ${actionType}`);
        });

      // Should not throw
      expect(() => controller.init()).not.toThrow();

      // Should still enable popular networks from NetworkController
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x2105')).toBe(true);
    });

    it('creates namespace buckets for all configured networks', () => {
      const { controller } = setupController();

      jest
        // eslint-disable-next-line dot-notation
        .spyOn(controller['messagingSystem'], 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': { chainId: '0x1', name: 'Ethereum' },
                '0x89': { chainId: '0x89', name: 'Polygon' },
              },
              networksMetadata: {},
            };
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana',
                },
                'bip122:000000000019d6689c085ae165831e93': {
                  chainId: 'bip122:000000000019d6689c085ae165831e93',
                  name: 'Bitcoin',
                },
              },
              selectedMultichainNetworkChainId:
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
              isEvmSelected: false,
              networksWithTransactionActivity: {},
            };
          }
          throw new Error(`Unexpected action type: ${actionType}`);
        });

      controller.init();

      // Should have created namespace buckets for all network types
      expect(controller.state.enabledNetworkMap).toHaveProperty(
        KnownCaipNamespace.Eip155,
      );
      expect(controller.state.enabledNetworkMap).toHaveProperty(
        KnownCaipNamespace.Solana,
      );
      expect(controller.state.enabledNetworkMap).toHaveProperty(
        KnownCaipNamespace.Bip122,
      );
    });

    it('creates new namespace buckets for networks that do not exist', () => {
      const { controller } = setupController();

      // Start with empty state to test namespace bucket creation
      // eslint-disable-next-line dot-notation
      controller['update']((state) => {
        state.enabledNetworkMap = {};
      });

      jest
        // eslint-disable-next-line dot-notation
        .spyOn(controller['messagingSystem'], 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: unknown[]): any => {
          const responses = {
            'NetworkController:getState': {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': {
                  chainId: '0x1' as Hex,
                  name: 'Ethereum',
                  blockExplorerUrls: [],
                  defaultRpcEndpointIndex: 0,
                  nativeCurrency: 'ETH',
                  rpcEndpoints: [],
                },
              },
              networksMetadata: {},
            },
            'MultichainNetworkController:getState': {
              multichainNetworkConfigurationsByChainId: {
                'cosmos:cosmoshub-4': {
                  chainId: 'cosmos:cosmoshub-4' as CaipChainId,
                  name: 'Cosmos Hub',
                  isEvm: false as const,
                  nativeCurrency:
                    'cosmos:cosmoshub-4/slip44:118' as `${string}:${string}/${string}:${string}`,
                },
              },
              selectedMultichainNetworkChainId:
                'cosmos:cosmoshub-4' as CaipChainId,
              isEvmSelected: false,
              networksWithTransactionActivity: {},
            },
          };
          return responses[actionType as keyof typeof responses];
        });

      controller.init();

      // Should have created namespace buckets for both EIP-155 and Cosmos
      expect(controller.state.enabledNetworkMap).toHaveProperty(
        KnownCaipNamespace.Eip155,
      );
      expect(controller.state.enabledNetworkMap).toHaveProperty('cosmos');
    });

    it('sets Bitcoin testnet to false when it exists in MultichainNetworkController configurations', () => {
      const { controller } = setupController();

      // Mock MultichainNetworkController to include Bitcoin testnet BEFORE calling init
      jest
        // eslint-disable-next-line dot-notation
        .spyOn(controller['messagingSystem'], 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': { chainId: '0x1', name: 'Ethereum Mainnet' },
              },
              networksMetadata: {},
            };
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                [BtcScope.Mainnet]: {
                  chainId: BtcScope.Mainnet,
                  name: 'Bitcoin Mainnet',
                },
                [BtcScope.Testnet]: {
                  chainId: BtcScope.Testnet,
                  name: 'Bitcoin Testnet',
                },
              },
              selectedMultichainNetworkChainId: BtcScope.Mainnet,
              isEvmSelected: false,
              networksWithTransactionActivity: {},
            };
          }
          throw new Error(`Unexpected action type: ${actionType}`);
        });

      // Initialize the controller to trigger line 378 (init() method sets testnet to false)
      controller.init();

      // Verify Bitcoin testnet is set to false by init() - line 378
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(false);
      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Bip122][
          BtcScope.Testnet
        ],
      ).toBe(false);
    });

    it('sets Bitcoin signet to false when it exists in MultichainNetworkController configurations', () => {
      const { controller } = setupController();

      // Mock MultichainNetworkController to include Bitcoin signet BEFORE calling init
      jest
        // eslint-disable-next-line dot-notation
        .spyOn(controller['messagingSystem'], 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': { chainId: '0x1', name: 'Ethereum Mainnet' },
              },
              networksMetadata: {},
            };
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                [BtcScope.Mainnet]: {
                  chainId: BtcScope.Mainnet,
                  name: 'Bitcoin Mainnet',
                },
                [BtcScope.Signet]: {
                  chainId: BtcScope.Signet,
                  name: 'Bitcoin Signet',
                },
              },
              selectedMultichainNetworkChainId: BtcScope.Mainnet,
              isEvmSelected: false,
              networksWithTransactionActivity: {},
            };
          }
          throw new Error(`Unexpected action type: ${actionType}`);
        });

      // Initialize the controller to trigger line 391 (init() method sets signet to false)
      controller.init();

      // Verify Bitcoin signet is set to false by init() - line 391
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);
      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Bip122][
          BtcScope.Signet
        ],
      ).toBe(false);
    });
  });

  describe('enableAllPopularNetworks', () => {
    it('enables all popular networks that exist in controller configurations and Solana mainnet', () => {
      const { controller } = setupInitializedController();

      // Mock the network configurations
      jest
        // eslint-disable-next-line dot-notation
        .spyOn(controller['messagingSystem'], 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': { chainId: '0x1', name: 'Ethereum Mainnet' },
                '0xe708': { chainId: '0xe708', name: 'Linea Mainnet' },
                '0x2105': { chainId: '0x2105', name: 'Base Mainnet' },
              },
              networksMetadata: {},
            };
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana Mainnet',
                },
                [BtcScope.Mainnet]: {
                  chainId: BtcScope.Mainnet,
                  name: 'Bitcoin Mainnet',
                },
              },
              selectedMultichainNetworkChainId:
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
              isEvmSelected: false,
              networksWithTransactionActivity: {},
            };
          }
          throw new Error(`Unexpected action type: ${actionType}`);
        });

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
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: true,
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
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
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true, // Solana
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: true,
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
          },
        },
      });
    });

    it('enables all popular networks from constants', () => {
      const { controller, messenger } = setupController();

      // Mock all popular networks to be available in configurations
      jest.spyOn(messenger, 'call').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (actionType: string, ..._args: any[]): any => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'NetworkController:getState') {
            // Create mock configurations for all popular networks
            const networkConfigurationsByChainId = POPULAR_NETWORKS.reduce(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (acc: any, chainId: string) => {
                acc[chainId] = { chainId, name: `Network ${chainId}` };
                return acc;
              },
              {},
            );
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId,
              networksMetadata: {},
            };
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana Mainnet',
                },
                [BtcScope.Mainnet]: {
                  chainId: BtcScope.Mainnet,
                  name: 'Bitcoin Mainnet',
                },
              },
              selectedMultichainNetworkChainId:
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
              isEvmSelected: false,
              networksWithTransactionActivity: {},
            };
          }
          throw new Error(`Unexpected action type: ${actionType}`);
        },
      );

      // The function should enable all popular networks defined in constants
      expect(() => controller.enableAllPopularNetworks()).not.toThrow();

      // Should enable all popular networks and Solana
      const expectedEip155Networks = POPULAR_NETWORKS.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc: any, chainId: string) => {
          acc[chainId] = true;
          return acc;
        },
        {},
      );

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: expectedEip155Networks,
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: true, // Solana Mainnet
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: true,
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
          },
        },
      });
    });

    it('disables existing networks and enables only popular networks (exclusive behavior)', async () => {
      const { controller, messenger } = setupInitializedController();

      // Mock the network configurations to include popular networks
      jest
        // eslint-disable-next-line dot-notation
        .spyOn(controller['messagingSystem'], 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': { chainId: '0x1', name: 'Ethereum Mainnet' },
                '0xe708': { chainId: '0xe708', name: 'Linea Mainnet' },
                '0x2105': { chainId: '0x2105', name: 'Base Mainnet' },
                '0x2': { chainId: '0x2', name: 'Test Network' }, // Non-popular network
              },
              networksMetadata: {},
            };
          }
          // eslint-disable-next-line jest/no-conditional-in-test
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana Mainnet',
                },
                [BtcScope.Mainnet]: {
                  chainId: BtcScope.Mainnet,
                  name: 'Bitcoin Mainnet',
                },
              },
              selectedMultichainNetworkChainId:
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
              isEvmSelected: false,
              networksWithTransactionActivity: {},
            };
          }
          throw new Error(`Unexpected action type: ${actionType}`);
        });

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

      // Enable all popular networks - this should disable the non-popular network (exclusive behavior)
      controller.enableAllPopularNetworks();

      // All popular networks should now be enabled (with exclusive behavior)
      expect(controller.isNetworkEnabled('0x1')).toBe(true); // Ethereum
      expect(controller.isNetworkEnabled('0xe708')).toBe(true); // Linea
      expect(controller.isNetworkEnabled('0x2105')).toBe(true); // Base
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true); // Solana
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true); // Bitcoin
      // The non-popular network should be disabled due to exclusive behavior
      expect(controller.isNetworkEnabled('0x2')).toBe(false); // Test network
    });

    it('enables Bitcoin mainnet when configured in MultichainNetworkController', () => {
      const { controller } = setupController();

      // Mock the network configurations to include Bitcoin
      jest
        // eslint-disable-next-line dot-notation
        .spyOn(controller['messagingSystem'], 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: unknown[]): any => {
          const responses = {
            'NetworkController:getState': {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {},
              networksMetadata: {},
            },
            'MultichainNetworkController:getState': {
              multichainNetworkConfigurationsByChainId: {
                [BtcScope.Mainnet]: {
                  chainId: BtcScope.Mainnet,
                  name: 'Bitcoin Mainnet',
                  isEvm: false as const,
                  nativeCurrency:
                    'bip122:000000000019d6689c085ae165831e93/slip44:0' as `${string}:${string}/${string}:${string}`,
                },
              },
              selectedMultichainNetworkChainId: BtcScope.Mainnet,
              isEvmSelected: false,
              networksWithTransactionActivity: {},
            },
          };
          return responses[actionType as keyof typeof responses];
        });

      // Initially disable Bitcoin to test enablement
      // eslint-disable-next-line dot-notation
      controller['update']((state) => {
        state.enabledNetworkMap[KnownCaipNamespace.Bip122][BtcScope.Mainnet] =
          false;
      });

      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);

      // enableAllPopularNetworks should re-enable Bitcoin when it exists in config
      controller.enableAllPopularNetworks();

      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
    });
  });

  describe('enableNetwork', () => {
    it('enables a network and clears all others in all namespaces', () => {
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
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: true,
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
          },
        },
      });

      // Enable the network again - this should disable all others in all namespaces
      controller.enableNetwork('0x1');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet (re-enabled)
            [ChainId[BuiltInNetworkName.LineaMainnet]]: false, // Linea Mainnet (disabled)
            [ChainId[BuiltInNetworkName.BaseMainnet]]: false, // Base Mainnet (disabled)
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: false, // Now disabled (cross-namespace behavior)
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: false, // Now disabled (cross-namespace behavior)
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
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
            [SolScope.Mainnet]: false, // Disabled due to cross-namespace behavior
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: false, // Disabled due to cross-namespace behavior
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
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
            [SolScope.Mainnet]: false, // Now disabled (cross-namespace behavior)
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: false, // Now disabled (cross-namespace behavior)
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
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
            [SolScope.Mainnet]: false, // Now disabled (cross-namespace behavior)
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: false, // Now disabled (cross-namespace behavior)
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
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
            [ChainId[BuiltInNetworkName.Mainnet]]: false, // Disabled due to cross-namespace behavior
            [ChainId[BuiltInNetworkName.LineaMainnet]]: false, // Disabled due to cross-namespace behavior
            [ChainId[BuiltInNetworkName.BaseMainnet]]: false, // Disabled due to cross-namespace behavior
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: false, // Disabled due to cross-namespace behavior
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: true, // This network was enabled (even though namespace doesn't exist)
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
          },
        },
      });
    });

    it('handles enabling a network in non-existent namespace gracefully', () => {
      const { controller } = setupController();

      // Remove the BIP122 namespace to test the early return
      // eslint-disable-next-line dot-notation
      controller['update']((state) => {
        delete state.enabledNetworkMap[KnownCaipNamespace.Bip122];
      });

      // Try to enable a Bitcoin network when the namespace doesn't exist
      controller.enableNetwork('bip122:000000000933ea01ad0ee984209779ba');

      // All existing networks should be disabled due to cross-namespace behavior, even though target network couldn't be enabled
      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: false,
            [ChainId[BuiltInNetworkName.LineaMainnet]]: false,
            [ChainId[BuiltInNetworkName.BaseMainnet]]: false,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: false,
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
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
            [ChainId[BuiltInNetworkName.Mainnet]]: false, // Disabled due to cross-namespace behavior
            [ChainId[BuiltInNetworkName.LineaMainnet]]: false, // Disabled due to cross-namespace behavior
            [ChainId[BuiltInNetworkName.BaseMainnet]]: false, // Disabled due to cross-namespace behavior
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: false, // Disabled due to cross-namespace behavior
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            'bip122:000000000019d6689c085ae165831e93': true,
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
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
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: true,
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
          },
        },
      });
    });

    it('does disable a Solana network using CAIP chain ID as it is the only enabled network on the namespace', () => {
      const { controller } = setupController();

      // Try to disable a Solana network using CAIP chain ID
      expect(() =>
        controller.disableNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).not.toThrow();
    });

    it('disables the last active network for an EVM namespace', () => {
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
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Bip122]: {
            [BtcScope.Mainnet]: true,
            [BtcScope.Testnet]: false,
            [BtcScope.Signet]: false,
          },
        },
      });

      // Try to disable the last active network
      expect(() => controller.disableNetwork('0x1')).not.toThrow();
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
      ).toBe(true);
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

    it('handles disabling networks across different namespaces independently, but adding networks has exclusive behavior', async () => {
      const { controller, messenger } = setupController();

      // EVM networks should not affect Solana network status when disabling
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true);

      // Disable all EVM networks (should not affect Solana)
      controller.disableNetwork('0xe708'); // Linea
      controller.disableNetwork('0x2105'); // Base

      // Solana should still be enabled
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(true);

      // Add a Bitcoin network (this triggers enabling, which disables all others)
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

      // Bitcoin should be enabled, all others should be disabled due to exclusive behavior
      expect(
        controller.isNetworkEnabled('bip122:000000000019d6689c085ae165831e93'),
      ).toBe(true);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false); // Now disabled due to exclusive behavior
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
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

  describe('Bitcoin Support', () => {
    it('initializes with only Bitcoin mainnet enabled by default', () => {
      const { controller } = setupController();

      // Only Bitcoin mainnet should be enabled by default
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);

      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Bip122],
      ).toStrictEqual({
        [BtcScope.Mainnet]: true,
        [BtcScope.Testnet]: false,
        [BtcScope.Signet]: false,
      });
    });

    it('enables and disables Bitcoin networks using CAIP chain IDs with exclusive behavior', () => {
      const { controller } = setupController();

      // Initially only Bitcoin mainnet is enabled
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);

      // Enable Bitcoin testnet (should disable all others in all namespaces due to exclusive behavior)
      controller.enableNetwork(BtcScope.Testnet);
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);
      // Check that EVM and Solana networks are also disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);

      // Enable Bitcoin signet (should disable testnet and all other networks)
      controller.enableNetwork(BtcScope.Signet);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);
      // EVM and Solana networks should remain disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);

      // Re-enable mainnet (should disable signet and all other networks)
      controller.enableNetwork(BtcScope.Mainnet);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);
      // EVM and Solana networks should remain disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);
    });

    it('allows disabling Bitcoin networks when multiple are enabled', () => {
      const { controller } = setupController();

      // Initially only Bitcoin mainnet is enabled
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);

      // Enable testnet (this will disable mainnet and all other networks due to exclusive behavior)
      controller.enableNetwork(BtcScope.Testnet);
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);
      // EVM and Solana networks should also be disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);

      // Now enable mainnet again (this will disable testnet and all other networks)
      controller.enableNetwork(BtcScope.Mainnet);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(false);
      // EVM and Solana networks should remain disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);

      // Enable signet (this will disable mainnet and all other networks)
      controller.enableNetwork(BtcScope.Signet);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);
      // EVM and Solana networks should remain disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);
    });

    it('prevents disabling the last remaining Bitcoin network', () => {
      const { controller } = setupController();

      // Only Bitcoin mainnet is enabled by default
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);

      // Should not be able to disable the last remaining Bitcoin network
      expect(() => controller.disableNetwork(BtcScope.Mainnet)).not.toThrow();
    });

    it('allows disabling the last Bitcoin network', () => {
      const { controller } = setupController();

      // Only Bitcoin mainnet is enabled by default in the BIP122 namespace
      expect(() => controller.disableNetwork(BtcScope.Mainnet)).not.toThrow();
    });

    it('handles all Bitcoin testnet variants', () => {
      const { controller } = setupController();

      // Test each Bitcoin testnet variant
      const testnets = [
        { scope: BtcScope.Testnet, name: 'Testnet' },
        { scope: BtcScope.Signet, name: 'Signet' },
      ];

      testnets.forEach(({ scope }) => {
        // Enable the testnet (should disable all others in all namespaces due to exclusive behavior)
        controller.enableNetwork(scope);
        expect(controller.isNetworkEnabled(scope)).toBe(true);
        expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);

        // Check that EVM and Solana networks are also disabled
        expect(controller.isNetworkEnabled('0x1')).toBe(false);
        expect(controller.isNetworkEnabled('0xe708')).toBe(false);
        expect(controller.isNetworkEnabled('0x2105')).toBe(false);
        expect(
          controller.isNetworkEnabled(
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          ),
        ).toBe(false);

        // Verify other testnets are also disabled
        testnets.forEach(({ scope: otherScope }) => {
          expect(controller.isNetworkEnabled(otherScope)).toBe(
            otherScope === scope,
          );
        });
      });
    });

    it('handles Bitcoin network addition dynamically', async () => {
      const { controller, messenger } = setupController();

      // Add Bitcoin testnet dynamically
      messenger.publish('NetworkController:networkAdded', {
        // @ts-expect-error Testing with Bitcoin network
        chainId: BtcScope.Testnet,
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        name: 'Bitcoin Testnet',
        nativeCurrency: 'tBTC',
        rpcEndpoints: [
          {
            url: 'https://api.blockcypher.com/v1/btc/test3',
            networkClientId: 'btc-testnet',
            type: RpcEndpointType.Custom,
          },
        ],
      });

      await advanceTime({ clock, duration: 1 });

      // Bitcoin testnet should be enabled, others should be disabled (exclusive behavior across all namespaces)
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);
      // EVM and Solana networks should also be disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);
    });

    it('maintains Bitcoin network state independently when disabling networks from other namespaces', () => {
      const { controller } = setupController();

      // Disable EVM networks (disableNetwork should not affect other namespaces)
      controller.disableNetwork('0x1');
      controller.disableNetwork('0xe708');

      // Bitcoin mainnet should still be enabled, testnets remain disabled
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);

      // Disable Solana network - this should not affect Bitcoin networks
      expect(() =>
        controller.disableNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).not.toThrow();

      // Bitcoin mainnet should still be enabled, testnets remain disabled
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);
    });

    it('validates Bitcoin network chain IDs are correct', () => {
      const { controller } = setupController();

      // Test that Bitcoin networks have the correct chain IDs and default states
      expect(
        controller.isNetworkEnabled('bip122:000000000019d6689c085ae165831e93'),
      ).toBe(true); // Mainnet (enabled by default)
      expect(
        controller.isNetworkEnabled('bip122:000000000933ea01ad0ee984209779ba'),
      ).toBe(false); // Testnet (disabled by default)
      expect(
        controller.isNetworkEnabled('bip122:00000008819873e925422c1ff0f99f7c'),
      ).toBe(false); // Signet (disabled by default)
    });
  });

  describe('enableNetworkInNamespace', () => {
    it('enables a network in the specified namespace and disables others in same namespace', () => {
      const { controller } = setupInitializedController();

      // Initially multiple EVM networks are enabled
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x2105')).toBe(true);

      // Enable only Ethereum mainnet in EIP-155 namespace
      controller.enableNetworkInNamespace('0x1', KnownCaipNamespace.Eip155);

      // Only Ethereum mainnet should be enabled in EIP-155 namespace
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);

      // Other namespaces should remain unchanged
      expect(controller.isNetworkEnabled(SolScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
    });

    it('enables a network using CAIP chain ID in the specified namespace', () => {
      const { controller } = setupInitializedController();

      // Enable Ethereum mainnet using CAIP format
      controller.enableNetworkInNamespace(
        'eip155:1',
        KnownCaipNamespace.Eip155,
      );

      // Only Ethereum mainnet should be enabled in EIP-155 namespace
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);
    });

    it('enables a Solana network in the Solana namespace', () => {
      const { controller } = setupInitializedController();

      // Enable Solana testnet in the Solana namespace
      controller.enableNetworkInNamespace(
        SolScope.Testnet,
        KnownCaipNamespace.Solana,
      );

      // Only Solana testnet should be enabled in Solana namespace
      expect(controller.isNetworkEnabled(SolScope.Testnet)).toBe(true);
      expect(controller.isNetworkEnabled(SolScope.Mainnet)).toBe(false);
      expect(controller.isNetworkEnabled(SolScope.Devnet)).toBe(false);

      // Other namespaces should remain unchanged
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x2105')).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
    });

    it('enables a Bitcoin network in the Bitcoin namespace', () => {
      const { controller } = setupInitializedController();

      // Enable Bitcoin testnet in the Bitcoin namespace
      controller.enableNetworkInNamespace(
        BtcScope.Testnet,
        KnownCaipNamespace.Bip122,
      );

      // Only Bitcoin testnet should be enabled in Bitcoin namespace
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);

      // Other namespaces should remain unchanged
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x2105')).toBe(true);
      expect(controller.isNetworkEnabled(SolScope.Mainnet)).toBe(true);
    });

    it('throws error when chainId namespace does not match provided namespace', () => {
      const { controller } = setupInitializedController();

      // Try to enable Ethereum network in Solana namespace
      expect(() => {
        controller.enableNetworkInNamespace('0x1', KnownCaipNamespace.Solana);
      }).toThrow(
        'Chain ID 0x1 belongs to namespace eip155, but namespace solana was specified',
      );

      // Try to enable Solana network in EIP-155 namespace
      expect(() => {
        controller.enableNetworkInNamespace(
          SolScope.Mainnet,
          KnownCaipNamespace.Eip155,
        );
      }).toThrow(
        `Chain ID ${SolScope.Mainnet} belongs to namespace solana, but namespace eip155 was specified`,
      );

      // Try to enable Bitcoin network in Solana namespace
      expect(() => {
        controller.enableNetworkInNamespace(
          BtcScope.Mainnet,
          KnownCaipNamespace.Solana,
        );
      }).toThrow(
        `Chain ID ${BtcScope.Mainnet} belongs to namespace bip122, but namespace solana was specified`,
      );
    });

    it('throws error with CAIP chain ID when namespace does not match', () => {
      const { controller } = setupInitializedController();

      // Try to enable Ethereum network using CAIP format in Solana namespace
      expect(() => {
        controller.enableNetworkInNamespace(
          'eip155:1',
          KnownCaipNamespace.Solana,
        );
      }).toThrow(
        'Chain ID eip155:1 belongs to namespace eip155, but namespace solana was specified',
      );
    });
    it('handles enabling an already enabled network', () => {
      const { controller } = setupInitializedController();

      // Ethereum mainnet is already enabled
      expect(controller.isNetworkEnabled('0x1')).toBe(true);

      const initialState = { ...controller.state };

      // Enable it again - should disable other networks in the namespace
      controller.enableNetworkInNamespace('0x1', KnownCaipNamespace.Eip155);

      // Only Ethereum mainnet should be enabled in EIP-155 namespace
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);

      // Should be different from initial state due to disabling other networks
      expect(controller.state).not.toStrictEqual(initialState);
    });

    it('enables network that does not exist in current state', () => {
      const { controller } = setupController();

      // Try to enable a network that doesn't exist in the state yet
      controller.enableNetworkInNamespace('0x89', KnownCaipNamespace.Eip155);

      // Network should be enabled (namespace bucket should be created)
      expect(controller.isNetworkEnabled('0x89')).toBe(true);
      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Eip155]['0x89'],
      ).toBe(true);
    });

    it('maintains consistency between hex and CAIP formats', () => {
      const { controller } = setupInitializedController();

      // Enable using hex format
      controller.enableNetworkInNamespace('0x1', KnownCaipNamespace.Eip155);

      // Both formats should show the same result
      expect(controller.isNetworkEnabled('0x1')).toBe(
        controller.isNetworkEnabled('eip155:1'),
      );
      expect(controller.isNetworkEnabled('0x1')).toBe(true);

      // Enable using CAIP format
      controller.enableNetworkInNamespace(
        'eip155:59144',
        KnownCaipNamespace.Eip155,
      );

      // Both formats should show the same result
      expect(controller.isNetworkEnabled('0xe708')).toBe(
        controller.isNetworkEnabled('eip155:59144'),
      );
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x1')).toBe(false); // Should be disabled
    });

    it('handles custom namespace creation for new blockchain', () => {
      const { controller } = setupController();

      // Try to enable a network in a custom namespace that doesn't exist yet
      const customChainId = 'cosmos:cosmoshub-4' as CaipChainId;
      const customNamespace = 'cosmos' as CaipNamespace;

      controller.enableNetworkInNamespace(customChainId, customNamespace);

      // Custom namespace should be created and network enabled
      expect(controller.state.enabledNetworkMap[customNamespace]).toBeDefined();
      expect(
        controller.state.enabledNetworkMap[customNamespace][customChainId],
      ).toBe(true);
      expect(controller.isNetworkEnabled(customChainId)).toBe(true);
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'anonymous',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "enabledNetworkMap": Object {
            "bip122": Object {
              "bip122:000000000019d6689c085ae165831e93": true,
              "bip122:000000000933ea01ad0ee984209779ba": false,
              "bip122:00000008819873e925422c1ff0f99f7c": false,
            },
            "eip155": Object {
              "0x1": true,
              "0x2105": true,
              "0xe708": true,
            },
            "solana": Object {
              "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z": false,
              "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": true,
              "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": false,
            },
          },
        }
      `);
    });

    it('includes expected state in state logs', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "enabledNetworkMap": Object {
            "bip122": Object {
              "bip122:000000000019d6689c085ae165831e93": true,
              "bip122:000000000933ea01ad0ee984209779ba": false,
              "bip122:00000008819873e925422c1ff0f99f7c": false,
            },
            "eip155": Object {
              "0x1": true,
              "0x2105": true,
              "0xe708": true,
            },
            "solana": Object {
              "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z": false,
              "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": true,
              "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": false,
            },
          },
        }
      `);
    });

    it('persists expected state', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "enabledNetworkMap": Object {
            "bip122": Object {
              "bip122:000000000019d6689c085ae165831e93": true,
              "bip122:000000000933ea01ad0ee984209779ba": false,
              "bip122:00000008819873e925422c1ff0f99f7c": false,
            },
            "eip155": Object {
              "0x1": true,
              "0x2105": true,
              "0xe708": true,
            },
            "solana": Object {
              "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z": false,
              "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": true,
              "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": false,
            },
          },
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const { controller } = setupController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "enabledNetworkMap": Object {
            "bip122": Object {
              "bip122:000000000019d6689c085ae165831e93": true,
              "bip122:000000000933ea01ad0ee984209779ba": false,
              "bip122:00000008819873e925422c1ff0f99f7c": false,
            },
            "eip155": Object {
              "0x1": true,
              "0x2105": true,
              "0xe708": true,
            },
            "solana": Object {
              "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z": false,
              "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": true,
              "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": false,
            },
          },
        }
      `);
    });
  });
});
