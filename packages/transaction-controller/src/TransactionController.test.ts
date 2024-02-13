/* eslint-disable jest/expect-expect */
import { TransactionFactory } from '@ethereumjs/tx';
import type {
  AcceptResultCallbacks,
  AddResult,
} from '@metamask/approval-controller';
import {
  ChainId,
  NetworkType,
  NetworksTicker,
  toHex,
  BUILT_IN_NETWORKS,
  ORIGIN_METAMASK,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import HttpProvider from '@metamask/ethjs-provider-http';
import type {
  BlockTracker,
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkState,
  Provider,
} from '@metamask/network-controller';
import { NetworkClientType, NetworkStatus } from '@metamask/network-controller';
import { errorCodes, providerErrors, rpcErrors } from '@metamask/rpc-errors';
import { createDeferredPromise } from '@metamask/utils';
import * as NonceTrackerPackage from 'nonce-tracker';

import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { flushPromises } from '../../../tests/helpers';
import { mockNetwork } from '../../../tests/mock-network';
import { IncomingTransactionHelper } from './helpers/IncomingTransactionHelper';
import { MultichainTrackingHelper } from './helpers/MultichainTrackingHelper';
import { PendingTransactionTracker } from './helpers/PendingTransactionTracker';
import type {
  TransactionControllerMessenger,
  TransactionConfig,
  TransactionState,
} from './TransactionController';
import { TransactionController } from './TransactionController';
import type {
  TransactionMeta,
  DappSuggestedGasFees,
  TransactionParams,
  TransactionHistoryEntry,
  TransactionError,
} from './types';
import { TransactionStatus, TransactionType, WalletDevice } from './types';
import { addGasBuffer, estimateGas, updateGas } from './utils/gas';
import { updateGasFees } from './utils/gas-fees';
import {
  updatePostTransactionBalance,
  updateSwapsTransaction,
} from './utils/swaps';

const MOCK_V1_UUID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const v1Stub = jest.fn().mockImplementation(() => MOCK_V1_UUID);

jest.mock('uuid', () => {
  return {
    ...jest.requireActual('uuid'),
    v1: () => v1Stub(),
  };
});

jest.mock('./utils/gas');
jest.mock('./utils/gas-fees');
jest.mock('./utils/swaps');

// TODO: Replace `any` with type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFlags: { [key: string]: any } = {
  estimateGasError: null,
  estimateGasValue: null,
  getBlockByNumberValue: null,
};

const ethQueryMockResults = {
  sendRawTransaction: 'mockSendRawTransactionResult',
};
const mockSendRawTransaction = jest
  .fn()
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .mockImplementation((_transaction: any, callback: any) => {
    callback(undefined, ethQueryMockResults.sendRawTransaction);
  });
jest.mock('@metamask/eth-query', () =>
  jest.fn().mockImplementation(() => {
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
      sendRawTransaction: mockSendRawTransaction,
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
    };
  }),
);

jest.mock('./helpers/IncomingTransactionHelper');
jest.mock('./helpers/PendingTransactionTracker');
jest.mock('./helpers/MultichainTrackingHelper');

/**
 * Builds a mock block tracker with a canned block number that can be used in
 * tests.
 *
 * @param latestBlockNumber - The block number that the block tracker should
 * always return.
 * @returns The mocked block tracker.
 */
function buildMockBlockTracker(latestBlockNumber: string): BlockTracker {
  const fakeBlockTracker = new FakeBlockTracker();
  fakeBlockTracker.mockLatestBlockNumber(latestBlockNumber);
  return fakeBlockTracker;
}

/**
 * Create an object containing mock result callbacks to be used when testing the approval process.
 *
 * @returns The mock result callbacks.
 */
function buildMockResultCallbacks(): AcceptResultCallbacks {
  return {
    success: jest.fn(),
    error: jest.fn(),
  };
}

/**
 * @type AddRequestOptions
 * @property approved - Whether transactions should immediately be approved or rejected.
 * @property delay - Whether to delay approval or rejection until the returned functions are called.
 * @property resultCallbacks - The result callbacks to return when a request is approved.
 */
type AddRequestOptions = {
  approved?: boolean;
  delay?: boolean;
  resultCallbacks?: AcceptResultCallbacks;
};

/**
 * Create a mock controller messenger.
 *
 * @param opts - Options to customize the mock messenger.
 * @param opts.addRequest - Options for ApprovalController.addRequest mock.
 * @param opts.getNetworkClientById - The function to use as the NetworkController:getNetworkClientById mock.
 * @param opts.findNetworkClientIdByChainId - The function to use as the NetworkController:findNetworkClientIdByChainId mock.
 * @returns The mock controller messenger.
 */
//
function buildMockMessenger({
  addRequest: { approved, delay, resultCallbacks },
  getNetworkClientById,
  findNetworkClientIdByChainId,
}: {
  addRequest: AddRequestOptions;
  getNetworkClientById: NetworkControllerGetNetworkClientByIdAction['handler'];
  findNetworkClientIdByChainId: NetworkControllerFindNetworkClientIdByChainIdAction['handler'];
}): {
  messenger: TransactionControllerMessenger;
  approve: () => void;
  reject: (reason: unknown) => void;
} {
  let approve, reject;
  let promise: Promise<AddResult>;

  if (delay) {
    promise = new Promise((res, rej) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      approve = (value?: any) => res({ resultCallbacks, value });
      reject = rej;
    });
  }

  const mockSubscribe = jest.fn();
  mockSubscribe.mockImplementation((_type, handler) => {
    setTimeout(() => {
      handler({}, [
        {
          op: 'add',
          path: ['networkConfigurations', 'foo'],
          value: 'foo',
        },
      ]);
    }, 0);
  });

  const messenger = {
    subscribe: mockSubscribe,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    call: jest.fn().mockImplementation((actionType: string, ...args: any[]) => {
      switch (actionType) {
        case 'ApprovalController:addRequest':
          if (approved) {
            return Promise.resolve({ resultCallbacks });
          }

          if (delay) {
            return promise;
          }

          // eslint-disable-next-line prefer-promise-reject-errors
          return Promise.reject({
            code: errorCodes.provider.userRejectedRequest,
          });
        case 'NetworkController:getNetworkClientById':
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (getNetworkClientById as any)(...args);
        case 'NetworkController:findNetworkClientIdByChainId':
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (findNetworkClientIdByChainId as any)(...args);
        default:
          throw new Error(
            `A handler for ${actionType} has not been registered`,
          );
      }
    }),
  } as unknown as TransactionControllerMessenger;

  return {
    messenger,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    approve: approve as unknown as (value?: any) => void,
    reject: reject as unknown as (reason: unknown) => void,
  };
}

/**
 * Wait for the controller to emit a transaction finished event.
 *
 * @param controller - The transaction controller to monitor.
 * @param options - Options to customize the wait.
 * @param options.confirmed - Whether to wait for the transaction to be confirmed or just finished.
 * @returns A promise that resolves with the transaction meta when the transaction is finished.
 */
