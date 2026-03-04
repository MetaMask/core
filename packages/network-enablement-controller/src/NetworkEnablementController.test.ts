import { deriveStateFromMetadata } from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId } from '@metamask/controller-utils';
import { BtcScope, SolScope, TrxScope } from '@metamask/keyring-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import { RpcEndpointType } from '@metamask/network-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { KnownCaipNamespace } from '@metamask/utils';
import type { CaipChainId, CaipNamespace, Hex } from '@metamask/utils';

import { POPULAR_NETWORKS } from './constants';
import { NetworkEnablementController } from './NetworkEnablementController';
import type {
  NetworkEnablementControllerMessenger,
  NativeAssetIdentifiersMap,
} from './NetworkEnablementController';
import { Slip44Service } from './services';
import { jestAdvanceTime } from '../../../tests/helpers';

// Known chainId mappings from chainid.network for mocking
const chainIdToSlip44: Record<number, number> = {
  1: 60, // Ethereum
  10: 60, // Optimism
  56: 714, // BNB Chain
  137: 966, // Polygon
  43114: 9000, // Avalanche
  42161: 60, // Arbitrum
  8453: 60, // Base
  59144: 60, // Linea
  1329: 60, // Sei (uses ETH as native)
};

const controllerName = 'NetworkEnablementController';

/**
 * Returns the default nativeAssetIdentifiers state for testing.
 *
 * @returns The default nativeAssetIdentifiers with all pre-configured networks.
 */
// Default nativeAssetIdentifiers is empty - should be populated by client using initNativeAssetIdentifiers()
function getDefaultNativeAssetIdentifiers(): NativeAssetIdentifiersMap {
  return {};
}

type AllNetworkEnablementControllerActions =
  MessengerActions<NetworkEnablementControllerMessenger>;

type AllNetworkEnablementControllerEvents =
  MessengerEvents<NetworkEnablementControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllNetworkEnablementControllerActions,
  AllNetworkEnablementControllerEvents
>;

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

const setupController = ({
  config,
}: {
  config?: Partial<
    ConstructorParameters<typeof NetworkEnablementController>[0]
  >;
} = {}): {
  controller: NetworkEnablementController;
  rootMessenger: RootMessenger;
  messenger: NetworkEnablementControllerMessenger;
} => {
  const rootMessenger = getRootMessenger();

  const networkEnablementControllerMessenger = new Messenger<
    typeof controllerName,
    AllNetworkEnablementControllerActions,
    AllNetworkEnablementControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger: networkEnablementControllerMessenger,
    actions: [
      'NetworkController:getState',
      'MultichainNetworkController:getState',
    ],
    events: [
      'NetworkController:networkAdded',
      'NetworkController:networkRemoved',
      'NetworkController:stateChange',
      'TransactionController:transactionSubmitted',
    ],
  });

  rootMessenger.registerActionHandler(
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
    rootMessenger,
    messenger: networkEnablementControllerMessenger,
  };
};

