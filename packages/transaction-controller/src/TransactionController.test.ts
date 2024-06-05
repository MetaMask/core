/* eslint-disable jest/expect-expect */
import type { TypedTransaction } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import type {
  AddApprovalRequest,
  AddResult,
} from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  NetworksTicker,
  toHex,
  BUILT_IN_NETWORKS,
  ORIGIN_METAMASK,
} from '@metamask/controller-utils';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import EthQuery from '@metamask/eth-query';
import HttpProvider from '@metamask/ethjs-provider-http';
import type {
  BlockTracker,
  NetworkController,
  NetworkState,
  Provider,
} from '@metamask/network-controller';
import { NetworkClientType, NetworkStatus } from '@metamask/network-controller';
import { errorCodes, providerErrors, rpcErrors } from '@metamask/rpc-errors';
import { createDeferredPromise } from '@metamask/utils';
import assert from 'assert';
import * as uuidModule from 'uuid';

import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { flushPromises } from '../../../tests/helpers';
import { mockNetwork } from '../../../tests/mock-network';
import { DefaultGasFeeFlow } from './gas-flows/DefaultGasFeeFlow';
import { LineaGasFeeFlow } from './gas-flows/LineaGasFeeFlow';
import { TestGasFeeFlow } from './gas-flows/TestGasFeeFlow';
import { GasFeePoller } from './helpers/GasFeePoller';
import { IncomingTransactionHelper } from './helpers/IncomingTransactionHelper';
import { MultichainTrackingHelper } from './helpers/MultichainTrackingHelper';
import { PendingTransactionTracker } from './helpers/PendingTransactionTracker';
import type {
  AllowedActions,
  AllowedEvents,
  TransactionControllerActions,
  TransactionControllerEvents,
} from './TransactionController';
import { TransactionController } from './TransactionController';
import type {
  TransactionMeta,
  DappSuggestedGasFees,
  TransactionParams,
  TransactionHistoryEntry,
  TransactionError,
  SimulationData,
  GasFeeFlow,
  GasFeeFlowResponse,
} from './types';
import {
  GasFeeEstimateType,
  SimulationErrorCode,
  SimulationTokenStandard,
  TransactionStatus,
  TransactionType,
  WalletDevice,
} from './types';
import { addGasBuffer, estimateGas, updateGas } from './utils/gas';
import { updateGasFees } from './utils/gas-fees';
import { getGasFeeFlow } from './utils/gas-flow';
import {
  getTransactionLayer1GasFee,
  updateTransactionLayer1GasFee,
} from './utils/layer1-gas-fee-flow';
import { getSimulationData } from './utils/simulation';
import {
  updatePostTransactionBalance,
  updateSwapsTransaction,
} from './utils/swaps';

type UnrestrictedControllerMessenger = ControllerMessenger<
  TransactionControllerActions | AllowedActions,
  TransactionControllerEvents | AllowedEvents
>;

type NetworkClient = ReturnType<NetworkController['getNetworkClientById']>;

type NetworkClientConfiguration = Pick<
  NetworkClient['configuration'],
  'chainId'
>;

const MOCK_V1_UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

jest.mock('@metamask/eth-query');
jest.mock('./gas-flows/DefaultGasFeeFlow');
jest.mock('./gas-flows/LineaGasFeeFlow');
jest.mock('./gas-flows/TestGasFeeFlow');
jest.mock('./helpers/GasFeePoller');
jest.mock('./helpers/IncomingTransactionHelper');
jest.mock('./helpers/MultichainTrackingHelper');
jest.mock('./helpers/PendingTransactionTracker');
jest.mock('./utils/gas');
jest.mock('./utils/gas-fees');
jest.mock('./utils/gas-flow');
jest.mock('./utils/swaps');
jest.mock('./utils/layer1-gas-fee-flow');
jest.mock('./utils/simulation');
jest.mock('uuid');

// TODO: Replace `any` with type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFlags: { [key: string]: any } = {
  estimateGasError: null,
  estimateGasValue: null,
  getBlockByNumberValue: null,
};

/**
 * Constructs an EthQuery for use in tests, with various methods replaced with
 * fake implementations.
 *
 * @returns The mock EthQuery instance.
 */
