import { deriveStateFromMetadata } from '@metamask/base-controller';
import {
  NetworkType,
  convertHexToDecimal,
  ChainId,
} from '@metamask/controller-utils';
import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';
import {
  NetworkStatus,
  RpcEndpointType,
  type NetworkState,
} from '@metamask/network-controller';
import type {
  TransactionControllerGetNonceLockAction,
  TransactionControllerGetTransactionsAction,
  TransactionControllerUpdateTransactionAction,
} from '@metamask/transaction-controller';
import {
  type TransactionParams,
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import nock from 'nock';
import * as sinon from 'sinon';

import packageJson from '../package.json';
import { advanceTime, flushPromises, getFakeProvider } from '../tests/helpers';
import {
  API_BASE_URL,
  SENTINEL_API_BASE_URL_MAP,
  SmartTransactionsTraceName,
} from './constants';
import {
  DEFAULT_INTERVAL,
  SmartTransactionsController,
  getDefaultSmartTransactionsControllerState,
  type SmartTransactionsControllerMessenger,
} from './SmartTransactionsController';
import type { SmartTransaction, UnsignedTransaction } from './types';
import { SmartTransactionStatuses, ClientId } from './types';
import * as utils from './utils';

type AllActions = MessengerActions<SmartTransactionsControllerMessenger>;

type AllEvents = MessengerEvents<SmartTransactionsControllerMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

jest.mock('@metamask/eth-query', () => {
  const EthQuery = jest.requireActual('@metamask/eth-query');
  return class FakeEthQuery extends EthQuery {
    sendAsync = jest.fn(({ method, params }, callback) => {
      switch (method) {
        case 'eth_getBalance': {
          callback(null, '0x1000');
          break;
        }

        case 'eth_getTransactionReceipt': {
          // Return null if txHash is empty/falsy
          const txHash = params?.[0];
          if (txHash) {
            callback(null, { blockNumber: '123' });
          } else {
            callback(null, null);
          }
          break;
        }

        case 'eth_getBlockByNumber': {
          callback(null, { baseFeePerGas: '0x123' });
          break;
        }

        case 'eth_getTransactionByHash': {
          callback(null, {
            maxFeePerGas: '0x123',
            maxPriorityFeePerGas: '0x123',
          });
          break;
        }

        default: {
          throw new Error('Invalid method');
        }
      }
    });
  };
});

const addressFrom = '0x268392a24B6b093127E8581eAfbD1DA228bAdAe3';
const txHash =
  '0x0302b75dfb9fd9eb34056af031efcaee2a8cbd799ea054a85966165cd82a7356';

const createUnsignedTransaction = (chainId: number) => {
  return {
    from: addressFrom,
    to: '0x0000000000000000000000000000000000000000',
    value: 0,
    data: '0x',
    nonce: 1,
    type: 2,
    chainId,
  };
};

const createGetFeesApiResponse = () => {
  return {
    txs: [
      {
        // Approval tx.
        cancelFees: [
          { maxFeePerGas: 2100001000, maxPriorityFeePerGas: 466503987 },
          { maxFeePerGas: 2310003200, maxPriorityFeePerGas: 513154852 },
          { maxFeePerGas: 2541005830, maxPriorityFeePerGas: 564470851 },
          { maxFeePerGas: 2795108954, maxPriorityFeePerGas: 620918500 },
          { maxFeePerGas: 3074622644, maxPriorityFeePerGas: 683010971 },
          { maxFeePerGas: 3382087983, maxPriorityFeePerGas: 751312751 },
          { maxFeePerGas: 3720300164, maxPriorityFeePerGas: 826444778 },
          { maxFeePerGas: 4092333900, maxPriorityFeePerGas: 909090082 },
          { maxFeePerGas: 4501571383, maxPriorityFeePerGas: 1000000000 },
          { maxFeePerGas: 4951733023, maxPriorityFeePerGas: 1100001000 },
          { maxFeePerGas: 5446911277, maxPriorityFeePerGas: 1210002200 },
          { maxFeePerGas: 5991607851, maxPriorityFeePerGas: 1331003630 },
          { maxFeePerGas: 6590774628, maxPriorityFeePerGas: 1464105324 },
          { maxFeePerGas: 7249858682, maxPriorityFeePerGas: 1610517320 },
          { maxFeePerGas: 7974851800, maxPriorityFeePerGas: 1771570663 },
          { maxFeePerGas: 8772344955, maxPriorityFeePerGas: 1948729500 },
          { maxFeePerGas: 9649588222, maxPriorityFeePerGas: 2143604399 },
          { maxFeePerGas: 10614556694, maxPriorityFeePerGas: 2357966983 },
          { maxFeePerGas: 11676022978, maxPriorityFeePerGas: 2593766039 },
        ],
        feeEstimate: 42000000000000,
        fees: [
          { maxFeePerGas: 2310003200, maxPriorityFeePerGas: 513154852 },
          { maxFeePerGas: 2541005830, maxPriorityFeePerGas: 564470850 },
          { maxFeePerGas: 2795108954, maxPriorityFeePerGas: 620918500 },
          { maxFeePerGas: 3074622644, maxPriorityFeePerGas: 683010970 },
          { maxFeePerGas: 3382087983, maxPriorityFeePerGas: 751312751 },
          { maxFeePerGas: 3720300163, maxPriorityFeePerGas: 826444777 },
          { maxFeePerGas: 4092333900, maxPriorityFeePerGas: 909090082 },
          { maxFeePerGas: 4501571382, maxPriorityFeePerGas: 999999999 },
          { maxFeePerGas: 4951733022, maxPriorityFeePerGas: 1100001000 },
          { maxFeePerGas: 5446911277, maxPriorityFeePerGas: 1210002200 },
          { maxFeePerGas: 5991607851, maxPriorityFeePerGas: 1331003630 },
          { maxFeePerGas: 6590774627, maxPriorityFeePerGas: 1464105324 },
          { maxFeePerGas: 7249858681, maxPriorityFeePerGas: 1610517320 },
          { maxFeePerGas: 7974851800, maxPriorityFeePerGas: 1771570662 },
          { maxFeePerGas: 8772344954, maxPriorityFeePerGas: 1948729500 },
          { maxFeePerGas: 9649588222, maxPriorityFeePerGas: 2143604398 },
          { maxFeePerGas: 10614556693, maxPriorityFeePerGas: 2357966982 },
          { maxFeePerGas: 11676022977, maxPriorityFeePerGas: 2593766039 },
          { maxFeePerGas: 12843636951, maxPriorityFeePerGas: 2853145236 },
        ],
        gasLimit: 21000,
        gasUsed: 21000,
      },
      {
        // Trade tx.
        cancelFees: [
          { maxFeePerGas: 2100001000, maxPriorityFeePerGas: 466503987 },
          { maxFeePerGas: 2310003200, maxPriorityFeePerGas: 513154852 },
          { maxFeePerGas: 2541005830, maxPriorityFeePerGas: 564470851 },
          { maxFeePerGas: 2795108954, maxPriorityFeePerGas: 620918500 },
          { maxFeePerGas: 3074622644, maxPriorityFeePerGas: 683010971 },
          { maxFeePerGas: 3382087983, maxPriorityFeePerGas: 751312751 },
          { maxFeePerGas: 3720300164, maxPriorityFeePerGas: 826444778 },
          { maxFeePerGas: 4092333900, maxPriorityFeePerGas: 909090082 },
          { maxFeePerGas: 4501571383, maxPriorityFeePerGas: 1000000000 },
          { maxFeePerGas: 4951733023, maxPriorityFeePerGas: 1100001000 },
          { maxFeePerGas: 5446911277, maxPriorityFeePerGas: 1210002200 },
          { maxFeePerGas: 5991607851, maxPriorityFeePerGas: 1331003630 },
          { maxFeePerGas: 6590774628, maxPriorityFeePerGas: 1464105324 },
          { maxFeePerGas: 7249858682, maxPriorityFeePerGas: 1610517320 },
          { maxFeePerGas: 7974851800, maxPriorityFeePerGas: 1771570663 },
          { maxFeePerGas: 8772344955, maxPriorityFeePerGas: 1948729500 },
          { maxFeePerGas: 9649588222, maxPriorityFeePerGas: 2143604399 },
          { maxFeePerGas: 10614556694, maxPriorityFeePerGas: 2357966983 },
          { maxFeePerGas: 11676022978, maxPriorityFeePerGas: 2593766039 },
        ],
        feeEstimate: 42000000000000,
        fees: [
          { maxFeePerGas: 2310003200, maxPriorityFeePerGas: 513154852 },
          { maxFeePerGas: 2541005830, maxPriorityFeePerGas: 564470850 },
          { maxFeePerGas: 2795108954, maxPriorityFeePerGas: 620918500 },
          { maxFeePerGas: 3074622644, maxPriorityFeePerGas: 683010970 },
          { maxFeePerGas: 3382087983, maxPriorityFeePerGas: 751312751 },
          { maxFeePerGas: 3720300163, maxPriorityFeePerGas: 826444777 },
          { maxFeePerGas: 4092333900, maxPriorityFeePerGas: 909090082 },
          { maxFeePerGas: 4501571382, maxPriorityFeePerGas: 999999999 },
          { maxFeePerGas: 4951733022, maxPriorityFeePerGas: 1100001000 },
          { maxFeePerGas: 5446911277, maxPriorityFeePerGas: 1210002200 },
          { maxFeePerGas: 5991607851, maxPriorityFeePerGas: 1331003630 },
          { maxFeePerGas: 6590774627, maxPriorityFeePerGas: 1464105324 },
          { maxFeePerGas: 7249858681, maxPriorityFeePerGas: 1610517320 },
          { maxFeePerGas: 7974851800, maxPriorityFeePerGas: 1771570662 },
          { maxFeePerGas: 8772344954, maxPriorityFeePerGas: 1948729500 },
          { maxFeePerGas: 9649588222, maxPriorityFeePerGas: 2143604398 },
          { maxFeePerGas: 10614556693, maxPriorityFeePerGas: 2357966982 },
          { maxFeePerGas: 11676022977, maxPriorityFeePerGas: 2593766039 },
          { maxFeePerGas: 12843636951, maxPriorityFeePerGas: 2853145236 },
        ],
        gasLimit: 21000,
        gasUsed: 21000,
      },
    ],
  };
};

const createSubmitTransactionsApiResponse = () => {
  return { uuid: 'dP23W7c2kt4FK9TmXOkz1UM2F20' };
};

const createSignedTransaction = () => {
  return '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a02b79f322a625d623a2bb2911e0c6b3e7eaf741a7c7c5d2e8c67ef3ff4acf146ca01ae168fea63dc3391b75b586c8a7c0cb55cdf3b8e2e4d8e097957a3a56c6f2c5';
};

const createTxParams = (): TransactionParams => {
  return {
    from: addressFrom,
    to: '0x0000000000000000000000000000000000000000',
    value: '0',
    data: '0x',
    nonce: '0',
    type: '2',
    chainId: '0x4',
    maxFeePerGas: '2310003200',
    maxPriorityFeePerGas: '513154852',
  };
};

const createSignedCanceledTransaction = () => {
  return '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a02b79f322a625d623a2bb2911e0c6b3e7eaf741a7c7c5d2e8c67ef3ff4acf146ca01ae168fea63dc3391b75b586c8a7c0cb55cdf3b8e2e4d8e097957a3a56c6f2c5';
};

const createPendingBatchStatusApiResponse = () => ({
  uuid1: {
    cancellationFeeWei: 0,
    cancellationReason: 'not_cancelled',
    deadlineRatio: 0.0006295545895894369,
    minedTx: 'not_mined',
    minedHash: '',
  },
});

const createStateAfterPending = () => {
  return [
    {
      uuid: 'uuid1',
      status: 'pending',
      cancellable: true,
      statusMetadata: {
        cancellationFeeWei: 0,
        cancellationReason: 'not_cancelled',
        deadlineRatio: 0.0006295545895894369,
        minedTx: 'not_mined',
        minedHash: '',
      },
      accountHardwareType: 'Ledger Hardware',
      accountType: 'hardware',
      deviceModel: 'ledger',
    },
  ];
};

const createSuccessBatchStatusApiResponse = () => ({
  uuid2: {
    cancellationFeeWei: 36777567771000,
    cancellationReason: 'not_cancelled',
    deadlineRatio: 0.6400288486480713,
    minedHash:
      '0x55ad39634ee10d417b6e190cfd3736098957e958879cffe78f1f00f4fd2654d6',
    minedTx: 'success',
  },
});

const createStateAfterSuccess = () => {
  return [
    {
      uuid: 'uuid2',
      status: 'success',
      cancellable: false,
      statusMetadata: {
        cancellationFeeWei: 36777567771000,
        cancellationReason: 'not_cancelled',
        deadlineRatio: 0.6400288486480713,
        minedHash:
          '0x55ad39634ee10d417b6e190cfd3736098957e958879cffe78f1f00f4fd2654d6',
        minedTx: 'success',
      },
      accountHardwareType: 'Ledger Hardware',
      accountType: 'hardware',
      deviceModel: 'ledger',
    },
  ];
};

const createSuccessLivenessApiResponse = () => ({
  smartTransactions: true,
});

const testHistory = [
  {
    op: 'add',
    path: '/swapTokenValue',
    value: '0.001',
  },
];

const ethereumChainIdDec = parseInt(ChainId.mainnet, 16);
const sepoliaChainIdDec = parseInt(ChainId.sepolia, 16);

const trackMetaMetricsEventSpy = jest.fn();

describe('SmartTransactionsController', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    nock.cleanAll();
  });

  it('initializes with default state', async () => {
    const defaultState = getDefaultSmartTransactionsControllerState();
    await withController(({ controller }) => {
      expect(controller.state).toStrictEqual({
        ...defaultState,
        smartTransactionsState: {
          ...defaultState.smartTransactionsState,
          smartTransactions: {
            [ChainId.mainnet]: [],
          },
        },
      });
    });
  });

  describe('feature flag validation error reporting', () => {
    it('reports error to ErrorReportingService when feature flags are invalid after state change', async () => {
      const captureExceptionSpy = jest.fn();
      const rootMessenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      rootMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        jest.fn().mockReturnValue({
          configuration: { chainId: ChainId.mainnet },
          provider: getFakeProvider(),
        }),
      );
      rootMessenger.registerActionHandler(
        'NetworkController:getState',
        jest.fn().mockReturnValue({
          selectedNetworkClientId: NetworkType.mainnet,
          networkConfigurationsByChainId: {},
        }),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:getNonceLock',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:getTransactions',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:updateTransaction',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'RemoteFeatureFlagController:getState',
        jest.fn().mockReturnValue({
          remoteFeatureFlags: {
            smartTransactionsNetworks: 'invalid-data',
          },
        }),
      );
      rootMessenger.registerActionHandler(
        'ErrorReportingService:captureException',
        captureExceptionSpy,
      );

      const messenger = new Messenger<
        'SmartTransactionsController',
        AllActions,
        AllEvents,
        RootMessenger
      >({
        namespace: 'SmartTransactionsController',
        parent: rootMessenger,
      });
      rootMessenger.delegate({
        messenger,
        actions: [
          'NetworkController:getNetworkClientById',
          'NetworkController:getState',
          'RemoteFeatureFlagController:getState',
          'TransactionController:getNonceLock',
          'TransactionController:getTransactions',
          'TransactionController:updateTransaction',
          'ErrorReportingService:captureException',
        ],
        events: [
          'NetworkController:stateChange',
          'RemoteFeatureFlagController:stateChange',
        ],
      });

      const controller = new SmartTransactionsController({
        messenger,
        clientId: ClientId.Mobile,
        trackMetaMetricsEvent: jest.fn(),
        getMetaMetricsProps: jest.fn(async () => ({})),
      });

      // No validation on construction
      expect(captureExceptionSpy).not.toHaveBeenCalled();

      // Trigger state change with invalid data
      rootMessenger.publish(
        'RemoteFeatureFlagController:stateChange',
        {
          remoteFeatureFlags: {
            smartTransactionsNetworks: 'invalid-data',
          },
          cacheTimestamp: Date.now(),
        },
        [],
      );

      // Should be called after state change
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            '[SmartTransactionsController] Feature flag validation failed',
          ),
        }),
      );

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      controller.stop();
    });

    it('does not report error when feature flags are valid after state change', async () => {
      const captureExceptionSpy = jest.fn();
      const rootMessenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      rootMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        jest.fn().mockReturnValue({
          configuration: { chainId: ChainId.mainnet },
          provider: getFakeProvider(),
        }),
      );
      rootMessenger.registerActionHandler(
        'NetworkController:getState',
        jest.fn().mockReturnValue({
          selectedNetworkClientId: NetworkType.mainnet,
          networkConfigurationsByChainId: {},
        }),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:getNonceLock',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:getTransactions',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:updateTransaction',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'RemoteFeatureFlagController:getState',
        jest.fn().mockReturnValue({
          remoteFeatureFlags: {
            smartTransactionsNetworks: {
              default: { extensionActive: true },
            },
          },
        }),
      );
      rootMessenger.registerActionHandler(
        'ErrorReportingService:captureException',
        captureExceptionSpy,
      );

      const messenger = new Messenger<
        'SmartTransactionsController',
        AllActions,
        AllEvents,
        RootMessenger
      >({
        namespace: 'SmartTransactionsController',
        parent: rootMessenger,
      });
      rootMessenger.delegate({
        messenger,
        actions: [
          'NetworkController:getNetworkClientById',
          'NetworkController:getState',
          'RemoteFeatureFlagController:getState',
          'TransactionController:getNonceLock',
          'TransactionController:getTransactions',
          'TransactionController:updateTransaction',
          'ErrorReportingService:captureException',
        ],
        events: [
          'NetworkController:stateChange',
          'RemoteFeatureFlagController:stateChange',
        ],
      });

      const controller = new SmartTransactionsController({
        messenger,
        clientId: ClientId.Mobile,
        trackMetaMetricsEvent: jest.fn(),
        getMetaMetricsProps: jest.fn(async () => ({})),
      });

      // No validation on construction
      expect(captureExceptionSpy).not.toHaveBeenCalled();

      // Trigger state change with valid data
      rootMessenger.publish(
        'RemoteFeatureFlagController:stateChange',
        {
          remoteFeatureFlags: {
            smartTransactionsNetworks: {
              default: { extensionActive: true },
            },
          },
          cacheTimestamp: Date.now(),
        },
        [],
      );

      // Should not be called after state change with valid flags
      expect(captureExceptionSpy).not.toHaveBeenCalled();

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      controller.stop();
    });

    it('reports error when smartTransactionsNetworks flag is missing after state change', async () => {
      const captureExceptionSpy = jest.fn();
      const rootMessenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      rootMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        jest.fn().mockReturnValue({
          configuration: { chainId: ChainId.mainnet },
          provider: getFakeProvider(),
        }),
      );
      rootMessenger.registerActionHandler(
        'NetworkController:getState',
        jest.fn().mockReturnValue({
          selectedNetworkClientId: NetworkType.mainnet,
          networkConfigurationsByChainId: {},
        }),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:getNonceLock',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:getTransactions',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:updateTransaction',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'RemoteFeatureFlagController:getState',
        jest.fn().mockReturnValue({
          remoteFeatureFlags: {
            // smartTransactionsNetworks is undefined (missing from remote config)
          },
        }),
      );
      rootMessenger.registerActionHandler(
        'ErrorReportingService:captureException',
        captureExceptionSpy,
      );

      const messenger = new Messenger<
        'SmartTransactionsController',
        AllActions,
        AllEvents,
        RootMessenger
      >({
        namespace: 'SmartTransactionsController',
        parent: rootMessenger,
      });
      rootMessenger.delegate({
        messenger,
        actions: [
          'NetworkController:getNetworkClientById',
          'NetworkController:getState',
          'RemoteFeatureFlagController:getState',
          'TransactionController:getNonceLock',
          'TransactionController:getTransactions',
          'TransactionController:updateTransaction',
          'ErrorReportingService:captureException',
        ],
        events: [
          'NetworkController:stateChange',
          'RemoteFeatureFlagController:stateChange',
        ],
      });

      const controller = new SmartTransactionsController({
        messenger,
        clientId: ClientId.Mobile,
        trackMetaMetricsEvent: jest.fn(),
        getMetaMetricsProps: jest.fn(async () => ({})),
      });

      // No validation on construction
      expect(captureExceptionSpy).not.toHaveBeenCalled();

      // Trigger state change with missing smartTransactionsNetworks flag
      rootMessenger.publish(
        'RemoteFeatureFlagController:stateChange',
        {
          remoteFeatureFlags: {
            // smartTransactionsNetworks is undefined
          },
          cacheTimestamp: Date.now(),
        },
        [],
      );

      // Should report error when flag is missing after state change
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            '[SmartTransactionsController] Feature flag validation failed',
          ),
        }),
      );

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      controller.stop();
    });

    it('reports error to ErrorReportingService when feature flags become invalid after state change', async () => {
      const captureExceptionSpy = jest.fn();
      const getStateMock = jest.fn().mockReturnValue({
        remoteFeatureFlags: {
          smartTransactionsNetworks: {
            default: { extensionActive: true },
          },
        },
      });
      const rootMessenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      rootMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        jest.fn().mockReturnValue({
          configuration: { chainId: ChainId.mainnet },
          provider: getFakeProvider(),
        }),
      );
      rootMessenger.registerActionHandler(
        'NetworkController:getState',
        jest.fn().mockReturnValue({
          selectedNetworkClientId: NetworkType.mainnet,
          networkConfigurationsByChainId: {},
        }),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:getNonceLock',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:getTransactions',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:updateTransaction',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'RemoteFeatureFlagController:getState',
        getStateMock,
      );
      rootMessenger.registerActionHandler(
        'ErrorReportingService:captureException',
        captureExceptionSpy,
      );

      const messenger = new Messenger<
        'SmartTransactionsController',
        AllActions,
        AllEvents,
        RootMessenger
      >({
        namespace: 'SmartTransactionsController',
        parent: rootMessenger,
      });
      rootMessenger.delegate({
        messenger,
        actions: [
          'NetworkController:getNetworkClientById',
          'NetworkController:getState',
          'RemoteFeatureFlagController:getState',
          'TransactionController:getNonceLock',
          'TransactionController:getTransactions',
          'TransactionController:updateTransaction',
          'ErrorReportingService:captureException',
        ],
        events: [
          'NetworkController:stateChange',
          'RemoteFeatureFlagController:stateChange',
        ],
      });

      const controller = new SmartTransactionsController({
        messenger,
        clientId: ClientId.Mobile,
        trackMetaMetricsEvent: jest.fn(),
        getMetaMetricsProps: jest.fn(async () => ({})),
      });

      // Should not be called initially (valid flags)
      expect(captureExceptionSpy).not.toHaveBeenCalled();

      // Simulate feature flag state change with invalid data
      getStateMock.mockReturnValue({
        remoteFeatureFlags: {
          smartTransactionsNetworks: 'invalid-data',
        },
      });

      rootMessenger.publish(
        'RemoteFeatureFlagController:stateChange',
        {
          remoteFeatureFlags: {
            smartTransactionsNetworks: 'invalid-data',
          },
          cacheTimestamp: Date.now(),
        },
        [],
      );

      // Should be called after state change with invalid data
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            '[SmartTransactionsController] Feature flag validation failed',
          ),
        }),
      );

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      controller.stop();
    });

    it('reports multiple errors to ErrorReportingService when multiple chains are invalid after state change', async () => {
      const captureExceptionSpy = jest.fn();
      const rootMessenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      rootMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        jest.fn().mockReturnValue({
          configuration: { chainId: ChainId.mainnet },
          provider: getFakeProvider(),
        }),
      );
      rootMessenger.registerActionHandler(
        'NetworkController:getState',
        jest.fn().mockReturnValue({
          selectedNetworkClientId: NetworkType.mainnet,
          networkConfigurationsByChainId: {},
        }),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:getNonceLock',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:getTransactions',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'TransactionController:updateTransaction',
        jest.fn(),
      );
      rootMessenger.registerActionHandler(
        'RemoteFeatureFlagController:getState',
        jest.fn().mockReturnValue({
          remoteFeatureFlags: {
            smartTransactionsNetworks: {
              default: { extensionActive: true },
              '0x1': { extensionActive: true },
              invalidChain1: { extensionActive: false },
              invalidChain2: { mobileActive: true },
            },
          },
        }),
      );
      rootMessenger.registerActionHandler(
        'ErrorReportingService:captureException',
        captureExceptionSpy,
      );

      const messenger = new Messenger<
        'SmartTransactionsController',
        AllActions,
        AllEvents,
        RootMessenger
      >({
        namespace: 'SmartTransactionsController',
        parent: rootMessenger,
      });
      rootMessenger.delegate({
        messenger,
        actions: [
          'NetworkController:getNetworkClientById',
          'NetworkController:getState',
          'RemoteFeatureFlagController:getState',
          'TransactionController:getNonceLock',
          'TransactionController:getTransactions',
          'TransactionController:updateTransaction',
          'ErrorReportingService:captureException',
        ],
        events: [
          'NetworkController:stateChange',
          'RemoteFeatureFlagController:stateChange',
        ],
      });

      const controller = new SmartTransactionsController({
        messenger,
        clientId: ClientId.Mobile,
        trackMetaMetricsEvent: jest.fn(),
        getMetaMetricsProps: jest.fn(async () => ({})),
      });

      // No validation on construction
      expect(captureExceptionSpy).not.toHaveBeenCalled();

      // Trigger state change with multiple invalid chains
      rootMessenger.publish(
        'RemoteFeatureFlagController:stateChange',
        {
          remoteFeatureFlags: {
            smartTransactionsNetworks: {
              default: { extensionActive: true },
              '0x1': { extensionActive: true },
              invalidChain1: { extensionActive: false },
              invalidChain2: { mobileActive: true },
            },
          },
          cacheTimestamp: Date.now(),
        },
        [],
      );

      // Should be called twice - once for each invalid chain
      expect(captureExceptionSpy).toHaveBeenCalledTimes(2);

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      controller.stop();
    });
  });

  describe('onNetworkChange', () => {
    it('calls poll', async () => {
      await withController(({ controller, triggerNetworStateChange }) => {
        const checkPollSpy = jest.spyOn(controller, 'checkPoll');

        triggerNetworStateChange({
          selectedNetworkClientId: NetworkType.sepolia,
          networkConfigurationsByChainId: {},
          networksMetadata: {},
        });

        expect(checkPollSpy).toHaveBeenCalled();
      });
    });
  });

  describe('checkPoll', () => {
    it('calls poll if there is no pending transaction and pending transactions', async () => {
      const pollSpy = jest
        .spyOn(SmartTransactionsController.prototype, 'poll')
        .mockImplementation(async () => {
          return new Promise(() => ({}));
        });
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const pendingStx = createStateAfterPending();
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: pendingStx as SmartTransaction[],
                },
              },
            },
          },
        },
        () => {
          expect(pollSpy).toHaveBeenCalled();
        },
      );
    });

    it('calls stop if there is a timeoutHandle and no pending transactions', async () => {
      await withController(({ controller }) => {
        const stopSpy = jest.spyOn(controller, 'stop');
        controller.timeoutHandle = setTimeout(() => ({}));

        controller.checkPoll(controller.state);

        expect(stopSpy).toHaveBeenCalled();

        clearInterval(controller.timeoutHandle);
      });
    });
  });

  describe('poll', () => {
    it('does not call updateSmartTransactions on unsupported networks', async () => {
      await withController(
        {
          options: {
            supportedChainIds: [ChainId.mainnet],
          },
        },
        ({ controller, triggerNetworStateChange }) => {
          const updateSmartTransactionsSpy = jest.spyOn(
            controller,
            'updateSmartTransactions',
          );

          expect(updateSmartTransactionsSpy).not.toHaveBeenCalled();

          triggerNetworStateChange({
            selectedNetworkClientId: NetworkType.sepolia,
            networkConfigurationsByChainId: {},
            networksMetadata: {},
          });

          expect(updateSmartTransactionsSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('calls updateSmartTransactions if there is a timeoutHandle and pending transactions', async () => {
      await withController(({ controller }) => {
        const updateSmartTransactionsSpy = jest.spyOn(
          controller,
          'updateSmartTransactions',
        );

        controller.timeoutHandle = setTimeout(() => ({}));

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        controller.poll(1000);

        expect(updateSmartTransactionsSpy).toHaveBeenCalled();
      });
    });
  });

  describe('updateSmartTransactions', () => {
    // TODO rewrite this test... updateSmartTransactions is getting called via the checkPoll method which is called whenever state is updated.
    // this test should be more isolated to the updateSmartTransactions method.
    it('calls fetchSmartTransactionsStatus if there are pending transactions', async () => {
      const fetchSmartTransactionsStatusSpy = jest
        .spyOn(
          SmartTransactionsController.prototype,
          'fetchSmartTransactionsStatus',
        )
        .mockImplementation(async () => {
          return new Promise(() => ({}));
        });
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const pendingStx = createStateAfterPending();
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: pendingStx as SmartTransaction[],
                },
              },
            },
          },
        },
        () => {
          expect(fetchSmartTransactionsStatusSpy).toHaveBeenCalled();
        },
      );
    });
  });

  describe('trackStxStatusChange', () => {
    it('tracks status change if prevSmartTransactions is undefined', async () => {
      await withController(({ controller }) => {
        const smartTransaction = {
          ...createStateAfterPending()[0],
          swapMetaData: {},
        } as SmartTransaction;

        controller.trackStxStatusChange(smartTransaction);

        expect(trackMetaMetricsEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'STX Status Updated',
            category: 'Transactions',
            properties: expect.objectContaining({
              stx_status: SmartTransactionStatuses.PENDING,
              is_smart_transaction: true,
            }),
            sensitiveProperties: expect.objectContaining({
              account_hardware_type: 'Ledger Hardware',
              account_type: 'hardware',
              device_model: 'ledger',
            }),
          }),
        );
      });
    });

    it('does not track if smartTransaction and prevSmartTransaction have the same status', async () => {
      await withController(({ controller }) => {
        const smartTransaction = createStateAfterPending()[0];

        controller.trackStxStatusChange(
          smartTransaction as SmartTransaction,
          smartTransaction as SmartTransaction,
        );

        expect(trackMetaMetricsEventSpy).not.toHaveBeenCalled();
      });
    });

    it('tracks status change if smartTransaction and prevSmartTransaction have different statuses', async () => {
      await withController(({ controller }) => {
        const smartTransaction = {
          ...createStateAfterSuccess()[0],
          swapMetaData: {},
        };
        const prevSmartTransaction = {
          ...smartTransaction,
          status: SmartTransactionStatuses.PENDING,
        };

        controller.trackStxStatusChange(
          smartTransaction as SmartTransaction,
          prevSmartTransaction as SmartTransaction,
        );

        expect(trackMetaMetricsEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'STX Status Updated',
            category: 'Transactions',
            properties: expect.objectContaining({
              stx_status: SmartTransactionStatuses.SUCCESS,
              is_smart_transaction: true,
            }),
            sensitiveProperties: expect.objectContaining({
              account_hardware_type: 'Ledger Hardware',
              account_type: 'hardware',
              device_model: 'ledger',
            }),
          }),
        );
      });
    });
  });

  describe('setOptInState', () => {
    it('sets optIn state', async () => {
      await withController(({ controller }) => {
        controller.setOptInState(true);

        expect(controller.state.smartTransactionsState.userOptInV2).toBe(true);

        controller.setOptInState(false);

        expect(controller.state.smartTransactionsState.userOptInV2).toBe(false);

        controller.setOptInState(null);

        expect(controller.state.smartTransactionsState.userOptInV2).toBeNull();
      });
    });
  });

  describe('clearFees', () => {
    it('clears fees', async () => {
      await withController(async ({ controller }) => {
        const tradeTx = createUnsignedTransaction(ethereumChainIdDec);
        const approvalTx = createUnsignedTransaction(ethereumChainIdDec);
        const getFeesApiResponse = createGetFeesApiResponse();
        nock(API_BASE_URL)
          .post(`/networks/${ethereumChainIdDec}/getFees`)
          .reply(200, getFeesApiResponse);

        const fees = await controller.getFees(tradeTx, approvalTx);

        expect(fees).toMatchObject({
          approvalTxFees: getFeesApiResponse.txs[0],
          tradeTxFees: getFeesApiResponse.txs[1],
        });

        controller.clearFees();

        expect(controller.state.smartTransactionsState.fees).toStrictEqual({
          approvalTxFees: null,
          tradeTxFees: null,
        });
      });
    });
  });

  describe('getFees', () => {
    it('gets unsigned transactions and estimates based on an unsigned transaction', async () => {
      await withController(async ({ controller }) => {
        const tradeTx = createUnsignedTransaction(ethereumChainIdDec);
        const approvalTx = createUnsignedTransaction(ethereumChainIdDec);
        const getFeesApiResponse = createGetFeesApiResponse();
        nock(API_BASE_URL)
          .post(`/networks/${ethereumChainIdDec}/getFees`)
          .reply(200, getFeesApiResponse);

        const fees = await controller.getFees(tradeTx, approvalTx);

        expect(fees).toMatchObject({
          approvalTxFees: getFeesApiResponse.txs[0],
          tradeTxFees: getFeesApiResponse.txs[1],
        });
      });
    });

    it('gets estimates based on an unsigned transaction with an undefined nonce', async () => {
      await withController(async ({ controller }) => {
        const tradeTx: UnsignedTransaction =
          createUnsignedTransaction(ethereumChainIdDec);
        tradeTx.nonce = undefined;
        const getFeesApiResponse = createGetFeesApiResponse();
        nock(API_BASE_URL)
          .post(`/networks/${ethereumChainIdDec}/getFees`)
          .reply(200, getFeesApiResponse);

        const fees = await controller.getFees(tradeTx);

        expect(fees).toMatchObject({
          tradeTxFees: getFeesApiResponse.txs[0],
        });
      });
    });

    it('should add fee data to feesByChainId state using the networkClientId passed in to identify the appropriate chain', async () => {
      await withController(async ({ controller }) => {
        const tradeTx = createUnsignedTransaction(sepoliaChainIdDec);
        const approvalTx = createUnsignedTransaction(sepoliaChainIdDec);
        const getFeesApiResponse = createGetFeesApiResponse();
        nock(API_BASE_URL)
          .post(`/networks/${sepoliaChainIdDec}/getFees`)
          .reply(200, getFeesApiResponse);

        expect(
          controller.state.smartTransactionsState.feesByChainId,
        ).toStrictEqual(
          getDefaultSmartTransactionsControllerState().smartTransactionsState
            .feesByChainId,
        );

        await controller.getFees(tradeTx, approvalTx, {
          networkClientId: NetworkType.sepolia,
        });

        expect(
          controller.state.smartTransactionsState.feesByChainId,
        ).toMatchObject({
          [ChainId.mainnet]: {
            approvalTxFees: null,
            tradeTxFees: null,
          },
          [ChainId.sepolia]: {
            approvalTxFees: getFeesApiResponse.txs[0],
            tradeTxFees: getFeesApiResponse.txs[1],
          },
        });
      });
    });
  });

  describe('submitSignedTransactions', () => {
    beforeEach(() => {
      jest
        .spyOn(SmartTransactionsController.prototype, 'checkPoll')
        .mockImplementation(() => ({}));
    });

    it('submits a smart transaction with signed transactions', async () => {
      await withController(async ({ controller }) => {
        const signedTransaction = createSignedTransaction();
        const signedCanceledTransaction = createSignedCanceledTransaction();
        const submitTransactionsApiResponse =
          createSubmitTransactionsApiResponse(); // It has uuid.
        nock(API_BASE_URL)
          .post(
            `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
          )
          .reply(200, submitTransactionsApiResponse);

        await controller.submitSignedTransactions({
          signedTransactions: [signedTransaction],
          signedCanceledTransactions: [signedCanceledTransaction],
          txParams: createTxParams(),
        });

        const submittedSmartTransaction =
          controller.state.smartTransactionsState.smartTransactions[
            ChainId.mainnet
          ][0];
        expect(submittedSmartTransaction.uuid).toBe(
          'dP23W7c2kt4FK9TmXOkz1UM2F20',
        );
        expect(submittedSmartTransaction.accountHardwareType).toBe(
          'Ledger Hardware',
        );
        expect(submittedSmartTransaction.accountType).toBe('hardware');
        expect(submittedSmartTransaction.deviceModel).toBe('ledger');
      });
    });

    it('should acquire nonce for Swap transactions only', async () => {
      // Create a mock for getNonceLock
      const mockGetNonceLock = jest.fn().mockResolvedValue({
        nextNonce: 42,
        nonceDetails: { test: 'details' },
        releaseLock: jest.fn(),
      });

      await withController(
        {
          getNonceLock: mockGetNonceLock,
        },
        async ({ controller }) => {
          const signedTransaction = createSignedTransaction();
          const submitTransactionsApiResponse =
            createSubmitTransactionsApiResponse();

          // First API mock for the case without nonce
          nock(API_BASE_URL)
            .post(
              `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
            )
            .reply(200, submitTransactionsApiResponse);

          // Second API mock for the case with nonce
          nock(API_BASE_URL)
            .post(
              `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
            )
            .reply(200, submitTransactionsApiResponse);

          // Case 1: Swap transaction without nonce (should call getNonceLock)
          const txParamsWithoutNonce = {
            ...createTxParams(),
            nonce: undefined, // Explicitly undefined nonce
          };

          await controller.submitSignedTransactions({
            signedTransactions: [signedTransaction],
            txParams: txParamsWithoutNonce,
            // No transactionMeta means type defaults to 'swap'
          });

          // Verify getNonceLock was called for the Swap
          expect(mockGetNonceLock).toHaveBeenCalledTimes(1);
          expect(mockGetNonceLock).toHaveBeenCalledWith(
            txParamsWithoutNonce.from,
            NetworkType.mainnet,
          );

          // Reset the mock
          mockGetNonceLock.mockClear();

          // Case 2: Transaction with nonce already set (should NOT call getNonceLock)
          const txParamsWithNonce = createTxParams(); // This has nonce: '0'

          await controller.submitSignedTransactions({
            signedTransactions: [signedTransaction],
            txParams: txParamsWithNonce,
          });

          // Verify getNonceLock was NOT called for transaction with nonce
          expect(mockGetNonceLock).not.toHaveBeenCalled();
        },
      );
    });

    it('should properly set nonce on txParams and mark transaction as swap type', async () => {
      // Mock with a specific nextNonce value we can verify
      const mockGetNonceLock = jest.fn().mockResolvedValue({
        nextNonce: 42,
        nonceDetails: { test: 'nonce details' },
        releaseLock: jest.fn(),
      });

      await withController(
        {
          getNonceLock: mockGetNonceLock,
        },
        async ({ controller }) => {
          const signedTransaction = createSignedTransaction();
          const submitTransactionsApiResponse =
            createSubmitTransactionsApiResponse();
          nock(API_BASE_URL)
            .post(
              `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
            )
            .reply(200, submitTransactionsApiResponse);

          // Create txParams without nonce
          const txParamsWithoutNonce = {
            ...createTxParams(),
            nonce: undefined,
            from: addressFrom,
          };

          await controller.submitSignedTransactions({
            signedTransactions: [signedTransaction],
            txParams: txParamsWithoutNonce,
            // No transactionMeta provided, should default to 'swap' type
          });

          // Get the created smart transaction
          const createdSmartTransaction =
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.mainnet
            ][0];

          // Verify nonce was set correctly on the txParams in the created transaction
          expect(createdSmartTransaction.txParams.nonce).toBe('0x2a'); // 42 in hex

          // Verify transaction type is set to 'swap' by default
          expect(createdSmartTransaction.type).toBe('swap');

          // Verify nonceDetails were passed correctly
          expect(createdSmartTransaction.nonceDetails).toStrictEqual({
            test: 'nonce details',
          });
        },
      );
    });

    it('should handle errors when acquiring nonce lock', async () => {
      // Mock getNonceLock to reject with an error
      const mockError = new Error('Failed to acquire nonce');
      const mockGetNonceLock = jest.fn().mockRejectedValue(mockError);

      // Spy on console.error to verify it's called
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await withController(
        {
          getNonceLock: mockGetNonceLock,
        },
        async ({ controller }) => {
          const signedTransaction = createSignedTransaction();
          const submitTransactionsApiResponse =
            createSubmitTransactionsApiResponse();
          nock(API_BASE_URL)
            .post(
              `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
            )
            .reply(200, submitTransactionsApiResponse);

          // Create txParams without nonce
          const txParamsWithoutNonce = {
            ...createTxParams(),
            nonce: undefined,
            from: addressFrom,
          };

          // Attempt to submit a transaction that will fail when acquiring nonce
          await expect(
            controller.submitSignedTransactions({
              signedTransactions: [signedTransaction],
              txParams: txParamsWithoutNonce,
            }),
          ).rejects.toThrow('Failed to acquire nonce');

          // Verify error was logged
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to acquire nonce lock:',
            mockError,
          );

          // Cleanup spy
          consoleErrorSpy.mockRestore();
        },
      );
    });

    it('submits a batch of signed transactions', async () => {
      await withController(async ({ controller }) => {
        const signedTransaction1 = createSignedTransaction();
        const signedTransaction2 = createSignedTransaction();
        const submitTransactionsApiResponse =
          createSubmitTransactionsApiResponse(); // It has uuid.
        nock(API_BASE_URL)
          .post(
            `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
          )
          .reply(200, submitTransactionsApiResponse);

        const txParams = createTxParams();
        const result = await controller.submitSignedTransactions({
          signedTransactions: [signedTransaction1, signedTransaction2],
          txParams,
        });

        // Check response has both txHash and txHashes
        expect(result.uuid).toBe('dP23W7c2kt4FK9TmXOkz1UM2F20');
        expect(result.txHash).toBeDefined();
        expect(result.txHashes).toBeDefined();
        expect(result.txHashes?.length).toBe(2);

        // Check smart transaction has correct properties
        const submittedSmartTransaction =
          controller.state.smartTransactionsState.smartTransactions[
            ChainId.mainnet
          ][0];
        expect(submittedSmartTransaction.uuid).toBe(
          'dP23W7c2kt4FK9TmXOkz1UM2F20',
        );
        expect(submittedSmartTransaction.txHashes).toBeDefined();
        expect(submittedSmartTransaction.txHashes?.length).toBe(2);
        expect(submittedSmartTransaction.txHash).toBe(result.txHashes[0]);
      });
    });

    it('works with optional signedCanceledTransactions', async () => {
      await withController(async ({ controller }) => {
        const signedTransaction = createSignedTransaction();
        const submitTransactionsApiResponse =
          createSubmitTransactionsApiResponse();

        // Verify that the request body has empty rawCancelTxs array when signedCanceledTransactions is omitted
        let requestBody: any;
        nock(API_BASE_URL)
          .post(
            `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
            (body) => {
              requestBody = body;
              return true;
            },
          )
          .reply(200, submitTransactionsApiResponse);

        await controller.submitSignedTransactions({
          signedTransactions: [signedTransaction],
          txParams: createTxParams(),
          // No signedCanceledTransactions provided
        });

        // Verify the request was made with an empty rawCancelTxs array
        expect(requestBody).toBeDefined();
        expect(requestBody.rawCancelTxs).toStrictEqual([]);
      });
    });

    it('includes signedTransactionsWithMetadata in request body as rawTxsWithMetadata', async () => {
      await withController(async ({ controller }) => {
        const signedTransaction = createSignedTransaction();
        const submitTransactionsApiResponse =
          createSubmitTransactionsApiResponse();

        const signedTransactionsWithMetadata = [
          {
            tx: signedTransaction,
            metadata: {
              txType: TransactionType.swap,
            },
          },
        ];

        let requestBody: any;
        nock(API_BASE_URL)
          .post(
            `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
            (body) => {
              requestBody = body;
              return true;
            },
          )
          .reply(200, submitTransactionsApiResponse);

        await controller.submitSignedTransactions({
          signedTransactions: [signedTransaction],
          signedTransactionsWithMetadata,
          txParams: createTxParams(),
        });

        // Verify the request includes rawTxsWithMetadata
        expect(requestBody).toBeDefined();
        expect(requestBody.rawTxsWithMetadata).toStrictEqual(
          signedTransactionsWithMetadata,
        );
      });
    });

    it('omits rawTxsWithMetadata from request body when signedTransactionsWithMetadata is not provided', async () => {
      await withController(async ({ controller }) => {
        const signedTransaction = createSignedTransaction();
        const submitTransactionsApiResponse =
          createSubmitTransactionsApiResponse();

        let requestBody: any;
        nock(API_BASE_URL)
          .post(
            `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
            (body) => {
              requestBody = body;
              return true;
            },
          )
          .reply(200, submitTransactionsApiResponse);

        await controller.submitSignedTransactions({
          signedTransactions: [signedTransaction],
          txParams: createTxParams(),
          // signedTransactionsWithMetadata not provided
        });

        // Verify the request does not include rawTxsWithMetadata
        expect(requestBody).toBeDefined();
        expect(requestBody.rawTxsWithMetadata).toBeUndefined();
      });
    });

    it('works without txParams', async () => {
      await withController(async ({ controller }) => {
        const signedTransaction = createSignedTransaction();
        const submitTransactionsApiResponse =
          createSubmitTransactionsApiResponse();

        nock(API_BASE_URL)
          .post(
            `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
          )
          .reply(200, submitTransactionsApiResponse);

        // This should not throw an error when txParams is missing
        const result = await controller.submitSignedTransactions({
          signedTransactions: [signedTransaction],
          // No txParams provided
        });

        expect(result.uuid).toBe('dP23W7c2kt4FK9TmXOkz1UM2F20');

        // The transaction should still be created in state
        const submittedSmartTransaction =
          controller.state.smartTransactionsState.smartTransactions[
            ChainId.mainnet
          ][0];
        expect(submittedSmartTransaction.uuid).toBe(
          'dP23W7c2kt4FK9TmXOkz1UM2F20',
        );
      });
    });
  });

  describe('fetchSmartTransactionsStatus', () => {
    beforeEach(() => {
      jest
        .spyOn(SmartTransactionsController.prototype, 'checkPoll')
        .mockImplementation(() => ({}));
    });

    it('fetches a pending status for a single smart transaction via batchStatus API', async () => {
      await withController(async ({ controller }) => {
        const uuids = ['uuid1'];
        const pendingBatchStatusApiResponse =
          createPendingBatchStatusApiResponse();
        nock(API_BASE_URL)
          .get(`/networks/${ethereumChainIdDec}/batchStatus?uuids=uuid1`)
          .reply(200, pendingBatchStatusApiResponse);

        const params = uuids.map((uuid) => ({
          uuid,
          chainId: ChainId.mainnet,
        }));

        await controller.fetchSmartTransactionsStatus(params);

        const pendingState = createStateAfterPending()[0];
        const pendingTransaction = { ...pendingState, history: [pendingState] };
        expect(controller.state).toMatchObject({
          smartTransactionsState: {
            smartTransactions: {
              [ChainId.mainnet]: [pendingTransaction],
            },
            userOptIn: null,
            userOptInV2: null,
            fees: {
              approvalTxFees: null,
              tradeTxFees: null,
            },
            feesByChainId: {
              [ChainId.mainnet]: {
                approvalTxFees: null,
                tradeTxFees: null,
              },
              [ChainId.sepolia]: {
                approvalTxFees: null,
                tradeTxFees: null,
              },
            },
            liveness: true,
            livenessByChainId: {
              [ChainId.mainnet]: true,
              [ChainId.sepolia]: true,
            },
          },
        });
      });
    });

    it('fetches a success status for a single smart transaction via batchStatus API', async () => {
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...getDefaultSmartTransactionsControllerState()
                  .smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]:
                    createStateAfterPending() as SmartTransaction[],
                },
              },
            },
          },
        },
        async ({ controller }) => {
          const uuids = ['uuid2'];
          const successBatchStatusApiResponse =
            createSuccessBatchStatusApiResponse();
          nock(API_BASE_URL)
            .get(`/networks/${ethereumChainIdDec}/batchStatus?uuids=uuid2`)
            .reply(200, successBatchStatusApiResponse);

          const params = uuids.map((uuid) => ({
            uuid,
            chainId: ChainId.mainnet,
          }));

          await controller.fetchSmartTransactionsStatus(params);

          const [successState] = createStateAfterSuccess();
          const successTransaction = {
            ...successState,
            history: [successState],
          };
          expect(controller.state).toMatchObject({
            smartTransactionsState: {
              smartTransactions: {
                [ChainId.mainnet]: [
                  ...createStateAfterPending(),
                  ...[successTransaction],
                ],
              },
              userOptIn: null,
              userOptInV2: null,
              fees: {
                approvalTxFees: null,
                tradeTxFees: null,
              },
              liveness: true,
              feesByChainId: {
                [ChainId.mainnet]: {
                  approvalTxFees: null,
                  tradeTxFees: null,
                },
                [ChainId.sepolia]: {
                  approvalTxFees: null,
                  tradeTxFees: null,
                },
              },
              livenessByChainId: {
                [ChainId.mainnet]: true,
                [ChainId.sepolia]: true,
              },
            },
          });
        },
      );
    });
  });

  describe('fetchLiveness', () => {
    it('fetches a liveness for Smart Transactions API', async () => {
      await withController(async ({ controller }) => {
        const successLivenessApiResponse = createSuccessLivenessApiResponse();
        nock(SENTINEL_API_BASE_URL_MAP[ethereumChainIdDec])
          .get(`/network`)
          .reply(200, successLivenessApiResponse);

        const liveness = await controller.fetchLiveness();

        expect(liveness).toBe(true);
      });
    });

    it('fetches liveness and sets in feesByChainId state for the Smart Transactions API for the chainId of the networkClientId passed in', async () => {
      await withController(async ({ controller }) => {
        nock(SENTINEL_API_BASE_URL_MAP[sepoliaChainIdDec])
          .get(`/network`)
          .replyWithError('random error');

        expect(
          controller.state.smartTransactionsState.livenessByChainId,
        ).toStrictEqual({
          [ChainId.mainnet]: true,
          [ChainId.sepolia]: true,
        });

        await controller.fetchLiveness({
          networkClientId: NetworkType.sepolia,
        });

        expect(
          controller.state.smartTransactionsState.livenessByChainId,
        ).toStrictEqual({
          [ChainId.mainnet]: true,
          [ChainId.sepolia]: false,
        });
      });
    });

    it('fetches liveness using chainId directly when provided', async () => {
      await withController(async ({ controller }) => {
        nock(SENTINEL_API_BASE_URL_MAP[sepoliaChainIdDec])
          .get(`/network`)
          .reply(200, createSuccessLivenessApiResponse());

        expect(
          controller.state.smartTransactionsState.livenessByChainId,
        ).toStrictEqual({
          [ChainId.mainnet]: true,
          [ChainId.sepolia]: true,
        });

        const liveness = await controller.fetchLiveness({
          chainId: ChainId.sepolia,
        });

        expect(liveness).toBe(true);
        expect(
          controller.state.smartTransactionsState.livenessByChainId,
        ).toStrictEqual({
          [ChainId.mainnet]: true,
          [ChainId.sepolia]: true,
        });
      });
    });

    it('prioritizes chainId over networkClientId when both are provided', async () => {
      await withController(async ({ controller }) => {
        // Mock sepolia (the chainId we're passing directly)
        nock(SENTINEL_API_BASE_URL_MAP[sepoliaChainIdDec])
          .get(`/network`)
          .reply(200, createSuccessLivenessApiResponse());

        const liveness = await controller.fetchLiveness({
          chainId: ChainId.sepolia,
          networkClientId: NetworkType.mainnet, // This should be ignored
        });

        expect(liveness).toBe(true);
        // Verify it used sepolia (from chainId), not mainnet (from networkClientId)
        expect(
          controller.state.smartTransactionsState.livenessByChainId[
            ChainId.sepolia
          ],
        ).toBe(true);
      });
    });
  });

  describe('updateSmartTransaction', () => {
    beforeEach(() => {
      jest
        .spyOn(SmartTransactionsController.prototype, 'checkPoll')
        .mockImplementation(() => ({}));
    });

    it('updates smart transaction based on uuid', async () => {
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const pendingStx = {
        ...createStateAfterPending()[0],
        history: testHistory,
      };
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [pendingStx] as SmartTransaction[],
                },
              },
            },
          },
        },
        ({ controller }) => {
          const updateTransaction = {
            ...pendingStx,
            status: 'test',
          };

          controller.updateSmartTransaction(
            updateTransaction as SmartTransaction,
            {
              networkClientId: NetworkType.mainnet,
            },
          );

          expect(
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.mainnet
            ][0].status,
          ).toBe('test');
        },
      );
    });

    it('calls updateTransaction when smart transaction is cancelled and returnTxHashAsap is true', async () => {
      const mockUpdateTransaction = jest.fn();
      const defaultState = getDefaultSmartTransactionsControllerState();
      const pendingStx = createStateAfterPending();
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...defaultState.smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: pendingStx as SmartTransaction[],
                },
              },
            },
          },
          remoteFeatureFlags: {
            smartTransactionsNetworks: {
              default: {
                mobileReturnTxHashAsap: true,
              },
              // Chain-specific config required for known chains
              '0x1': {
                mobileReturnTxHashAsap: true,
              },
            },
          },
          updateTransaction: mockUpdateTransaction,
          getTransactions: () => [
            {
              id: 'test-tx-id',
              status: TransactionStatus.submitted,
              chainId: '0x1',
              time: 123,
              txParams: {
                from: '0x123',
              },
              networkClientId: NetworkType.mainnet,
            },
          ],
        },
        async ({ controller }) => {
          const smartTransaction = {
            uuid: 'uuid1',
            status: SmartTransactionStatuses.CANCELLED,
            transactionId: 'test-tx-id',
          };

          controller.updateSmartTransaction(smartTransaction);

          expect(mockUpdateTransaction).toHaveBeenCalledWith(
            {
              id: 'test-tx-id',
              status: TransactionStatus.failed,
              chainId: '0x1',
              time: 123,
              txParams: {
                from: '0x123',
              },
              networkClientId: NetworkType.mainnet,
              error: {
                message: 'Smart transaction failed with status: cancelled',
                name: 'SmartTransactionFailed',
              },
            },
            'Smart transaction status: cancelled',
          );
        },
      );
    });

    it('does not call updateTransaction when smart transaction is cancelled but returnTxHashAsap is false', async () => {
      const mockUpdateTransaction = jest.fn();
      await withController(
        {
          remoteFeatureFlags: {
            smartTransactionsNetworks: {
              default: {
                mobileReturnTxHashAsap: false,
              },
            },
          },
          updateTransaction: mockUpdateTransaction,
          getTransactions: () => [
            {
              id: 'test-tx-id',
              status: TransactionStatus.submitted,
              chainId: '0x1',
              time: 123,
              txParams: {
                from: '0x123',
              },
              networkClientId: NetworkType.mainnet,
            },
          ],
        },
        async ({ controller }) => {
          const smartTransaction = {
            uuid: 'test-uuid',
            status: SmartTransactionStatuses.CANCELLED,
            transactionId: 'test-tx-id',
          };

          controller.updateSmartTransaction(smartTransaction);

          expect(mockUpdateTransaction).not.toHaveBeenCalled();
        },
      );
    });

    it('does not call updateTransaction when transaction is not found in regular transactions', async () => {
      const mockUpdateTransaction = jest.fn();

      await withController(
        {
          remoteFeatureFlags: {
            smartTransactionsNetworks: {
              default: {
                mobileReturnTxHashAsap: true,
              },
            },
          },
          updateTransaction: mockUpdateTransaction,
          getTransactions: () => [],
        },
        async ({ controller }) => {
          const smartTransaction = {
            uuid: 'test-uuid',
            status: SmartTransactionStatuses.CANCELLED,
            transactionId: 'test-tx-id',
          };

          controller.updateSmartTransaction(smartTransaction);

          expect(mockUpdateTransaction).not.toHaveBeenCalled();
        },
      );
    });

    it('does not call updateTransaction for non-cancelled transactions', async () => {
      const mockUpdateTransaction = jest.fn();
      await withController(
        {
          remoteFeatureFlags: {
            smartTransactionsNetworks: {
              default: {
                mobileReturnTxHashAsap: true,
              },
            },
          },
          updateTransaction: mockUpdateTransaction,
          getTransactions: () => [
            {
              id: 'test-tx-id',
              status: TransactionStatus.submitted,
              chainId: '0x1',
              time: 123,
              txParams: {
                from: '0x123',
              },
              networkClientId: NetworkType.mainnet,
            },
          ],
        },
        async ({ controller }) => {
          const smartTransaction = {
            uuid: 'test-uuid',
            status: SmartTransactionStatuses.PENDING,
            transactionId: 'test-tx-id',
          };

          controller.updateSmartTransaction(smartTransaction);

          expect(mockUpdateTransaction).not.toHaveBeenCalled();
        },
      );
    });

    it('confirms a smart transaction with SUCCESS status', async () => {
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const pendingStx = {
        ...createStateAfterPending()[0],
        history: testHistory,
      };
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [pendingStx] as SmartTransaction[],
                },
              },
            },
          },
        },
        async ({ controller }) => {
          const updateTransaction = {
            ...pendingStx,
            statusMetadata: {
              ...pendingStx.statusMetadata,
              minedHash: txHash,
            },
            status: SmartTransactionStatuses.SUCCESS,
          };

          controller.updateSmartTransaction(
            updateTransaction as SmartTransaction,
            {
              networkClientId: NetworkType.mainnet,
            },
          );
          await flushPromises();

          expect(
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.mainnet
            ][0].confirmed,
          ).toBe(true);
        },
      );
    });

    it('confirms a smart transaction with REVERTED status', async () => {
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const pendingStx = {
        ...createStateAfterPending()[0],
        history: testHistory,
      };
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [pendingStx] as SmartTransaction[],
                },
              },
            },
          },
        },
        async ({ controller }) => {
          const updateTransaction = {
            ...pendingStx,
            statusMetadata: {
              ...pendingStx.statusMetadata,
              minedHash: txHash,
            },
            status: SmartTransactionStatuses.REVERTED,
          };

          controller.updateSmartTransaction(
            updateTransaction as SmartTransaction,
            {
              networkClientId: NetworkType.mainnet,
            },
          );
          await flushPromises();

          expect(
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.mainnet
            ][0].confirmed,
          ).toBe(true);
        },
      );
    });

    it('does not confirm a smart transaction that does not have a minedHash', async () => {
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const pendingStx = {
        ...createStateAfterPending()[0],
        history: testHistory,
      };
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [pendingStx] as SmartTransaction[],
                },
              },
            },
          },
        },
        async ({ controller }) => {
          const updateTransaction = {
            ...pendingStx,
            statusMetadata: {
              ...pendingStx.statusMetadata,
              minedHash: '',
            },
            status: SmartTransactionStatuses.SUCCESS,
          };

          controller.updateSmartTransaction(
            updateTransaction as SmartTransaction,
            {
              networkClientId: NetworkType.mainnet,
            },
          );
          await flushPromises();

          expect(
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.mainnet
            ][0].confirmed,
          ).toBeUndefined();
        },
      );
    });
  });

  describe('cancelSmartTransaction', () => {
    it('sends POST call to Transactions API', async () => {
      await withController(async ({ controller }) => {
        const apiCall = nock(API_BASE_URL)
          .post(`/networks/${ethereumChainIdDec}/cancel`)
          .reply(200, { message: 'successful' });

        await controller.cancelSmartTransaction('uuid1');

        expect(apiCall.isDone()).toBe(true);
      });
    });
  });

  describe('getTransactions', () => {
    beforeEach(() => {
      jest
        .spyOn(SmartTransactionsController.prototype, 'checkPoll')
        .mockImplementation(() => ({}));
    });

    it('retrieves smart transactions by addressFrom and status', async () => {
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const pendingStx = {
        ...createStateAfterPending()[0],
        history: testHistory,
        txParams: {
          from: addressFrom,
        },
      };
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [pendingStx] as SmartTransaction[],
                },
              },
            },
          },
        },
        ({ controller }) => {
          const pendingStxs = controller.getTransactions({
            addressFrom,
            status: SmartTransactionStatuses.PENDING,
          });

          expect(pendingStxs).toStrictEqual([pendingStx]);
        },
      );
    });

    it('returns empty array if there are no smart transactions', async () => {
      await withController(({ controller }) => {
        const transactions = controller.getTransactions({
          addressFrom,
          status: SmartTransactionStatuses.PENDING,
        });

        expect(transactions).toStrictEqual([]);
      });
    });
  });

  describe('getSmartTransactionByMinedTxHash', () => {
    it('retrieves a smart transaction by a mined tx hash', async () => {
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const [successfulSmartTransaction] = createStateAfterSuccess();
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [
                    successfulSmartTransaction,
                  ] as SmartTransaction[],
                },
              },
            },
          },
        },
        ({ controller }) => {
          const smartTransaction = controller.getSmartTransactionByMinedTxHash(
            successfulSmartTransaction.statusMetadata.minedHash,
          );

          expect(smartTransaction).toStrictEqual(successfulSmartTransaction);
        },
      );
    });

    it('returns undefined if there is no smart transaction found by tx hash', async () => {
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const [successfulSmartTransaction] = createStateAfterSuccess();
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [
                    successfulSmartTransaction,
                  ] as SmartTransaction[],
                },
              },
            },
          },
        },
        ({ controller }) => {
          const smartTransaction =
            controller.getSmartTransactionByMinedTxHash('nonStxTxHash');

          expect(smartTransaction).toBeUndefined();
        },
      );
    });
  });

  describe('isNewSmartTransaction', () => {
    beforeEach(() => {
      jest
        .spyOn(SmartTransactionsController.prototype, 'checkPoll')
        .mockImplementation(() => ({}));
    });

    it('returns true if it is a new STX', async () => {
      await withController(({ controller }) => {
        const actual = controller.isNewSmartTransaction('newUuid');

        expect(actual).toBe(true);
      });
    });

    it('returns false if an STX already exist', async () => {
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...getDefaultSmartTransactionsControllerState()
                  .smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]:
                    createStateAfterPending() as SmartTransaction[],
                },
              },
            },
          },
        },
        ({ controller }) => {
          const actual = controller.isNewSmartTransaction('uuid1');
          expect(actual).toBe(false);
        },
      );
    });
  });

  describe('startPolling', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
    });

    it('starts and stops calling smart transactions batch status api endpoint with the correct chainId at the polling interval', async () => {
      // mock this to a noop because it causes an extra fetch call to the API upon state changes
      jest
        .spyOn(SmartTransactionsController.prototype, 'checkPoll')
        .mockImplementation(() => undefined);
      await withController(
        {
          options: {
            // pending transactions in state are required to test polling
            state: {
              smartTransactionsState: {
                ...getDefaultSmartTransactionsControllerState()
                  .smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [
                    {
                      uuid: 'uuid1',
                      status: 'pending',
                      cancellable: true,
                      chainId: ChainId.mainnet,
                    },
                  ],
                  [ChainId.sepolia]: [
                    {
                      uuid: 'uuid2',
                      status: 'pending',
                      cancellable: true,
                      chainId: ChainId.sepolia,
                    },
                  ],
                },
              },
            },
          },
        },
        async ({ controller }) => {
          const handleFetchSpy = jest
            .spyOn(utils, 'handleFetch')
            .mockImplementation(async () => Promise.resolve({}));

          const mainnetPollingToken = controller.startPolling({
            chainIds: [ChainId.mainnet],
          });

          await advanceTime({ clock, duration: 0 });

          const fetchHeaders = {
            headers: {
              'Content-Type': 'application/json',
              'X-Client-Id': ClientId.Mobile,
            },
          };

          expect(handleFetchSpy).toHaveBeenNthCalledWith(
            1,
            `${API_BASE_URL}/networks/${convertHexToDecimal(
              ChainId.mainnet,
            )}/batchStatus?uuids=uuid1`,
            fetchHeaders,
          );

          await advanceTime({ clock, duration: DEFAULT_INTERVAL });

          expect(handleFetchSpy).toHaveBeenNthCalledWith(
            2,
            `${API_BASE_URL}/networks/${convertHexToDecimal(
              ChainId.mainnet,
            )}/batchStatus?uuids=uuid1`,
            fetchHeaders,
          );

          controller.startPolling({ chainIds: [ChainId.sepolia] });
          await advanceTime({ clock, duration: 0 });

          expect(handleFetchSpy).toHaveBeenNthCalledWith(
            3,
            `${API_BASE_URL}/networks/${convertHexToDecimal(
              ChainId.sepolia,
            )}/batchStatus?uuids=uuid2`,
            fetchHeaders,
          );

          await advanceTime({ clock, duration: DEFAULT_INTERVAL });

          expect(handleFetchSpy).toHaveBeenNthCalledWith(
            5,
            `${API_BASE_URL}/networks/${convertHexToDecimal(
              ChainId.sepolia,
            )}/batchStatus?uuids=uuid2`,
            fetchHeaders,
          );

          // stop the mainnet polling
          controller.stopPollingByPollingToken(mainnetPollingToken);

          // cycle two polling intervals
          await advanceTime({ clock, duration: DEFAULT_INTERVAL });

          await advanceTime({ clock, duration: DEFAULT_INTERVAL });

          // check that the mainnet polling has stopped while the sepolia polling continues
          expect(handleFetchSpy).toHaveBeenNthCalledWith(
            6,
            `${API_BASE_URL}/networks/${convertHexToDecimal(
              ChainId.sepolia,
            )}/batchStatus?uuids=uuid2`,
            fetchHeaders,
          );

          expect(handleFetchSpy).toHaveBeenNthCalledWith(
            7,
            `${API_BASE_URL}/networks/${convertHexToDecimal(
              ChainId.sepolia,
            )}/batchStatus?uuids=uuid2`,
            fetchHeaders,
          );
        },
      );
    });

    it('does not poll for chains that are not supported', async () => {
      // mock this to a noop because it causes an extra fetch call to the API upon state changes
      jest
        .spyOn(SmartTransactionsController.prototype, 'checkPoll')
        .mockImplementation(() => undefined);
      await withController(
        {
          options: {
            // pending transactions in state are required to test polling
            state: {
              smartTransactionsState: {
                ...getDefaultSmartTransactionsControllerState()
                  .smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [
                    {
                      uuid: 'uuid1',
                      status: 'pending',
                      cancellable: true,
                      chainId: ChainId.mainnet,
                    },
                  ],
                  [ChainId.sepolia]: [
                    {
                      uuid: 'uuid2',
                      status: 'pending',
                      cancellable: true,
                      chainId: ChainId.sepolia,
                    },
                  ],
                },
              },
            },
          },
        },
        async ({ controller }) => {
          const handleFetchSpy = jest
            .spyOn(utils, 'handleFetch')
            .mockImplementation(async () => Promise.resolve({}));

          controller.startPolling({
            chainIds: ['notSupportedChainId' as Hex],
          });

          await advanceTime({ clock, duration: 0 });

          expect(handleFetchSpy).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('wipeSmartTransactions', () => {
    it('does not modify state if no address is provided', async () => {
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...getDefaultSmartTransactionsControllerState()
                  .smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [
                    { uuid: 'some-uuid-1', txParams: { from: '0x123' } },
                    { uuid: 'some-uuid-2', txParams: { from: '0x456' } },
                    { uuid: 'some-uuid-3', txParams: { from: '0x123' } },
                  ],
                  [ChainId.sepolia]: [
                    { uuid: 'some-uuid-4', txParams: { from: '0x123' } },
                    { uuid: 'some-uuid-5', txParams: { from: '0x789' } },
                    { uuid: 'some-uuid-6', txParams: { from: '0x123' } },
                  ],
                },
              },
            },
          },
        },
        ({ controller }) => {
          const prevState = {
            ...controller.state,
          };

          controller.wipeSmartTransactions({ address: '' });

          expect(controller.state).toStrictEqual(prevState);
        },
      );
    });

    it('removes transactions from all chains saved in the smartTransactionsState if ignoreNetwork is true', async () => {
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...getDefaultSmartTransactionsControllerState()
                  .smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [
                    { uuid: 'some-uuid-1', txParams: { from: '0x123' } },
                    { uuid: 'some-uuid-2', txParams: { from: '0x456' } },
                    { uuid: 'some-uuid-3', txParams: { from: '0x123' } },
                  ],
                  [ChainId.sepolia]: [
                    { uuid: 'some-uuid-4', txParams: { from: '0x123' } },
                    { uuid: 'some-uuid-5', txParams: { from: '0x789' } },
                    { uuid: 'some-uuid-6', txParams: { from: '0x123' } },
                  ],
                },
              },
            },
          },
        },
        ({ controller }) => {
          const address = '0x123';

          controller.wipeSmartTransactions({
            address,
            ignoreNetwork: true,
          });

          const {
            smartTransactionsState: { smartTransactions },
          } = controller.state;
          Object.keys(smartTransactions).forEach((chainId) => {
            const chainIdHex: Hex = chainId as Hex;
            expect(
              controller.state.smartTransactionsState.smartTransactions[
                chainIdHex
              ],
            ).not.toContainEqual({ txParams: { from: address } });
          });
        },
      );
    });

    it('removes transactions only from the current chainId if ignoreNetwork is false', async () => {
      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...getDefaultSmartTransactionsControllerState()
                  .smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [
                    { uuid: 'some-uuid-1', txParams: { from: '0x123' } },
                    { uuid: 'some-uuid-2', txParams: { from: '0x456' } },
                    { uuid: 'some-uuid-3', txParams: { from: '0x123' } },
                  ],
                  [ChainId.sepolia]: [
                    { uuid: 'some-uuid-4', txParams: { from: '0x123' } },
                    { uuid: 'some-uuid-5', txParams: { from: '0x789' } },
                    { uuid: 'some-uuid-6', txParams: { from: '0x123' } },
                  ],
                },
              },
            },
          },
        },
        ({ controller }) => {
          const address = '0x123';
          controller.wipeSmartTransactions({
            address,
            ignoreNetwork: false,
          });

          expect(
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.mainnet
            ],
          ).not.toContainEqual({ txParams: { from: address } });
          expect(
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.sepolia
            ],
          ).toContainEqual(
            expect.objectContaining({
              txParams: expect.objectContaining({ from: address }),
            }),
          );
        },
      );
    });

    it('removes transactions from the current chainId (even if it is not in supportedChainIds) if ignoreNetwork is false', async () => {
      await withController(
        {
          options: {
            supportedChainIds: [ChainId.sepolia],
            chainId: ChainId.mainnet,
            state: {
              smartTransactionsState: {
                ...getDefaultSmartTransactionsControllerState()
                  .smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [
                    { uuid: 'some-uuid-1', txParams: { from: '0x123' } },
                    { uuid: 'some-uuid-2', txParams: { from: '0x456' } },
                    { uuid: 'some-uuid-3', txParams: { from: '0x123' } },
                  ],
                  [ChainId.sepolia]: [
                    { uuid: 'some-uuid-4', txParams: { from: '0x123' } },
                    { uuid: 'some-uuid-5', txParams: { from: '0x789' } },
                    { uuid: 'some-uuid-6', txParams: { from: '0x123' } },
                  ],
                },
              },
            },
          },
        },
        ({ controller }) => {
          const address = '0x123';

          controller.wipeSmartTransactions({
            address,
            ignoreNetwork: false,
          });

          expect(
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.mainnet
            ],
          ).not.toContainEqual({ txParams: { from: address } });
          expect(
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.sepolia
            ],
          ).toContainEqual(
            expect.objectContaining({
              txParams: expect.objectContaining({ from: address }),
            }),
          );
        },
      );
    });

    it('removes transactions from all chains (even if they are not in supportedChainIds) if ignoreNetwork is true', async () => {
      await withController(
        {
          options: {
            supportedChainIds: [],
            state: {
              smartTransactionsState: {
                ...getDefaultSmartTransactionsControllerState()
                  .smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [
                    { uuid: 'some-uuid-1', txParams: { from: '0x123' } },
                    { uuid: 'some-uuid-2', txParams: { from: '0x456' } },
                    { uuid: 'some-uuid-3', txParams: { from: '0x123' } },
                  ],
                  [ChainId.sepolia]: [
                    { uuid: 'some-uuid-4', txParams: { from: '0x123' } },
                    { uuid: 'some-uuid-5', txParams: { from: '0x789' } },
                    { uuid: 'some-uuid-6', txParams: { from: '0x123' } },
                  ],
                },
              },
            },
          },
        },
        ({ controller }) => {
          const address = '0x123';

          controller.wipeSmartTransactions({
            address,
            ignoreNetwork: true,
          });

          const {
            smartTransactionsState: { smartTransactions },
          } = controller.state;
          Object.keys(smartTransactions).forEach((chainId) => {
            const chainIdHex: Hex = chainId as Hex;
            expect(
              controller.state.smartTransactionsState.smartTransactions[
                chainIdHex
              ],
            ).not.toContainEqual({ txParams: { from: address } });
          });
        },
      );
    });
  });

  describe('createOrUpdateSmartTransaction', () => {
    beforeEach(() => {
      jest
        .spyOn(SmartTransactionsController.prototype, 'checkPoll')
        .mockImplementation(() => ({}));
    });

    it('adds metaMetricsProps to new smart transactions', async () => {
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const newSmartTransaction = {
        uuid: 'new-uuid-test',
        status: SmartTransactionStatuses.PENDING,
        txParams: {
          from: addressFrom,
        },
      };

      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [],
                },
              },
            },
            getMetaMetricsProps: jest.fn().mockResolvedValue({
              accountHardwareType: 'Test Hardware',
              accountType: 'test-account',
              deviceModel: 'test-model',
            }),
          },
        },
        async ({ controller }) => {
          controller.updateSmartTransaction(
            newSmartTransaction as SmartTransaction,
          );

          // Allow async operations to complete
          await flushPromises();

          // Verify MetaMetricsProps were added
          const updatedTransaction =
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.mainnet
            ][0];
          expect(updatedTransaction.accountHardwareType).toBe('Test Hardware');
          expect(updatedTransaction.accountType).toBe('test-account');
          expect(updatedTransaction.deviceModel).toBe('test-model');
        },
      );
    });

    it('continues without metaMetricsProps if adding them fails', async () => {
      const { smartTransactionsState } =
        getDefaultSmartTransactionsControllerState();
      const newSmartTransaction = {
        uuid: 'new-uuid-test',
        status: SmartTransactionStatuses.PENDING,
        txParams: {
          from: addressFrom,
        },
      };

      // Mock console.error to verify it's called
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await withController(
        {
          options: {
            state: {
              smartTransactionsState: {
                ...smartTransactionsState,
                smartTransactions: {
                  [ChainId.mainnet]: [],
                },
              },
            },
            // Mock getting MetaMetricsProps to fail
            getMetaMetricsProps: jest
              .fn()
              .mockRejectedValue(new Error('Test metrics error')),
          },
        },
        async ({ controller }) => {
          controller.updateSmartTransaction(
            newSmartTransaction as SmartTransaction,
          );

          // Allow async operations to complete
          await flushPromises();

          // Verify transaction was still added even without metrics props
          const updatedTransaction =
            controller.state.smartTransactionsState.smartTransactions[
              ChainId.mainnet
            ][0];
          expect(updatedTransaction.uuid).toBe('new-uuid-test');

          // These should be undefined since getting metrics props failed
          expect(updatedTransaction.accountHardwareType).toBeUndefined();
          expect(updatedTransaction.accountType).toBeUndefined();
          expect(updatedTransaction.deviceModel).toBeUndefined();

          // Verify the error was logged
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to add metrics props to smart transaction:',
            expect.any(Error),
          );

          // Clean up the spy
          consoleErrorSpy.mockRestore();
        },
      );
    });
  });

  describe('Tracing', () => {
    const createTraceCallback = () =>
      jest.fn().mockImplementation(async (_request, fn) => {
        return fn?.();
      });

    it('traces getFees API call with expected name', async () => {
      const traceCallback = createTraceCallback();

      await withController(
        {
          options: {
            trace: traceCallback,
          },
        },
        async ({ controller }) => {
          const apiUrl = API_BASE_URL;
          nock(apiUrl)
            .post(`/networks/${ethereumChainIdDec}/getFees`)
            .reply(200, createGetFeesApiResponse());

          const tradeTx = createUnsignedTransaction(ethereumChainIdDec);
          await controller.getFees(tradeTx);

          expect(traceCallback).toHaveBeenCalledWith(
            { name: SmartTransactionsTraceName.GetFees },
            expect.any(Function),
          );
        },
      );
    });

    it('traces submitSignedTransactions API call with expected name', async () => {
      const traceCallback = createTraceCallback();

      await withController(
        {
          options: {
            trace: traceCallback,
          },
        },
        async ({ controller }) => {
          const apiUrl = API_BASE_URL;
          nock(apiUrl)
            .post(
              `/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
            )
            .reply(200, createSubmitTransactionsApiResponse());

          const signedTx = createSignedTransaction();
          const signedCanceledTx = createSignedCanceledTransaction();
          const txParams = createTxParams();

          await controller.submitSignedTransactions({
            signedTransactions: [signedTx],
            signedCanceledTransactions: [signedCanceledTx],
            txParams,
          });

          expect(traceCallback).toHaveBeenCalledWith(
            { name: SmartTransactionsTraceName.SubmitTransactions },
            expect.any(Function),
          );
        },
      );
    });

    it('traces cancelSmartTransaction API call with expected name', async () => {
      const traceCallback = createTraceCallback();

      await withController(
        {
          options: {
            trace: traceCallback,
          },
        },
        async ({ controller }) => {
          const apiUrl = API_BASE_URL;
          nock(apiUrl)
            .post(`/networks/${ethereumChainIdDec}/cancel`)
            .reply(200, {});

          await controller.cancelSmartTransaction('uuid1');

          expect(traceCallback).toHaveBeenCalledWith(
            { name: SmartTransactionsTraceName.CancelTransaction },
            expect.any(Function),
          );
        },
      );
    });

    it('traces fetchLiveness API call with expected name', async () => {
      const traceCallback = createTraceCallback();

      await withController(
        {
          options: {
            trace: traceCallback,
          },
        },
        async ({ controller }) => {
          nock(SENTINEL_API_BASE_URL_MAP[ethereumChainIdDec])
            .get(`/network`)
            .reply(200, createSuccessLivenessApiResponse());

          await controller.fetchLiveness();

          expect(traceCallback).toHaveBeenCalledWith(
            { name: SmartTransactionsTraceName.FetchLiveness },
            expect.any(Function),
          );
        },
      );
    });

    it('returns correct result when tracing is enabled', async () => {
      const traceCallback = createTraceCallback();

      await withController(
        {
          options: {
            trace: traceCallback,
          },
        },
        async ({ controller }) => {
          const apiUrl = API_BASE_URL;
          const expectedResponse = createGetFeesApiResponse();
          nock(apiUrl)
            .post(`/networks/${ethereumChainIdDec}/getFees`)
            .reply(200, expectedResponse);

          const tradeTx = createUnsignedTransaction(ethereumChainIdDec);
          const result = await controller.getFees(tradeTx);

          expect(traceCallback).toHaveBeenCalled();
          expect(result).toMatchObject({
            tradeTxFees: expectedResponse.txs[0],
            approvalTxFees: null,
          });
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`
          {
            "smartTransactionsState": {
              "fees": {
                "approvalTxFees": null,
                "tradeTxFees": null,
              },
              "feesByChainId": {
                "0x1": {
                  "approvalTxFees": null,
                  "tradeTxFees": null,
                },
                "0xaa36a7": {
                  "approvalTxFees": null,
                  "tradeTxFees": null,
                },
              },
              "liveness": true,
              "livenessByChainId": {
                "0x1": true,
                "0xaa36a7": true,
              },
              "smartTransactions": {
                "0x1": [],
              },
              "userOptIn": null,
              "userOptInV2": null,
            },
          }
        `);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          {
            "smartTransactionsState": {
              "fees": {
                "approvalTxFees": null,
                "tradeTxFees": null,
              },
              "feesByChainId": {
                "0x1": {
                  "approvalTxFees": null,
                  "tradeTxFees": null,
                },
                "0xaa36a7": {
                  "approvalTxFees": null,
                  "tradeTxFees": null,
                },
              },
              "liveness": true,
              "livenessByChainId": {
                "0x1": true,
                "0xaa36a7": true,
              },
              "smartTransactions": {
                "0x1": [],
              },
              "userOptIn": null,
              "userOptInV2": null,
            },
          }
        `);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`{}`);
      });
    });

    it('includes expected state in UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          {
            "smartTransactionsState": {
              "fees": {
                "approvalTxFees": null,
                "tradeTxFees": null,
              },
              "feesByChainId": {
                "0x1": {
                  "approvalTxFees": null,
                  "tradeTxFees": null,
                },
                "0xaa36a7": {
                  "approvalTxFees": null,
                  "tradeTxFees": null,
                },
              },
              "liveness": true,
              "livenessByChainId": {
                "0x1": true,
                "0xaa36a7": true,
              },
              "smartTransactions": {
                "0x1": [],
              },
              "userOptIn": null,
              "userOptInV2": null,
            },
          }
        `);
      });
    });
  });
});

type WithControllerCallback<ReturnValue> = ({
  controller,
  triggerNetworStateChange,
}: {
  controller: SmartTransactionsController;
  triggerNetworStateChange: (state: NetworkState) => void;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<
    ConstructorParameters<typeof SmartTransactionsController>[0]
  >;
  getNonceLock?: TransactionControllerGetNonceLockAction['handler'];
  getTransactions?: TransactionControllerGetTransactionsAction['handler'];
  updateTransaction?: TransactionControllerUpdateTransactionAction['handler'];
  remoteFeatureFlags?: {
    smartTransactionsNetworks?: Record<string, unknown>;
  };
};

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options, and calls the given function
 * with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag is equivalent to the controller options; the function will be called
 * with the built controller.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const {
    options,
    getNonceLock = jest.fn().mockResolvedValue({
      nextNonce: 42,
      releaseLock: jest.fn(),
    }),
    getTransactions = jest.fn(),
    updateTransaction = jest.fn(),
    remoteFeatureFlags = {},
  } = rest;

  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    jest.fn().mockImplementation((networkClientId) => {
      switch (networkClientId) {
        case NetworkType.mainnet:
          return {
            configuration: {
              chainId: ChainId.mainnet,
            },
            provider: getFakeProvider(),
          };
        case NetworkType.sepolia:
          return {
            configuration: {
              chainId: ChainId.sepolia,
            },
            provider: getFakeProvider(),
          };
        default:
          throw new Error('Invalid network client id');
      }
    }),
  );
  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    jest.fn().mockReturnValue({
      selectedNetworkClientId: NetworkType.mainnet,
      networkConfigurationsByChainId: {
        '0x1': {
          blockExplorerUrls: ['https://etherscan.io'],
          chainId: '0x1',
          defaultBlockExplorerUrlIndex: 0,
          defaultRpcEndpointIndex: 0,
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          rpcEndpoints: [
            {
              networkClientId: NetworkType.mainnet,
              type: 'infura',
              url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
            },
          ],
        },
        '0xaa36a7': {
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
          chainId: '0xaa36a7',
          defaultBlockExplorerUrlIndex: 0,
          defaultRpcEndpointIndex: 0,
          name: 'Sepolia',
          nativeCurrency: 'SepoliaETH',
          rpcEndpoints: [
            {
              networkClientId: NetworkType.sepolia,
              type: 'infura',
              url: 'https://sepolia.infura.io/v3/{infuraProjectId}',
            },
          ],
        },
      },
    }),
  );
  rootMessenger.registerActionHandler(
    'TransactionController:getNonceLock',
    getNonceLock,
  );
  rootMessenger.registerActionHandler(
    'TransactionController:getTransactions',
    getTransactions,
  );
  rootMessenger.registerActionHandler(
    'TransactionController:updateTransaction',
    updateTransaction,
  );
  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    jest.fn().mockReturnValue({
      remoteFeatureFlags,
    }),
  );
  rootMessenger.registerActionHandler(
    'ErrorReportingService:captureException',
    jest.fn(),
  );

  const messenger = new Messenger<
    'SmartTransactionsController',
    AllActions,
    AllEvents,
    RootMessenger
  >({
    namespace: 'SmartTransactionsController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'NetworkController:getNetworkClientById',
      'NetworkController:getState',
      'RemoteFeatureFlagController:getState',
      'TransactionController:getNonceLock',
      'TransactionController:getTransactions',
      'TransactionController:updateTransaction',
      'ErrorReportingService:captureException',
    ],
    events: [
      'NetworkController:stateChange',
      'RemoteFeatureFlagController:stateChange',
    ],
  });

  const controller = new SmartTransactionsController({
    messenger,
    clientId: ClientId.Mobile,
    trackMetaMetricsEvent: trackMetaMetricsEventSpy,
    getMetaMetricsProps: jest.fn(async () => {
      return Promise.resolve({
        accountHardwareType: 'Ledger Hardware',
        accountType: 'hardware',
        deviceModel: 'ledger',
      });
    }),
    ...options,
  });

  function triggerNetworStateChange(state: NetworkState) {
    rootMessenger.publish('NetworkController:stateChange', state, []);
  }

  triggerNetworStateChange({
    selectedNetworkClientId: NetworkType.mainnet,
    networkConfigurationsByChainId: {
      [ChainId.mainnet]: {
        rpcEndpoints: [
          {
            type: RpcEndpointType.Custom,
            url: 'https://mainnet.infura.io/v3/123',
            networkClientId: 'id',
          },
        ],
        chainId: ChainId.mainnet,
        nativeCurrency: 'string',
        name: 'mainnet',
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
      },
    },
    networksMetadata: {
      id: {
        EIPS: {
          1155: true,
        },
        status: NetworkStatus.Available,
      },
    },
  });

  try {
    return await fn({
      controller,
      triggerNetworStateChange,
    });
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    controller.stop();
    controller.stopAllPolling();
  }
}