describe('NetworkEnablementController', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    // Mock Slip44Service.getEvmSlip44 to avoid network calls
    jest
      .spyOn(Slip44Service, 'getEvmSlip44')
      .mockImplementation(async (chainId) => {
        return chainIdToSlip44[chainId] ?? 60;
      });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('initializes with default state', () => {
    const { controller } = setupController();

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true,
          [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
          [ChainId[BuiltInNetworkName.ArbitrumOne]]: true,
          [ChainId[BuiltInNetworkName.BscMainnet]]: true,
          [ChainId[BuiltInNetworkName.OptimismMainnet]]: true,
          [ChainId[BuiltInNetworkName.PolygonMainnet]]: true,
          [ChainId[BuiltInNetworkName.SeiMainnet]]: true,
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
        [KnownCaipNamespace.Tron]: {
          [TrxScope.Mainnet]: true,
          [TrxScope.Nile]: false,
          [TrxScope.Shasta]: false,
        },
      },
      nativeAssetIdentifiers: getDefaultNativeAssetIdentifiers(),
    });
  });

  it('subscribes to NetworkController:networkAdded', async () => {
    const { controller, rootMessenger } = setupController();

    // Publish an update with avax network added
    // Avalanche is a popular network, and we already have >2 popular networks enabled
    // So the new behavior should keep current selection (add but don't enable)
    rootMessenger.publish('NetworkController:networkAdded', {
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

    await jestAdvanceTime({ duration: 1 });

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet
          [ChainId[BuiltInNetworkName.LineaMainnet]]: true, // Linea Mainnet
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true, // Base Mainnet
          [ChainId[BuiltInNetworkName.ArbitrumOne]]: true,
          [ChainId[BuiltInNetworkName.BscMainnet]]: true,
          [ChainId[BuiltInNetworkName.OptimismMainnet]]: true,
          [ChainId[BuiltInNetworkName.PolygonMainnet]]: true,
          [ChainId[BuiltInNetworkName.SeiMainnet]]: true,
          '0xa86a': true, // Avalanche network added and enabled (keeps current selection)
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
        [KnownCaipNamespace.Tron]: {
          [TrxScope.Mainnet]: true,
          [TrxScope.Nile]: false,
          [TrxScope.Shasta]: false,
        },
      },
      nativeAssetIdentifiers: {
        ...getDefaultNativeAssetIdentifiers(),
        'eip155:43114': 'eip155:43114/slip44:9000', // AVAX
      },
    });
  });

  it('subscribes to NetworkController:networkRemoved', async () => {
    const { controller, rootMessenger } = setupController();

    // Publish an update with linea network removed
    rootMessenger.publish('NetworkController:networkRemoved', {
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

    await jestAdvanceTime({ duration: 1 });

    // Create expected nativeAssetIdentifiers without Linea
    const expectedNativeAssetIdentifiers = {
      ...getDefaultNativeAssetIdentifiers(),
    };
    delete expectedNativeAssetIdentifiers[
      toEvmCaipChainId(ChainId[BuiltInNetworkName.LineaMainnet])
    ];

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true, // Base Mainnet (Linea removed)
          [ChainId[BuiltInNetworkName.ArbitrumOne]]: true,
          [ChainId[BuiltInNetworkName.BscMainnet]]: true,
          [ChainId[BuiltInNetworkName.OptimismMainnet]]: true,
          [ChainId[BuiltInNetworkName.PolygonMainnet]]: true,
          [ChainId[BuiltInNetworkName.SeiMainnet]]: true,
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
        [KnownCaipNamespace.Tron]: {
          [TrxScope.Mainnet]: true,
          [TrxScope.Nile]: false,
          [TrxScope.Shasta]: false,
        },
      },
      nativeAssetIdentifiers: expectedNativeAssetIdentifiers,
    });
  });

  it('handles TransactionController:transactionSubmitted with missing chainId gracefully', async () => {
    const { controller, rootMessenger } = setupController();

    const initialState = { ...controller.state };

    // Publish a transaction submitted event without chainId
    rootMessenger.publish('TransactionController:transactionSubmitted', {
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

    await jestAdvanceTime({ duration: 1 });

    // State should remain unchanged
    expect(controller.state).toStrictEqual(initialState);
  });

  it('handles TransactionController:transactionSubmitted with malformed structure gracefully', async () => {
    const { controller, rootMessenger } = setupController();

    const initialState = { ...controller.state };

    // Publish a transaction submitted event with malformed structure
    // @ts-expect-error - Testing runtime safety for malformed payload
    rootMessenger.publish('TransactionController:transactionSubmitted', {
      // Missing transactionMeta entirely
    });

    await jestAdvanceTime({ duration: 1 });

    // State should remain unchanged
    expect(controller.state).toStrictEqual(initialState);
  });

  it('handles TransactionController:transactionSubmitted with null/undefined transactionMeta gracefully', async () => {
    const { controller, rootMessenger } = setupController();

    const initialState = { ...controller.state };

    // Test with null transactionMeta
    rootMessenger.publish('TransactionController:transactionSubmitted', {
      // @ts-expect-error - Testing runtime safety for null transactionMeta
      transactionMeta: null,
    });

    await jestAdvanceTime({ duration: 1 });

    // State should remain unchanged
    expect(controller.state).toStrictEqual(initialState);

    // Test with undefined transactionMeta
    rootMessenger.publish('TransactionController:transactionSubmitted', {
      // @ts-expect-error - Testing runtime safety for undefined transactionMeta
      transactionMeta: undefined,
    });

    await jestAdvanceTime({ duration: 1 });

    // State should still remain unchanged
    expect(controller.state).toStrictEqual(initialState);
  });

  it('does fallback to ethereum when removing the last enabled network', async () => {
    const { controller, rootMessenger } = setupController();

    // disable all networks except linea
    controller.disableNetwork('0x1'); // Ethereum Mainnet
    controller.disableNetwork('0x2105'); // Base Mainnet
    controller.disableNetwork('0xa4b1'); // Arbitrum One
    controller.disableNetwork('0x38'); // BSC Mainnet
    controller.disableNetwork('0xa'); // Optimism Mainnet
    controller.disableNetwork('0x89'); // Polygon Mainnet
    controller.disableNetwork('0x531'); // Sei Mainnet

    // Publish an update with linea network removed
    rootMessenger.publish('NetworkController:networkRemoved', {
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

    await jestAdvanceTime({ duration: 1 });

    // Create expected nativeAssetIdentifiers without Linea
    const expectedNativeAssetIdentifiersForFallback = {
      ...getDefaultNativeAssetIdentifiers(),
    };
    delete expectedNativeAssetIdentifiersForFallback[
      toEvmCaipChainId(ChainId[BuiltInNetworkName.LineaMainnet])
    ];

    expect(controller.state).toStrictEqual({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet (fallback enabled)
          [ChainId[BuiltInNetworkName.BaseMainnet]]: false, // Base Mainnet (still disabled)
          [ChainId[BuiltInNetworkName.ArbitrumOne]]: false,
          [ChainId[BuiltInNetworkName.BscMainnet]]: false,
          [ChainId[BuiltInNetworkName.OptimismMainnet]]: false,
          [ChainId[BuiltInNetworkName.PolygonMainnet]]: false,
          [ChainId[BuiltInNetworkName.SeiMainnet]]: false,
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
        [KnownCaipNamespace.Tron]: {
          [TrxScope.Mainnet]: true,
          [TrxScope.Nile]: false,
          [TrxScope.Shasta]: false,
        },
      },
      nativeAssetIdentifiers: expectedNativeAssetIdentifiersForFallback,
    });
  });

  describe('init', () => {
    it('initializes network enablement state from controller configurations', async () => {
      const { controller, messenger } = setupController();

      jest
        .spyOn(messenger, 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': {
                  chainId: '0x1',
                  name: 'Ethereum Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0xe708': {
                  chainId: '0xe708',
                  name: 'Linea Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0x2105': {
                  chainId: '0x2105',
                  name: 'Base Mainnet',
                  nativeCurrency: 'ETH',
                },
              },
              networksMetadata: {},
            };
          }
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'eip155:1': {
                  chainId: 'eip155:1',
                  name: 'Ethereum Mainnet',
                  nativeCurrency: 'ETH',
                },
                'eip155:59144': {
                  chainId: 'eip155:59144',
                  name: 'Linea Mainnet',
                  nativeCurrency: 'ETH',
                },
                'eip155:8453': {
                  chainId: 'eip155:8453',
                  name: 'Base Mainnet',
                  nativeCurrency: 'ETH',
                },
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana Mainnet',
                  nativeCurrency: 'SOL',
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
      await controller.init();

      // Should only enable popular networks that exist in NetworkController config
      // (0x1, 0xe708, 0x2105 exist in default NetworkController mock)
      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet (exists in default config)
            [ChainId[BuiltInNetworkName.LineaMainnet]]: true, // Linea Mainnet (exists in default config)
            [ChainId[BuiltInNetworkName.BaseMainnet]]: true, // Base Mainnet (exists in default config)
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: true,
            [ChainId[BuiltInNetworkName.BscMainnet]]: true,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: true,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: true,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: true,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: true,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        // init() populates nativeAssetIdentifiers from NetworkController (EVM networks only)
        nativeAssetIdentifiers: {
          'eip155:1': 'eip155:1/slip44:60',
          'eip155:59144': 'eip155:59144/slip44:60',
          'eip155:8453': 'eip155:8453/slip44:60',
        },
      });
    });

    it('only enables popular networks that exist in NetworkController configurations', async () => {
      // Create a separate controller setup for this test to avoid handler conflicts
      const { controller, messenger } = setupController({
        config: {
          state: {
            enabledNetworkMap: {
              [KnownCaipNamespace.Eip155]: {},
              [KnownCaipNamespace.Solana]: {},
            },
            nativeAssetIdentifiers: {},
          },
        },
      });

      jest.spyOn(messenger, 'call').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (actionType: string, ..._args: any[]): any => {
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': {
                  chainId: '0x1',
                  name: 'Ethereum Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0xe708': {
                  chainId: '0xe708',
                  name: 'Linea Mainnet',
                  nativeCurrency: 'ETH',
                },
                // Missing other popular networks
              },
              networksMetadata: {},
            };
          }
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana Mainnet',
                  nativeCurrency: 'SOL',
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
      await controller.init();

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
        nativeAssetIdentifiers: {
          'eip155:1': 'eip155:1/slip44:60', // ETH
          'eip155:59144': 'eip155:59144/slip44:60', // ETH (Linea uses ETH)
          // Multichain networks don't populate nativeAssetIdentifiers in init() because
          // the mock doesn't include the required nativeCurrency for non-EVM networks
        },
      });
    });

    it('handles missing MultichainNetworkController gracefully', async () => {
      const { controller, messenger } = setupController();

      jest
        .spyOn(messenger, 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': {
                  chainId: '0x1',
                  name: 'Ethereum Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0xe708': {
                  chainId: '0xe708',
                  name: 'Linea Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0x2105': {
                  chainId: '0x2105',
                  name: 'Base Mainnet',
                  nativeCurrency: 'ETH',
                },
              },
              networksMetadata: {},
            };
          }
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
      await controller.init();

      // Should still enable popular networks from NetworkController
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x2105')).toBe(true);
    });

    it('creates namespace buckets for all configured networks', async () => {
      const { controller, messenger } = setupController();

      jest
        .spyOn(messenger, 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': {
                  chainId: '0x1',
                  name: 'Ethereum',
                  nativeCurrency: 'ETH',
                },
                '0x89': {
                  chainId: '0x89',
                  name: 'Polygon',
                  nativeCurrency: 'MATIC',
                },
              },
              networksMetadata: {},
            };
          }
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana',
                  nativeCurrency: 'SOL',
                },
                'bip122:000000000019d6689c085ae165831e93': {
                  chainId: 'bip122:000000000019d6689c085ae165831e93',
                  name: 'Bitcoin',
                  nativeCurrency: 'BTC',
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

      await controller.init();

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

    it('creates new namespace buckets for networks that do not exist', async () => {
      const { controller, messenger } = setupController();

      // Start with empty state to test namespace bucket creation
      // eslint-disable-next-line dot-notation
      controller['update']((state) => {
        state.enabledNetworkMap = {};
      });

      jest
        .spyOn(messenger, 'call')
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

      await controller.init();

      // Should have created namespace buckets for both EIP-155 and Cosmos
      expect(controller.state.enabledNetworkMap).toHaveProperty(
        KnownCaipNamespace.Eip155,
      );
      expect(controller.state.enabledNetworkMap).toHaveProperty('cosmos');
    });

    it('sets Bitcoin testnet to false when it exists in MultichainNetworkController configurations', async () => {
      const { controller, messenger } = setupController();

      // Mock MultichainNetworkController to include Bitcoin testnet BEFORE calling init
      jest
        .spyOn(messenger, 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': {
                  chainId: '0x1',
                  name: 'Ethereum Mainnet',
                  nativeCurrency: 'ETH',
                },
              },
              networksMetadata: {},
            };
          }
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
      await controller.init();

      // Verify Bitcoin testnet is set to false by init() - line 378
      expect(controller.isNetworkEnabled(BtcScope.Testnet)).toBe(false);
      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Bip122][
          BtcScope.Testnet
        ],
      ).toBe(false);
    });

    it('sets Bitcoin signet to false when it exists in MultichainNetworkController configurations', async () => {
      const { controller, messenger } = setupController();

      // Mock MultichainNetworkController to include Bitcoin signet BEFORE calling init
      jest
        .spyOn(messenger, 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': {
                  chainId: '0x1',
                  name: 'Ethereum Mainnet',
                  nativeCurrency: 'ETH',
                },
              },
              networksMetadata: {},
            };
          }
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                [BtcScope.Mainnet]: {
                  chainId: BtcScope.Mainnet,
                  name: 'Bitcoin Mainnet',
                  nativeCurrency: 'BTC',
                },
                [BtcScope.Signet]: {
                  chainId: BtcScope.Signet,
                  name: 'Bitcoin Signet',
                  nativeCurrency: 'BTC',
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
      await controller.init();

      // Verify Bitcoin signet is set to false by init() - line 391
      expect(controller.isNetworkEnabled(BtcScope.Signet)).toBe(false);
      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Bip122][
          BtcScope.Signet
        ],
      ).toBe(false);
    });

    it('skips networks that already have nativeAssetIdentifiers in state', async () => {
      // Create controller with existing nativeAssetIdentifiers
      const { controller, messenger } = setupController({
        config: {
          state: {
            enabledNetworkMap: {
              [KnownCaipNamespace.Eip155]: {},
            },
            nativeAssetIdentifiers: {
              // Pre-existing nativeAssetIdentifier with custom value
              'eip155:1': 'eip155:1/slip44:999' as const,
            },
          },
        },
      });

      jest
        .spyOn(messenger, 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': {
                  chainId: '0x1',
                  name: 'Ethereum Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0x38': {
                  chainId: '0x38',
                  name: 'BNB Chain',
                  nativeCurrency: 'BNB',
                },
              },
              networksMetadata: {},
            };
          }
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

      await controller.init();

      // Existing nativeAssetIdentifier should be preserved (not overwritten)
      expect(controller.state.nativeAssetIdentifiers['eip155:1']).toBe(
        'eip155:1/slip44:999',
      );

      // New network should be added
      expect(controller.state.nativeAssetIdentifiers['eip155:56']).toBe(
        'eip155:56/slip44:714',
      );
    });

    it('defaults to slip44:60 for EVM networks with unknown chainId and symbol', async () => {
      const { controller, messenger } = setupController();

      jest
        .spyOn(messenger, 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                // Use an unknown chainId (99999 = 0x1869F) and unknown symbol
                '0x1869f': {
                  chainId: '0x1869f',
                  name: 'Unknown Network',
                  nativeCurrency: 'UNKNOWN_SYMBOL_XYZ',
                },
              },
              networksMetadata: {},
            };
          }
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

      await controller.init();

      // Should default to slip44:60 when no mapping is found
      expect(controller.state.nativeAssetIdentifiers['eip155:99999']).toBe(
        'eip155:99999/slip44:60',
      );
    });
  });

  describe('initNativeAssetIdentifiers', () => {
    it('populates nativeAssetIdentifiers from network configurations', async () => {
      const { controller } = setupController();

      const networks = [
        { chainId: 'eip155:1' as const, nativeCurrency: 'ETH' },
        { chainId: 'eip155:56' as const, nativeCurrency: 'BNB' },
        {
          chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const,
          nativeCurrency: 'SOL',
        },
      ];

      await controller.initNativeAssetIdentifiers(networks);

      expect(controller.state.nativeAssetIdentifiers).toStrictEqual({
        'eip155:1': 'eip155:1/slip44:60',
        'eip155:56': 'eip155:56/slip44:714',
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp':
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      });
    });

    it('defaults to slip44:60 for EVM networks with unknown symbols', async () => {
      const { controller } = setupController();

      const networks = [
        { chainId: 'eip155:1' as const, nativeCurrency: 'ETH' },
        { chainId: 'eip155:999' as const, nativeCurrency: 'UNKNOWN_XYZ' },
      ];

      await controller.initNativeAssetIdentifiers(networks);

      expect(controller.state.nativeAssetIdentifiers['eip155:1']).toBe(
        'eip155:1/slip44:60',
      );
      // EVM networks default to slip44:60 (Ethereum) when no specific mapping is found
      expect(controller.state.nativeAssetIdentifiers['eip155:999']).toBe(
        'eip155:999/slip44:60',
      );
    });

    it('does not modify state for empty input', async () => {
      const { controller } = setupController();

      await controller.initNativeAssetIdentifiers([]);

      expect(controller.state.nativeAssetIdentifiers).toStrictEqual({});
    });

    it('handles CAIP-19 format nativeCurrency from MultichainNetworkController', async () => {
      const { controller } = setupController();

      // Non-EVM networks from MultichainNetworkController use CAIP-19 format for nativeCurrency
      const networks = [
        // EVM networks use simple symbols
        { chainId: 'eip155:1' as const, nativeCurrency: 'ETH' },
        // Non-EVM networks use full CAIP-19 format
        {
          chainId: 'bip122:000000000019d6689c085ae165831e93' as const,
          nativeCurrency: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
        },
        {
          chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const,
          nativeCurrency: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
        },
        {
          chainId: 'tron:728126428' as const,
          nativeCurrency: 'tron:728126428/slip44:195',
        },
      ];

      await controller.initNativeAssetIdentifiers(networks);

      expect(controller.state.nativeAssetIdentifiers).toStrictEqual({
        'eip155:1': 'eip155:1/slip44:60',
        'bip122:000000000019d6689c085ae165831e93':
          'bip122:000000000019d6689c085ae165831e93/slip44:0',
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp':
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
        'tron:728126428': 'tron:728126428/slip44:195',
      });
    });
  });

  describe('enableAllPopularNetworks', () => {
    it('enables all popular networks that exist in controller configurations and Solana mainnet', () => {
      const { controller, messenger } = setupController();

      // Mock the network configurations
      jest
        .spyOn(messenger, 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': {
                  chainId: '0x1',
                  name: 'Ethereum Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0xe708': {
                  chainId: '0xe708',
                  name: 'Linea Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0x2105': {
                  chainId: '0x2105',
                  name: 'Base Mainnet',
                  nativeCurrency: 'ETH',
                },
              },
              networksMetadata: {},
            };
          }
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana Mainnet',
                  nativeCurrency: 'SOL',
                },
                [BtcScope.Mainnet]: {
                  chainId: BtcScope.Mainnet,
                  name: 'Bitcoin Mainnet',
                },
                [TrxScope.Mainnet]: {
                  chainId: TrxScope.Mainnet,
                  name: 'Tron Mainnet',
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
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: true,
            [ChainId[BuiltInNetworkName.BscMainnet]]: true,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: true,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: true,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: true,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: true,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: getDefaultNativeAssetIdentifiers(),
      });

      // Enable all popular networks
      controller.enableAllPopularNetworks();

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': true, // Ethereum Mainnet
            '0xe708': true, // Linea Mainnet
            '0x2105': true, // Base Mainnet
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: false, // Not in mocked config
            [ChainId[BuiltInNetworkName.BscMainnet]]: false, // Not in mocked config
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: false, // Not in mocked config
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: false, // Not in mocked config
            [ChainId[BuiltInNetworkName.SeiMainnet]]: false, // Not in mocked config
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: true,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: getDefaultNativeAssetIdentifiers(),
      });
    });

    it('enables all popular networks from constants', () => {
      const { controller, messenger } = setupController();

      // Mock all popular networks to be available in configurations
      jest.spyOn(messenger, 'call').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (actionType: string, ..._args: any[]): any => {
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
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana Mainnet',
                  nativeCurrency: 'SOL',
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: false,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: getDefaultNativeAssetIdentifiers(),
      });
    });

    it('disables existing networks and enables only popular networks (exclusive behavior)', async () => {
      const { controller, rootMessenger, messenger } = setupController();

      // Mock the network configurations to include popular networks
      jest
        .spyOn(messenger, 'call')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation((actionType: string, ..._args: any[]): any => {
          if (actionType === 'NetworkController:getState') {
            return {
              selectedNetworkClientId: 'mainnet',
              networkConfigurationsByChainId: {
                '0x1': {
                  chainId: '0x1',
                  name: 'Ethereum Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0xe708': {
                  chainId: '0xe708',
                  name: 'Linea Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0x2105': {
                  chainId: '0x2105',
                  name: 'Base Mainnet',
                  nativeCurrency: 'ETH',
                },
                '0x2': { chainId: '0x2', name: 'Test Network' }, // Non-popular network
              },
              networksMetadata: {},
            };
          }
          if (actionType === 'MultichainNetworkController:getState') {
            return {
              multichainNetworkConfigurationsByChainId: {
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
                  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
                  name: 'Solana Mainnet',
                  nativeCurrency: 'SOL',
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
      rootMessenger.publish('NetworkController:networkAdded', {
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

      await jestAdvanceTime({ duration: 1 });

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
      const { controller, messenger } = setupController();

      // Mock the network configurations to include Bitcoin
      jest
        .spyOn(messenger, 'call')
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
      const { controller } = setupController();

      // Disable a popular network (Ethereum Mainnet)
      controller.disableNetwork('0x1');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': false, // Ethereum Mainnet (disabled)
            '0xe708': true, // Linea Mainnet
            '0x2105': true, // Base Mainnet
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: true,
            [ChainId[BuiltInNetworkName.BscMainnet]]: true,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: true,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: true,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: true,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: true,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: getDefaultNativeAssetIdentifiers(),
      });

      // Enable the network again - this should disable all others in all namespaces
      controller.enableNetwork('0x1');

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: true, // Ethereum Mainnet (re-enabled)
            [ChainId[BuiltInNetworkName.LineaMainnet]]: false, // Linea Mainnet (disabled)
            [ChainId[BuiltInNetworkName.BaseMainnet]]: false, // Base Mainnet (disabled)
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: false,
            [ChainId[BuiltInNetworkName.BscMainnet]]: false,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: false,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: false,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: false,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: false,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: getDefaultNativeAssetIdentifiers(),
      });
    });

    it('enables any network and clears all others (exclusive behavior)', async () => {
      const { controller, rootMessenger } = setupController();

      // Add a non-popular network
      rootMessenger.publish('NetworkController:networkAdded', {
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

      await jestAdvanceTime({ duration: 1 });

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': false,
            '0xe708': false,
            '0x2105': false,
            '0x2': true,
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: false,
            [ChainId[BuiltInNetworkName.BscMainnet]]: false,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: false,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: false,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: false,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: false,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: {
          ...getDefaultNativeAssetIdentifiers(),
          'eip155:2': 'eip155:2/slip44:60', // Defaults to 60 as chainId 2 is not in chainid.network
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
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: false,
            [ChainId[BuiltInNetworkName.BscMainnet]]: false,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: false,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: false,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: false,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: false,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: {
          ...getDefaultNativeAssetIdentifiers(),
          'eip155:2': 'eip155:2/slip44:60', // Defaults to 60 as chainId 2 is not in chainid.network
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
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: false,
            [ChainId[BuiltInNetworkName.BscMainnet]]: false,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: false,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: false,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: false,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: false,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: {
          ...getDefaultNativeAssetIdentifiers(),
          'eip155:2': 'eip155:2/slip44:60', // Defaults to 60 as chainId 2 is not in chainid.network
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
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: false,
            [ChainId[BuiltInNetworkName.BscMainnet]]: false,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: false,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: false,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: false,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: false,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: getDefaultNativeAssetIdentifiers(),
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
      // slip44Map is not affected by enabledNetworkMap changes, so it still contains all the original entries
      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: false,
            [ChainId[BuiltInNetworkName.LineaMainnet]]: false,
            [ChainId[BuiltInNetworkName.BaseMainnet]]: false,
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: false,
            [ChainId[BuiltInNetworkName.BscMainnet]]: false,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: false,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: false,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: false,
          },
          [KnownCaipNamespace.Solana]: {
            [SolScope.Mainnet]: false,
            [SolScope.Testnet]: false,
            [SolScope.Devnet]: false,
          },
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: false,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: getDefaultNativeAssetIdentifiers(),
      });
    });

    it('handle no namespace bucket', async () => {
      const { controller, rootMessenger } = setupController();

      // add new network with no namespace bucket
      rootMessenger.publish('NetworkController:networkAdded', {
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

      await jestAdvanceTime({ duration: 1 });

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            [ChainId[BuiltInNetworkName.Mainnet]]: false, // Disabled due to cross-namespace behavior
            [ChainId[BuiltInNetworkName.LineaMainnet]]: false, // Disabled due to cross-namespace behavior
            [ChainId[BuiltInNetworkName.BaseMainnet]]: false, // Disabled due to cross-namespace behavior
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: false,
            [ChainId[BuiltInNetworkName.BscMainnet]]: false,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: false,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: false,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: false,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: false,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: {
          ...getDefaultNativeAssetIdentifiers(),
          // Note: This is testing invalid input (non-EVM chainId to EVM event handler)
          // getEvmSlip44 defaults to 60 for unknown chainIds
          'bip122:000000000019d6689c085ae165831e93':
            'bip122:000000000019d6689c085ae165831e93/slip44:60',
        },
      });
    });
  });

  describe('disableNetwork', () => {
    it('disables an EVM network using hex chain ID', () => {
      const { controller } = setupController();

      // Disable a network (but not the last one)
      controller.disableNetwork('0xe708'); // Linea Mainnet

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
            '0xe708': false,
            '0x2105': true,
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: true,
            [ChainId[BuiltInNetworkName.BscMainnet]]: true,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: true,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: true,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: true,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: true,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: getDefaultNativeAssetIdentifiers(),
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
      const { controller } = setupController();

      // disable all networks except one
      controller.disableNetwork('0xe708'); // Linea Mainnet
      controller.disableNetwork('0x2105'); // Base Mainnet

      expect(controller.state).toStrictEqual({
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
            '0xe708': false,
            '0x2105': false,
            [ChainId[BuiltInNetworkName.ArbitrumOne]]: true,
            [ChainId[BuiltInNetworkName.BscMainnet]]: true,
            [ChainId[BuiltInNetworkName.OptimismMainnet]]: true,
            [ChainId[BuiltInNetworkName.PolygonMainnet]]: true,
            [ChainId[BuiltInNetworkName.SeiMainnet]]: true,
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
          [KnownCaipNamespace.Tron]: {
            [TrxScope.Mainnet]: true,
            [TrxScope.Nile]: false,
            [TrxScope.Shasta]: false,
          },
        },
        nativeAssetIdentifiers: getDefaultNativeAssetIdentifiers(),
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
      const { controller } = setupController();

      // Test default enabled networks
      expect(controller.isNetworkEnabled('0x1')).toBe(true); // Ethereum Mainnet
      expect(controller.isNetworkEnabled('0xe708')).toBe(true); // Linea Mainnet
      expect(controller.isNetworkEnabled('0x2105')).toBe(true); // Base Mainnet
    });

    it('returns false for disabled networks using hex chain ID', () => {
      const { controller } = setupController();

      // Disable a network and test
      controller.disableNetwork('0xe708'); // Linea Mainnet (not the last one)
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);

      // Test networks that were never enabled
      expect(controller.isNetworkEnabled('0xa86a')).toBe(false); // Avalanche (not in default state)
      expect(controller.isNetworkEnabled('0x999')).toBe(false); // Non-existent network
    });

    it('returns true for enabled networks using CAIP chain ID', () => {
      const { controller } = setupController();

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
      const { controller } = setupController();

      // Disable a network using hex and test with CAIP
      controller.disableNetwork('0xe708'); // Linea Mainnet (not the last one)
      expect(controller.isNetworkEnabled('eip155:59144')).toBe(false);

      // Test networks that were never enabled
      expect(controller.isNetworkEnabled('eip155:43114')).toBe(false); // Avalanche (not in default state)
      expect(controller.isNetworkEnabled('eip155:999')).toBe(false); // Non-existent network
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
      const { controller } = setupController();

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
      const { controller } = setupController();

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
      const { controller, rootMessenger } = setupController();

      // Initially, Avalanche network should not be enabled (doesn't exist)
      expect(controller.isNetworkEnabled('0xa86a')).toBe(false);

      // Add Avalanche network (popular network in popular mode)
      // Should keep current selection (add but don't enable)
      rootMessenger.publish('NetworkController:networkAdded', {
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

      await jestAdvanceTime({ duration: 1 });

      // Now it should be added but not enabled (keeps current selection in popular mode)
      expect(controller.isNetworkEnabled('0xa86a')).toBe(true);
      expect(controller.isNetworkEnabled('eip155:43114')).toBe(true);
    });

    it('handles disabling networks across different namespaces independently, but adding networks has exclusive behavior', async () => {
      const { controller, rootMessenger } = setupController();

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
      rootMessenger.publish('NetworkController:networkAdded', {
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

      await jestAdvanceTime({ duration: 1 });

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
      const { controller, rootMessenger } = setupController();

      // Add Bitcoin testnet dynamically
      rootMessenger.publish('NetworkController:networkAdded', {
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

      await jestAdvanceTime({ duration: 1 });

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

  describe('Tron Support', () => {
    it('initializes with only Tron mainnet enabled by default', () => {
      const { controller } = setupController();

      // Only Tron mainnet should be enabled by default
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(false);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(false);

      expect(
        controller.state.enabledNetworkMap[KnownCaipNamespace.Tron],
      ).toStrictEqual({
        [TrxScope.Mainnet]: true,
        [TrxScope.Nile]: false,
        [TrxScope.Shasta]: false,
      });
    });

    it('enables and disables Tron networks using CAIP chain IDs with exclusive behavior', () => {
      const { controller } = setupController();

      // Initially only Tron mainnet is enabled
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(false);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(false);

      // Enable Tron Nile (should disable all others in all namespaces due to exclusive behavior)
      controller.enableNetwork(TrxScope.Nile);
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(false);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(false);
      // Check that EVM, Solana, and Bitcoin networks are also disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);

      // Enable Tron Shasta (should disable Nile and all other networks)
      controller.enableNetwork(TrxScope.Shasta);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(false);
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(false);
      // EVM, Solana, and Bitcoin networks should remain disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);

      // Re-enable mainnet (should disable Shasta and all other networks)
      controller.enableNetwork(TrxScope.Mainnet);
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(false);
      // EVM, Solana, and Bitcoin networks should remain disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);
    });

    it('allows disabling Tron networks when multiple are enabled', () => {
      const { controller } = setupController();

      // Initially only Tron mainnet is enabled
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(false);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(false);

      // Enable Nile (this will disable mainnet and all other networks due to exclusive behavior)
      controller.enableNetwork(TrxScope.Nile);
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(false);
      // EVM, Solana, and Bitcoin networks should also be disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);

      // Now enable mainnet again (this will disable Nile and all other networks)
      controller.enableNetwork(TrxScope.Mainnet);
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(false);
      // EVM, Solana, and Bitcoin networks should remain disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);

      // Enable Shasta (this will disable mainnet and all other networks)
      controller.enableNetwork(TrxScope.Shasta);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(false);
      // EVM, Solana, and Bitcoin networks should remain disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);
    });

    it('prevents disabling the last remaining Tron network', () => {
      const { controller } = setupController();

      // Only Tron mainnet is enabled by default
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(false);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(false);

      // Should not be able to disable the last remaining Tron network
      expect(() => controller.disableNetwork(TrxScope.Mainnet)).not.toThrow();
    });

    it('allows disabling the last Tron network', () => {
      const { controller } = setupController();

      // Only Tron mainnet is enabled by default in the Tron namespace
      expect(() => controller.disableNetwork(TrxScope.Mainnet)).not.toThrow();
    });

    it('handles all Tron testnet variants', () => {
      const { controller } = setupController();

      // Test each Tron testnet variant
      const testnets = [
        { scope: TrxScope.Nile, name: 'Nile' },
        { scope: TrxScope.Shasta, name: 'Shasta' },
      ];

      testnets.forEach(({ scope }) => {
        // Enable the testnet (should disable all others in all namespaces due to exclusive behavior)
        controller.enableNetwork(scope);
        expect(controller.isNetworkEnabled(scope)).toBe(true);
        expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(false);

        // Check that EVM, Solana, and Bitcoin networks are also disabled
        expect(controller.isNetworkEnabled('0x1')).toBe(false);
        expect(controller.isNetworkEnabled('0xe708')).toBe(false);
        expect(controller.isNetworkEnabled('0x2105')).toBe(false);
        expect(
          controller.isNetworkEnabled(
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          ),
        ).toBe(false);
        expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);

        // Verify other testnets are also disabled
        testnets.forEach(({ scope: otherScope }) => {
          expect(controller.isNetworkEnabled(otherScope)).toBe(
            otherScope === scope,
          );
        });
      });
    });

    it('handles Tron network addition dynamically', async () => {
      const { controller, rootMessenger } = setupController();

      // Add Tron Nile dynamically
      rootMessenger.publish('NetworkController:networkAdded', {
        // @ts-expect-error Testing with Tron network
        chainId: TrxScope.Nile,
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        name: 'Tron Nile',
        nativeCurrency: 'TRX',
        rpcEndpoints: [
          {
            url: 'https://nile.trongrid.io',
            networkClientId: 'trx-nile',
            type: RpcEndpointType.Custom,
          },
        ],
      });

      await jestAdvanceTime({ duration: 1 });

      // Tron Nile should be enabled, others should be disabled (exclusive behavior across all namespaces)
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(false);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(false);
      // EVM, Solana, and Bitcoin networks should also be disabled
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);
      expect(
        controller.isNetworkEnabled('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBe(false);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(false);
    });

    it('maintains Tron network state independently when disabling networks from other namespaces', () => {
      const { controller } = setupController();

      // Disable EVM networks (disableNetwork should not affect other namespaces)
      controller.disableNetwork('0x1');
      controller.disableNetwork('0xe708');

      // Tron mainnet should still be enabled, testnets remain disabled
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(false);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(false);

      // Disable Solana network - this should not affect Tron networks
      expect(() =>
        controller.disableNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).not.toThrow();

      // Tron mainnet should still be enabled, testnets remain disabled
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(false);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(false);
    });

    it('validates Tron network chain IDs are correct', () => {
      const { controller } = setupController();

      // Test that Tron networks have the correct chain IDs and default states
      expect(controller.isNetworkEnabled('tron:728126428')).toBe(true); // Mainnet (enabled by default)
      expect(controller.isNetworkEnabled('tron:3448148188')).toBe(false); // Nile (disabled by default)
      expect(controller.isNetworkEnabled('tron:2494104990')).toBe(false); // Shasta (disabled by default)
    });

    it('enables a Tron network in the Tron namespace', () => {
      const { controller } = setupController();

      // Enable Tron Nile in the Tron namespace
      controller.enableNetworkInNamespace(
        TrxScope.Nile,
        KnownCaipNamespace.Tron,
      );

      // Only Tron Nile should be enabled in Tron namespace
      expect(controller.isNetworkEnabled(TrxScope.Nile)).toBe(true);
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(false);
      expect(controller.isNetworkEnabled(TrxScope.Shasta)).toBe(false);

      // Other namespaces should remain unchanged
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x2105')).toBe(true);
      expect(controller.isNetworkEnabled(SolScope.Mainnet)).toBe(true);
      expect(controller.isNetworkEnabled(BtcScope.Mainnet)).toBe(true);
    });

    it('throws error when Tron chainId namespace does not match provided namespace', () => {
      const { controller } = setupController();

      // Try to enable Tron network in Solana namespace
      expect(() => {
        controller.enableNetworkInNamespace(
          TrxScope.Mainnet,
          KnownCaipNamespace.Solana,
        );
      }).toThrow(
        `Chain ID ${TrxScope.Mainnet} belongs to namespace tron, but namespace solana was specified`,
      );

      // Try to enable Ethereum network in Tron namespace
      expect(() => {
        controller.enableNetworkInNamespace('0x1', KnownCaipNamespace.Tron);
      }).toThrow(
        'Chain ID 0x1 belongs to namespace eip155, but namespace tron was specified',
      );
    });
  });

  describe('enableNetworkInNamespace', () => {
    it('enables a network in the specified namespace and disables others in same namespace', () => {
      const { controller } = setupController();

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
      expect(controller.isNetworkEnabled(TrxScope.Mainnet)).toBe(true);
    });

    it('enables a network using CAIP chain ID in the specified namespace', () => {
      const { controller } = setupController();

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
      const { controller } = setupController();

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
      const { controller } = setupController();

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
      const { controller } = setupController();

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
      const { controller } = setupController();

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
      const { controller } = setupController();

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
      const { controller } = setupController();

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

      const derivedState = deriveStateFromMetadata(
        controller.state,
        controller.metadata,
        'includeInDebugSnapshot',
      );

      expect(derivedState).toHaveProperty('enabledNetworkMap');
      expect(derivedState).toHaveProperty('nativeAssetIdentifiers');
    });

    it('includes expected state in state logs', () => {
      const { controller } = setupController();

      const derivedState = deriveStateFromMetadata(
        controller.state,
        controller.metadata,
        'includeInStateLogs',
      );

      expect(derivedState).toHaveProperty('enabledNetworkMap');
      expect(derivedState).toHaveProperty('nativeAssetIdentifiers');
    });

    it('persists expected state', () => {
      const { controller } = setupController();

      const derivedState = deriveStateFromMetadata(
        controller.state,
        controller.metadata,
        'persist',
      );

      expect(derivedState).toHaveProperty('enabledNetworkMap');
      expect(derivedState).toHaveProperty('nativeAssetIdentifiers');
    });

    it('exposes expected state to UI', () => {
      const { controller } = setupController();

      const derivedState = deriveStateFromMetadata(
        controller.state,
        controller.metadata,
        'usedInUi',
      );

      expect(derivedState).toHaveProperty('enabledNetworkMap');
      expect(derivedState).toHaveProperty('nativeAssetIdentifiers');
    });
  });

  describe('new onAddNetwork behavior', () => {
    it('switches to newly added popular network when NOT in popular networks mode', async () => {
      const { controller, rootMessenger } = setupController();

      // Start with only 1 popular network enabled (not in popular networks mode)
      controller.disableNetwork('0xe708'); // Disable Linea
      controller.disableNetwork('0x2105'); // Disable Base
      // Now only Ethereum is enabled (1 popular network < 3 threshold)

      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);

      // Add Avalanche (popular network) when NOT in popular networks mode
      rootMessenger.publish('NetworkController:networkAdded', {
        chainId: '0xa86a', // Avalanche - popular network
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

      await jestAdvanceTime({ duration: 1 });

      // Should switch to Avalanche (disable all others, enable Avalanche)
      expect(controller.isNetworkEnabled('0xa86a')).toBe(true);
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);
    });

    it('switches to newly added non-popular network even when in popular networks mode', async () => {
      const { controller, rootMessenger } = setupController();

      // Default state has 3 popular networks enabled (in popular networks mode)
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x2105')).toBe(true);

      // Add a non-popular network when in popular networks mode
      rootMessenger.publish('NetworkController:networkAdded', {
        chainId: '0x999', // Non-popular network
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        name: 'Custom Network',
        nativeCurrency: 'CUSTOM',
        rpcEndpoints: [
          {
            url: 'https://custom.network/rpc',
            networkClientId: 'id',
            type: RpcEndpointType.Custom,
          },
        ],
      });

      await jestAdvanceTime({ duration: 1 });

      // Should switch to the non-popular network (disable all others, enable new one)
      expect(controller.isNetworkEnabled('0x999')).toBe(true);
      expect(controller.isNetworkEnabled('0x1')).toBe(false);
      expect(controller.isNetworkEnabled('0xe708')).toBe(false);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);
    });

    it('keeps current selection when adding popular network in popular networks mode', async () => {
      const { controller, rootMessenger } = setupController();

      // Default state has 3 popular networks enabled (in popular networks mode)
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x2105')).toBe(true);

      // Add another popular network when in popular networks mode
      rootMessenger.publish('NetworkController:networkAdded', {
        chainId: '0x89', // Polygon - popular network
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

      await jestAdvanceTime({ duration: 1 });

      // Should keep current selection (add Polygon but don't enable it)
      expect(controller.isNetworkEnabled('0x89')).toBe(true); // Polygon enabled
      expect(controller.isNetworkEnabled('0x1')).toBe(true); // Ethereum still enabled
      expect(controller.isNetworkEnabled('0xe708')).toBe(true); // Linea still enabled
      expect(controller.isNetworkEnabled('0x2105')).toBe(true); // Base still enabled
    });

    it('handles edge case: exactly 2 popular networks enabled (not in popular mode)', async () => {
      const { controller, rootMessenger } = setupController();

      // Start with exactly 2 popular networks enabled (not >2, so not in popular mode)
      controller.disableNetwork('0x2105'); // Disable Base, keep only Ethereum and Linea
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);

      // Add another popular network when NOT in popular networks mode (exactly 2 enabled)
      rootMessenger.publish('NetworkController:networkAdded', {
        chainId: '0xa86a', // Avalanche - popular network
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

      await jestAdvanceTime({ duration: 1 });

      // Should switch to Avalanche since we're not in popular networks mode (2 ≤ 2, not >2)
      expect(controller.isNetworkEnabled('0xa86a')).toBe(true);
      expect(controller.isNetworkEnabled('0x1')).toBe(true);
      expect(controller.isNetworkEnabled('0xe708')).toBe(true);
      expect(controller.isNetworkEnabled('0x2105')).toBe(false);
    });
  });
});