function waitForTransactionFinished(
  controller: TransactionController,
  { confirmed = false } = {},
): Promise<TransactionMeta> {
  return new Promise((resolve) => {
    controller.hub.once(
      `${controller.state.transactions[0].id}:${
        confirmed ? 'confirmed' : 'finished'
      }`,
      (txMeta) => {
        resolve(txMeta);
      },
    );
  });
}

const MOCK_PREFERENCES = { state: { selectedAddress: 'foo' } };
const INFURA_PROJECT_ID = '341eacb578dd44a1a049cbc5f6fd4035';
const GOERLI_PROVIDER = new HttpProvider(
  `https://goerli.infura.io/v3/${INFURA_PROJECT_ID}`,
);
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
  blockTracker: buildMockBlockTracker('0x102833C'),
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
const MOCK_NETWORK_WITHOUT_CHAIN_ID: MockNetwork = {
  provider: GOERLI_PROVIDER,
  blockTracker: buildMockBlockTracker('0x102833C'),
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
    } as NetworkState['providerConfig'],
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};
const MOCK_MAINNET_NETWORK: MockNetwork = {
  provider: MAINNET_PROVIDER,
  blockTracker: buildMockBlockTracker('0x102833C'),
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
  blockTracker: buildMockBlockTracker('0xA6EDFC'),
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
  blockTracker: buildMockBlockTracker('0xA6EDFC'),
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
  blockTracker: buildMockBlockTracker('0xA6EDFC'),
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

const TRANSACTION_META_MOCK = {
  hash: '0x1',
  status: TransactionStatus.confirmed as const,
  time: 123456789,
  txParams: {
    from: ACCOUNT_MOCK,
    to: ACCOUNT_2_MOCK,
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

describe('TransactionController', () => {
  const updateGasMock = jest.mocked(updateGas);
  const updateGasFeesMock = jest.mocked(updateGasFees);
  const estimateGasMock = jest.mocked(estimateGas);
  const addGasBufferMock = jest.mocked(addGasBuffer);
  const updateSwapsTransactionMock = jest.mocked(updateSwapsTransaction);
  const updatePostTransactionBalanceMock = jest.mocked(
    updatePostTransactionBalance,
  );

  let resultCallbacksMock: AcceptResultCallbacks;
  let messengerMock: TransactionControllerMessenger;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let approveTransaction: (value?: any) => void;
  let getNonceLockSpy: jest.Mock;
  let incomingTransactionHelperMock: jest.Mocked<IncomingTransactionHelper>;
  let pendingTransactionTrackerMock: jest.Mocked<PendingTransactionTracker>;
  let multichainTrackingHelperMock: jest.Mocked<MultichainTrackingHelper>;
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
   * Create a new instance of the TransactionController.
   *
   * @param opts - Options to use when creating the controller.
   * @param opts.options - Any controller options to override the test defaults.
   * @param opts.config - Any configuration to override the test defaults.
   * @param opts.network - The mock network to use with the controller.
   * @param opts.approve - Whether transactions should be immediately approved.
   * @param opts.reject - Whether transactions should be immediately rejected.
   * @param opts.state - The initial state to use for the controller.
   * @returns The new TransactionController instance.
   */
  function newController({
    options,
    config,
    network,
    approve,
    reject,
    state,
  }: {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: any;
    config?: Partial<TransactionConfig>;
    network?: MockNetwork;
    approve?: boolean;
    reject?: boolean;
    state?: Partial<TransactionState>;
  } = {}): TransactionController {
    const finalNetwork = network ?? MOCK_NETWORK;

    resultCallbacksMock = buildMockResultCallbacks();
    let addRequestMockOptions: AddRequestOptions;
    if (approve) {
      addRequestMockOptions = {
        approved: true,
        resultCallbacks: resultCallbacksMock,
      };
    } else if (reject) {
      addRequestMockOptions = {
        approved: false,
        resultCallbacks: resultCallbacksMock,
      };
    } else {
      addRequestMockOptions = {
        delay: true,
        resultCallbacks: resultCallbacksMock,
      };
    }

    const mockGetNetworkClientById = jest
      .fn()
      .mockImplementation((networkClientId) => {
        switch (networkClientId) {
          case 'mainnet':
            return {
              configuration: {
                chainId: toHex(1),
              },
              blockTracker: finalNetwork.blockTracker,
              provider: finalNetwork.provider,
            };
          case 'sepolia':
            return {
              configuration: {
                chainId: ChainId.sepolia,
              },
              blockTracker: buildMockBlockTracker('0x1'),
              provider: MAINNET_PROVIDER,
            };
          case 'goerli':
            return {
              configuration: {
                chainId: ChainId.goerli,
              },
              blockTracker: buildMockBlockTracker('0x1'),
              provider: MAINNET_PROVIDER,
            };
          case 'customNetworkClientId-1':
            return {
              configuration: {
                chainId: '0xa',
              },
              blockTracker: buildMockBlockTracker('0x1'),
              provider: MAINNET_PROVIDER,
            };
          default:
            throw new Error(`Invalid network client id ${networkClientId}`);
        }
      });

    const mockFindNetworkClientIdByChainId = jest
      .fn()
      .mockImplementation((chainId) => {
        switch (chainId) {
          case '0x1':
            return 'mainnet';
          case ChainId.sepolia:
            return 'sepolia';
          case ChainId.goerli:
            return 'goerli';
          case '0xa':
            return 'customNetworkClientId-1';
          default:
            throw new Error("Couldn't find networkClientId for chainId");
        }
      });

    ({ messenger: messengerMock, approve: approveTransaction } =
      buildMockMessenger({
        addRequest: addRequestMockOptions,
        getNetworkClientById: mockGetNetworkClientById,
        findNetworkClientIdByChainId: mockFindNetworkClientIdByChainId,
      }));

    return new TransactionController(
      {
        blockTracker: finalNetwork.blockTracker,
        getNetworkState: () => finalNetwork.state,
        getCurrentNetworkEIP1559Compatibility: () => true,
        getSavedGasFees: () => undefined,
        getGasFeeEstimates: () => Promise.resolve({}),
        getPermittedAccounts: () => [ACCOUNT_MOCK],
        getSelectedAddress: () => ACCOUNT_MOCK,
        getNetworkClientRegistry: jest.fn(),
        messenger: messengerMock,
        onNetworkStateChange: finalNetwork.subscribe,
        provider: finalNetwork.provider,
        ...options,
      },
      {
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sign: async (transaction: any) => transaction,
        ...config,
      },
      state ?? undefined,
    );
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

    multichainTrackingHelperClassMock.mockImplementation(({ provider }) => {
      multichainTrackingHelperMock = {
        getEthQuery: jest.fn().mockImplementation(() => {
          return new EthQuery(provider);
        }),
        checkForPendingTransactionAndStartPolling: jest.fn(),
        getNonceLock: getNonceLockSpy,
        initialize: jest.fn(),
        has: jest.fn().mockReturnValue(false),
      } as unknown as jest.Mocked<MultichainTrackingHelper>;
      return multichainTrackingHelperMock;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('sets default state', () => {
      const controller = newController();
      expect(controller.state).toStrictEqual({
        methodData: {},
        transactions: [],
        lastFetchedBlockNumbers: {},
      });
    });

    it('sets default config', () => {
      const controller = newController();
      expect(controller.config).toStrictEqual({
        txHistoryLimit: 40,
        sign: expect.any(Function),
      });
    });

    describe('nonce tracker', () => {
      it('uses external pending transactions', async () => {
        const nonceTrackerMock = jest
          .spyOn(NonceTrackerPackage, 'NonceTracker')
          .mockImplementation();

        const externalPendingTransactions = [
          {
            from: '0x1',
          },
          { from: '0x2' },
        ];

        const getExternalPendingTransactions = jest
          .fn()
          .mockReturnValueOnce(externalPendingTransactions);

        const controller = newController({
          options: { getExternalPendingTransactions },
        });

        controller.state.transactions = [
          {
            ...TRANSACTION_META_MOCK,
            chainId: MOCK_NETWORK.state.providerConfig.chainId,
            status: TransactionStatus.submitted,
          },
        ];

        const pendingTransactions =
          nonceTrackerMock.mock.calls[0][0].getPendingTransactions(
            ACCOUNT_MOCK,
          );

        expect(nonceTrackerMock).toHaveBeenCalledTimes(1);
        expect(pendingTransactions).toStrictEqual([
          expect.any(Object),
          ...externalPendingTransactions,
        ]);
        expect(getExternalPendingTransactions).toHaveBeenCalledTimes(1);
        expect(getExternalPendingTransactions).toHaveBeenCalledWith(
          ACCOUNT_MOCK,
          // This is undefined for the base nonceTracker
          undefined,
        );
      });
    });

    describe('onBootCleanup', () => {
      afterEach(() => {
        updateGasMock.mockReset();
        updateGasFeesMock.mockReset();
      });

      it('submits approved transactions for all chains', async () => {
        const mockTransactionMeta = {
          from: ACCOUNT_MOCK,
          status: TransactionStatus.approved,
          txParams: {
            from: ACCOUNT_MOCK,
            to: ACCOUNT_2_MOCK,
          },
        };
        const mockedTransactions = [
          {
            id: '123',
            history: [{ ...mockTransactionMeta, id: '123' }],
            chainId: toHex(5),
            ...mockTransactionMeta,
          },
          {
            id: '456',
            history: [{ ...mockTransactionMeta, id: '456' }],
            chainId: toHex(1),
            ...mockTransactionMeta,
          },
          {
            id: '789',
            history: [{ ...mockTransactionMeta, id: '789' }],
            chainId: toHex(16),
            ...mockTransactionMeta,
          },
        ];

        const mockedControllerState = {
          transactions: mockedTransactions,
          methodData: {},
          lastFetchedBlockNumbers: {},
        };

        const controller = newController({
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          state: mockedControllerState as any,
        });

        await flushPromises();

        const { transactions } = controller.state;

        expect(transactions[0].status).toBe(TransactionStatus.submitted);
        expect(transactions[1].status).toBe(TransactionStatus.submitted);
        expect(transactions[2].status).toBe(TransactionStatus.submitted);
      });
    });
  });

  describe('estimateGas', () => {
    it('returns estimatedGas and simulation fails', async () => {
      const gasMock = '0x123';

      const simulationFailsMock = {
        errorKey: 'testKey',
      };

      const controller = newController();

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

      const controller = newController();

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
      const controller = newController();

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
      expect(messengerMock.call).toHaveBeenCalledTimes(1);
      expect(messengerMock.call).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
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
      const controller = newController();

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

      approveTransaction();
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
        const controller = newController();
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
        expect(messengerMock.call).toHaveBeenCalledTimes(
          expectedRequestApprovalCalledTimes,
        );
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
        const controller = newController();
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
      const controller = newController();

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
      expect(transactionMeta.securityAlertResponse).toBe(
        mockSecurityAlertResponse,
      );
      expect(controller.state.transactions[0].sendFlowHistory).toStrictEqual(
        mockSendFlowHistory,
      );
    });

    describe('networkClientId exists in the MultichainTrackingHelper', () => {
      it('adds unapproved transaction to state when using networkClientId', async () => {
        const controller = newController({
          options: { isMultichainEnabled: true },
        });
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
        const controller = newController({
          approve: true,
          options: { isMultichainEnabled: true },
        });

        multichainTrackingHelperMock.has.mockReturnValue(true);

        const submittedEventListener = jest.fn();
        controller.hub.on('transaction-submitted', submittedEventListener);

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
      const controller = newController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      const expectedInitialSnapshot = {
        actionId: undefined,
        chainId: expect.any(String),
        networkClientId: undefined,
        dappSuggestedGasFees: undefined,
        deviceConfirmedOn: undefined,
        id: expect.any(String),
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
      expect(controller.state.transactions[0]?.history).toStrictEqual([
        expectedInitialSnapshot,
      ]);
    });

    it('only reads the current chain id to filter to initially populate the metadata', async () => {
      const getNetworkStateMock = jest.fn().mockReturnValue(MOCK_NETWORK.state);
      const controller = newController({
        options: { getNetworkState: getNetworkStateMock },
      });

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      // First call comes from getting the chainId to populate the initial unapproved transaction
      // Second call comes from getting the network type to populate the initial gas estimates
      expect(getNetworkStateMock).toHaveBeenCalledTimes(2);
    });

    describe('adds dappSuggestedGasFees to transaction', () => {
      it.each([
        ['origin is MM', ORIGIN_METAMASK],
        ['origin is not defined', undefined],
        ['no fee information is given', 'MockDappOrigin'],
      ])('as undefined if %s', async (_testName, origin) => {
        const controller = newController();
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
          const controller = newController();
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

        const controller = newController({
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
      const controller = newController();
      await expect(controller.addTransaction({ from: 'foo' })).rejects.toThrow(
        'Invalid "from" address',
      );
    });

    it('increments nonce when adding a new non-cancel non-speedup transaction', async () => {
      v1Stub
        .mockImplementationOnce(() => 'aaaab1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')
        .mockImplementationOnce(() => 'bbbb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');

      const controller = newController({ approve: true });

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
      const controller = newController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(messengerMock.call).toHaveBeenCalledTimes(1);
      expect(messengerMock.call).toHaveBeenCalledWith(
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
      const controller = newController();

      await controller.addTransaction(
        {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        },
        {
          requireApproval: false,
        },
      );

      expect(messengerMock.call).toHaveBeenCalledTimes(0);
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

      const controller = newController({
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
      expect(securityProviderResponse).toBe(mockSecurityProviderResponse);
    });

    it('updates gas properties', async () => {
      const controller = newController();

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
      const controller = newController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(updateGasFeesMock).toHaveBeenCalledTimes(1);
      expect(updateGasFeesMock).toHaveBeenCalledWith({
        eip1559: true,
        ethQuery: expect.any(Object),
        getSavedGasFees: expect.any(Function),
        getGasFeeEstimates: expect.any(Function),
        txMeta: expect.any(Object),
      });
    });

    describe('on approve', () => {
      it('submits transaction', async () => {
        const controller = newController({ approve: true });
        const submittedEventListener = jest.fn();
        controller.hub.on('transaction-submitted', submittedEventListener);

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x0',
          to: ACCOUNT_MOCK,
          value: '0x0',
        });

        await result;

        const { txParams, status, submittedTime } =
          controller.state.transactions[0];
        expect(txParams.from).toBe(ACCOUNT_MOCK);
        expect(txParams.nonce).toBe(`0x${NONCE_MOCK.toString(16)}`);
        expect(status).toBe(TransactionStatus.submitted);
        expect(submittedTime).toStrictEqual(expect.any(Number));

        expect(submittedEventListener).toHaveBeenCalledTimes(1);
        expect(submittedEventListener).toHaveBeenCalledWith({
          transactionMeta: controller.state.transactions[0],
        });
      });

      it('reports success to approval acceptor', async () => {
        const controller = newController({ approve: true });

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        await result;

        expect(resultCallbacksMock.success).toHaveBeenCalledTimes(1);
      });

      it('reports error to approval acceptor on error', async () => {
        const controller = newController({
          approve: true,
          config: { sign: undefined },
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

        expect(resultCallbacksMock.error).toHaveBeenCalledTimes(1);
      });

      it('updates transaction if approval result includes updated metadata', async () => {
        const controller = newController();

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        const transaction = controller.state.transactions[0];

        approveTransaction({
          txMeta: { ...transaction, customNonceValue: '123' },
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
          const controller = newController({
            approve: true,
            config: {
              sign: () => {
                throw new Error('foo');
              },
            },
          });

          await expectTransactionToFail(controller, 'foo');
        });

        it('if no sign method defined', async () => {
          const controller = newController({
            approve: true,
            config: {
              sign: undefined,
            },
          });

          await expectTransactionToFail(controller, 'No sign method defined');
        });

        it('if no chainId defined', async () => {
          const controller = newController({
            approve: true,
            network: MOCK_NETWORK_WITHOUT_CHAIN_ID,
          });

          await expectTransactionToFail(controller, 'No chainId defined');
        });

        it('if unexpected status', async () => {
          const controller = newController();

          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const callMock = messengerMock.call as jest.MockedFunction<any>;
          callMock.mockImplementationOnce(() => {
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
          const controller = newController();

          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const callMock = messengerMock.call as jest.MockedFunction<any>;
          callMock.mockImplementationOnce(() => {
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
          const controller = newController();

          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const callMock = messengerMock.call as jest.MockedFunction<any>;
          callMock.mockImplementationOnce(() => {
            controller.state.transactions = [];
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
        const controller = newController({ reject: true });

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        const finishedPromise = waitForTransactionFinished(controller);

        await expect(result).rejects.toThrow(
          'MetaMask Tx Signature: User denied transaction signature.',
        );

        const { txParams, status } = await finishedPromise;
        expect(txParams.from).toBe(ACCOUNT_MOCK);
        expect(status).toBe(TransactionStatus.rejected);
      });

      it('emits rejected and finished event', async () => {
        const controller = newController({ reject: true });
        const rejectedEventListener = jest.fn();
        const finishedEventListener = jest.fn();

        controller.hub.on('transaction-rejected', rejectedEventListener);

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

        controller.hub.on(
          `${transactionMeta.id}:finished`,
          finishedEventListener,
        );

        const finishedPromise = waitForTransactionFinished(controller);

        try {
          await result;
        } catch (error) {
          // Ignore user rejected error as it is expected
        }
        await finishedPromise;

        expect(rejectedEventListener).toHaveBeenCalledTimes(1);
        expect(rejectedEventListener).toHaveBeenCalledWith({
          transactionMeta,
          actionId: mockActionId,
        });

        expect(finishedEventListener).toHaveBeenCalledTimes(1);
        expect(finishedEventListener).toHaveBeenCalledWith(transactionMeta);
      });
    });

    describe('checks from address origin', () => {
      it('throws if `from` address is different from current selected address', async () => {
        const controller = newController();
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
        const controller = newController();
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
      const controller = newController();

      controller.wipeTransactions();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      controller.wipeTransactions();

      expect(controller.state.transactions).toHaveLength(0);
    });

    it('removes only txs with given address', async () => {
      const controller = newController();

      controller.wipeTransactions();

      const mockFromAccount1 = '0x1bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockFromAccount2 = '0x2bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockCurrentChainId = toHex(5);

      controller.state.transactions.push({
        id: '1',
        chainId: mockCurrentChainId,
        status: TransactionStatus.confirmed as const,
        time: 123456789,
        txParams: {
          from: mockFromAccount1,
        },
      });

      controller.state.transactions.push({
        id: '2',
        chainId: mockCurrentChainId,
        status: TransactionStatus.confirmed as const,
        time: 987654321,
        txParams: {
          from: mockFromAccount2,
        },
      });

      controller.wipeTransactions(true, mockFromAccount2);

      expect(controller.state.transactions).toHaveLength(1);
      expect(controller.state.transactions[0].id).toBe('1');
    });

    it('removes only txs with given address only on current network', async () => {
      const controller = newController();

      controller.wipeTransactions();

      const mockFromAccount1 = '0x1bf137f335ea1b8f193b8f6ea92561a60d23a207';
      const mockDifferentChainId = toHex(1);
      const mockCurrentChainId = toHex(5);

      controller.state.transactions.push({
        id: '1',
        chainId: mockCurrentChainId,
        txParams: {
          from: mockFromAccount1,
        },
        status: TransactionStatus.confirmed as const,
        time: 123456789,
      });

      controller.state.transactions.push({
        id: '4',
        chainId: mockDifferentChainId,
        txParams: {
          from: mockFromAccount1,
        },
        status: TransactionStatus.confirmed as const,
        time: 987654321,
      });

      controller.wipeTransactions(false, mockFromAccount1);

      expect(controller.state.transactions).toHaveLength(1);
      expect(controller.state.transactions[0].id).toBe('4');
    });
  });

  describe('handleMethodData', () => {
    it('loads method data from registry', async () => {
      const controller = newController({ network: MOCK_MAINNET_NETWORK });
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
      const controller = newController({ network: MOCK_MAINNET_NETWORK });
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
      const controller = newController();

      controller.state.transactions.push({
        actionId: mockActionId,
        id: '2',
        chainId: toHex(5),
        status: TransactionStatus.submitted,
        type: TransactionType.cancel,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
        },
      });

      await controller.stopTransaction('2', undefined, {
        actionId: mockActionId,
      });

      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if transaction already confirmed', async () => {
      const controller = newController();

      controller.state.transactions.push({
        id: '2',
        chainId: toHex(5),
        status: TransactionStatus.submitted,
        type: TransactionType.cancel,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
        },
      });

      mockSendRawTransaction.mockImplementationOnce(
        (_transaction, callback) => {
          callback(
            undefined,
            // eslint-disable-next-line prefer-promise-reject-errors
            Promise.reject({
              message: 'nonce too low',
            }),
          );
        },
      );

      await expect(controller.stopTransaction('2')).rejects.toThrow(
        'Previous transaction is already confirmed',
      );

      // Expect cancel transaction to be submitted - it will fail
      expect(mockSendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if publish transaction fails', async () => {
      const errorMock = new Error('Another reason');
      const controller = newController();

      controller.state.transactions.push({
        id: '2',
        chainId: toHex(5),
        status: TransactionStatus.submitted,
        type: TransactionType.cancel,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
        },
      });

      mockSendRawTransaction.mockImplementationOnce(
        (_transaction, callback) => {
          callback(
            undefined,
            // eslint-disable-next-line prefer-promise-reject-errors
            Promise.reject(errorMock),
          );
        },
      );

      await expect(controller.stopTransaction('2')).rejects.toThrow(errorMock);

      // Expect cancel transaction to be submitted - it will fail
      expect(mockSendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('submits a cancel transaction', async () => {
      const simpleSendTransactionId =
        'simpleeb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const cancelTransactionId = 'cancel1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const mockNonce = '0x9';
      v1Stub.mockImplementationOnce(() => cancelTransactionId);

      const controller = newController();

      // Assume we have a submitted transaction in the state
      controller.state.transactions.push({
        id: simpleSendTransactionId,
        chainId: toHex(5),
        status: TransactionStatus.submitted,
        type: TransactionType.simpleSend,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          nonce: mockNonce,
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
      expect(mockSendRawTransaction).toHaveBeenCalledTimes(1);
      expect(cancelTransaction?.hash).toBe(
        ethQueryMockResults.sendRawTransaction,
      );
    });

    it('adds cancel transaction to state', async () => {
      const simpleSendTransactionId =
        'simpleeb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const cancelTransactionId = 'cancel1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const mockNonce = '0x9';
      v1Stub.mockImplementationOnce(() => cancelTransactionId);

      const controller = newController();

      // Assume we have a submitted transaction in the state
      controller.state.transactions.push({
        id: simpleSendTransactionId,
        chainId: toHex(5),
        status: TransactionStatus.submitted,
        type: TransactionType.simpleSend,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          nonce: mockNonce,
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
      const controller = newController({
        network: MOCK_LINEA_GOERLI_NETWORK,
      });

      await controller.stopTransaction('transactionIdMock', {
        gasPrice: '0x1',
      });

      const signSpy = jest.spyOn(controller, 'sign');

      expect(signSpy).toHaveBeenCalledTimes(0);
    });

    it('throws if no sign method', async () => {
      const controller = newController({ config: { sign: undefined } });

      await controller.addTransaction({ from: ACCOUNT_MOCK, to: ACCOUNT_MOCK });

      await expect(
        controller.stopTransaction(controller.state.transactions[0].id),
      ).rejects.toThrow('No sign method defined');
    });

    it('emits transaction events', async () => {
      const controller = newController({
        network: MOCK_LINEA_GOERLI_NETWORK,
      });

      const approvedEventListener = jest.fn();
      const submittedEventListener = jest.fn();
      const finishedEventListener = jest.fn();

      const mockActionId = 'mockActionId';

      controller.hub.on('transaction-approved', approvedEventListener);
      controller.hub.on('transaction-approved', submittedEventListener);

      const { transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x1',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      controller.hub.on(
        `${transactionMeta.id}:finished`,
        finishedEventListener,
      );

      approveTransaction();

      // Release for add transaction transaction submission
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
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: () => false,
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
      const controller = newController();

      controller.state.transactions.push({
        actionId: mockActionId,
        id: '2',
        chainId: toHex(5),
        status: TransactionStatus.submitted,
        type: TransactionType.retry,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
        },
      });

      await controller.speedUpTransaction('2', undefined, {
        actionId: mockActionId,
      });

      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if transaction already confirmed', async () => {
      const controller = newController();

      controller.state.transactions.push({
        id: '2',
        chainId: toHex(5),
        status: TransactionStatus.submitted,
        type: TransactionType.retry,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
        },
      });

      mockSendRawTransaction.mockImplementationOnce(
        (_transaction, callback) => {
          callback(
            undefined,
            // eslint-disable-next-line prefer-promise-reject-errors
            Promise.reject({
              message: 'nonce too low',
            }),
          );
        },
      );

      await expect(controller.speedUpTransaction('2')).rejects.toThrow(
        'Previous transaction is already confirmed',
      );

      // Expect speedup transaction to be submitted - it will fail
      expect(mockSendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('should throw error if publish transaction fails', async () => {
      const controller = newController();
      const errorMock = new Error('Another reason');

      controller.state.transactions.push({
        id: '2',
        chainId: toHex(5),
        status: TransactionStatus.submitted,
        type: TransactionType.retry,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
        },
      });

      mockSendRawTransaction.mockImplementationOnce(
        (_transaction, callback) => {
          callback(
            undefined,
            // eslint-disable-next-line prefer-promise-reject-errors
            Promise.reject(errorMock),
          );
        },
      );

      await expect(controller.speedUpTransaction('2')).rejects.toThrow(
        errorMock,
      );

      // Expect speedup transaction to be submitted - it will fail
      expect(mockSendRawTransaction).toHaveBeenCalledTimes(1);
      expect(controller.state.transactions).toHaveLength(1);
    });

    it('creates additional transaction with increased gas', async () => {
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: () => false,
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
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        config: {
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sign: async (transaction: any) => {
            transaction.r = '1b';
            transaction.s = 'abc';
            transaction.v = '123';
            return transaction;
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
      expect(speedUpTransaction.r).toBe('0x1b');
      expect(speedUpTransaction.s).toBe('0xabc');
      expect(speedUpTransaction.v).toBe('0x123');
    });

    it('verifies s,r and v values are correctly populated if values are zero', async () => {
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        config: {
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sign: async (transaction: any) => {
            transaction.r = 0;
            transaction.s = 0;
            transaction.v = 0;
            return transaction;
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
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
        options: {
          getCurrentNetworkEIP1559Compatibility: () => false,
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
      const controller = newController({ approve: true });

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
      const controller = newController({
        approve: true,
        config: {
          txHistoryLimit: 1,
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

    it('emits transaction events', async () => {
      const controller = newController({
        network: MOCK_LINEA_MAINNET_NETWORK,
      });

      const approvedEventListener = jest.fn();
      const submittedEventListener = jest.fn();
      const finishedEventListener = jest.fn();

      const mockActionId = 'mockActionId';

      controller.hub.on('transaction-approved', approvedEventListener);
      controller.hub.on('transaction-approved', submittedEventListener);

      const { transactionMeta: firstTransactionMeta } =
        await controller.addTransaction({
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x1',
          to: ACCOUNT_MOCK,
          value: '0x0',
        });

      controller.hub.on(
        `${firstTransactionMeta.id}:speedup`,
        finishedEventListener,
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

      expect(finishedEventListener).toHaveBeenCalledTimes(1);
      expect(finishedEventListener).toHaveBeenCalledWith(speedUpTransaction);
    });
  });

  describe('confirmExternalTransaction', () => {
    it('adds external transaction to the state as confirmed', async () => {
      const controller = newController();

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
      const controller = newController();

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
      const droppedEventListener = jest.fn();
      const changedStatusEventListener = jest.fn();
      const controller = newController({
        options: {
          disableHistory: true,
        },
      });
      controller.hub.on('transaction-dropped', droppedEventListener);
      controller.hub.on(
        'transaction-status-update',
        changedStatusEventListener,
      );

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
          nonce: String(NONCE_MOCK),
        },
      };
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      // Local unapproved transaction with the same chainId and nonce
      const localTransactionIdWithSameNonce = '9';
      controller.state.transactions.push({
        id: localTransactionIdWithSameNonce,
        chainId: toHex(5),
        status: TransactionStatus.unapproved as const,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          nonce: String(NONCE_MOCK),
        },
      });

      await controller.confirmExternalTransaction(
        externalTransactionToConfirm,
        externalTransactionReceipt,
        externalBaseFeePerGas,
      );

      const droppedTx = controller.state.transactions.find(
        (transaction) => transaction.id === localTransactionIdWithSameNonce,
      );

      const externalTx = controller.state.transactions.find(
        (transaction) => transaction.id === externalTransactionId,
      );

      expect(droppedTx?.status).toBe(TransactionStatus.dropped);

      expect(droppedTx?.replacedById).toBe(externalTransactionId);

      expect(droppedTx?.replacedBy).toBe(externalTransactionHash);
      expect(droppedEventListener).toHaveBeenCalledTimes(1);
      expect(droppedEventListener).toHaveBeenCalledWith({
        transactionMeta: droppedTx,
      });

      expect(changedStatusEventListener).toHaveBeenCalledTimes(2);
      expect(changedStatusEventListener.mock.calls[0][0]).toStrictEqual({
        transactionMeta: droppedTx,
      });
      expect(changedStatusEventListener.mock.calls[1][0]).toStrictEqual({
        transactionMeta: externalTx,
      });
    });

    it('doesnt mark transaction as dropped if local transaction with same nonce and chainId has status of failed', async () => {
      const controller = newController();
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
          nonce: String(NONCE_MOCK),
        },
      };
      const externalTransactionReceipt = {
        gasUsed: '0x5208',
      };
      const externalBaseFeePerGas = '0x14';

      // Off-chain failed local transaction with the same chainId and nonce
      const localTransactionIdWithSameNonce = '9';
      controller.state.transactions.push({
        id: localTransactionIdWithSameNonce,
        chainId: toHex(5),
        status: TransactionStatus.failed as const,
        error: new Error('mock error'),
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
          nonce: String(NONCE_MOCK),
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
      const mockPostTransactionBalanceUpdatedListener = jest.fn();
      const controller = newController();
      controller.hub.on(
        'post-transaction-balance-updated',
        mockPostTransactionBalanceUpdatedListener,
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

      expect(mockPostTransactionBalanceUpdatedListener).toHaveBeenCalledTimes(
        1,
      );
      expect(mockPostTransactionBalanceUpdatedListener).toHaveBeenCalledWith(
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

    it('emits confirmed event', async () => {
      const controller = newController();

      const confirmedEventListener = jest.fn();

      controller.hub.on('transaction-confirmed', confirmedEventListener);

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

      const externalTransaction = controller.state.transactions[0];

      expect(confirmedEventListener).toHaveBeenCalledTimes(1);
      expect(confirmedEventListener).toHaveBeenCalledWith({
        transactionMeta: externalTransaction,
      });
    });

    it('emits confirmed event with transaction chainId regardless of whether it matches globally selected chainId', async () => {
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
      const controller = newController({
        network: mockGloballySelectedNetwork,
      });

      const confirmedEventListener = jest.fn();

      controller.hub.on('transaction-confirmed', confirmedEventListener);

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

      const [[{ transactionMeta }]] = confirmedEventListener.mock.calls;
      expect(transactionMeta.chainId).toBe(ChainId.goerli);
    });
  });

  describe('updateTransactionSendFlowHistory', () => {
    it('appends sendFlowHistory entries to transaction meta', async () => {
      const controller = newController();
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
      const controller = newController();
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
      const controller = newController();
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
      const controller = newController({
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
      const controller = newController();
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
      const controller = newController();
      const mockSendFlowHistory = [
        {
          entry:
            'sendFlow - user selected transfer to my accounts on recipient screen',
          timestamp: 1650663928211,
        },
      ];
      controller.state.transactions.push({
        id: 'foo',
        chainId: toHex(5),
        hash: '1337',
        status: TransactionStatus.submitted as const,
        time: 123456789,
        txParams: {
          from: MOCK_PREFERENCES.state.selectedAddress,
        },
      });
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
      const controller = newController();

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

      controller.state.transactions.push(
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
      );

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
      const controller = newController();

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
      const controller = newController();

      controller.state.transactions = [
        TRANSACTION_META_MOCK,
        TRANSACTION_META_2_MOCK,
      ];

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
      const controller = newController({ config: { txHistoryLimit: 1 } });

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
      const controller = newController();

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

    it('emits incomingTransactionBlock event', async () => {
      const blockNumber = 123;
      const listener = jest.fn();

      const controller = newController();
      controller.hub.on('incomingTransactionBlock', listener);

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
      const controller = newController();
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
      const controller = newController();
      controller.state.transactions.push({
        id: transactionId,
        status,
        error: new Error('mock error'),
        chainId: '0x1',
        time: 123456789,
        txParams: {} as TransactionParams,
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
      const controller = newController();

      const gas = '0xgas';
      const gasLimit = '0xgasLimit';
      const gasPrice = '0xgasPrice';
      const estimateUsed = '0xestimateUsed';
      const estimateSuggested = '0xestimateSuggested';
      const defaultGasEstimates = '0xdefaultGasEstimates';
      const originalGasEstimate = '0xoriginalGasEstimate';
      const userEditedGasLimit = true;
      const userFeeLevel = '0xuserFeeLevel';

      controller.state.transactions.push({
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
      });

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

      const controller = newController();

      controller.state.transactions.push({
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
      const controller = newController();
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
      const controller = newController();
      controller.state.transactions.push({
        id: transactionId,
        status,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
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
      const controller = newController();

      const gasLimit = '0xgasLimit';
      const maxFeePerGas = '0xmaxFeePerGas';
      const maxPriorityFeePerGas = '0xmaxPriorityFeePerGas';

      controller.state.transactions.push({
        id: transactionId,
        status: TransactionStatus.unapproved,
        history: [{}],
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

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
        const controller = newController();

        controller.hub.on(`${TRANSACTION_META_MOCK.id}:confirmed`, listener);
        controller.hub.on(`transaction-status-update`, statusUpdateListener);

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
        const controller = newController();

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

        controller.state.transactions = [
          confirmed,
          wrongChain,
          wrongNonce,
          wrongFrom,
          wrongType,
          duplicate_1,
          duplicate_2,
          duplicate_3,
        ] as TransactionMeta[];

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
      const controller = newController({
        options: { disableHistory: true },
      });

      controller.state.transactions = [{ ...TRANSACTION_META_MOCK }];

      firePendingTransactionTrackerEvent(
        'transaction-dropped',
        TRANSACTION_META_MOCK,
      );

      expect(controller.state.transactions).toStrictEqual([
        { ...TRANSACTION_META_MOCK, status: TransactionStatus.dropped },
      ]);
    });

    it('sets status to failed on transaction-failed event', async () => {
      const changedStatusEventListener = jest.fn();
      const controller = newController({
        options: { disableHistory: true },
      });
      controller.hub.on(
        'transaction-status-update',
        changedStatusEventListener,
      );

      const errorMock = new Error('TestError');
      const expectedTransactionError: TransactionError = {
        message: errorMock.message,
        name: errorMock.name,
        stack: errorMock.stack,
        code: undefined,
        rpc: undefined,
      };

      controller.state.transactions = [{ ...TRANSACTION_META_MOCK }];

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

      expect(changedStatusEventListener).toHaveBeenCalledTimes(1);
      expect(changedStatusEventListener).toHaveBeenCalledWith({
        transactionMeta: failedTx,
      });
    });

    it('updates transaction on transaction-updated event', async () => {
      const controller = newController({
        options: { disableHistory: true },
      });

      controller.state.transactions = [{ ...TRANSACTION_META_MOCK }];

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
      const controller = newController({
        config: {
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
      const controller = newController();
      const result = await controller.approveTransactionsWithSameNonce([]);
      expect(result).toBe('');
    });

    it('return empty string if transaction is already being signed', async () => {
      const controller = newController({
        config: {
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
      const controller = newController({
        config: {
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
      const controller = newController({
        config: {
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
      const controller = newController();

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
      const controller = newController();

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
    const paramsMock = {
      from: ACCOUNT_MOCK,
      to: ACCOUNT_MOCK,
    };

    const metadataMock = {
      txParams: paramsMock,
    };

    it('adds a transaction, signs and update status to `approved`', async () => {
      const controller = newController({
        options: {
          hooks: {
            afterSign: () => false,
            beforeApproveOnInit: () => false,
            beforePublish: () => false,
            getAdditionalSignArguments: () => [metadataMock],
          },
        },
      });
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signSpy = jest.spyOn(controller, 'sign' as any);
      const updateTransactionSpy = jest.spyOn(controller, 'updateTransaction');

      await controller.addTransaction(paramsMock, {
        origin: 'origin',
        actionId: ACTION_ID_MOCK,
      });

      approveTransaction();
      await wait(0);

      const transactionMeta = controller.state.transactions[0];

      expect(signSpy).toHaveBeenCalledTimes(1);

      expect(updateTransactionSpy).toHaveBeenCalledTimes(2);
      expect(updateTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          txParams: expect.objectContaining(paramsMock),
        }),
        'TransactionController#approveTransaction - Transaction approved',
      );
      expect(updateTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          txParams: expect.objectContaining(paramsMock),
        }),
        'TransactionController#signTransaction - Update after sign',
      );

      expect(transactionMeta.status).toBe(TransactionStatus.approved);
    });

    it('adds a transaction and signing returns undefined', async () => {
      const controller = newController({
        options: {
          hooks: {
            afterSign: () => false,
            beforeApproveOnInit: () => false,
            beforePublish: () => false,
            getAdditionalSignArguments: () => [metadataMock],
          },
        },
        config: { sign: async () => undefined },
      });
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signSpy = jest.spyOn(controller, 'sign' as any);
      const updateTransactionSpy = jest.spyOn(controller, 'updateTransaction');

      await controller.addTransaction(paramsMock, {
        origin: 'origin',
        actionId: ACTION_ID_MOCK,
      });

      approveTransaction();
      await wait(0);

      expect(signSpy).toHaveBeenCalledTimes(1);
      expect(updateTransactionSpy).toHaveBeenCalledTimes(1);
    });

    it('adds a transaction, signs and skips publish the transaction', async () => {
      const controller = newController({
        options: {
          hooks: {
            beforePublish: undefined,
            afterSign: () => false,
            getAdditionalSignArguments: () => [metadataMock],
          },
        },
      });
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signSpy = jest.spyOn(controller, 'sign' as any);
      const updateTransactionSpy = jest.spyOn(controller, 'updateTransaction');

      await controller.addTransaction(paramsMock, {
        origin: 'origin',
        actionId: ACTION_ID_MOCK,
      });

      approveTransaction();
      await wait(0);

      expect(signSpy).toHaveBeenCalledTimes(1);

      expect(updateTransactionSpy).toHaveBeenCalledTimes(2);
      expect(updateTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          txParams: expect.objectContaining(paramsMock),
        }),
        'TransactionController#approveTransaction - Transaction approved',
      );
      expect(updateTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          txParams: expect.objectContaining(paramsMock),
        }),
        'TransactionController#signTransaction - Update after sign',
      );
    });

    it('gets transaction hash from publish hook and does not submit to provider', async () => {
      const controller = newController({
        options: {
          hooks: {
            publish: async () => ({
              transactionHash: '0x123',
            }),
          },
        },
        approve: true,
      });

      const { result } = await controller.addTransaction(paramsMock);

      await result;

      expect(controller.state.transactions[0].hash).toBe('0x123');
      expect(mockSendRawTransaction).not.toHaveBeenCalled();
    });

    it('submits to provider if publish hook returns no transaction hash', async () => {
      const controller = newController({
        options: {
          hooks: {
            publish: async () => ({}),
          },
        },
        approve: true,
      });

      const { result } = await controller.addTransaction(paramsMock);

      await result;

      expect(controller.state.transactions[0].hash).toBe(
        ethQueryMockResults.sendRawTransaction,
      );

      expect(mockSendRawTransaction).toHaveBeenCalledTimes(1);
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
      const transactionMetaId = '123';
      const status = TransactionStatus.submitted;
      const controller = newController();
      controller.state.transactions.push({
        id: transactionMetaId,
        status,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
        history: mockSendFlowHistory,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      expect(controller.state.transactions[0]).toBeDefined();
      controller.updateSecurityAlertResponse(transactionMetaId, {
        reason: 'NA',
        result_type: 'Benign',
      });

      expect(
        controller.state.transactions[0].securityAlertResponse,
      ).toBeDefined();
    });

    it('should throw error if transactionMetaId is not defined', async () => {
      const transactionMetaId = '123';
      const status = TransactionStatus.submitted;
      const controller = newController();
      controller.state.transactions.push({
        id: transactionMetaId,
        status,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      expect(controller.state.transactions[0]).toBeDefined();

      expect(() =>
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        controller.updateSecurityAlertResponse(undefined as any, {
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
      const controller = newController();
      controller.state.transactions.push({
        id: transactionMetaId,
        status,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
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
      const controller = newController();
      controller.state.transactions.push({
        id: transactionMetaId,
        status,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
        history: mockSendFlowHistory,
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
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
      const transactionId = '1';
      const statusMock = TransactionStatus.unapproved as const;
      const baseTransaction = {
        id: transactionId,
        chainId: toHex(5),
        status: statusMock,
        time: 123456789,
        txParams: {
          from: ACCOUNT_MOCK,
          to: ACCOUNT_2_MOCK,
        },
      };
      const transactionMeta: TransactionMeta = {
        ...baseTransaction,
        custodyId: '123',
        history: [{ ...baseTransaction }],
      };

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
          const controller = newController();
          controller.state.transactions.push(transactionMeta);

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
        'emits txId:finished when update transaction status to $newStatus',
        async ({ newStatus, errorMessage }) => {
          const controller = newController();
          const hubEmitSpy = jest
            .spyOn(controller.hub, 'emit')
            .mockImplementation();
          controller.state.transactions.push(transactionMeta);

          controller.updateCustodialTransaction(transactionId, {
            status: newStatus,
            errorMessage,
          });

          const updatedTransaction = controller.state.transactions[0];

          expect(hubEmitSpy).toHaveBeenCalledTimes(1);
          expect(hubEmitSpy).toHaveBeenCalledWith(
            `${transactionId}:finished`,
            updatedTransaction,
          );
          expect(updatedTransaction?.status).toStrictEqual(newStatus);
        },
      );

      it('updates transaction hash', async () => {
        const newHash = '1234';
        const controller = newController();
        const hubEmitSpy = jest
          .spyOn(controller.hub, 'emit')
          .mockImplementation();
        controller.state.transactions.push(transactionMeta);

        controller.updateCustodialTransaction(transactionId, {
          hash: newHash,
        });

        const updatedTransaction = controller.state.transactions[0];

        expect(hubEmitSpy).toHaveBeenCalledTimes(0);
        expect(updatedTransaction?.hash).toStrictEqual(newHash);
      });

      it('throws if custodial transaction does not exists', async () => {
        const nonExistentId = 'nonExistentId';
        const newStatus = TransactionStatus.approved as const;
        const controller = newController();

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
        const controller = newController();
        controller.state.transactions.push(nonCustodialTransaction);

        expect(() =>
          controller.updateCustodialTransaction(nonCustodialTransaction.id, {
            status: newStatus,
          }),
        ).toThrow('Transaction must be a custodian transaction');
      });

      it('throws if status is invalid', async () => {
        const newStatus = TransactionStatus.approved as const;
        const controller = newController();
        controller.state.transactions.push(transactionMeta);

        expect(() =>
          controller.updateCustodialTransaction(transactionMeta.id, {
            status: newStatus,
          }),
        ).toThrow(
          `Cannot update custodial transaction with status: ${newStatus}`,
        );
      });

      it('no property was updated', async () => {
        const controller = newController();
        controller.state.transactions.push(transactionMeta);

        controller.updateCustodialTransaction(transactionId, {});

        const updatedTransaction = controller.state.transactions[0];

        expect(updatedTransaction?.status).toStrictEqual(
          transactionMeta.status,
        );
        expect(updatedTransaction?.hash).toStrictEqual(transactionMeta.hash);
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

        const controller = newController({
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          state: mockedControllerState as any,
        });

        controller.initApprovals();
        await flushPromises();

        expect(messengerMock.call).toHaveBeenCalledTimes(2);
        expect(messengerMock.call).toHaveBeenCalledWith(
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
        expect(messengerMock.call).toHaveBeenCalledWith(
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

      it('only reads the current chain id to filter for unapproved transactions', async () => {
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

        const getNetworkStateMock = jest
          .fn()
          .mockReturnValue(MOCK_NETWORK.state);

        const controller = newController({
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          state: mockedControllerState as any,
          options: { getNetworkState: getNetworkStateMock },
        });

        controller.initApprovals();
        await flushPromises();

        expect(getNetworkStateMock).toHaveBeenCalledTimes(1);
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

        const controller = newController({
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          state: mockedControllerState as any,
        });

        const mockedErrorMessage = 'mocked error';

        // Expect both calls to throw error, one with code property to check if it is handled
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (messengerMock.call as jest.MockedFunction<any>)
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
        expect(messengerMock.call).toHaveBeenCalledTimes(2);
      });

      it('does not create any approval when there is no unapproved transaction', async () => {
        const controller = newController();
        controller.initApprovals();
        await flushPromises();
        expect(messengerMock.call).not.toHaveBeenCalled();
      });
    });

    describe('getTransactions', () => {
      it('returns transactions matching values in search criteria', () => {
        const controller = newController();

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

        controller.state.transactions = transactions;

        expect(
          controller.getTransactions({
            searchCriteria: { time: 1 },
            filterToCurrentNetwork: false,
          }),
        ).toStrictEqual([transactions[0], transactions[2]]);
      });

      it('returns transactions matching param values in search criteria', () => {
        const controller = newController();

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

        controller.state.transactions = transactions;

        expect(
          controller.getTransactions({
            searchCriteria: { from: '0x1' },
            filterToCurrentNetwork: false,
          }),
        ).toStrictEqual([transactions[0], transactions[2]]);
      });

      it('returns transactions matching multiple values in search criteria', () => {
        const controller = newController();

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

        controller.state.transactions = transactions;

        expect(
          controller.getTransactions({
            searchCriteria: { from: '0x1', time: 1 },
            filterToCurrentNetwork: false,
          }),
        ).toStrictEqual([transactions[0], transactions[2]]);
      });

      it('returns transactions matching function in search criteria', () => {
        const controller = newController();

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

        controller.state.transactions = transactions;

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
        const controller = newController();

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

        controller.state.transactions = transactions;

        expect(
          controller.getTransactions({
            filterToCurrentNetwork: true,
          }),
        ).toStrictEqual([transactions[0], transactions[2]]);
      });

      it('returns transactions from specified list', () => {
        const controller = newController();

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
        const controller = newController();

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

        controller.state.transactions = transactions;

        expect(
          controller.getTransactions({
            searchCriteria: { from: '0x1' },
            filterToCurrentNetwork: false,
            limit: 2,
          }),
        ).toStrictEqual([transactions[1], transactions[3]]);
      });

      it('returns limited number of transactions except for duplicate nonces', () => {
        const controller = newController();

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

        controller.state.transactions = transactions;

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
      data: '0x0',
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
      const controller = newController();
      controller.state.transactions.push(transactionMeta);

      const updatedTransaction = await controller.updateEditableParams(
        transactionId,
        params,
      );

      expect(updatedTransaction?.txParams).toStrictEqual(params);
    });

    it('throws an error if no transaction metadata is found', async () => {
      const controller = newController();
      await expect(
        controller.updateEditableParams(transactionId, params),
      ).rejects.toThrow(
        'Cannot update editable params as no transaction metadata found',
      );
    });

    it('throws an error if the transaction is not unapproved', async () => {
      const controller = newController();
      controller.state.transactions.push({
        ...transactionMeta,
        status: TransactionStatus.submitted as const,
      });
      await expect(controller.updateEditableParams(transactionId, params))
        .rejects
        .toThrow(`TransactionsController: Can only call updateEditableParams on an unapproved transaction.
      Current tx status: ${TransactionStatus.submitted}`);
    });
  });

  describe('abortTransactionSigning', () => {
    it('throws if transaction does not exist', () => {
      const controller = newController();

      expect(() =>
        controller.abortTransactionSigning(TRANSACTION_META_MOCK.id),
      ).toThrow('Cannot abort signing as no transaction metadata found');
    });

    it('throws if transaction not being signed', () => {
      const controller = newController();

      controller.state.transactions = [TRANSACTION_META_MOCK];

      expect(() =>
        controller.abortTransactionSigning(TRANSACTION_META_MOCK.id),
      ).toThrow(
        'Cannot abort signing as transaction is not waiting for signing',
      );
    });

    it('sets status to failed if transaction being signed', async () => {
      const controller = newController({
        approve: true,
        config: {
          sign: jest.fn().mockReturnValue(createDeferredPromise().promise),
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
});