function buildMockEthQuery(): EthQuery {
  return {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimateGas: (_transaction: any, callback: any) => {
      if (mockFlags.estimateGasError) {
        callback(new Error(mockFlags.estimateGasError));
        return;
      }

      if (mockFlags.estimateGasValue) {
        callback(undefined, mockFlags.estimateGasValue);
        return;
      }
      callback(undefined, '0x0');
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gasPrice: (callback: any) => {
      callback(undefined, '0x0');
    },
    getBlockByNumber: (
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _blocknumber: any,
      _fetchTxs: boolean,
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: any,
    ) => {
      if (mockFlags.getBlockByNumberValue) {
        callback(undefined, { gasLimit: '0x12a05f200' });
        return;
      }
      callback(undefined, { gasLimit: '0x0' });
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getCode: (_to: any, callback: any) => {
      callback(undefined, '0x0');
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getTransactionByHash: (_hash: string, callback: any) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txs: any = [
        { blockNumber: '0x1', hash: '1337' },
        { blockNumber: null, hash: '1338' },
      ];
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx: any = txs.find((element: any) => element.hash === _hash);
      callback(undefined, tx);
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getTransactionCount: (_from: any, _to: any, callback: any) => {
      callback(undefined, '0x0');
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendRawTransaction: (_transaction: unknown, callback: any) => {
      callback(undefined, 'somehash');
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getTransactionReceipt: (_hash: any, callback: any) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txs: any = [
        {
          blockHash: '1337',
          gasUsed: '0x5208',
          hash: '1337',
          status: '0x1',
          transactionIndex: 1337,
        },
        {
          gasUsed: '0x1108',
          hash: '1111',
          status: '0x0',
          transactionIndex: 1111,
        },
      ];
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx: any = txs.find((element: any) => element.hash === _hash);
      callback(undefined, tx);
    },
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getBlockByHash: (_blockHash: any, callback: any) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks: any = [
        {
          baseFeePerGas: '0x14',
          hash: '1337',
          number: '0x1',
          timestamp: '628dc0c8',
        },
        { hash: '1338', number: '0x2' },
      ];
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const block: any = blocks.find(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (element: any) => element.hash === _blockHash,
      );
      callback(undefined, block);
    },
    sendAsync: () => {
      // do nothing
    },
  };
}

/**
 * Builds a mock block tracker with a canned block number that can be used in
 * tests.
 *
 * @param latestBlockNumber - The block number that the block tracker should
 * always return.
 * @param provider - json rpc provider
 * @returns The mocked block tracker.
 */
function buildMockBlockTracker(
  latestBlockNumber: string,
  provider: SafeEventEmitterProvider,
): BlockTracker {
  const fakeBlockTracker = new FakeBlockTracker({ provider });
  fakeBlockTracker.mockLatestBlockNumber(latestBlockNumber);
  return fakeBlockTracker;
}

/**
 * Builds a mock gas fee flow.
 * @returns The mocked gas fee flow.
 */
function buildMockGasFeeFlow(): jest.Mocked<GasFeeFlow> {
  return {
    matchesTransaction: jest.fn(),
    getGasFees: jest.fn(),
  };
}

/**
 * Wait for the controller to emit a transaction finished event.
 *
 * @param messenger - The messenger to monitor.
 * @param options - Options to customize the wait.
 * @param options.confirmed - Whether to wait for the transaction to be confirmed or just finished.
 * @returns A promise that resolves with the transaction meta when the transaction is finished.
 */
function waitForTransactionFinished(
  messenger: ControllerMessenger<
    TransactionControllerActions | AllowedActions,
    TransactionControllerEvents | AllowedEvents
  >,
  { confirmed = false } = {},
): Promise<TransactionMeta> {
  const eventName = confirmed
    ? 'TransactionController:transactionConfirmed'
    : 'TransactionController:transactionFinished';
  return new Promise((resolve) => {
    const subscriber = (transactionMeta: TransactionMeta) => {
      resolve(transactionMeta);
      messenger.unsubscribe(eventName, subscriber);
    };
    messenger.subscribe(eventName, subscriber);
  });
}

const MOCK_PREFERENCES = { state: { selectedAddress: 'foo' } };
const INFURA_PROJECT_ID = '341eacb578dd44a1a049cbc5f6fd4035';
const MAINNET_PROVIDER = new HttpProvider(
  `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
);
const PALM_PROVIDER = new HttpProvider(
  `https://palm-mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
);

type MockNetwork = {
  provider: Provider;
  blockTracker: BlockTracker;
  state: NetworkState;
  subscribe: (listener: (state: NetworkState) => void) => void;
};

const MOCK_NETWORK: MockNetwork = {
  provider: MAINNET_PROVIDER,
  blockTracker: buildMockBlockTracker('0x102833C', MAINNET_PROVIDER),
  state: {
    selectedNetworkClientId: NetworkType.goerli,
    networksMetadata: {
      [NetworkType.goerli]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType.goerli,
      chainId: ChainId.goerli,
      ticker: NetworksTicker.goerli,
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};
const MOCK_MAINNET_NETWORK: MockNetwork = {
  provider: MAINNET_PROVIDER,
  blockTracker: buildMockBlockTracker('0x102833C', MAINNET_PROVIDER),
  state: {
    selectedNetworkClientId: NetworkType.mainnet,
    networksMetadata: {
      [NetworkType.mainnet]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType.mainnet,
      chainId: ChainId.mainnet,
      ticker: NetworksTicker.mainnet,
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};

const MOCK_LINEA_MAINNET_NETWORK: MockNetwork = {
  provider: PALM_PROVIDER,
  blockTracker: buildMockBlockTracker('0xA6EDFC', PALM_PROVIDER),
  state: {
    selectedNetworkClientId: NetworkType['linea-mainnet'],
    networksMetadata: {
      [NetworkType['linea-mainnet']]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType['linea-mainnet'],
      chainId: toHex(59144),
      ticker: NetworksTicker['linea-mainnet'],
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};

const MOCK_LINEA_GOERLI_NETWORK: MockNetwork = {
  provider: PALM_PROVIDER,
  blockTracker: buildMockBlockTracker('0xA6EDFC', PALM_PROVIDER),
  state: {
    selectedNetworkClientId: NetworkType['linea-goerli'],
    networksMetadata: {
      [NetworkType['linea-goerli']]: {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType['linea-goerli'],
      chainId: toHex(59140),
      ticker: NetworksTicker['linea-goerli'],
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};

const MOCK_CUSTOM_NETWORK: MockNetwork = {
  provider: PALM_PROVIDER,
  blockTracker: buildMockBlockTracker('0xA6EDFC', PALM_PROVIDER),
  state: {
    selectedNetworkClientId: 'uuid-1',
    networksMetadata: {
      'uuid-1': {
        EIPS: { 1559: false },
        status: NetworkStatus.Available,
      },
    },
    providerConfig: {
      type: NetworkType.rpc,
      chainId: toHex(11297108109),
      ticker: 'TEST',
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};

const ACCOUNT_MOCK = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
const ACCOUNT_2_MOCK = '0x08f137f335ea1b8f193b8f6ea92561a60d23a211';
const NONCE_MOCK = 12;
const ACTION_ID_MOCK = '123456';
const CHAIN_ID_MOCK = MOCK_NETWORK.state.providerConfig.chainId;
const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';

const TRANSACTION_META_MOCK = {
  hash: '0x1',
  id: '1',
  status: TransactionStatus.confirmed as const,
  time: 123456789,
  txParams: {
    from: ACCOUNT_MOCK,
    to: ACCOUNT_2_MOCK,
    value: '0x42',
  },
} as TransactionMeta;

const TRANSACTION_META_2_MOCK = {
  hash: '0x2',
  status: TransactionStatus.confirmed as const,
  time: 987654321,
  txParams: {
    from: '0x3',
  },
} as TransactionMeta;

const SIMULATION_DATA_MOCK: SimulationData = {
  nativeBalanceChange: {
    previousBalance: '0x0',
    newBalance: '0x1',
    difference: '0x1',
    isDecrease: false,
  },
  tokenBalanceChanges: [
    {
      address: '0x123',
      standard: SimulationTokenStandard.erc721,
      id: '0x456',
      previousBalance: '0x1',
      newBalance: '0x3',
      difference: '0x2',
      isDecrease: false,
    },
  ],
};

const GAS_FEE_ESTIMATES_MOCK: GasFeeFlowResponse = {
  estimates: {
    type: GasFeeEstimateType.GasPrice,
    gasPrice: '0x1',
  },
};

describe('TransactionController', () => {
  const uuidModuleMock = jest.mocked(uuidModule);
  const EthQueryMock = jest.mocked(EthQuery);
  const updateGasMock = jest.mocked(updateGas);
  const updateGasFeesMock = jest.mocked(updateGasFees);
  const estimateGasMock = jest.mocked(estimateGas);
  const addGasBufferMock = jest.mocked(addGasBuffer);
  const updateSwapsTransactionMock = jest.mocked(updateSwapsTransaction);
  const updatePostTransactionBalanceMock = jest.mocked(
    updatePostTransactionBalance,
  );
  const defaultGasFeeFlowClassMock = jest.mocked(DefaultGasFeeFlow);
  const lineaGasFeeFlowClassMock = jest.mocked(LineaGasFeeFlow);
  const testGasFeeFlowClassMock = jest.mocked(TestGasFeeFlow);
  const gasFeePollerClassMock = jest.mocked(GasFeePoller);
  const getSimulationDataMock = jest.mocked(getSimulationData);
  const getTransactionLayer1GasFeeMock = jest.mocked(
    getTransactionLayer1GasFee,
  );
  const getGasFeeFlowMock = jest.mocked(getGasFeeFlow);

  let mockEthQuery: EthQuery;
  let getNonceLockSpy: jest.Mock;
  let incomingTransactionHelperMock: jest.Mocked<IncomingTransactionHelper>;
  let pendingTransactionTrackerMock: jest.Mocked<PendingTransactionTracker>;
  let multichainTrackingHelperMock: jest.Mocked<MultichainTrackingHelper>;
  let defaultGasFeeFlowMock: jest.Mocked<DefaultGasFeeFlow>;
  let lineaGasFeeFlowMock: jest.Mocked<LineaGasFeeFlow>;
  let testGasFeeFlowMock: jest.Mocked<TestGasFeeFlow>;
  let gasFeePollerMock: jest.Mocked<GasFeePoller>;
  let timeCounter = 0;

  const incomingTransactionHelperClassMock =
    IncomingTransactionHelper as jest.MockedClass<
      typeof IncomingTransactionHelper
    >;

  const pendingTransactionTrackerClassMock =
    PendingTransactionTracker as jest.MockedClass<
      typeof PendingTransactionTracker
    >;

  const multichainTrackingHelperClassMock =
    MultichainTrackingHelper as jest.MockedClass<
      typeof MultichainTrackingHelper
    >;

  /**
   * Constructs an instance of the TransactionController and supporting data for
   * use in tests.
   *
   * @param args - The arguments to this function.
   * @param args.options - TransactionController options.
   * @param args.network - The mock network to use with the controller.
   * @param args.messengerOptions - Options to build the mock unrestricted
   * messenger.
   * @param args.messengerOptions.addTransactionApprovalRequest - Options to mock
   * the `ApprovalController:addRequest` action call for transactions.
   * @returns The new TransactionController instance.
   */
  function setupController({
    options: givenOptions = {},
    network = MOCK_NETWORK,
    messengerOptions = {},
  }: {
    options?: Partial<ConstructorParameters<typeof TransactionController>[0]>;
    network?: MockNetwork;
    messengerOptions?: {
      addTransactionApprovalRequest?: Parameters<
        typeof mockAddTransactionApprovalRequest
      >[1];
    };
  } = {}) {
    const unrestrictedMessenger: UnrestrictedControllerMessenger =
      new ControllerMessenger();

    const { addTransactionApprovalRequest = { state: 'pending' } } =
      messengerOptions;
    const mockTransactionApprovalRequest = mockAddTransactionApprovalRequest(
      unrestrictedMessenger,
      addTransactionApprovalRequest,
    );

    const { messenger: givenRestrictedMessenger, ...otherOptions } = {
      disableHistory: false,
      disableSendFlowHistory: false,
      disableSwaps: false,
      getCurrentNetworkEIP1559Compatibility: async () => false,
      getGlobalProviderAndBlockTracker: () => ({
        provider: network.provider,
        blockTracker: network.blockTracker,
      }),
      getNetworkState: () => network.state,
      // TODO: Replace with a real type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getNetworkClientRegistry: () => ({} as any),
      getPermittedAccounts: async () => [ACCOUNT_MOCK],
      getSelectedAddress: () => ACCOUNT_MOCK,
      isMultichainEnabled: false,
      hooks: {},
      onNetworkStateChange: network.subscribe,
      sign: async (transaction: TypedTransaction) => transaction,
      transactionHistoryLimit: 40,
      ...givenOptions,
    };

    const restrictedMessenger =
      givenRestrictedMessenger ??
      unrestrictedMessenger.getRestricted({
        name: 'TransactionController',
        allowedActions: [
          'ApprovalController:addRequest',
          'NetworkController:getNetworkClientById',
          'NetworkController:findNetworkClientIdByChainId',
        ],
        allowedEvents: [],
      });

    const controller = new TransactionController({
      ...otherOptions,
      messenger: restrictedMessenger,
    });

    return {
      controller,
      messenger: unrestrictedMessenger,
      mockTransactionApprovalRequest,
    };
  }

  /**
   * Mocks the `ApprovalController:addRequest` action that the
   * TransactionController calls as it creates transactions.
   *
   * This helper allows the `addRequest` action to be in one of three states:
   * approved, rejected, or pending. In the approved state, the promise which the
   * action returns is resolved ahead of time, and in the rejected state, the
   * promise is rejected ahead of time. Otherwise, in the pending state, the
   * promise is unresolved and it is assumed that the test will resolve or reject
   * the promise.
   *
   * @param messenger - The unrestricted messenger.
   * @param options - Options for the mock. `state` controls the state of the
   * promise as outlined above. Note, if the `state` is approved, then its
   * `result` may be specified; if the `state` is rejected, then its `error` may
   * be specified.
   * @returns An object which contains the aforementioned promise, functions to
   * manually approve or reject the approval (and therefore the promise), and
   * finally the mocked version of the action handler itself.
   */
  function mockAddTransactionApprovalRequest(
    messenger: UnrestrictedControllerMessenger,
    options:
      | {
          state: 'approved';
          result?: Partial<AddResult>;
        }
      | {
          state: 'rejected';
          error?: unknown;
        }
      | {
          state: 'pending';
        },
  ): {
    promise: Promise<AddResult>;
    approve: (approvalResult?: Partial<AddResult>) => void;
    reject: (rejectionError: unknown) => void;
    actionHandlerMock: jest.Mock<
      ReturnType<AddApprovalRequest['handler']>,
      Parameters<AddApprovalRequest['handler']>
    >;
  } {
    const { promise, resolve, reject } = createDeferredPromise<AddResult>();

    const approveTransaction = (approvalResult?: Partial<AddResult>) => {
      resolve({
        resultCallbacks: {
          success() {
            // do nothing
          },
          error() {
            // do nothing
          },
        },
        ...approvalResult,
      });
    };

    const rejectTransaction = (
      rejectionError: unknown = {
        code: errorCodes.provider.userRejectedRequest,
      },
    ) => {
      reject(rejectionError);
    };

    const actionHandlerMock: jest.Mock<
      ReturnType<AddApprovalRequest['handler']>,
      Parameters<AddApprovalRequest['handler']>
    > = jest.fn().mockReturnValue(promise);

    if (options.state === 'approved') {
      approveTransaction(options.result);
    } else if (options.state === 'rejected') {
      rejectTransaction(options.error);
    }

    messenger.registerActionHandler(
      'ApprovalController:addRequest',
      actionHandlerMock,
    );

    return {
      promise,
      approve: approveTransaction,
      reject: rejectTransaction,
      actionHandlerMock,
    };
  }

  /**
   * Builds a network client that is only used in tests to get a chain ID.
   *
   * @param networkClient - The properties in the desired network client.
   * Only needs to contain `configuration`.
   * @param networkClient.configuration - The desired network client
   * configuration. Only needs to contain `chainId`>
   * @returns The network client.
   */
  function buildMockNetworkClient(networkClient: {
    configuration: NetworkClientConfiguration;
  }): NetworkClient {
    // Type assertion: We don't expect anything but the configuration to get used.
    return networkClient as unknown as NetworkClient;
  }

  /**
   * Wait for a specified number of milliseconds.
   *
   * @param ms - The number of milliseconds to wait.
   */
  async function wait(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => {
      timeCounter += 1;
      return timeCounter;
    });

    for (const key of Object.keys(mockFlags)) {
      mockFlags[key] = null;
    }

    uuidModuleMock.v1.mockReturnValue(MOCK_V1_UUID);

    mockEthQuery = buildMockEthQuery();
    EthQueryMock.mockImplementation(() => mockEthQuery);

    getNonceLockSpy = jest.fn().mockResolvedValue({
      nextNonce: NONCE_MOCK,
      releaseLock: () => Promise.resolve(),
    });

    incomingTransactionHelperClassMock.mockImplementation(() => {
      incomingTransactionHelperMock = {
        start: jest.fn(),
        stop: jest.fn(),
        update: jest.fn(),
        hub: {
          on: jest.fn(),
          removeAllListeners: jest.fn(),
        },
      } as unknown as jest.Mocked<IncomingTransactionHelper>;
      return incomingTransactionHelperMock;
    });

    pendingTransactionTrackerClassMock.mockImplementation(() => {
      pendingTransactionTrackerMock = {
        start: jest.fn(),
        stop: jest.fn(),
        startIfPendingTransactions: jest.fn(),
        hub: {
          on: jest.fn(),
          removeAllListeners: jest.fn(),
        },
        onStateChange: jest.fn(),
        forceCheckTransaction: jest.fn(),
      } as unknown as jest.Mocked<PendingTransactionTracker>;
      return pendingTransactionTrackerMock;
    });

    multichainTrackingHelperClassMock.mockImplementation(
      ({ getGlobalProviderAndBlockTracker }) => {
        multichainTrackingHelperMock = {
          getEthQuery: jest.fn().mockImplementation(() => {
            return new EthQuery(
              getGlobalProviderAndBlockTracker()?.provider as Provider,
            );
          }),
          getProvider: jest.fn().mockImplementation(() => {
            return getGlobalProviderAndBlockTracker()?.provider as Provider;
          }),
          checkForPendingTransactionAndStartPolling: jest.fn(),
          getNonceLock: getNonceLockSpy,
          initialize: jest.fn(),
          has: jest.fn().mockReturnValue(false),
        } as unknown as jest.Mocked<MultichainTrackingHelper>;
        return multichainTrackingHelperMock;
      },
    );

    defaultGasFeeFlowClassMock.mockImplementation(() => {
      defaultGasFeeFlowMock = {
        matchesTransaction: () => false,
      } as unknown as jest.Mocked<DefaultGasFeeFlow>;
      return defaultGasFeeFlowMock;
    });

    lineaGasFeeFlowClassMock.mockImplementation(() => {
      lineaGasFeeFlowMock = {
        matchesTransaction: () => false,
      } as unknown as jest.Mocked<LineaGasFeeFlow>;
      return lineaGasFeeFlowMock;
    });

    testGasFeeFlowClassMock.mockImplementation(() => {
      testGasFeeFlowMock = {
        matchesTransaction: () => false,
      } as unknown as jest.Mocked<TestGasFeeFlow>;
      return testGasFeeFlowMock;
    });

    gasFeePollerClassMock.mockImplementation(() => {
      gasFeePollerMock = {
        hub: {
          on: jest.fn(),
        },
      } as unknown as jest.Mocked<GasFeePoller>;
      return gasFeePollerMock;
    });

    updateSwapsTransactionMock.mockImplementation(
      (transactionMeta) => transactionMeta,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('sets default state', () => {
      const { controller } = setupController();
      expect(controller.state).toStrictEqual({
        methodData: {},
        transactions: [],
        lastFetchedBlockNumbers: {},
      });
    });

    it('provides gas fee flows to GasFeePoller in correct order', () => {
      setupController();

      expect(gasFeePollerClassMock).toHaveBeenCalledTimes(1);
      expect(gasFeePollerClassMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gasFeeFlows: [lineaGasFeeFlowMock, defaultGasFeeFlowMock],
        }),
      );
    });

    it('provides only test flow if option set', () => {
      setupController({
        options: {
          testGasFeeFlows: true,
        },
      });

      expect(gasFeePollerClassMock).toHaveBeenCalledTimes(1);
      expect(gasFeePollerClassMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gasFeeFlows: [testGasFeeFlowMock],
        }),
      );
    });

    it('checks pending transactions', () => {
      expect(
        pendingTransactionTrackerMock.startIfPendingTransactions,
      ).toHaveBeenCalledTimes(0);

      setupController();

      expect(
        pendingTransactionTrackerMock.startIfPendingTransactions,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('estimateGas', () => {
    it('returns estimatedGas and simulation fails', async () => {
      const gasMock = '0x123';

      const simulationFailsMock = {
        errorKey: 'testKey',
      };

      const { controller } = setupController();

      estimateGasMock.mockResolvedValue({
        estimatedGas: gasMock,
        simulationFails: simulationFailsMock,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const { gas, simulationFails } = await controller.estimateGas({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(gas).toBe(gasMock);
      expect(simulationFails).toBe(simulationFailsMock);
    });
  });

  describe('estimateGasBuffered', () => {
    it('returns estimated gas and simulation fails', async () => {
      const gasMock = '0x123';
      const blockGasLimitMock = '0x1234';
      const expectedEstimatedGas = '0x12345';
      const multiplierMock = 1;
      const transactionParamsMock = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      };

      const simulationFailsMock = {
        errorKey: 'testKey',
        reason: 'testReason',
        debug: {
          blockNumber: '123',
          blockGasLimit: '1234',
        },
      };

      const { controller } = setupController();

      estimateGasMock.mockResolvedValue({
        estimatedGas: gasMock,
        blockGasLimit: blockGasLimitMock,
        simulationFails: simulationFailsMock,
      });

      addGasBufferMock.mockReturnValue(expectedEstimatedGas);

      const { gas, simulationFails } = await controller.estimateGasBuffered(
        transactionParamsMock,
        multiplierMock,
      );

      expect(estimateGasMock).toHaveBeenCalledTimes(1);
      expect(estimateGasMock).toHaveBeenCalledWith(
        transactionParamsMock,
        expect.anything(),
      );

      expect(addGasBufferMock).toHaveBeenCalledTimes(1);
      expect(addGasBufferMock).toHaveBeenCalledWith(
        gasMock,
        blockGasLimitMock,
        multiplierMock,
      );

      expect(gas).toBe(expectedEstimatedGas);
      expect(simulationFails).toBe(simulationFailsMock);
    });
  });

  describe('with actionId', () => {
    it('adds single unapproved transaction when called twice with same actionId', async () => {
      const { controller, mockTransactionApprovalRequest } = setupController();

      const mockOrigin = 'origin';

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          origin: mockOrigin,
          actionId: ACTION_ID_MOCK,
        },
      );

      const firstTransactionCount = controller.state.transactions.length;

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          origin: mockOrigin,
          actionId: ACTION_ID_MOCK,
        },
      );
      const secondTransactionCount = controller.state.transactions.length;

      expect(firstTransactionCount).toStrictEqual(secondTransactionCount);
      expect(
        mockTransactionApprovalRequest.actionHandlerMock,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockTransactionApprovalRequest.actionHandlerMock,
      ).toHaveBeenCalledWith(
        {
          id: expect.any(String),
          origin: mockOrigin,
          type: 'transaction',
          requestData: { txId: expect.any(String) },
          expectsResult: true,
        },
        true,
      );
    });

    it('adds multiple transactions with same actionId and ensures second transaction result does not resolves before the first transaction result', async () => {
      const { controller, mockTransactionApprovalRequest } = setupController();

      const mockOrigin = 'origin';
      let firstTransactionCompleted = false;
      let secondTransactionCompleted = false;

      const { result: firstResult } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          origin: mockOrigin,
          actionId: ACTION_ID_MOCK,
        },
      );

      firstResult
        .then(() => {
          firstTransactionCompleted = true;
        })
        .catch(() => undefined);

      const { result: secondResult } = await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          origin: mockOrigin,
          actionId: ACTION_ID_MOCK,
        },
      );
      secondResult
        .then(() => {
          secondTransactionCompleted = true;
        })
        .catch(() => undefined);

      await wait(0);

      expect(firstTransactionCompleted).toBe(false);
      expect(secondTransactionCompleted).toBe(false);

      mockTransactionApprovalRequest.approve();
      await firstResult;
      await secondResult;

      expect(firstTransactionCompleted).toBe(true);
      expect(secondTransactionCompleted).toBe(true);
    });

    it.each([
      [
        'does not add duplicate transaction if actionId already used',
        ACTION_ID_MOCK,
        ACTION_ID_MOCK,
        1,
      ],
      [
        'adds additional transaction if actionId not used',
        ACTION_ID_MOCK,
        '00000',
        2,
      ],
    ])(
      '%s',
      async (_, firstActionId, secondActionId, expectedTransactionCount) => {
        const { controller, mockTransactionApprovalRequest } =
          setupController();
        const expectedRequestApprovalCalledTimes = expectedTransactionCount;

        const mockOrigin = 'origin';

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            origin: mockOrigin,
            actionId: firstActionId,
          },
        );

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            origin: mockOrigin,
            actionId: secondActionId,
          },
        );
        const { transactions } = controller.state;

        expect(transactions).toHaveLength(expectedTransactionCount);
        expect(
          mockTransactionApprovalRequest.actionHandlerMock,
        ).toHaveBeenCalledTimes(expectedRequestApprovalCalledTimes);
      },
    );

    it.each([
      [
        'adds single transaction when speed up called twice with the same actionId',
        ACTION_ID_MOCK,
        2,
        1,
      ],
      [
        'adds multiple transactions when speed up called with non-existent actionId',
        '00000',
        3,
        2,
      ],
    ])(
      '%s',
      async (
        _,
        actionId,
        expectedTransactionCount,
        expectedSignCalledTimes,
      ) => {
        const { controller } = setupController();
        const signSpy = jest.spyOn(controller, 'sign');

        const { transactionMeta } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x50fd51da',
          to: ACCOUNT_MOCK,
          value: '0x0',
        });
        await controller.speedUpTransaction(transactionMeta.id, undefined, {
          actionId: ACTION_ID_MOCK,
        });

        await controller.speedUpTransaction(transactionMeta.id, undefined, {
          actionId,
        });

        const { transactions } = controller.state;
        expect(transactions).toHaveLength(expectedTransactionCount);
        expect(signSpy).toHaveBeenCalledTimes(expectedSignCalledTimes);
      },
    );
  });

  describe('addTransaction', () => {
    it('adds unapproved transaction to state', async () => {
      const { controller } = setupController();

      const mockDeviceConfirmedOn = WalletDevice.OTHER;
      const mockOrigin = 'origin';
      const mockSecurityAlertResponse = {
        result_type: 'Malicious',
        reason: 'blur_farming',
        description:
          'A SetApprovalForAll request was made on {contract}. We found the operator {operator} to be malicious',
        args: {
          contract: '0xa7206d878c5c3871826dfdb42191c49b1d11f466',
          operator: '0x92a3b9773b1763efa556f55ccbeb20441962d9b2',
        },
      };
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          deviceConfirmedOn: mockDeviceConfirmedOn,
          origin: mockOrigin,
          securityAlertResponse: mockSecurityAlertResponse,
          sendFlowHistory: mockSendFlowHistory,
        },
      );

      const transactionMeta = controller.state.transactions[0];

      expect(updateSwapsTransactionMock).toHaveBeenCalledTimes(1);
      expect(transactionMeta.txParams.from).toBe(ACCOUNT_MOCK);
      expect(transactionMeta.chainId).toBe(
        MOCK_NETWORK.state.providerConfig.chainId,
      );
      expect(transactionMeta.deviceConfirmedOn).toBe(mockDeviceConfirmedOn);
      expect(transactionMeta.origin).toBe(mockOrigin);
      expect(transactionMeta.status).toBe(TransactionStatus.unapproved);
      expect(transactionMeta.securityAlertResponse).toStrictEqual(
        mockSecurityAlertResponse,
      );
      expect(controller.state.transactions[0].sendFlowHistory).toStrictEqual(
        mockSendFlowHistory,
      );
    });

    describe('networkClientId exists in the MultichainTrackingHelper', () => {
      it('adds unapproved transaction to state when using networkClientId', async () => {
        const { controller, messenger } = setupController({
          options: { isMultichainEnabled: true },
        });
        messenger.registerActionHandler(
          'NetworkController:getNetworkClientById',
          (networkClientId) => {
            switch (networkClientId) {
              case 'sepolia':
                return buildMockNetworkClient({
                  configuration: {
                    chainId: ChainId.sepolia,
                  },
                });
              default:
                throw new Error(
                  `Unknown network client ID: ${networkClientId}`,
                );
            }
          },
        );
        const sepoliaTxParams: TransactionParams = {
          chainId: ChainId.sepolia,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        };

        multichainTrackingHelperMock.has.mockReturnValue(true);

        await controller.addTransaction(sepoliaTxParams, {
          origin: 'metamask',
          actionId: ACTION_ID_MOCK,
          networkClientId: 'sepolia',
        });

        const transactionMeta = controller.state.transactions[0];

        expect(transactionMeta.txParams.from).toStrictEqual(
          sepoliaTxParams.from,
        );
        expect(transactionMeta.chainId).toStrictEqual(sepoliaTxParams.chainId);
        expect(transactionMeta.networkClientId).toBe('sepolia');
        expect(transactionMeta.origin).toBe('metamask');
      });

      it('adds unapproved transaction with networkClientId and can be updated to submitted', async () => {
        const { controller, messenger } = setupController({
          options: { isMultichainEnabled: true },
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
            },
          },
        });
        messenger.registerActionHandler(
          'NetworkController:getNetworkClientById',
          (networkClientId) => {
            switch (networkClientId) {
              case 'sepolia':
                return buildMockNetworkClient({
                  configuration: {
                    chainId: ChainId.sepolia,
                  },
                });
              default:
                throw new Error(
                  `Unknown network client ID: ${networkClientId}`,
                );
            }
          },
        );
        multichainTrackingHelperMock.has.mockReturnValue(true);

        const submittedEventListener = jest.fn();
        messenger.subscribe(
          'TransactionController:transactionSubmitted',
          submittedEventListener,
        );

        const sepoliaTxParams: TransactionParams = {
          chainId: ChainId.sepolia,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        };

        const { result } = await controller.addTransaction(sepoliaTxParams, {
          origin: 'metamask',
          actionId: ACTION_ID_MOCK,
          networkClientId: 'sepolia',
        });

        await result;

        const { txParams, status, networkClientId, chainId } =
          controller.state.transactions[0];
        expect(submittedEventListener).toHaveBeenCalledTimes(1);
        expect(txParams.from).toBe(ACCOUNT_MOCK);
        expect(networkClientId).toBe('sepolia');
        expect(chainId).toBe(ChainId.sepolia);
        expect(status).toBe(TransactionStatus.submitted);
      });
    });

    it('generates initial history', async () => {
      const { controller } = setupController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      await flushPromises();

      const expectedInitialSnapshot = {
        actionId: undefined,
        chainId: expect.any(String),
        dappSuggestedGasFees: undefined,
        deviceConfirmedOn: undefined,
        id: expect.any(String),
        networkClientId: MOCK_NETWORK.state.selectedNetworkClientId,
        origin: undefined,
        securityAlertResponse: undefined,
        sendFlowHistory: expect.any(Array),
        status: TransactionStatus.unapproved as const,
        time: expect.any(Number),
        txParams: expect.anything(),
        userEditedGasLimit: false,
        type: TransactionType.simpleSend,
        verifiedOnBlockchain: expect.any(Boolean),
      };

      // Expect initial snapshot to be in place
      expect(controller.state.transactions[0].history).toStrictEqual([
        expectedInitialSnapshot,
      ]);
    });

    describe('adds dappSuggestedGasFees to transaction', () => {
      it.each([
        ['origin is MM', ORIGIN_METAMASK],
        ['origin is not defined', undefined],
        ['no fee information is given', 'MockDappOrigin'],
      ])('as undefined if %s', async (_testName, origin) => {
        const { controller } = setupController();
        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            origin,
          },
        );
        expect(
          controller.state.transactions[0]?.dappSuggestedGasFees,
        ).toBeUndefined();
      });

      it.each<[keyof DappSuggestedGasFees]>([
        ['gasPrice'],
        ['maxFeePerGas'],
        ['maxPriorityFeePerGas'],
        ['gas'],
      ])(
        'if %s is defined',
        async (gasPropName: keyof DappSuggestedGasFees) => {
          const { controller } = setupController();
          const mockDappOrigin = 'MockDappOrigin';
          const mockGasValue = '0x1';
          await controller.addTransaction(
            {
              from: ACCOUNT_MOCK,
              to: ACCOUNT_MOCK,
              [gasPropName]: mockGasValue,
            },
            {
              origin: mockDappOrigin,
            },
          );
          expect(
            controller.state.transactions[0]?.dappSuggestedGasFees?.[
              gasPropName
            ],
          ).toBe(mockGasValue);
        },
      );
    });

    it.each([
      ['mainnet', MOCK_MAINNET_NETWORK],
      ['custom network', MOCK_CUSTOM_NETWORK],
    ])(
      'adds unapproved transaction to state after switching to %s',
      async (_networkName, newNetwork) => {
        const getNetworkState = jest.fn().mockReturnValue(MOCK_NETWORK.state);

        let networkStateChangeListener: ((state: NetworkState) => void) | null =
          null;

        const onNetworkStateChange = (
          listener: (state: NetworkState) => void,
        ) => {
          networkStateChangeListener = listener;
        };

        const { controller } = setupController({
          options: { getNetworkState, onNetworkStateChange },
        });

        // switch from Goerli to Mainnet
        getNetworkState.mockReturnValue(newNetwork.state);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        networkStateChangeListener!(newNetwork.state);

        await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        expect(controller.state.transactions[0].txParams.from).toBe(
          ACCOUNT_MOCK,
        );
        expect(controller.state.transactions[0].chainId).toBe(
          newNetwork.state.providerConfig.chainId,
        );
        expect(controller.state.transactions[0].status).toBe(
          TransactionStatus.unapproved,
        );
      },
    );

    it('throws if address invalid', async () => {
      const { controller } = setupController();
      await expect(controller.addTransaction({ from: 'foo' })).rejects.toThrow(
        'Invalid "from" address',
      );
    });

    it('increments nonce when adding a new non-cancel non-speedup transaction', async () => {
      uuidModuleMock.v1
        .mockImplementationOnce(() => 'aaaab1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')
        .mockImplementationOnce(() => 'bbbb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');

      const { controller } = setupController({
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { result: firstResult } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await firstResult.catch(() => undefined);

      const firstTransaction = controller.state.transactions[0];

      // eslint-disable-next-line jest/prefer-spy-on
      multichainTrackingHelperMock.getNonceLock = jest.fn().mockResolvedValue({
        nextNonce: NONCE_MOCK + 1,
        releaseLock: () => Promise.resolve(),
      });

      const { result: secondResult } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x2',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x1290',
      });

      await secondResult.catch(() => undefined);

      expect(controller.state.transactions).toHaveLength(2);
      const secondTransaction = controller.state.transactions[1];

      expect(firstTransaction.txParams.nonce).toBe(
        `0x${NONCE_MOCK.toString(16)}`,
      );

      expect(secondTransaction.txParams.nonce).toBe(
        `0x${(NONCE_MOCK + 1).toString(16)}`,
      );
    });

    it('requests approval using the approval controller', async () => {
      const { controller, messenger } = setupController();
      jest.spyOn(messenger, 'call');

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(messenger.call).toHaveBeenCalledTimes(1);
      expect(messenger.call).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: expect.any(String),
          origin: 'metamask',
          type: 'transaction',
          requestData: { txId: expect.any(String) },
          expectsResult: true,
        },
        true,
      );
    });

    it('skips approval if option explicitly false', async () => {
      const { controller, messenger } = setupController();
      jest.spyOn(messenger, 'call');

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          requireApproval: false,
        },
      );

      expect(messenger.call).toHaveBeenCalledTimes(0);
    });

    it('calls security provider with transaction meta and sets response in to securityProviderResponse', async () => {
      const mockRPCMethodName = 'MOCK_RPC_METHOD_NAME';
      const mockSecurityProviderResponse = {
        flagAsDangerous: 1,
        info: 'Mock info',
      };
      const securityProviderRequestMock = jest
        .fn()
        .mockResolvedValue(mockSecurityProviderResponse);

      const { controller } = setupController({
        options: {
          securityProviderRequest: securityProviderRequestMock,
        },
      });

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          method: mockRPCMethodName,
        },
      );

      expect(securityProviderRequestMock).toHaveBeenCalledTimes(1);
      expect(securityProviderRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: MOCK_V1_UUID,
        }),
        mockRPCMethodName,
      );

      const { securityProviderResponse } = controller.state.transactions[0];
      expect(securityProviderResponse).toStrictEqual(
        mockSecurityProviderResponse,
      );
    });

    it('updates gas properties', async () => {
      const { controller } = setupController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(updateGasMock).toHaveBeenCalledTimes(1);
      expect(updateGasMock).toHaveBeenCalledWith({
        ethQuery: expect.any(Object),
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
        isCustomNetwork:
          MOCK_NETWORK.state.providerConfig.type === NetworkType.rpc,
        txMeta: expect.any(Object),
      });
    });

    it('updates gas fee properties', async () => {
      const { controller } = setupController({
        options: {
          getCurrentNetworkEIP1559Compatibility: async () => true,
          getCurrentAccountEIP1559Compatibility: async () => true,
        },
      });

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(updateGasFeesMock).toHaveBeenCalledTimes(1);
      expect(updateGasFeesMock).toHaveBeenCalledWith({
        eip1559: true,
        ethQuery: expect.any(Object),
        gasFeeFlows: [lineaGasFeeFlowMock, defaultGasFeeFlowMock],
        getGasFeeEstimates: expect.any(Function),
        getSavedGasFees: expect.any(Function),
        txMeta: expect.any(Object),
      });
    });

    describe('updates simulation data', () => {
      it('by default', async () => {
        getSimulationDataMock.mockResolvedValueOnce(SIMULATION_DATA_MOCK);

        const { controller } = setupController();

        await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        await flushPromises();

        expect(getSimulationDataMock).toHaveBeenCalledTimes(1);
        expect(getSimulationDataMock).toHaveBeenCalledWith({
          chainId: MOCK_NETWORK.state.providerConfig.chainId,
          data: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
          value: '0x0',
        });

        expect(controller.state.transactions[0].simulationData).toStrictEqual(
          SIMULATION_DATA_MOCK,
        );
      });

      it('with error if simulation disabled', async () => {
        getSimulationDataMock.mockResolvedValueOnce(SIMULATION_DATA_MOCK);

        const { controller } = setupController({
          options: { isSimulationEnabled: () => false },
        });

        await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        expect(getSimulationDataMock).toHaveBeenCalledTimes(0);
        expect(controller.state.transactions[0].simulationData).toStrictEqual({
          error: {
            code: SimulationErrorCode.Disabled,
            message: 'Simulation disabled',
          },
          tokenBalanceChanges: [],
        });
      });

      it('unless approval not required', async () => {
        getSimulationDataMock.mockResolvedValueOnce(SIMULATION_DATA_MOCK);

        const { controller } = setupController();

        await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          { requireApproval: false },
        );

        expect(getSimulationDataMock).toHaveBeenCalledTimes(0);
        expect(controller.state.transactions[0].simulationData).toBeUndefined();
      });
    });

    describe('on approve', () => {
      it('submits transaction', async () => {
        const { controller, messenger } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
            },
          },
        });
        const submittedEventListener = jest.fn();
        messenger.subscribe(
          'TransactionController:transactionSubmitted',
          submittedEventListener,
        );

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x0',
          to: ACCOUNT_MOCK,
          value: '0x0',
        });

        await result;

        expect(controller.state.transactions).toMatchObject([
          expect.objectContaining({
            txParams: expect.objectContaining({
              from: ACCOUNT_MOCK,
              nonce: toHex(NONCE_MOCK),
            }),
            status: TransactionStatus.submitted,
            submittedTime: expect.any(Number),
          }),
        ]);

        expect(submittedEventListener).toHaveBeenCalledTimes(1);
        expect(submittedEventListener).toHaveBeenCalledWith({
          transactionMeta: expect.objectContaining({
            txParams: expect.objectContaining({
              from: ACCOUNT_MOCK,
              nonce: toHex(NONCE_MOCK),
            }),
            status: TransactionStatus.submitted,
            submittedTime: expect.any(Number),
          }),
        });
      });

      it('reports success to approval acceptor', async () => {
        const successCallback = jest.fn();
        const { controller } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
              result: {
                resultCallbacks: {
                  success: successCallback,
                  error: () => {
                    // do nothing
                  },
                },
              },
            },
          },
        });

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        await result;

        expect(successCallback).toHaveBeenCalledTimes(1);
      });

      it('reports error to approval acceptor on error', async () => {
        const errorCallback = jest.fn();
        const { controller } = setupController({
          options: { sign: undefined },
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'approved',
              result: {
                resultCallbacks: {
                  success: () => {
                    // do nothing
                  },
                  error: errorCallback,
                },
              },
            },
          },
        });

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        try {
          await result;
        } catch {
          // Expected error
        }

        expect(errorCallback).toHaveBeenCalledTimes(1);
      });

      it('updates transaction if approval result includes updated metadata', async () => {
        const { controller, mockTransactionApprovalRequest } =
          setupController();

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        const transaction = controller.state.transactions[0];

        mockTransactionApprovalRequest.approve({
          value: {
            txMeta: { ...transaction, customNonceValue: '123' },
          },
        });

        await result;

        expect(controller.state.transactions).toStrictEqual([
          expect.objectContaining({
            customNonceValue: '123',
          }),
        ]);
      });

      describe('fails', () => {
        /**
         * Test template to assert adding and submitting a transaction fails.
         *
         * @param controller - The controller instance.
         * @param expectedError - The expected error message.
         */
        async function expectTransactionToFail(
          controller: TransactionController,
          expectedError: string,
        ) {
          const { result } = await controller.addTransaction({
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          });

          await expect(result).rejects.toThrow(expectedError);

          const { txParams, status } = controller.state.transactions[0];
          expect(txParams.from).toBe(ACCOUNT_MOCK);
          expect(txParams.to).toBe(ACCOUNT_MOCK);
          expect(status).toBe(TransactionStatus.failed);
        }

        it('if signing error', async () => {
          const { controller } = setupController({
            options: {
              sign: () => {
                throw new Error('foo');
              },
            },
            messengerOptions: {
              addTransactionApprovalRequest: {
                state: 'approved',
              },
            },
          });

          await expectTransactionToFail(controller, 'foo');
        });

        it('if no sign method defined', async () => {
          const { controller } = setupController({
            options: {
              sign: undefined,
            },
            messengerOptions: {
              addTransactionApprovalRequest: {
                state: 'approved',
              },
            },
          });

          await expectTransactionToFail(controller, 'No sign method defined');
        });

        it('if unexpected status', async () => {
          const { controller, messenger } = setupController();

          jest.spyOn(messenger, 'call').mockImplementationOnce(() => {
            throw new Error('Unknown problem');
          });

          const { result } = await controller.addTransaction({
            from: ACCOUNT_MOCK,
            gas: '0x0',
            gasPrice: '0x0',
            to: ACCOUNT_MOCK,
            value: '0x0',
          });

          await expect(result).rejects.toThrow('Unknown problem');
        });

        it('if unrecognised error', async () => {
          const { controller, messenger } = setupController();

          jest.spyOn(messenger, 'call').mockImplementationOnce(() => {
            throw new Error('TestError');
          });

          const { result } = await controller.addTransaction({
            from: ACCOUNT_MOCK,
            gas: '0x0',
            gasPrice: '0x0',
            to: ACCOUNT_MOCK,
            value: '0x0',
          });

          await expect(result).rejects.toThrow('TestError');
        });

        it('if transaction removed', async () => {
          const { controller, messenger } = setupController();

          jest.spyOn(messenger, 'call').mockImplementationOnce(() => {
            controller.clearUnapprovedTransactions();
            throw new Error('Unknown problem');
          });

          const { result } = await controller.addTransaction({
            from: ACCOUNT_MOCK,
            gas: '0x0',
            gasPrice: '0x0',
            to: ACCOUNT_MOCK,
            value: '0x0',
          });

          await expect(result).rejects.toThrow('Unknown problem');
        });
      });
    });

    describe('on reject', () => {
      it('cancels transaction', async () => {
        const { controller, messenger } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'rejected',
            },
          },
        });

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        const finishedPromise = waitForTransactionFinished(messenger);

        await expect(result).rejects.toThrow(
          'MetaMask Tx Signature: User denied transaction signature.',
        );

        const { txParams, status } = await finishedPromise;
        expect(txParams.from).toBe(ACCOUNT_MOCK);
        expect(status).toBe(TransactionStatus.rejected);
      });

      it('publishes TransactionController:transactionRejected and TransactionController:transactionFinished', async () => {
        const { controller, messenger } = setupController({
          messengerOptions: {
            addTransactionApprovalRequest: {
              state: 'rejected',
            },
          },
        });
        const rejectedEventListener = jest.fn();

        messenger.subscribe(
          'TransactionController:transactionRejected',
          rejectedEventListener,
        );

        const mockActionId = 'mockActionId';

        const { result, transactionMeta } = await controller.addTransaction(
          {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_MOCK,
          },
          {
            actionId: mockActionId,
          },
        );

        const finishedPromise = waitForTransactionFinished(messenger);

        try {
          await result;
        } catch (error) {
          // Ignore user rejected error as it is expected
        }
        await finishedPromise;

        expect(rejectedEventListener).toHaveBeenCalledTimes(1);
        expect(rejectedEventListener).toHaveBeenCalledWith({
          transactionMeta: { ...transactionMeta, status: 'rejected' },
          actionId: mockActionId,
        });
      });
    });

    describe('checks from address origin', () => {
      it('throws if `from` address is different from current selected address', async () => {
        const { controller } = setupController();
        const origin = ORIGIN_METAMASK;
        const notSelectedFromAddress = ACCOUNT_2_MOCK;
        await expect(
          controller.addTransaction(
            {
              from: notSelectedFromAddress,
              to: ACCOUNT_MOCK,
            },
            { origin: ORIGIN_METAMASK },
          ),
        ).rejects.toThrow(
          rpcErrors.internal({
            message: `Internally initiated transaction is using invalid account.`,
            data: {
              origin,
              fromAddress: notSelectedFromAddress,
              selectedAddress: ACCOUNT_MOCK,
            },
          }),
        );
      });

      it('throws if the origin does not have permissions to initiate transactions from the specified address', async () => {
        const { controller } = setupController();
        const expectedOrigin = 'originMocked';
        await expect(
          controller.addTransaction(
            { from: ACCOUNT_2_MOCK, to: ACCOUNT_MOCK },
            { origin: expectedOrigin },
          ),
        ).rejects.toThrow(
          providerErrors.unauthorized({ data: { origin: expectedOrigin } }),
        );
      });
    });
  });

  describe('wipeTransactions', () => {
    it('removes all transactions on current network', async () => {
      const { controller } = setupController();

      controller.wipeTransactions();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      controller.wipeTransactions();

      expect(controller.state.transactions).toHaveLength(0);
    });

    it('removes only txs with given address', async () => {
      const mockFromAccount1 = '0x1bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockFromAccount2 = '0x2bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockCurrentChainId = toHex(5);
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '1',
                chainId: mockCurrentChainId,
                status: TransactionStatus.confirmed as const,
                time: 123456789,
                txParams: {
                  from: mockFromAccount1,
                },
              },
              {
                id: '2',
                chainId: mockCurrentChainId,
                status: TransactionStatus.confirmed as const,
                time: 987654321,
                txParams: {
                  from: mockFromAccount2,
                },
              },
            ],
          },
        },
      });

      controller.wipeTransactions(true, mockFromAccount2);

      expect(controller.state.transactions).toHaveLength(1);
      expect(controller.state.transactions[0].id).toBe('1');
    });

    it('removes only txs with given address only on current network', async () => {
      const mockFromAccount1 = '0x1bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockDifferentChainId = toHex(1);
      const mockCurrentChainId = toHex(5);
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '1',
                chainId: mockCurrentChainId,
                txParams: {
                  from: mockFromAccount1,
                },
                status: TransactionStatus.confirmed as const,
                time: 123456789,
              },
              {
                id: '4',
                chainId: mockDifferentChainId,
                txParams: {
                  from: mockFromAccount1,
                },
                status: TransactionStatus.confirmed as const,
                time: 987654321,
              },
            ],
          },
        },
      });

      controller.wipeTransactions(false, mockFromAccount1);

      expect(controller.state.transactions).toHaveLength(1);
      expect(controller.state.transactions[0].id).toBe('4');
    });
  });

  describe('handleMethodData', () => {
    it('loads method data from registry', async () => {
      const { controller } = setupController({ network: MOCK_MAINNET_NETWORK });
      mockNetwork({
        networkClientConfiguration: {
          chainId: BUILT_IN_NETWORKS.mainnet.chainId,
          ticker: BUILT_IN_NETWORKS.mainnet.ticker,
          type: NetworkClientType.Infura,
          network: 'mainnet',
          infuraProjectId: INFURA_PROJECT_ID,
        },
        mocks: [
          {
            request: {
              method: 'eth_call',
              params: [
                {
                  to: '0x44691B39d1a75dC4E0A0346CBB15E310e6ED1E86',
                  data: '0xb46bcdaaf39b5b9b00000000000000000000000000000000000000000000000000000000',
                },
                'latest',
              ],
            },
            response: {
              result:
                '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000024657468546f546f6b656e53776170496e7075742875696e743235362c75696e743235362900000000000000000000000000000000000000000000000000000000',
            },
          },
        ],
      });
      const registry = await controller.handleMethodData('0xf39b5b9b');

      expect(registry.parsedRegistryMethod).toStrictEqual({
        args: [{ type: 'uint256' }, { type: 'uint256' }],
        name: 'Eth To Token Swap Input',
      });
      expect(registry.registryMethod).toBe(
        'ethToTokenSwapInput(uint256,uint256)',
      );
    });

    it('skips reading registry if already cached in state', async () => {
      const { controller } = setupController({ network: MOCK_MAINNET_NETWORK });
      mockNetwork({
        networkClientConfiguration: {
          ticker: BUILT_IN_NETWORKS.mainnet.ticker,
          chainId: BUILT_IN_NETWORKS.mainnet.chainId,
          type: NetworkClientType.Infura,
          network: 'mainnet',
          infuraProjectId: INFURA_PROJECT_ID,
        },
        mocks: [
          {
            request: {
              method: 'eth_call',
              params: [
                {
                  to: '0x44691B39d1a75dC4E0A0346CBB15E310e6ED1E86',
                  data: '0xb46bcdaaf39b5b9b00000000000000000000000000000000000000000000000000000000',
                },
                'latest',
              ],
            },
            response: {
              result:
                '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000024657468546f546f6b656e53776170496e7075742875696e743235362c75696e743235362900000000000000000000000000000000000000000000000000000000',
            },
          },
        ],
      });

      await controller.handleMethodData('0xf39b5b9b');

      const registryLookup = jest.spyOn<TransactionController, never>(
        controller,
        'registryLookup' as never,
      );

      await controller.handleMethodData('0xf39b5b9b');

      expect(registryLookup).not.toHaveBeenCalled();
    });
  });

  describe('stopTransaction', () => {
    it('should avoid creating cancel transaction if actionId already exist', async () => {
      const mockActionId = 'mockActionId';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                actionId: mockActionId,
                id: '2',
                chainId: toHex(5),
                status: TransactionStatus.submitted,
                type: TransactionType.cancel,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                },
              },
            ],
          },
        },
      });

      await controller.stopTransaction('2', undefined, {
        actionId: mockActionId,
      });

      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if transaction already confirmed', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '2',
                chainId: toHex(5),
                status: TransactionStatus.submitted,
                type: TransactionType.cancel,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                },
              },
            ],
          },
        },
      });

      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(new Error('nonce too low'));
        });

      await expect(controller.stopTransaction('2')).rejects.toThrow(
        'Previous transaction is already confirmed',
      );

      // Expect cancel transaction to be submitted - it will fail
      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if publish transaction fails', async () => {
      const error = new Error('Another reason');
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '2',
                chainId: toHex(5),
                status: TransactionStatus.submitted,
                type: TransactionType.cancel,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                },
              },
            ],
          },
        },
      });

      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(error);
        });

      await expect(controller.stopTransaction('2')).rejects.toThrow(error);

      // Expect cancel transaction to be submitted - it will fail
      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('submits a cancel transaction', async () => {
      const simpleSendTransactionId =
        'simpleeb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const cancelTransactionId = 'cancel1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const mockNonce = '0x9';
      uuidModuleMock.v1.mockImplementationOnce(() => cancelTransactionId);
      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(undefined, 'transaction-hash');
        });

      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              // Assume we have a submitted transaction in the state
              {
                id: simpleSendTransactionId,
                chainId: toHex(5),
                status: TransactionStatus.submitted,
                type: TransactionType.simpleSend,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  nonce: mockNonce,
                },
              },
            ],
          },
        },
      });

      await controller.stopTransaction(simpleSendTransactionId, undefined, {
        estimatedBaseFee: '0x123',
      });

      const { transactions } = controller.state;

      const cancelTransaction = transactions.find(
        ({ id }) => id === cancelTransactionId,
      );

      // Expect cancel transaction to be submitted
      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(cancelTransaction?.hash).toBe('transaction-hash');
    });

    it('adds cancel transaction to state', async () => {
      const simpleSendTransactionId =
        'simpleeb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const cancelTransactionId = 'cancel1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const mockNonce = '0x9';
      uuidModuleMock.v1.mockImplementationOnce(() => cancelTransactionId);

      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              // Assume we have a submitted transaction in the state
              {
                id: simpleSendTransactionId,
                chainId: toHex(5),
                status: TransactionStatus.submitted,
                type: TransactionType.simpleSend,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  nonce: mockNonce,
                },
              },
            ],
          },
        },
      });

      await controller.stopTransaction(simpleSendTransactionId, undefined, {
        estimatedBaseFee: '0x123',
      });

      const { transactions } = controller.state;

      const simpleSendTransaction = transactions.find(
        ({ id }) => id === simpleSendTransactionId,
      );
      const cancelTransaction = transactions.find(
        ({ id }) => id === cancelTransactionId,
      );

      expect(transactions).toHaveLength(2);
      expect(simpleSendTransaction?.type).toBe(TransactionType.simpleSend);
      expect(simpleSendTransaction?.status).toBe(TransactionStatus.submitted);

      // This nonce provided while adding first transaction
      expect(cancelTransaction?.txParams.nonce).toBe(mockNonce);

      expect(cancelTransaction?.type).toBe(TransactionType.cancel);
      expect(cancelTransaction?.status).toBe(TransactionStatus.submitted);
    });

    it('rejects unknown transaction', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_GOERLI_NETWORK,
      });

      await controller.stopTransaction('transactionIdMock', {
        gasPrice: '0x1',
      });

      const signSpy = jest.spyOn(controller, 'sign');

      expect(signSpy).toHaveBeenCalledTimes(0);
    });

    it('throws if no sign method', async () => {
      const { controller } = setupController({ options: { sign: undefined } });

      await controller.addTransaction({ from: ACCOUNT_MOCK, to: ACCOUNT_MOCK });

      await expect(
        controller.stopTransaction(controller.state.transactions[0].id),
      ).rejects.toThrow('No sign method defined');
    });

    it('publishes transaction events', async () => {
      const { controller, messenger, mockTransactionApprovalRequest } =
        setupController({ network: MOCK_LINEA_GOERLI_NETWORK });

      const approvedEventListener = jest.fn();
      const submittedEventListener = jest.fn();
      const finishedEventListener = jest.fn();

      const mockActionId = 'mockActionId';

      messenger.subscribe(
        'TransactionController:transactionApproved',
        approvedEventListener,
      );
      messenger.subscribe(
        'TransactionController:transactionSubmitted',
        submittedEventListener,
      );

      const { transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x1',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      messenger.subscribe(
        'TransactionController:transactionFinished',
        finishedEventListener,
      );

      mockTransactionApprovalRequest.approve();

      // Release for add transaction submission
      await flushPromises();

      await controller.stopTransaction(transactionMeta.id, undefined, {
        estimatedBaseFee: '0x123',
        actionId: mockActionId,
      });

      // Release for cancel transaction submission
      await flushPromises();

      const cancelTransaction = controller.state.transactions.find(
        ({ type }) => type === TransactionType.cancel,
      );

      // All expected events should be emitted twice (add and cancel transaction)
      expect(approvedEventListener).toHaveBeenCalledTimes(2);
      expect(approvedEventListener.mock.calls[1][0]).toStrictEqual({
        actionId: mockActionId,
        transactionMeta: cancelTransaction,
      });

      expect(submittedEventListener).toHaveBeenCalledTimes(2);
      expect(submittedEventListener).toHaveBeenCalledWith({
        actionId: mockActionId,
        transactionMeta: cancelTransaction,
      });

      expect(finishedEventListener).toHaveBeenCalledTimes(2);
      expect(finishedEventListener).toHaveBeenCalledWith(cancelTransaction);
    });
  });

  describe('speedUpTransaction', () => {
    it('creates additional transaction', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: async () => false,
        },
      });

      const { transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      const speedUpTransaction = transactions[1];
      expect(speedUpTransaction.originalType).toBe(transactionMeta.type);
      expect(speedUpTransaction.type).toBe(TransactionType.retry);
    });

    it('should avoid creating speedup transaction if actionId already exist', async () => {
      const mockActionId = 'mockActionId';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                actionId: mockActionId,
                id: '2',
                chainId: toHex(5),
                status: TransactionStatus.submitted,
                type: TransactionType.retry,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                },
              },
            ],
          },
        },
      });

      await controller.speedUpTransaction('2', undefined, {
        actionId: mockActionId,
      });

      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if transaction already confirmed', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '2',
                chainId: toHex(5),
                status: TransactionStatus.submitted,
                type: TransactionType.retry,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                },
              },
            ],
          },
        },
      });

      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(new Error('nonce too low'));
        });

      await expect(controller.speedUpTransaction('2')).rejects.toThrow(
        'Previous transaction is already confirmed',
      );

      // Expect speedup transaction to be submitted - it will fail
      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if publish transaction fails', async () => {
      const error = new Error('Another reason');
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: '2',
                chainId: toHex(5),
                status: TransactionStatus.submitted,
                type: TransactionType.retry,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                },
              },
            ],
          },
        },
      });

      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(error);
        });

      await expect(controller.speedUpTransaction('2')).rejects.toThrow(error);

      // Expect speedup transaction to be submitted - it will fail
      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('creates additional transaction with increased gas', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: async () => false,
        },
      });

      const { transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      expect(transactions[1].txParams.gasPrice).toBe(
        '0x5916a6d6', // 1.1 * 0x50fd51da
      );
    });

    it('verifies s,r and v values are correctly populated', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          sign: async (transaction) => {
            return Object.assign(transaction, {
              r: 128n,
              s: 256n,
              v: 512n,
            });
          },
        },
      });

      const { transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      const speedUpTransaction = transactions[1];
      expect(speedUpTransaction).toMatchObject({
        r: '0x80',
        s: '0x100',
        v: '0x200',
      });
    });

    it('verifies s,r and v values are correctly populated if values are zero', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sign: async (transaction: any) => {
            return Object.assign(transaction, {
              r: 0n,
              s: 0n,
              v: 0n,
            });
          },
        },
      });

      const { transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      const speedUpTransaction = transactions[1];
      expect(speedUpTransaction.r).toBe('0x0');
      expect(speedUpTransaction.s).toBe('0x0');
      expect(speedUpTransaction.v).toBe('0x0');
    });

    it('creates additional transaction specifying the gasPrice', async () => {
      const { controller } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: async () => false,
        },
      });

      const { transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await controller.speedUpTransaction(transactionMeta.id, {
        gasPrice: '0x62DEF4DA',
      });

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      expect(transactions[1].txParams.gasPrice).toBe('0x62DEF4DA');
    });

    it('uses the same nonce', async () => {
      const { controller } = setupController({
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { transactionMeta, result } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x1',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await result;
      await controller.speedUpTransaction(transactionMeta.id, undefined, {
        estimatedBaseFee: '0x123',
      });

      const { transactions } = controller.state;
      expect(getNonceLockSpy).toHaveBeenCalledTimes(1);
      expect(transactions).toHaveLength(2);
      expect(transactions[0].txParams.nonce).toBeDefined();
      expect(transactions[0].txParams.nonce).toStrictEqual(
        transactions[1].txParams.nonce,
      );
      expect(transactions[1].estimatedBaseFee).toBe('0x123');
      expect(transactions[1].originalGasEstimate).toBe('0x1');
    });

    it('allows transaction count to exceed txHistorylimit', async () => {
      const { controller } = setupController({
        options: {
          transactionHistoryLimit: 1,
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { transactionMeta, result } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        nonce: '1111111',
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await result;
      await controller.speedUpTransaction(transactionMeta.id);

      expect(controller.state.transactions).toHaveLength(2);
    });

    it('publishes transaction events', async () => {
      const { controller, messenger } = setupController({
        network: MOCK_LINEA_MAINNET_NETWORK,
      });

      const approvedEventListener = jest.fn();
      const submittedEventListener = jest.fn();
      const speedupEventListener = jest.fn();

      const mockActionId = 'mockActionId';

      messenger.subscribe(
        'TransactionController:transactionApproved',
        approvedEventListener,
      );
      messenger.subscribe(
        'TransactionController:transactionSubmitted',
        submittedEventListener,
      );

      const { transactionMeta: firstTransactionMeta } =
        await controller.addTransaction({
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x1',
          to: ACCOUNT_MOCK,
          value: '0x0',
        });

      messenger.subscribe(
        'TransactionController:speedupTransactionAdded',
        speedupEventListener,
      );

      await controller.speedUpTransaction(firstTransactionMeta.id, undefined, {
        actionId: mockActionId,
      });

      const { transactions } = controller.state;
      const speedUpTransaction = transactions[1];

      expect(approvedEventListener).toHaveBeenCalledTimes(1);
      expect(approvedEventListener).toHaveBeenCalledWith({
        actionId: mockActionId,
        transactionMeta: speedUpTransaction,
      });

      expect(submittedEventListener).toHaveBeenCalledTimes(1);
      expect(submittedEventListener).toHaveBeenCalledWith({
        actionId: mockActionId,
        transactionMeta: speedUpTransaction,
      });

      expect(speedupEventListener).toHaveBeenCalledTimes(1);
      expect(speedupEventListener).toHaveBeenCalledWith(speedUpTransaction);
    });
  });

  describe('confirmExternalTransaction', () => {
    it('adds external transaction to the state as confirmed', async () => {
      const { controller } = setupController();

      const externalTransactionToConfirm = {
        id: '1',
        chainId: toHex(1),
        time: 123456789,
        status: TransactionStatus.confirmed as const,
        txParams: {
          gasUsed: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
      };
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      expect(controller.state.transactions[0].status).toBe(
        TransactionStatus.confirmed,
      );
      expect(controller.state.transactions[0].baseFeePerGas).toBe(
        externalBaseFeePerGas,
      );
      expect(controller.state.transactions[0]?.txReceipt?.gasUsed).toBe(
        externalTransactionReceipt.gasUsed,
      );
    });

    it('generates initial history', async () => {
      const { controller } = setupController();

      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        id: '1',
        chainId: toHex(1),
        status: TransactionStatus.confirmed as const,
        time: 123456789,
        txParams: {
          gasUsed: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
      };

      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };

      const externalBaseFeePerGas = '0x14';

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      const expectedInitialSnapshot = {
        chainId: '0x1',
        from: ACCOUNT_MOCK,
        id: '1',
        time: 123456789,
        status: TransactionStatus.confirmed as const,
        to: ACCOUNT_2_MOCK,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          gasUsed: undefined,
        },
      };

      // Expect initial snapshot to be the first history item
      expect(controller.state.transactions[0]?.history?.[0]).toStrictEqual(
        expectedInitialSnapshot,
      );
      // Expect modification history to be present
      expect(controller.state.transactions[0]?.history?.[1]).toStrictEqual([
        {
          note: expect.any(String),
          op: 'remove',
          path: '/txParams/gasUsed',
          timestamp: expect.any(Number),
        },
        {
          op: 'add',
          path: '/txParams/value',
          value: '0x0',
        },
        {
          op: 'add',
          path: '/txReceipt',
          value: expect.anything(),
        },
        {
          op: 'add',
          path: '/baseFeePerGas',
          value: expect.any(String),
        },
      ]);
    });

    it('marks local transactions with the same nonce and chainId as status dropped and defines replacedBy properties', async () => {
      const externalTransactionId = '1';
      const externalTransactionHash = '0x1';
      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        hash: externalTransactionHash,
        id: externalTransactionId,
        chainId: toHex(5),
        status: TransactionStatus.confirmed as const,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          nonce: toHex(NONCE_MOCK),
          value: '0x42',
        },
      };
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      const localTransactionIdWithSameNonce = '9';

      const droppedEventListener = jest.fn();
      const statusUpdatedEventListener = jest.fn();

      const { controller, messenger } = setupController({
        options: {
          disableHistory: true,
          state: {
            transactions: [
              // Local unapproved transaction with the same chainId and nonce
              {
                id: localTransactionIdWithSameNonce,
                chainId: toHex(5),
                status: TransactionStatus.unapproved as const,
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                  nonce: toHex(NONCE_MOCK),
                  value: '0x42',
                },
              },
            ],
          },
        },
      });
      messenger.subscribe(
        'TransactionController:transactionDropped',
        droppedEventListener,
      );
      messenger.subscribe(
        'TransactionController:transactionStatusUpdated',
        statusUpdatedEventListener,
      );

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      const droppedTx = controller.state.transactions.find(
        (transaction) => transaction.id === localTransactionIdWithSameNonce,
      );
      assert(droppedTx, 'Could not find dropped transaction');
      const externalTx = controller.state.transactions.find(
        (transaction) => transaction.id === externalTransactionId,
      );

      expect(droppedTx.status).toBe(TransactionStatus.dropped);
      expect(droppedTx.replacedById).toBe(externalTransactionId);
      expect(droppedTx.replacedBy).toBe(externalTransactionHash);

      expect(droppedEventListener).toHaveBeenCalledTimes(1);
      expect(droppedEventListener).toHaveBeenCalledWith({
        transactionMeta: droppedTx,
      });

      expect(statusUpdatedEventListener).toHaveBeenCalledTimes(2);
      expect(statusUpdatedEventListener.mock.calls[0][0]).toStrictEqual({
        transactionMeta: droppedTx,
      });
      expect(statusUpdatedEventListener.mock.calls[1][0]).toStrictEqual({
        transactionMeta: externalTx,
      });
    });

    it('doesnt mark transaction as dropped if local transaction with same nonce and chainId has status of failed', async () => {
      const externalTransactionId = '1';
      const externalTransactionHash = '0x1';
      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        hash: externalTransactionHash,
        id: externalTransactionId,
        chainId: toHex(5),
        status: TransactionStatus.confirmed as const,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          nonce: toHex(NONCE_MOCK),
        },
      };
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      const localTransactionIdWithSameNonce = '9';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                // Off-chain failed local transaction with the same chainId and nonce
                id: localTransactionIdWithSameNonce,
                chainId: toHex(5),
                status: TransactionStatus.failed as const,
                error: new Error('mock error'),
                time: 123456789,
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                  nonce: toHex(NONCE_MOCK),
                },
              },
            ],
          },
        },
      });

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      const failedTx = controller.state.transactions.find(
        (transaction) => transaction.id === localTransactionIdWithSameNonce,
      );

      expect(failedTx?.status).toBe(TransactionStatus.failed);

      expect(failedTx?.replacedById).toBe(externalTransactionId);

      expect(failedTx?.replacedBy).toBe(externalTransactionHash);
    });

    it('updates post transaction balance if type is swap', async () => {
      const mockPostTxBalance = '7a00';
      const mockApprovalTransactionMeta = {
        id: '2',
      };
      updatePostTransactionBalanceMock.mockImplementationOnce(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (transactionMeta: TransactionMeta, _request: any) => {
          return Promise.resolve({
            updatedTransactionMeta: {
              ...transactionMeta,
              postTxBalance: mockPostTxBalance,
            },
            approvalTransactionMeta:
              mockApprovalTransactionMeta as TransactionMeta,
          });
        },
      );
      const postTransactionBalanceUpdatedListener = jest.fn();
      const { controller, messenger } = setupController();
      messenger.subscribe(
        'TransactionController:postTransactionBalanceUpdated',
        postTransactionBalanceUpdatedListener,
      );

      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        id: '1',
        chainId: '0x1',
        status: TransactionStatus.confirmed,
        type: TransactionType.swap,
        txParams: {
          gasUsed: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
        preTxBalance: '8b11',
        // Default token address
        destinationTokenAddress: '0x0000000000000000000000000000000000000000',
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      await flushPromises();

      expect(postTransactionBalanceUpdatedListener).toHaveBeenCalledTimes(1);
      expect(postTransactionBalanceUpdatedListener).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionMeta: expect.objectContaining({
            postTxBalance: mockPostTxBalance,
          }),
          approvalTransactionMeta: expect.objectContaining(
            mockApprovalTransactionMeta,
          ),
        }),
      );
    });

    it('publishes TransactionController:transactionConfirmed', async () => {
      const { controller, messenger } = setupController();

      const confirmedEventListener = jest.fn();

      messenger.subscribe(
        'TransactionController:transactionConfirmed',
        confirmedEventListener,
      );

      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        id: '1',
        chainId: toHex(5),
        status: TransactionStatus.confirmed,
        txParams: {
          gasUsed: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      expect(confirmedEventListener).toHaveBeenCalledTimes(1);
      expect(confirmedEventListener).toHaveBeenCalledWith(
        expect.objectContaining(externalTransactionToConfirm),
      );
    });

    it('publishes TransactionController:transactionConfirmed with transaction chainId regardless of whether it matches globally selected chainId', async () => {
      const mockGloballySelectedNetwork = {
        ...MOCK_NETWORK,
        state: {
          ...MOCK_NETWORK.state,
          providerConfig: {
            type: NetworkType.sepolia,
            chainId: ChainId.sepolia,
            ticker: NetworksTicker.sepolia,
          },
        },
      };
      const { controller, messenger } = setupController({
        network: mockGloballySelectedNetwork,
      });

      const confirmedEventListener = jest.fn();
      messenger.subscribe(
        'TransactionController:transactionConfirmed',
        confirmedEventListener,
      );

      const externalTransactionToConfirm = {
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        id: '1',
        chainId: ChainId.goerli, // doesn't match globally selected chainId (which is sepolia)
        status: TransactionStatus.confirmed,
        txParams: {
          gasUsed: undefined,
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      expect(confirmedEventListener).toHaveBeenCalledWith(
        expect.objectContaining(externalTransactionToConfirm),
      );
    });
  });

  describe('updateTransactionSendFlowHistory', () => {
    it('appends sendFlowHistory entries to transaction meta', async () => {
      const { controller } = setupController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });
      const addedTxId = controller.state.transactions[0].id;
      controller.updateTransactionSendFlowHistory(
        addedTxId,
        0,
        mockSendFlowHistory,
      );

      expect(controller.state.transactions[0].sendFlowHistory).toStrictEqual(
        mockSendFlowHistory,
      );
    });

    it('appends sendFlowHistory entries to existing entries in transaction meta', async () => {
      const { controller } = setupController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      const mockExistingSendFlowHistory = [
        {
          entry: 'sendFlow - user selected transfer to my accounts',
          timestamp: 1650663928210,
        },
      ];
      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          sendFlowHistory: mockExistingSendFlowHistory,
        },
      );
      const addedTxId = controller.state.transactions[0].id;
      controller.updateTransactionSendFlowHistory(
        addedTxId,
        1,
        mockSendFlowHistory,
      );

      expect(controller.state.transactions[0].sendFlowHistory).toStrictEqual([
        ...mockExistingSendFlowHistory,
        ...mockSendFlowHistory,
      ]);
    });

    it('doesnt append if current sendFlowHistory lengths doesnt match', async () => {
      const { controller } = setupController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });
      const addedTxId = controller.state.transactions[0].id;
      controller.updateTransactionSendFlowHistory(
        addedTxId,
        5,
        mockSendFlowHistory,
      );

      expect(controller.state.transactions[0].sendFlowHistory).toStrictEqual(
        [],
      );
    });

    it('throws if sendFlowHistory persistence is disabled', async () => {
      const { controller } = setupController({
        options: { disableSendFlowHistory: true },
      });
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });
      const addedTxId = controller.state.transactions[0].id;
      expect(() =>
        controller.updateTransactionSendFlowHistory(
          addedTxId,
          0,
          mockSendFlowHistory,
        ),
      ).toThrow(
        'Send flow history is disabled for the current transaction controller',
      );
    });

    it('throws if transactionMeta is not found', async () => {
      const { controller } = setupController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      expect(() =>
        controller.updateTransactionSendFlowHistory(
          'foo',
          0,
          mockSendFlowHistory,
        ),
      ).toThrow(
        'Cannot update send flow history as no transaction metadata found',
      );
    });

    it('throws if the transaction is not unapproved status', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: 'foo',
                chainId: toHex(5),
                hash: '1337',
                status: TransactionStatus.submitted as const,
                time: 123456789,
                txParams: {
                  from: MOCK_PREFERENCES.state.selectedAddress,
                },
              },
            ],
          },
        },
      });
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      expect(() =>
        controller.updateTransactionSendFlowHistory(
          'foo',
          0,
          mockSendFlowHistory,
        ),
      )
        .toThrow(`TransactionsController: Can only call updateTransactionSendFlowHistory on an unapproved transaction.
      Current tx status: submitted`);
    });
  });

  describe('clearUnapprovedTransactions', () => {
    it('clears unapproved transactions', async () => {
      const firstUnapprovedTxId = '1';
      const secondUnapprovedTxId = '2';
      const firstConfirmedTxId = '3';
      const secondConfirmedTxId = '4';

      const transactionMeta = {
        chainId: toHex(5),
        status: TransactionStatus.unapproved as const,
        time: 123456789,
        txParams: {
          from: '0x1bf137f335ea1b8f193b8f6ea92561a60d23a207',
        },
      };

      const confirmedTxMeta = {
        ...transactionMeta,
        status: TransactionStatus.confirmed as const,
      };

      const unapprovedTxMeta = {
        ...transactionMeta,
        status: TransactionStatus.unapproved as const,
      };

      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                ...unapprovedTxMeta,
                id: firstUnapprovedTxId,
              },
              {
                ...unapprovedTxMeta,
                id: secondUnapprovedTxId,
              },
              {
                ...confirmedTxMeta,
                id: firstConfirmedTxId,
              },
              {
                ...confirmedTxMeta,
                id: secondConfirmedTxId,
              },
            ],
          },
        },
      });

      controller.clearUnapprovedTransactions();

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(2);
      expect(
        transactions.find(({ id }) => id === firstConfirmedTxId)?.status,
      ).toBe(TransactionStatus.confirmed);
      expect(
        transactions.find(({ id }) => id === secondConfirmedTxId)?.status,
      ).toBe(TransactionStatus.confirmed);
    });
  });

  describe('on incoming transaction helper transactions event', () => {
    it('adds new transactions to state', async () => {
      const { controller } = setupController();

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]({
        added: [TRANSACTION_META_MOCK, TRANSACTION_META_2_MOCK],
        updated: [],
      });

      expect(controller.state.transactions).toStrictEqual([
        TRANSACTION_META_MOCK,
        TRANSACTION_META_2_MOCK,
      ]);
    });

    it('updates existing transactions in state', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [TRANSACTION_META_MOCK, TRANSACTION_META_2_MOCK],
          },
        },
      });

      const updatedTransaction = {
        ...TRANSACTION_META_MOCK,
        status: 'failed',
      };

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]({
        added: [],
        updated: [updatedTransaction],
      });

      expect(controller.state.transactions).toStrictEqual([
        updatedTransaction,
        TRANSACTION_META_2_MOCK,
      ]);
    });

    it('limits max transactions when adding to state', async () => {
      const { controller } = setupController({
        options: { transactionHistoryLimit: 1 },
      });

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (incomingTransactionHelperMock.hub.on as any).mock.calls[0][1]({
        added: [TRANSACTION_META_MOCK, TRANSACTION_META_2_MOCK],
        updated: [],
      });

      expect(controller.state.transactions).toStrictEqual([
        TRANSACTION_META_2_MOCK,
      ]);
    });
  });

  describe('on incoming transaction helper lastFetchedBlockNumbers event', () => {
    it('updates state', async () => {
      const { controller } = setupController();

      const lastFetchedBlockNumbers = {
        key: 234,
      };

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (incomingTransactionHelperMock.hub.on as any).mock.calls[1][1]({
        lastFetchedBlockNumbers,
        blockNumber: 123,
      });

      expect(controller.state.lastFetchedBlockNumbers).toStrictEqual(
        lastFetchedBlockNumbers,
      );
    });

    it('publishes TransactionController:incomingTransactionBlockReceived', async () => {
      const blockNumber = 123;
      const listener = jest.fn();

      const { messenger } = setupController();
      messenger.subscribe(
        'TransactionController:incomingTransactionBlockReceived',
        listener,
      );

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (incomingTransactionHelperMock.hub.on as any).mock.calls[1][1]({
        lastFetchedBlockNumbers: {
          key: 234,
        },
        blockNumber,
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(blockNumber);
    });
  });

  describe('updateTransactionGasFees', () => {
    it('throws if transaction does not exist', async () => {
      const { controller } = setupController();
      expect(() =>
        controller.updateTransactionGasFees('123', {
          gasPrice: '0x1',
        }),
      ).toThrow('Cannot update transaction as no transaction metadata found');
    });

    it('throws if transaction not unapproved status', async () => {
      const transactionId = '123';
      const fnName = 'updateTransactionGasFees';
      const status = TransactionStatus.failed;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionId,
                status,
                error: new Error('mock error'),
                chainId: '0x1',
                time: 123456789,
                txParams: {} as TransactionParams,
              },
            ],
          },
        },
      });
      expect(() =>
        controller.updateTransactionGasFees(transactionId, {
          gasPrice: '0x1',
        }),
      )
        .toThrow(`TransactionsController: Can only call ${fnName} on an unapproved transaction.
      Current tx status: ${status}`);
    });

    it('updates provided legacy gas values', async () => {
      const transactionId = '123';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionId,
                chainId: '0x1',
                time: 123456789,
                status: TransactionStatus.unapproved as const,
                history: [
                  {} as TransactionMeta,
                  ...([{}] as TransactionHistoryEntry[]),
                ],
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                },
              },
            ],
          },
        },
      });

      const gas = '0xgas';
      const gasLimit = '0xgasLimit';
      const gasPrice = '0xgasPrice';
      const estimateUsed = '0xestimateUsed';
      const estimateSuggested = '0xestimateSuggested';
      const defaultGasEstimates = '0xdefaultGasEstimates';
      const originalGasEstimate = '0xoriginalGasEstimate';
      const userEditedGasLimit = true;
      const userFeeLevel = '0xuserFeeLevel';

      controller.updateTransactionGasFees(transactionId, {
        gas,
        gasLimit,
        gasPrice,
        estimateUsed,
        estimateSuggested,
        defaultGasEstimates,
        originalGasEstimate,
        userEditedGasLimit,
        userFeeLevel,
      });

      const transaction = controller.state.transactions.find(
        ({ id }) => id === transactionId,
      );

      expect(transaction?.txParams?.gas).toBe(gas);
      expect(transaction?.txParams?.gasLimit).toBe(gasLimit);
      expect(transaction?.txParams?.gasPrice).toBe(gasPrice);
      expect(transaction?.estimateUsed).toBe(estimateUsed);
      expect(transaction?.estimateSuggested).toBe(estimateSuggested);
      expect(transaction?.defaultGasEstimates).toBe(defaultGasEstimates);
      expect(transaction?.originalGasEstimate).toBe(originalGasEstimate);
      expect(transaction?.userEditedGasLimit).toBe(userEditedGasLimit);
      expect(transaction?.userFeeLevel).toBe(userFeeLevel);
    });

    it('updates provided 1559 gas values', async () => {
      const maxPriorityFeePerGas = '0xmaxPriorityFeePerGas';
      const maxFeePerGas = '0xmaxFeePerGas';
      const transactionId = '123';

      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionId,
                chainId: '0x1',
                time: 123456789,
                status: TransactionStatus.unapproved as const,
                history: [
                  {} as TransactionMeta,
                  ...([{}] as TransactionHistoryEntry[]),
                ],
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                },
              },
            ],
          },
        },
      });

      controller.updateTransactionGasFees(transactionId, {
        maxPriorityFeePerGas,
        maxFeePerGas,
      });

      const txToBeUpdatedWithoutGasPrice = controller.state.transactions.find(
        ({ id }) => id === transactionId,
      );

      expect(txToBeUpdatedWithoutGasPrice?.txParams?.maxPriorityFeePerGas).toBe(
        maxPriorityFeePerGas,
      );
      expect(txToBeUpdatedWithoutGasPrice?.txParams?.maxFeePerGas).toBe(
        maxFeePerGas,
      );
    });
  });

  describe('updatePreviousGasParams', () => {
    it('throws if transaction does not exist', async () => {
      const { controller } = setupController();
      expect(() =>
        controller.updatePreviousGasParams('123', {
          maxFeePerGas: '0x1',
        }),
      ).toThrow('Cannot update transaction as no transaction metadata found');
    });

    it('throws if transaction not unapproved status', async () => {
      const transactionId = '123';
      const fnName = 'updatePreviousGasParams';
      const status = TransactionStatus.failed;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              // TODO: Replace `any` with type
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { id: transactionId, status } as any,
            ],
          },
        },
      });
      expect(() =>
        controller.updatePreviousGasParams(transactionId, {
          maxFeePerGas: '0x1',
        }),
      )
        .toThrow(`TransactionsController: Can only call ${fnName} on an unapproved transaction.
      Current tx status: ${status}`);
    });

    it('updates previous gas values', async () => {
      const transactionId = '123';
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionId,
                status: TransactionStatus.unapproved,
                history: [{}],
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                },
                // TODO: Replace `any` with type
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
            ],
          },
        },
      });

      const gasLimit = '0xgasLimit';
      const maxFeePerGas = '0xmaxFeePerGas';
      const maxPriorityFeePerGas = '0xmaxPriorityFeePerGas';

      controller.updatePreviousGasParams(transactionId, {
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });

      const transaction = controller.state.transactions[0];

      expect(transaction?.previousGas?.gasLimit).toBe(gasLimit);
      expect(transaction?.previousGas?.maxFeePerGas).toBe(maxFeePerGas);
      expect(transaction?.previousGas?.maxPriorityFeePerGas).toBe(
        maxPriorityFeePerGas,
      );
    });
  });

  describe('on pending transactions tracker event', () => {
    /**
     * Simulate an event from the pending transaction tracker.
     *
     * @param eventName - The name of the event to fire.
     * @param args - The arguments to pass to the event handler.
     */
    function firePendingTransactionTrackerEvent(
      eventName: string,
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...args: any
    ) {
      (pendingTransactionTrackerMock.hub.on as jest.Mock).mock.calls.find(
        (call) => call[0] === eventName,
      )[1](...args);
    }

    describe('on transaction-confirmed event', () => {
      it('bubbles event', async () => {
        const listener = jest.fn();
        const statusUpdateListener = jest.fn();
        const { messenger } = setupController();

        messenger.subscribe(
          'TransactionController:transactionConfirmed',
          listener,
        );
        messenger.subscribe(
          'TransactionController:transactionStatusUpdated',
          statusUpdateListener,
        );

        firePendingTransactionTrackerEvent(
          'transaction-confirmed',
          TRANSACTION_META_MOCK,
        );

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(TRANSACTION_META_MOCK);

        expect(statusUpdateListener).toHaveBeenCalledTimes(1);
        expect(statusUpdateListener).toHaveBeenCalledWith({
          transactionMeta: TRANSACTION_META_MOCK,
        });
      });

      it('marks duplicate nonce transactions as dropped', async () => {
        const confirmed = {
          ...TRANSACTION_META_MOCK,
          id: 'testId1',
          chainId: MOCK_NETWORK.state.providerConfig.chainId,
          hash: '0x3',
          status: TransactionStatus.confirmed,
          txParams: { ...TRANSACTION_META_MOCK.txParams, nonce: '0x1' },
        };

        const duplicate_1 = {
          ...confirmed,
          id: 'testId2',
          status: TransactionStatus.submitted,
        };

        const duplicate_2 = {
          ...duplicate_1,
          id: 'testId3',
          status: TransactionStatus.approved,
        };

        const duplicate_3 = {
          ...duplicate_1,
          id: 'testId4',
          status: TransactionStatus.failed,
        };

        const wrongChain = {
          ...duplicate_1,
          id: 'testId5',
          chainId: '0x2',
          txParams: { ...duplicate_1.txParams },
        };

        const wrongNonce = {
          ...duplicate_1,
          id: 'testId6',
          txParams: { ...duplicate_1.txParams, nonce: '0x2' },
        };

        const wrongFrom = {
          ...duplicate_1,
          id: 'testId7',
          txParams: { ...duplicate_1.txParams, from: '0x2' },
        };

        const wrongType = {
          ...duplicate_1,
          id: 'testId8',
          status: TransactionStatus.confirmed,
          type: TransactionType.incoming,
        };

        const { controller } = setupController({
          options: {
            state: {
              transactions: [
                confirmed,
                wrongChain,
                wrongNonce,
                wrongFrom,
                wrongType,
                duplicate_1,
                duplicate_2,
                duplicate_3,
              ] as TransactionMeta[],
            },
          },
        });

        firePendingTransactionTrackerEvent('transaction-confirmed', confirmed);

        expect(
          controller.state.transactions.map((tx) => tx.status),
        ).toStrictEqual([
          TransactionStatus.confirmed,
          TransactionStatus.submitted,
          TransactionStatus.submitted,
          TransactionStatus.submitted,
          TransactionStatus.confirmed,
          TransactionStatus.dropped,
          TransactionStatus.dropped,
          TransactionStatus.failed,
        ]);

        expect(
          controller.state.transactions.map((tx) => tx.replacedBy),
        ).toStrictEqual([
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          confirmed.hash,
          confirmed.hash,
          confirmed.hash,
        ]);

        expect(
          controller.state.transactions.map((tx) => tx.replacedById),
        ).toStrictEqual([
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          confirmed.id,
          confirmed.id,
          confirmed.id,
        ]);
      });
    });

    it('sets status to dropped on transaction-dropped event', async () => {
      const { controller } = setupController({
        options: {
          disableHistory: true,
          state: {
            transactions: [{ ...TRANSACTION_META_MOCK }],
          },
        },
      });

      firePendingTransactionTrackerEvent(
        'transaction-dropped',
        TRANSACTION_META_MOCK,
      );

      expect(controller.state.transactions).toStrictEqual([
        { ...TRANSACTION_META_MOCK, status: TransactionStatus.dropped },
      ]);
    });

    it('sets status to failed on transaction-failed event', async () => {
      const statusUpdatedEventListener = jest.fn();
      const { controller, messenger } = setupController({
        options: {
          disableHistory: true,
          state: {
            transactions: [{ ...TRANSACTION_META_MOCK }],
          },
        },
      });
      messenger.subscribe(
        'TransactionController:transactionStatusUpdated',
        statusUpdatedEventListener,
      );

      const errorMock = new Error('TestError');
      const expectedTransactionError: TransactionError = {
        message: errorMock.message,
        name: errorMock.name,
        stack: errorMock.stack,
        code: undefined,
        rpc: undefined,
      };

      firePendingTransactionTrackerEvent(
        'transaction-failed',
        TRANSACTION_META_MOCK,
        errorMock,
      );

      const failedTx = {
        ...TRANSACTION_META_MOCK,
        status: TransactionStatus.failed,
        error: expectedTransactionError,
      };

      expect(controller.state.transactions[0]).toStrictEqual(failedTx);

      expect(statusUpdatedEventListener).toHaveBeenCalledTimes(1);
      expect(statusUpdatedEventListener).toHaveBeenCalledWith({
        transactionMeta: failedTx,
      });
    });

    it('updates transaction on transaction-updated event', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [TRANSACTION_META_MOCK],
          },
          disableHistory: true,
        },
      });

      firePendingTransactionTrackerEvent(
        'transaction-updated',
        { ...TRANSACTION_META_MOCK, retryCount: 123 },
        'TestNote',
      );

      expect(controller.state.transactions).toStrictEqual([
        {
          ...TRANSACTION_META_MOCK,
          retryCount: 123,
        },
      ]);
    });
  });

  describe('approveTransactionsWithSameNonce', () => {
    it('throws error if no sign method', async () => {
      const { controller } = setupController({
        options: {
          sign: undefined,
        },
      });
      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
      };

      await expect(
        controller.approveTransactionsWithSameNonce([mockTransactionParam2]),
      ).rejects.toThrow('No sign method defined.');
    });

    it('returns empty string if no transactions are provided', async () => {
      const { controller } = setupController();
      const result = await controller.approveTransactionsWithSameNonce([]);
      expect(result).toBe('');
    });

    it('return empty string if transaction is already being signed', async () => {
      const { controller } = setupController({
        options: {
          // We never resolve this promise, so the transaction is always in the process of being signed
          sign: async () =>
            new Promise(() => {
              /* noop */
            }),
        },
      });
      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x5208',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
      };

      // Send the transaction to put it in the process of being signed
      controller.approveTransactionsWithSameNonce([mockTransactionParam]);

      // Now send it one more time to test that it doesn't get signed again
      const result = await controller.approveTransactionsWithSameNonce([
        mockTransactionParam,
      ]);

      expect(result).toBe('');
    });

    it('signs transactions and return raw transactions', async () => {
      const signMock = jest
        .fn()
        .mockImplementation(async (transactionParams) =>
          Promise.resolve(TransactionFactory.fromTxData(transactionParams)),
        );
      const { controller } = setupController({
        options: {
          sign: signMock,
        },
      });
      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x111',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
      };
      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
      };

      const result = await controller.approveTransactionsWithSameNonce([
        mockTransactionParam,
        mockTransactionParam2,
      ]);

      expect(result).toHaveLength(2);
      expect(result).toStrictEqual([expect.any(String), expect.any(String)]);
    });

    it('throws if error while signing transaction', async () => {
      const mockSignError = 'Error while signing transaction';

      const signMock = jest
        .fn()
        .mockImplementation(async () =>
          Promise.reject(new Error(mockSignError)),
        );
      const { controller } = setupController({
        options: {
          sign: signMock,
        },
      });
      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x111',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
      };
      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
      };

      await expect(
        controller.approveTransactionsWithSameNonce([
          mockTransactionParam,
          mockTransactionParam2,
        ]),
      ).rejects.toThrow(mockSignError);
    });

    it('does not create nonce lock if hasNonce set', async () => {
      const { controller } = setupController();

      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x111',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
      };

      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
      };

      await controller.approveTransactionsWithSameNonce(
        [mockTransactionParam, mockTransactionParam2],
        { hasNonce: true },
      );

      expect(getNonceLockSpy).not.toHaveBeenCalled();
    });

    it('uses the nonceTracker for the networkClientId matching the chainId', async () => {
      const { controller, messenger } = setupController();
      messenger.registerActionHandler(
        'NetworkController:findNetworkClientIdByChainId',
        () => 'goerli',
      );

      const mockTransactionParam = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x111',
        to: ACCOUNT_2_MOCK,
        value: '0x0',
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
      };

      const mockTransactionParam2 = {
        from: ACCOUNT_MOCK,
        nonce: '0x1',
        gas: '0x222',
        to: ACCOUNT_2_MOCK,
        value: '0x1',
        chainId: MOCK_NETWORK.state.providerConfig.chainId,
      };

      await controller.approveTransactionsWithSameNonce([
        mockTransactionParam,
        mockTransactionParam2,
      ]);

      expect(getNonceLockSpy).toHaveBeenCalledWith(ACCOUNT_MOCK, 'goerli');
    });
  });

  describe('with hooks', () => {
    const paramsMock: TransactionParams = {
      from: ACCOUNT_MOCK,
      to: ACCOUNT_MOCK,
    };

    const metadataMock: TransactionMeta = {
      txParams: paramsMock,
      chainId: '0x1' as const,
      id: '1',
      time: 0,
      status: TransactionStatus.approved,
    };

    it('adds a transaction, signs and update status to `approved`', async () => {
      const { controller, mockTransactionApprovalRequest } = setupController({
        options: {
          hooks: {
            afterSign: () => false,
            beforeApproveOnInit: () => false,
            beforePublish: () => false,
            getAdditionalSignArguments: () => [metadataMock],
          },
        },
      });
      const signSpy = jest.spyOn(controller, 'sign');
      const updateTransactionSpy = jest.spyOn(controller, 'updateTransaction');

      await controller.addTransaction(paramsMock, {
        origin: 'origin',
        actionId: ACTION_ID_MOCK,
      });

      mockTransactionApprovalRequest.approve({
        value: TRANSACTION_META_MOCK,
      });
      await wait(0);

      const transactionMeta = controller.state.transactions[0];

      expect(signSpy).toHaveBeenCalledTimes(1);

      expect(transactionMeta.txParams).toStrictEqual(
        expect.objectContaining(paramsMock),
      );
      expect(updateTransactionSpy).toHaveBeenCalledTimes(1);
      expect(updateTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          txParams: expect.objectContaining(paramsMock),
        }),
        'TransactionController#signTransaction - Update after sign',
      );

      expect(transactionMeta.status).toBe(TransactionStatus.approved);
    });

    it('adds a transaction and signing returns undefined', async () => {
      const { controller, mockTransactionApprovalRequest } = setupController({
        options: {
          hooks: {
            afterSign: () => false,
            beforeApproveOnInit: () => false,
            beforePublish: () => false,
            getAdditionalSignArguments: () => [metadataMock],
          },
          // @ts-expect-error sign intentionally returns undefined
          sign: async () => undefined,
        },
      });
      const signSpy = jest.spyOn(controller, 'sign');

      await controller.addTransaction(paramsMock, {
        origin: 'origin',
        actionId: ACTION_ID_MOCK,
      });

      mockTransactionApprovalRequest.approve({
        value: TRANSACTION_META_MOCK,
      });
      await wait(0);

      expect(signSpy).toHaveBeenCalledTimes(1);
    });

    it('adds a transaction, signs and skips publish the transaction', async () => {
      const { controller, mockTransactionApprovalRequest } = setupController({
        options: {
          hooks: {
            beforePublish: undefined,
            afterSign: () => false,
            getAdditionalSignArguments: () => [metadataMock],
          },
        },
      });
      const signSpy = jest.spyOn(controller, 'sign');
      const updateTransactionSpy = jest.spyOn(controller, 'updateTransaction');

      await controller.addTransaction(paramsMock, {
        origin: 'origin',
        actionId: ACTION_ID_MOCK,
      });

      mockTransactionApprovalRequest.approve();
      await wait(0);

      const transactionMeta = controller.state.transactions[0];

      expect(transactionMeta.txParams).toStrictEqual(
        expect.objectContaining(paramsMock),
      );

      expect(signSpy).toHaveBeenCalledTimes(1);
      expect(updateTransactionSpy).toHaveBeenCalledTimes(1);
      expect(updateTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          txParams: expect.objectContaining(paramsMock),
        }),
        'TransactionController#signTransaction - Update after sign',
      );
    });

    it('gets transaction hash from publish hook and does not submit to provider', async () => {
      const { controller } = setupController({
        options: {
          hooks: {
            publish: async () => ({
              transactionHash: '0x123',
            }),
          },
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });
      jest.spyOn(mockEthQuery, 'sendRawTransaction');

      const { result } = await controller.addTransaction(paramsMock);

      await result;

      expect(controller.state.transactions[0].hash).toBe('0x123');
      expect(mockEthQuery.sendRawTransaction).not.toHaveBeenCalled();
    });

    it('submits to provider if publish hook returns no transaction hash', async () => {
      jest
        .spyOn(mockEthQuery, 'sendRawTransaction')
        .mockImplementation((_transaction, callback) => {
          callback(undefined, 'some-transaction-hash');
        });
      const { controller } = setupController({
        options: {
          hooks: {
            // @ts-expect-error We are intentionally having this hook return no
            // transaction hash
            publish: async () => ({}),
          },
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { result } = await controller.addTransaction(paramsMock);

      await result;

      expect(controller.state.transactions[0].hash).toBe(
        'some-transaction-hash',
      );

      expect(mockEthQuery.sendRawTransaction).toHaveBeenCalledTimes(1);
    });

    it('submits to publish hook with final transaction meta', async () => {
      const publishHook = jest
        .fn()
        .mockResolvedValue({ transactionHash: TRANSACTION_META_MOCK.hash });

      const { controller } = setupController({
        options: {
          hooks: {
            publish: publishHook,
          },
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { result } = await controller.addTransaction(paramsMock);

      await result;

      expect(publishHook).toHaveBeenCalledTimes(1);
      expect(publishHook).toHaveBeenCalledWith(
        expect.objectContaining({
          txParams: expect.objectContaining({ nonce: toHex(NONCE_MOCK) }),
        }),
        expect.any(String),
      );
    });
  });

  describe('updateSecurityAlertResponse', () => {
    const mockSendFlowHistory = [
      {
        entry:
          'sendFlow - user selected transfer to my accounts on recipient screen',
        timestamp: 1650663928211,
      },
    ];

    it('add securityAlertResponse to transaction meta', async () => {
      const transactionMeta = TRANSACTION_META_MOCK;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta],
          },
        },
      });

      controller.updateSecurityAlertResponse(transactionMeta.id, {
        reason: 'NA',
        result_type: 'Benign',
      });

      expect(
        controller.state.transactions[0].securityAlertResponse,
      ).toBeDefined();
    });

    it('should throw error if transactionMetaId is not defined', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [TRANSACTION_META_MOCK],
          },
        },
      });

      expect(() =>
        // @ts-expect-error Intentionally passing invalid input
        controller.updateSecurityAlertResponse(undefined, {
          reason: 'NA',
          result_type: 'Benign',
        }),
      ).toThrow(
        'Cannot update security alert response as no transaction metadata found',
      );
    });

    it('should throw error if securityAlertResponse is not defined', async () => {
      const transactionMetaId = '123';
      const status = TransactionStatus.submitted;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionMetaId,
                status,
                // TODO: Replace `any` with type
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
            ],
          },
        },
      });
      expect(controller.state.transactions[0]).toBeDefined();

      expect(() =>
        controller.updateSecurityAlertResponse(
          transactionMetaId,
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          undefined as any,
        ),
      ).toThrow(
        'updateSecurityAlertResponse: securityAlertResponse should not be null',
      );
    });

    it('should throw error if transaction with given id does not exist', async () => {
      const transactionMetaId = '123';
      const status = TransactionStatus.submitted;
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                id: transactionMetaId,
                status,
                txParams: {
                  from: ACCOUNT_MOCK,
                  to: ACCOUNT_2_MOCK,
                },
                history: mockSendFlowHistory,
                // TODO: Replace `any` with type
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
            ],
          },
        },
      });
      expect(controller.state.transactions[0]).toBeDefined();

      expect(() =>
        controller.updateSecurityAlertResponse('456', {
          reason: 'NA',
          result_type: 'Benign',
        }),
      ).toThrow(
        'Cannot update security alert response as no transaction metadata found',
      );
    });

    describe('updateCustodialTransaction', () => {
      let transactionId: string;
      let statusMock: TransactionStatus;
      let baseTransaction: TransactionMeta;
      let transactionMeta: TransactionMeta;

      beforeEach(() => {
        transactionId = '1';
        statusMock = TransactionStatus.unapproved as const;
        baseTransaction = {
          id: transactionId,
          chainId: toHex(5),
          status: statusMock,
          time: 123456789,
          txParams: {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
        };
        transactionMeta = {
          ...baseTransaction,
          custodyId: '123',
          history: [{ ...baseTransaction }],
        };
      });

      it.each([
        {
          newStatus: TransactionStatus.signed,
        },
        {
          newStatus: TransactionStatus.submitted,
        },
        {
          newStatus: TransactionStatus.failed,
          errorMessage: 'Error mock',
        },
      ])(
        'updates transaction status to $newStatus',
        async ({ newStatus, errorMessage }) => {
          const { controller } = setupController({
            options: {
              state: {
                transactions: [transactionMeta],
              },
            },
          });

          controller.updateCustodialTransaction(transactionId, {
            status: newStatus,
            errorMessage,
          });

          const updatedTransaction = controller.state.transactions[0];

          expect(updatedTransaction?.status).toStrictEqual(newStatus);
        },
      );

      it.each([
        {
          newStatus: TransactionStatus.submitted,
        },
        {
          newStatus: TransactionStatus.failed,
          errorMessage: 'Error mock',
        },
      ])(
        'publishes TransactionController:transactionFinished when update transaction status to $newStatus',
        async ({ newStatus, errorMessage }) => {
          const finishedEventListener = jest.fn();
          const { controller, messenger } = setupController({
            options: {
              state: {
                transactions: [transactionMeta],
              },
            },
          });
          messenger.subscribe(
            'TransactionController:transactionFinished',
            finishedEventListener,
          );

          controller.updateCustodialTransaction(transactionId, {
            status: newStatus,
            errorMessage,
          });

          const updatedTransaction = controller.state.transactions[0];

          expect(finishedEventListener).toHaveBeenCalledTimes(1);
          expect(finishedEventListener).toHaveBeenCalledWith(
            expect.objectContaining({
              ...transactionMeta,
              status: newStatus,
            }),
          );
          expect(updatedTransaction.status).toStrictEqual(newStatus);
        },
      );

      it('updates transaction hash', async () => {
        const newHash = '1234';
        const { controller } = setupController({
          options: {
            state: {
              transactions: [transactionMeta],
            },
          },
        });

        controller.updateCustodialTransaction(transactionId, {
          hash: newHash,
        });

        const updatedTransaction = controller.state.transactions[0];

        expect(updatedTransaction.hash).toStrictEqual(newHash);
      });

      it('throws if custodial transaction does not exists', async () => {
        const nonExistentId = 'nonExistentId';
        const newStatus = TransactionStatus.approved as const;
        const { controller } = setupController();

        expect(() =>
          controller.updateCustodialTransaction(nonExistentId, {
            status: newStatus,
          }),
        ).toThrow(
          'Cannot update custodial transaction as no transaction metadata found',
        );
      });

      it('throws if transaction is not a custodial transaction', async () => {
        const nonCustodialTransaction: TransactionMeta = {
          ...baseTransaction,
          history: [{ ...baseTransaction }],
        };
        const newStatus = TransactionStatus.approved as const;
        const { controller } = setupController({
          options: {
            state: {
              transactions: [nonCustodialTransaction],
            },
          },
        });

        expect(() =>
          controller.updateCustodialTransaction(nonCustodialTransaction.id, {
            status: newStatus,
          }),
        ).toThrow('Transaction must be a custodian transaction');
      });

      it('throws if status is invalid', async () => {
        const newStatus = TransactionStatus.approved as const;
        const { controller } = setupController({
          options: {
            state: {
              transactions: [transactionMeta],
            },
          },
        });

        expect(() =>
          controller.updateCustodialTransaction(transactionMeta.id, {
            status: newStatus,
          }),
        ).toThrow(
          `Cannot update custodial transaction with status: ${newStatus}`,
        );
      });

      it('no property was updated', async () => {
        const { controller } = setupController({
          options: {
            state: {
              transactions: [transactionMeta],
            },
          },
        });

        controller.updateCustodialTransaction(transactionId, {});

        const updatedTransaction = controller.state.transactions[0];

        expect(updatedTransaction.status).toStrictEqual(transactionMeta.status);
        expect(updatedTransaction.hash).toStrictEqual(transactionMeta.hash);
      });
    });

    describe('initApprovals', () => {
      it('creates approvals for all unapproved transaction', async () => {
        const mockTransactionMeta = {
          from: ACCOUNT_MOCK,
          chainId: toHex(5),
          status: TransactionStatus.unapproved,
          txParams: {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
        };

        const mockedTransactions = [
          {
            id: '123',
            ...mockTransactionMeta,
            history: [{ ...mockTransactionMeta, id: '123' }],
          },
          {
            id: '1234',
            ...mockTransactionMeta,
            history: [{ ...mockTransactionMeta, id: '1234' }],
          },
          {
            id: '12345',
            ...mockTransactionMeta,
            history: [{ ...mockTransactionMeta, id: '12345' }],
            isUserOperation: true,
          },
        ];

        const mockedControllerState = {
          transactions: mockedTransactions,
          methodData: {},
          lastFetchedBlockNumbers: {},
        };

        const { controller, messenger } = setupController({
          options: {
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            state: mockedControllerState as any,
          },
        });
        jest.spyOn(messenger, 'call');

        controller.initApprovals();
        await flushPromises();

        expect(messenger.call).toHaveBeenCalledTimes(2);
        expect(messenger.call).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            expectsResult: true,
            id: '123',
            origin: 'metamask',
            requestData: { txId: '123' },
            type: 'transaction',
          },
          false,
        );
        expect(messenger.call).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            expectsResult: true,
            id: '1234',
            origin: 'metamask',
            requestData: { txId: '1234' },
            type: 'transaction',
          },
          false,
        );
      });

      it('catches error without code property in error object while creating approval', async () => {
        const mockTransactionMeta = {
          from: ACCOUNT_MOCK,
          chainId: toHex(5),
          status: TransactionStatus.unapproved,
          txParams: {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
        };

        const mockedTransactions = [
          {
            id: '123',
            ...mockTransactionMeta,
            history: [{ ...mockTransactionMeta, id: '123' }],
          },
          {
            id: '1234',
            ...mockTransactionMeta,
            history: [{ ...mockTransactionMeta, id: '1234' }],
          },
        ];

        const mockedControllerState = {
          transactions: mockedTransactions,
          methodData: {},
          lastFetchedBlockNumbers: {},
        };

        const mockedErrorMessage = 'mocked error';

        const { controller, messenger } = setupController({
          options: {
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            state: mockedControllerState as any,
          },
        });
        // Expect both calls to throw error, one with code property to check if it is handled
        jest
          .spyOn(messenger, 'call')
          .mockImplementationOnce(() => {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw { message: mockedErrorMessage };
          })
          .mockImplementationOnce(() => {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw {
              message: mockedErrorMessage,
              code: errorCodes.provider.userRejectedRequest,
            };
          });
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        controller.initApprovals();

        await flushPromises();

        expect(consoleSpy).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalledWith(
          'Error during persisted transaction approval',
          new Error(mockedErrorMessage),
        );
        expect(messenger.call).toHaveBeenCalledTimes(2);
      });

      it('does not create any approval when there is no unapproved transaction', async () => {
        const { controller, messenger } = setupController();
        jest.spyOn(messenger, 'call');
        controller.initApprovals();
        await flushPromises();
        expect(messenger.call).not.toHaveBeenCalled();
      });
    });

    describe('getTransactions', () => {
      it('returns transactions matching values in search criteria', () => {
        const transactions: TransactionMeta[] = [
          {
            chainId: '0x1',
            id: 'testId1',
            status: TransactionStatus.confirmed,
            time: 1,
            txParams: { from: '0x1' },
          },
          {
            chainId: '0x1',
            id: 'testId2',
            status: TransactionStatus.unapproved,
            time: 2,
            txParams: { from: '0x2' },
          },
          {
            chainId: '0x1',
            id: 'testId3',
            status: TransactionStatus.submitted,
            time: 1,
            txParams: { from: '0x3' },
          },
        ];

        const { controller } = setupController({
          options: {
            state: { transactions },
          },
        });

        expect(
          controller.getTransactions({
            searchCriteria: { time: 1 },
            filterToCurrentNetwork: false,
          }),
        ).toStrictEqual([transactions[0], transactions[2]]);
      });

      it('returns transactions matching param values in search criteria', () => {
        const transactions: TransactionMeta[] = [
          {
            chainId: '0x1',
            id: 'testId1',
            status: TransactionStatus.confirmed,
            time: 1,
            txParams: { from: '0x1' },
          },
          {
            chainId: '0x1',
            id: 'testId2',
            status: TransactionStatus.unapproved,
            time: 2,
            txParams: { from: '0x2' },
          },
          {
            chainId: '0x1',
            id: 'testId3',
            status: TransactionStatus.submitted,
            time: 3,
            txParams: { from: '0x1' },
          },
        ];

        const { controller } = setupController({
          options: {
            state: { transactions },
          },
        });

        expect(
          controller.getTransactions({
            searchCriteria: { from: '0x1' },
            filterToCurrentNetwork: false,
          }),
        ).toStrictEqual([transactions[0], transactions[2]]);
      });

      it('returns transactions matching multiple values in search criteria', () => {
        const transactions: TransactionMeta[] = [
          {
            chainId: '0x1',
            id: 'testId1',
            status: TransactionStatus.confirmed,
            time: 1,
            txParams: { from: '0x1' },
          },
          {
            chainId: '0x1',
            id: 'testId2',
            status: TransactionStatus.unapproved,
            time: 2,
            txParams: { from: '0x2' },
          },
          {
            chainId: '0x1',
            id: 'testId3',
            status: TransactionStatus.submitted,
            time: 1,
            txParams: { from: '0x1' },
          },
        ];

        const { controller } = setupController({
          options: {
            state: { transactions },
          },
        });

        expect(
          controller.getTransactions({
            searchCriteria: { from: '0x1', time: 1 },
            filterToCurrentNetwork: false,
          }),
        ).toStrictEqual([transactions[0], transactions[2]]);
      });

      it('returns transactions matching function in search criteria', () => {
        const transactions: TransactionMeta[] = [
          {
            chainId: '0x1',
            id: 'testId1',
            status: TransactionStatus.confirmed,
            time: 1,
            txParams: { from: '0x1' },
          },
          {
            chainId: '0x1',
            id: 'testId2',
            status: TransactionStatus.unapproved,
            time: 2,
            txParams: { from: '0x2' },
          },
          {
            chainId: '0x1',
            id: 'testId3',
            status: TransactionStatus.submitted,
            time: 1,
            txParams: { from: '0x3' },
          },
        ];

        const { controller } = setupController({
          options: {
            state: { transactions },
          },
        });

        expect(
          controller.getTransactions({
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            searchCriteria: { time: (v: any) => v === 1 },
            filterToCurrentNetwork: false,
          }),
        ).toStrictEqual([transactions[0], transactions[2]]);
      });

      it('returns transactions matching current network', () => {
        const transactions: TransactionMeta[] = [
          {
            chainId: MOCK_NETWORK.state.providerConfig.chainId,
            id: 'testId1',
            status: TransactionStatus.confirmed,
            time: 1,
            txParams: { from: '0x1' },
          },
          {
            chainId: '0x2',
            id: 'testId2',
            status: TransactionStatus.unapproved,
            time: 2,
            txParams: { from: '0x2' },
          },
          {
            chainId: MOCK_NETWORK.state.providerConfig.chainId,
            id: 'testId3',
            status: TransactionStatus.submitted,
            time: 1,
            txParams: { from: '0x3' },
          },
        ];

        const { controller } = setupController({
          options: {
            state: { transactions },
          },
        });

        expect(
          controller.getTransactions({
            filterToCurrentNetwork: true,
          }),
        ).toStrictEqual([transactions[0], transactions[2]]);
      });

      it('returns transactions from specified list', () => {
        const { controller } = setupController();

        const transactions: TransactionMeta[] = [
          {
            chainId: '0x1',
            id: 'testId1',
            status: TransactionStatus.confirmed,
            time: 1,
            txParams: { from: '0x1' },
          },
          {
            chainId: '0x1',
            id: 'testId2',
            status: TransactionStatus.unapproved,
            time: 2,
            txParams: { from: '0x2' },
          },
          {
            chainId: '0x1',
            id: 'testId3',
            status: TransactionStatus.submitted,
            time: 1,
            txParams: { from: '0x3' },
          },
        ];

        expect(
          controller.getTransactions({
            searchCriteria: { time: 1 },
            initialList: transactions,
            filterToCurrentNetwork: false,
          }),
        ).toStrictEqual([transactions[0], transactions[2]]);
      });

      it('returns limited number of transactions sorted by ascending time', () => {
        const transactions: TransactionMeta[] = [
          {
            chainId: '0x1',
            id: 'testId1',
            status: TransactionStatus.confirmed,
            time: 1,
            txParams: { from: '0x1', nonce: '0x1' },
          },
          {
            chainId: '0x1',
            id: 'testId2',
            status: TransactionStatus.confirmed,
            time: 2,
            txParams: { from: '0x1', nonce: '0x2' },
          },
          {
            chainId: '0x1',
            id: 'testId3',
            status: TransactionStatus.unapproved,
            time: 3,
            txParams: { from: '0x2', nonce: '0x3' },
          },
          {
            chainId: '0x1',
            id: 'testId4',
            status: TransactionStatus.submitted,
            time: 4,
            txParams: { from: '0x1', nonce: '0x4' },
          },
        ];

        const { controller } = setupController({
          options: {
            state: { transactions },
          },
        });

        expect(
          controller.getTransactions({
            searchCriteria: { from: '0x1' },
            filterToCurrentNetwork: false,
            limit: 2,
          }),
        ).toStrictEqual([transactions[1], transactions[3]]);
      });

      it('returns limited number of transactions except for duplicate nonces', () => {
        const transactions: TransactionMeta[] = [
          {
            chainId: '0x1',
            id: 'testId1',
            status: TransactionStatus.confirmed,
            time: 1,
            txParams: { from: '0x1', nonce: '0x1' },
          },
          {
            chainId: '0x1',
            id: 'testId2',

            status: TransactionStatus.unapproved,
            time: 2,
            txParams: { from: '0x2', nonce: '0x2' },
          },
          {
            chainId: '0x1',
            id: 'testId3',
            status: TransactionStatus.submitted,
            time: 3,
            txParams: { from: '0x1', nonce: '0x1' },
          },
          {
            chainId: '0x1',
            id: 'testId4',
            status: TransactionStatus.submitted,
            time: 4,
            txParams: { from: '0x1', nonce: '0x3' },
          },
        ];

        const { controller } = setupController({
          options: {
            state: { transactions },
          },
        });

        expect(
          controller.getTransactions({
            searchCriteria: { from: '0x1' },
            filterToCurrentNetwork: false,
            limit: 2,
          }),
        ).toStrictEqual([transactions[0], transactions[2], transactions[3]]);
      });
    });
  });

  describe('updateEditableParams', () => {
    const transactionId = '1';
    const params = {
      data: '0x12',
      from: ACCOUNT_2_MOCK,
      gas: '0x0',
      gasPrice: '0x50fd51da',
      to: ACCOUNT_MOCK,
      value: '0x0',
    };

    const baseTransaction = {
      id: transactionId,
      chainId: toHex(5),
      status: TransactionStatus.unapproved as const,
      time: 123456789,
      txParams: {
        data: 'originalData',
        gas: '50000',
        gasPrice: '1000000000',
        from: ACCOUNT_MOCK,
        to: ACCOUNT_2_MOCK,
        value: '5000000000000000000',
      },
    };
    const transactionMeta: TransactionMeta = {
      ...baseTransaction,
      history: [{ ...baseTransaction }],
    };

    it('updates editable params and returns updated transaction metadata', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta],
          },
        },
      });

      const updatedTransaction = await controller.updateEditableParams(
        transactionId,
        params,
      );

      expect(updatedTransaction?.txParams).toStrictEqual(params);
    });

    it('updates transaction layer 1 gas fee updater', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [transactionMeta],
          },
        },
      });

      const updatedTransaction = await controller.updateEditableParams(
        transactionId,
        params,
      );

      expect(updateTransactionLayer1GasFee).toHaveBeenCalledTimes(1);
      expect(updateTransactionLayer1GasFee).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionMeta: {
            ...updatedTransaction,
            history: expect.any(Array),
          },
        }),
      );
    });

    it('throws an error if no transaction metadata is found', async () => {
      const { controller } = setupController();
      await expect(
        controller.updateEditableParams(transactionId, params),
      ).rejects.toThrow(
        'Cannot update editable params as no transaction metadata found',
      );
    });

    it('throws an error if the transaction is not unapproved', async () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [
              {
                ...transactionMeta,
                status: TransactionStatus.submitted as const,
              },
            ],
          },
        },
      });
      await expect(controller.updateEditableParams(transactionId, params))
        .rejects
        .toThrow(`TransactionsController: Can only call updateEditableParams on an unapproved transaction.
      Current tx status: ${TransactionStatus.submitted}`);
    });

    it.each(['value', 'to', 'data'])(
      'updates simulation data if %s changes',
      async (param) => {
        const { controller } = setupController({
          options: {
            state: {
              transactions: [
                {
                  ...transactionMeta,
                },
              ],
            },
          },
        });

        expect(getSimulationDataMock).toHaveBeenCalledTimes(0);

        await controller.updateEditableParams(transactionMeta.id, {
          ...transactionMeta.txParams,
          [param]: ACCOUNT_2_MOCK,
        });

        await flushPromises();

        expect(getSimulationDataMock).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('abortTransactionSigning', () => {
    it('throws if transaction does not exist', () => {
      const { controller } = setupController();

      expect(() =>
        controller.abortTransactionSigning(TRANSACTION_META_MOCK.id),
      ).toThrow('Cannot abort signing as no transaction metadata found');
    });

    it('throws if transaction not being signed', () => {
      const { controller } = setupController({
        options: {
          state: {
            transactions: [TRANSACTION_META_MOCK],
          },
        },
      });

      expect(() =>
        controller.abortTransactionSigning(TRANSACTION_META_MOCK.id),
      ).toThrow(
        'Cannot abort signing as transaction is not waiting for signing',
      );
    });

    it('sets status to failed if transaction being signed', async () => {
      const { controller } = setupController({
        options: {
          sign: jest.fn().mockReturnValue(createDeferredPromise().promise),
        },
        messengerOptions: {
          addTransactionApprovalRequest: {
            state: 'approved',
          },
        },
      });

      const { transactionMeta, result } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      result.catch(() => {
        // Ignore error
      });

      await flushPromises();

      controller.abortTransactionSigning(transactionMeta.id);

      await flushPromises();

      expect(controller.state.transactions[0].status).toBe(
        TransactionStatus.failed,
      );
      expect(
        (
          controller.state.transactions[0] as TransactionMeta & {
            status: TransactionStatus.failed;
          }
        ).error.message,
      ).toBe('Signing aborted by user');
    });
  });

  describe('getLayer1GasFee', () => {
    it('calls getTransactionLayer1GasFee with the correct parameters', async () => {
      const chainIdMock = '0x1';
      const networkClientIdMock = 'mainnet';
      const layer1GasFeeMock = '0x12356';

      getTransactionLayer1GasFeeMock.mockResolvedValueOnce(layer1GasFeeMock);

      const { controller } = setupController();

      const result = await controller.getLayer1GasFee({
        transactionParams: TRANSACTION_META_MOCK.txParams,
        chainId: chainIdMock,
        networkClientId: networkClientIdMock,
      });

      expect(result).toBe(layer1GasFeeMock);
      expect(getTransactionLayer1GasFee).toHaveBeenCalledTimes(1);
    });
  });

  describe('estimateGasFee', () => {
    it('returns estimates from gas fee flow', async () => {
      const gasFeeFlowMock = buildMockGasFeeFlow();

      gasFeeFlowMock.getGasFees.mockResolvedValueOnce(GAS_FEE_ESTIMATES_MOCK);
      getGasFeeFlowMock.mockReturnValueOnce(gasFeeFlowMock);

      const { controller } = setupController();

      const result = await controller.estimateGasFee({
        transactionParams: TRANSACTION_META_MOCK.txParams,
      });

      expect(result).toStrictEqual(GAS_FEE_ESTIMATES_MOCK);
    });

    it('calls flow with transaction metadata matching args', async () => {
      const gasFeeFlowMock = buildMockGasFeeFlow();

      gasFeeFlowMock.getGasFees.mockResolvedValueOnce(GAS_FEE_ESTIMATES_MOCK);
      getGasFeeFlowMock.mockReturnValueOnce(gasFeeFlowMock);

      const { controller } = setupController();

      await controller.estimateGasFee({
        transactionParams: TRANSACTION_META_MOCK.txParams,
        chainId: CHAIN_ID_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
      });

      expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledTimes(1);
      expect(gasFeeFlowMock.getGasFees).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionMeta: {
            txParams: TRANSACTION_META_MOCK.txParams,
            chainId: CHAIN_ID_MOCK,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
          },
        }),
      );
    });
  });
});
