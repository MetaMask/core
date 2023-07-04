/* eslint-disable jest/expect-expect */

import HttpProvider from 'ethjs-provider-http';
import NonceTracker from 'nonce-tracker';
import { ChainId, NetworkType, toHex } from '@metamask/controller-utils';
import type {
  BlockTracker,
  NetworkState,
  ProviderProxy,
} from '@metamask/network-controller';
import { NetworkStatus } from '@metamask/network-controller';
import { errorCodes } from 'eth-rpc-errors';
import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import {
  AcceptResultCallbacks,
  AddResult,
} from '../../approval-controller/src';
import { ESTIMATE_GAS_ERROR } from './utils';
import {
  TransactionController,
  TransactionStatus,
  TransactionMeta,
  TransactionControllerMessenger,
  TransactionConfig,
} from './TransactionController';
import {
  ethTxsMock,
  tokenTxsMock,
  txsInStateMock,
  txsInStateWithOutdatedStatusMock,
  txsInStateWithOutdatedGasDataMock,
  txsInStateWithOutdatedStatusAndGasDataMock,
} from './mocks/txsMock';

const v1Stub = jest
  .fn()
  .mockImplementation(() => '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');

jest.mock('uuid', () => {
  return {
    ...jest.requireActual('uuid'),
    v1: () => v1Stub(),
  };
});

const mockFlags: { [key: string]: any } = {
  estimateGasError: null,
  estimateGasValue: null,
  getBlockByNumberValue: null,
};

jest.mock('eth-query', () =>
  jest.fn().mockImplementation(() => {
    return {
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
      gasPrice: (callback: any) => {
        callback(undefined, '0x0');
      },
      getBlockByNumber: (
        _blocknumber: any,
        _fetchTxs: boolean,
        callback: any,
      ) => {
        if (mockFlags.getBlockByNumberValue) {
          callback(undefined, { gasLimit: '0x12a05f200' });
          return;
        }
        callback(undefined, { gasLimit: '0x0' });
      },
      getCode: (_to: any, callback: any) => {
        callback(undefined, '0x0');
      },
      getTransactionByHash: (_hash: string, callback: any) => {
        const txs: any = [
          { transactionHash: '1337', blockNumber: '0x1' },
          { transactionHash: '1338', blockNumber: null },
        ];
        const tx: any = txs.find(
          (element: any) => element.transactionHash === _hash,
        );
        callback(undefined, tx);
      },
      getTransactionCount: (_from: any, _to: any, callback: any) => {
        callback(undefined, '0x0');
      },
      sendRawTransaction: (_transaction: any, callback: any) => {
        callback(undefined, '1337');
      },
      getTransactionReceipt: (_hash: any, callback: any) => {
        const txs: any = [
          { transactionHash: '1337', gasUsed: '0x5208', status: '0x1' },
          { transactionHash: '1111', gasUsed: '0x1108', status: '0x0' },
        ];
        const tx: any = txs.find(
          (element: any) => element.transactionHash === _hash,
        );
        callback(undefined, tx);
      },
    };
  }),
);

/**
 * Create a mock implementation of `fetch` that always returns the same data.
 *
 * @param data - The mock data to return.
 * @returns The mock `fetch` implementation.
 */
function mockFetchWithStaticResponse(data: any) {
  return jest
    .spyOn(global, 'fetch')
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(data))),
    );
}

/**
 * Mocks the global `fetch` to return the different mock data for each URL
 * requested.
 *
 * @param dataForUrl - A map of mock data, keyed by URL.
 * @returns The mock `fetch` implementation.
 */
function mockFetchWithDynamicResponse(dataForUrl: any) {
  return jest
    .spyOn(global, 'fetch')
    .mockImplementation((key) =>
      Promise.resolve(new Response(JSON.stringify(dataForUrl[key.toString()]))),
    );
}

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
 * Create a mock controller messenger.
 *
 * @param opts - Options to customize the mock messenger.
 * @param opts.approved - Whether transactions should immediately be approved or rejected.
 * @param opts.delay - Whether to delay approval or rejection until the returned functions are called.
 * @param opts.resultCallbacks - The result callbacks to return when a request is approved.
 * @returns The mock controller messenger.
 */
function buildMockMessenger({
  approved,
  delay,
  resultCallbacks,
}: {
  approved?: boolean;
  delay?: boolean;
  resultCallbacks?: AcceptResultCallbacks;
}): {
  messenger: TransactionControllerMessenger;
  approve: () => void;
  reject: (reason: any) => void;
} {
  let approve, reject;
  let promise: Promise<AddResult>;

  if (delay) {
    promise = new Promise((res, rej) => {
      approve = () => res({ resultCallbacks });
      reject = rej;
    });
  }

  const messenger = {
    call: jest.fn().mockImplementation(() => {
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
    }),
  } as unknown as TransactionControllerMessenger;

  return {
    messenger,
    approve: approve as any,
    reject: reject as any,
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

const MOCK_PRFERENCES = { state: { selectedAddress: 'foo' } };
const GOERLI_PROVIDER = new HttpProvider(
  'https://goerli.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const PALM_PROVIDER = new HttpProvider(
  'https://palm-mainnet.infura.io/v3/3a961d6501e54add9a41aa53f15de99b',
);

type MockNetwork = {
  provider: ProviderProxy;
  blockTracker: BlockTracker;
  state: NetworkState;
  subscribe: (listener: (state: NetworkState) => void) => void;
};

const MOCK_NETWORK: MockNetwork = {
  provider: MAINNET_PROVIDER,
  blockTracker: buildMockBlockTracker('0x102833C'),
  state: {
    networkId: '5',
    networkStatus: NetworkStatus.Available,
    networkDetails: { EIPS: { 1559: false } },
    providerConfig: {
      type: NetworkType.goerli,
      chainId: ChainId.goerli,
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};
const MOCK_NETWORK_WITHOUT_CHAIN_ID: MockNetwork = {
  provider: GOERLI_PROVIDER,
  blockTracker: buildMockBlockTracker('0x102833C'),
  state: {
    networkId: '5',
    networkStatus: NetworkStatus.Available,
    networkDetails: { EIPS: { 1559: false } },
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
    networkId: '1',
    networkStatus: NetworkStatus.Available,
    networkDetails: { EIPS: { 1559: false } },
    providerConfig: {
      type: NetworkType.mainnet,
      chainId: ChainId.mainnet,
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};
const MOCK_CUSTOM_NETWORK: MockNetwork = {
  provider: PALM_PROVIDER,
  blockTracker: buildMockBlockTracker('0xA6EDFC'),
  state: {
    networkId: '11297108109',
    networkStatus: NetworkStatus.Available,
    networkDetails: { EIPS: { 1559: false } },
    providerConfig: {
      type: NetworkType.rpc,
      chainId: toHex(11297108109),
    },
    networkConfigurations: {},
  },
  subscribe: () => undefined,
};

const TOKEN_TRANSACTION_HASH =
  '0x01d1cebeab9da8d887b36000c25fa175737e150f193ea37d5bb66347d834e999';
const ETHER_TRANSACTION_HASH =
  '0xa9d17df83756011ea63e1f0ca50a6627df7cac9806809e36680fcf4e88cb9dae';

const ETH_TRANSACTIONS = ethTxsMock(ETHER_TRANSACTION_HASH);

const TOKEN_TRANSACTIONS = tokenTxsMock(TOKEN_TRANSACTION_HASH);

const TRANSACTIONS_IN_STATE: TransactionMeta[] = txsInStateMock(
  ETHER_TRANSACTION_HASH,
  TOKEN_TRANSACTION_HASH,
);

const TRANSACTIONS_IN_STATE_WITH_OUTDATED_STATUS: TransactionMeta[] =
  txsInStateWithOutdatedStatusMock(
    ETHER_TRANSACTION_HASH,
    TOKEN_TRANSACTION_HASH,
  );

const TRANSACTIONS_IN_STATE_WITH_OUTDATED_GAS_DATA: TransactionMeta[] =
  txsInStateWithOutdatedGasDataMock(
    ETHER_TRANSACTION_HASH,
    TOKEN_TRANSACTION_HASH,
  );

const TRANSACTIONS_IN_STATE_WITH_OUTDATED_STATUS_AND_GAS_DATA: TransactionMeta[] =
  txsInStateWithOutdatedStatusAndGasDataMock(
    ETHER_TRANSACTION_HASH,
    TOKEN_TRANSACTION_HASH,
  );

const ETH_TX_HISTORY_DATA = {
  message: 'OK',
  result: ETH_TRANSACTIONS,
  status: '1',
};

const ETH_TX_HISTORY_DATA_FROM_BLOCK = {
  message: 'OK',
  result: [ETH_TRANSACTIONS[0], ETH_TRANSACTIONS[1]],
  status: '1',
};

const TOKEN_TX_HISTORY_DATA = {
  message: 'OK',
  result: TOKEN_TRANSACTIONS,
  status: '1',
};

const TOKEN_TX_HISTORY_DATA_FROM_BLOCK = {
  message: 'OK',
  result: [TOKEN_TRANSACTIONS[0]],
  status: '1',
};

const ETH_TX_HISTORY_DATA_GOERLI_NO_TRANSACTIONS_FOUND = {
  message: 'No transactions found',
  result: [],
  status: '0',
};

const ACCOUNT_MOCK = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';

const MOCK_FETCH_TX_HISTORY_DATA_OK = {
  [`https://api-goerli.etherscan.io/api?module=account&address=${ACCOUNT_MOCK}&offset=40&order=desc&action=tokentx&tag=latest&page=1`]:
    ETH_TX_HISTORY_DATA_GOERLI_NO_TRANSACTIONS_FOUND,
  [`https://api.etherscan.io/api?module=account&address=${ACCOUNT_MOCK}&offset=40&order=desc&action=tokentx&tag=latest&page=1`]:
    TOKEN_TX_HISTORY_DATA,
  [`https://api.etherscan.io/api?module=account&address=${ACCOUNT_MOCK}&startBlock=999&offset=40&order=desc&action=tokentx&tag=latest&page=1`]:
    TOKEN_TX_HISTORY_DATA_FROM_BLOCK,
  [`https://api.etherscan.io/api?module=account&address=${ACCOUNT_MOCK}&offset=40&order=desc&action=txlist&tag=latest&page=1`]:
    ETH_TX_HISTORY_DATA,
  [`https://api-goerli.etherscan.io/api?module=account&address=${ACCOUNT_MOCK}&offset=40&order=desc&action=txlist&tag=latest&page=1`]:
    ETH_TX_HISTORY_DATA,
  [`https://api.etherscan.io/api?module=account&address=${ACCOUNT_MOCK}&startBlock=999&offset=40&order=desc&action=txlist&tag=latest&page=1`]:
    ETH_TX_HISTORY_DATA_FROM_BLOCK,
  [`https://api-goerli.etherscan.io/api?module=account&address=${ACCOUNT_MOCK}&offset=2&order=desc&action=tokentx&tag=latest&page=1`]:
    ETH_TX_HISTORY_DATA_GOERLI_NO_TRANSACTIONS_FOUND,
  [`https://api-goerli.etherscan.io/api?module=account&address=${ACCOUNT_MOCK}&offset=2&order=desc&action=txlist&tag=latest&page=1`]:
    ETH_TX_HISTORY_DATA,
};

const MOCK_FETCH_TX_HISTORY_DATA_ERROR = {
  status: '0',
};

const NONCE_MOCK = 12;

describe('TransactionController', () => {
  let resultCallbacksMock: AcceptResultCallbacks;
  let messengerMock: TransactionControllerMessenger;
  let rejectMessengerMock: TransactionControllerMessenger;
  let delayMessengerMock: TransactionControllerMessenger;
  let approveTransaction: () => void;
  let getNonceLockSpy: jest.Mock<any, any>;

  /**
   * Create a new instance of the TransactionController.
   *
   * @param opts - Options to use when creating the controller.
   * @param opts.options - Any controller options to override the test defaults.
   * @param opts.config - Any configuration to override the test defaults.
   * @param opts.network - The mock network to use with the controller.
   * @param opts.approve - Whether transactions should be immediately approved.
   * @param opts.reject - Whether transactions should be immediately rejected.
   * @returns The new TransactionController instance.
   */
  function newController({
    options,
    config,
    network,
    approve,
    reject,
  }: {
    options?: any;
    config?: Partial<TransactionConfig>;
    network?: MockNetwork;
    approve?: boolean;
    reject?: boolean;
  } = {}): TransactionController {
    const finalNetwork = network ?? MOCK_NETWORK;
    let messenger = delayMessengerMock;

    if (approve) {
      messenger = messengerMock;
    }

    if (reject) {
      messenger = rejectMessengerMock;
    }

    return new TransactionController(
      {
        getNetworkState: () => finalNetwork.state,
        onNetworkStateChange: finalNetwork.subscribe,
        provider: finalNetwork.provider,
        blockTracker: finalNetwork.blockTracker,
        messenger,
        ...options,
      },
      {
        sign: async (transaction: any) => transaction,
        ...config,
      },
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
    for (const key in mockFlags) {
      mockFlags[key] = null;
    }

    resultCallbacksMock = buildMockResultCallbacks();

    messengerMock = buildMockMessenger({
      approved: true,
      resultCallbacks: resultCallbacksMock,
    }).messenger;

    rejectMessengerMock = buildMockMessenger({
      approved: false,
      resultCallbacks: resultCallbacksMock,
    }).messenger;

    ({ messenger: delayMessengerMock, approve: approveTransaction } =
      buildMockMessenger({
        delay: true,
        resultCallbacks: resultCallbacksMock,
      }));

    getNonceLockSpy = jest.fn().mockResolvedValue({
      nextNonce: NONCE_MOCK,
      releaseLock: () => Promise.resolve(),
    });

    NonceTracker.prototype.getNonceLock = getNonceLockSpy;
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
      });
    });

    it('sets default config', () => {
      const controller = newController();
      expect(controller.config).toStrictEqual({
        interval: 15000,
        txHistoryLimit: 40,
        sign: expect.any(Function),
      });
    });
  });

  describe('poll', () => {
    it('updates transaction statuses in the right interval', async () => {
      const mock = jest.spyOn(
        TransactionController.prototype,
        'queryTransactionStatuses',
      );

      newController({ config: { interval: 10 } });

      expect(mock).toHaveBeenCalledTimes(1);
      await wait(15);
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it('clears previous interval', async () => {
      const mock = jest.spyOn(global, 'clearTimeout');
      const controller = newController({ config: { interval: 1337 } });

      await wait(100);
      controller.poll(1338);
      expect(mock).toHaveBeenCalled();
    });

    it('does not update the state if there are no updates on transaction statuses', async () => {
      const controller = newController({ config: { interval: 10 } });
      const func = jest.spyOn(controller, 'update');

      await wait(20);
      expect(func).not.toHaveBeenCalled();
    });
  });

  describe('estimateGas', () => {
    /**
     * Test template to assert estimate gas succeeds.
     *
     * @param opts - Options to use when testing.
     * @param opts.network - The network to use.
     * @param opts.estimateGasValue - The value to return from the estimate gas call.
     * @param opts.getBlockByNumberValue - The value to return from the get block by number call.
     */
    async function estimateGasSucceeds({
      network,
      estimateGasValue,
      getBlockByNumberValue,
    }: {
      network: MockNetwork;
      estimateGasValue?: string;
      getBlockByNumberValue?: string;
    }) {
      const controller = newController({ network });

      if (estimateGasValue) {
        mockFlags.estimateGasValue = estimateGasValue;
      }

      if (getBlockByNumberValue) {
        mockFlags.getBlockByNumberValue = getBlockByNumberValue;
      }

      const result = await controller.estimateGas({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(result.estimateGasError).toBeUndefined();
    }

    /**
     * Test template to assert estimate gas fails.
     *
     * @param opts - Options to use when testing.
     * @param opts.network - The network to use.
     * @param opts.getBlockByNumberValue - The value to return from the get block by number call.
     */
    async function estimateGasFails({
      network,
      getBlockByNumberValue,
    }: {
      network: MockNetwork;
      getBlockByNumberValue?: string;
    }) {
      const controller = newController({ network });

      if (getBlockByNumberValue) {
        mockFlags.getBlockByNumberValue = getBlockByNumberValue;
      }

      mockFlags.estimateGasError = ESTIMATE_GAS_ERROR;

      const result = await controller.estimateGas({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(result.estimateGasError).toBe(ESTIMATE_GAS_ERROR);
    }

    it('succeeds when gasBn is greater than maxGasBN', async () => {
      await estimateGasSucceeds({
        network: MOCK_NETWORK,
        estimateGasValue: '0x12a05f200',
      });
    });

    it('succeeds on mainnet when gasBn is higher than maxGasBN', async () => {
      await estimateGasSucceeds({
        network: MOCK_MAINNET_NETWORK,
        estimateGasValue: '0x12a05f200',
      });
    });

    it('succeeds on custom network when gasBN is equal to maxGasBN', async () => {
      await estimateGasSucceeds({
        network: MOCK_CUSTOM_NETWORK,
      });
    });

    it('succeed on custom network when gasBN is less than maxGasBN', async () => {
      await estimateGasSucceeds({
        network: MOCK_CUSTOM_NETWORK,
        getBlockByNumberValue: '0x12a05f200',
      });
    });

    it('succeeds when gasBN is less than maxGasBN and paddedGasBN is less than MaxGasBN', async () => {
      await estimateGasSucceeds({
        network: MOCK_NETWORK,
        getBlockByNumberValue: '0x12a05f200',
      });
    });

    it('fails on custom network when gasBN is equal to maxGasBN', async () => {
      await estimateGasFails({ network: MOCK_CUSTOM_NETWORK });
    });

    it('fails on custom network when gasBN is less than maxGasBN', async () => {
      await estimateGasFails({
        network: MOCK_CUSTOM_NETWORK,
        getBlockByNumberValue: '0x12a05f200',
      });
    });

    it('fails when gasBN is less than maxGasBN and paddedGasBN is less than MaxGasBN', async () => {
      await estimateGasFails({
        network: MOCK_NETWORK,
        getBlockByNumberValue: '0x12a05f200',
      });
    });
  });

  describe('addTransaction', () => {
    it('adds unapproved transaction to state', async () => {
      const controller = newController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(controller.state.transactions[0].transaction.from).toBe(
        ACCOUNT_MOCK,
      );
      expect(controller.state.transactions[0].networkID).toBe(
        MOCK_NETWORK.state.networkId,
      );
      expect(controller.state.transactions[0].chainId).toBe(
        MOCK_NETWORK.state.providerConfig.chainId,
      );
      expect(controller.state.transactions[0].status).toBe(
        TransactionStatus.unapproved,
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

        expect(controller.state.transactions[0].transaction.from).toBe(
          ACCOUNT_MOCK,
        );
        expect(controller.state.transactions[0].networkID).toBe(
          newNetwork.state.networkId,
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
      await expect(
        controller.addTransaction({ from: 'foo' } as any),
      ).rejects.toThrow('Invalid "from" address');
    });

    it('limits transaction state to a length of 2', async () => {
      mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);

      const controller = newController({
        config: {
          interval: 5000,
          txHistoryLimit: 2,
        },
      });

      await controller.fetchAll(ACCOUNT_MOCK);

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        nonce: '55555',
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      expect(controller.state.transactions).toHaveLength(2);
      expect(controller.state.transactions[0].transaction.gasPrice).toBe(
        '0x4a817c800',
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
      NonceTracker.prototype.getNonceLock = jest.fn().mockResolvedValue({
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

      expect(firstTransaction.transaction.nonce).toStrictEqual(
        `0x${NONCE_MOCK.toString(16)}`,
      );

      expect(secondTransaction.transaction.nonce).toStrictEqual(
        `0x${(NONCE_MOCK + 1).toString(16)}`,
      );
    });

    it('requests approval using the approval controller', async () => {
      const controller = newController();

      await controller.addTransaction({
        from: ACCOUNT_MOCK,
        to: ACCOUNT_MOCK,
      });

      expect(delayMessengerMock.call).toHaveBeenCalledTimes(1);
      expect(delayMessengerMock.call).toHaveBeenCalledWith(
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

    it.each([
      ['mainnet', MOCK_MAINNET_NETWORK],
      ['custom network', MOCK_CUSTOM_NETWORK],
    ])(
      'populates estimateGasError if gas calculation fails on %s',
      async (_title, network) => {
        const controller = newController({ network });

        mockFlags.estimateGasError = ESTIMATE_GAS_ERROR;

        await controller.addTransaction({
          from: ACCOUNT_MOCK,
          to: ACCOUNT_MOCK,
        });

        const {
          transaction: { estimateGasError },
        } = controller.state.transactions[0];

        expect(estimateGasError).toBe(ESTIMATE_GAS_ERROR);
      },
    );

    describe('on approve', () => {
      it('submits transaction', async () => {
        const controller = newController({ approve: true });

        const { result } = await controller.addTransaction({
          from: ACCOUNT_MOCK,
          gas: '0x0',
          gasPrice: '0x0',
          to: ACCOUNT_MOCK,
          value: '0x0',
        });

        await result;

        const { transaction, status } = controller.state.transactions[0];
        expect(transaction.from).toBe(ACCOUNT_MOCK);
        expect(transaction.nonce).toBe(`0x${NONCE_MOCK.toString(16)}`);
        expect(status).toBe(TransactionStatus.submitted);
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

          const { transaction, status } = controller.state.transactions[0];
          expect(transaction.from).toBe(ACCOUNT_MOCK);
          expect(transaction.to).toBe(ACCOUNT_MOCK);
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

          (
            delayMessengerMock.call as jest.MockedFunction<any>
          ).mockImplementationOnce(() => {
            controller.state.transactions[0].status =
              TransactionStatus.confirmed;

            throw new Error('TestError');
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

          (
            delayMessengerMock.call as jest.MockedFunction<any>
          ).mockImplementationOnce(() => {
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

          (
            delayMessengerMock.call as jest.MockedFunction<any>
          ).mockImplementationOnce(() => {
            controller.state.transactions = [];
            throw new Error('TestError');
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

        await expect(result).rejects.toThrow('User rejected the transaction');

        const { transaction, status } = await finishedPromise;
        expect(transaction.from).toBe(ACCOUNT_MOCK);
        expect(status).toBe(TransactionStatus.rejected);
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

    // This tests the fallback to networkId only when there is no chainId present.
    // It should be removed when networkID is completely removed.
    it('removes all transactions with matching networkId when there is no chainId', async () => {
      const controller = newController();

      controller.wipeTransactions();

      controller.state.transactions.push({
        from: MOCK_PRFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '5',
        status: TransactionStatus.submitted,
        transactionHash: '1337',
      } as any);

      controller.wipeTransactions();

      expect(controller.state.transactions).toHaveLength(0);
    });
  });

  describe('queryTransactionStatus', () => {
    it('updates transaction status to confirmed', async () => {
      const controller = newController();

      controller.state.transactions.push({
        from: MOCK_PRFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '5',
        chainId: toHex(5),
        status: TransactionStatus.submitted,
        transactionHash: '1337',
      } as any);

      controller.state.transactions.push({} as any);

      const confirmedPromise = waitForTransactionFinished(controller, {
        confirmed: true,
      });

      await controller.queryTransactionStatuses();

      const { status } = await confirmedPromise;
      expect(status).toBe(TransactionStatus.confirmed);
    });

    // This tests the fallback to networkId only when there is no chainId present.
    // It should be removed when networkId is completely removed.
    it('uses networkId only when there is no chainId', async () => {
      const controller = newController();

      controller.state.transactions.push({
        from: MOCK_PRFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '5',
        status: TransactionStatus.submitted,
        transactionHash: '1337',
      } as any);

      controller.state.transactions.push({} as any);

      const confirmedPromise = waitForTransactionFinished(controller, {
        confirmed: true,
      });

      await controller.queryTransactionStatuses();

      const { status } = await confirmedPromise;
      expect(status).toBe(TransactionStatus.confirmed);
    });

    it('leaves transaction status as submitted if transaction was not added to a block', async () => {
      const controller = newController();

      controller.state.transactions.push({
        from: MOCK_PRFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '5',
        status: TransactionStatus.submitted,
        transactionHash: '1338',
      } as any);

      await controller.queryTransactionStatuses();

      const { status } = controller.state.transactions[0];
      expect(status).toBe(TransactionStatus.submitted);
    });

    it('verifies transactions using the correct blockchain', async () => {
      const controller = newController();

      controller.state.transactions.push({
        from: MOCK_PRFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '5',
        chainId: toHex(5),
        status: TransactionStatus.confirmed,
        transactionHash: '1337',
        verifiedOnBlockchain: false,
        transaction: {
          gasUsed: undefined,
        },
      } as any);

      await controller.queryTransactionStatuses();

      const transactionMeta = controller.state.transactions[0];
      expect(transactionMeta.verifiedOnBlockchain).toBe(true);
      expect(transactionMeta.transaction.gasUsed).toBe('0x5208');
    });
  });

  describe('fetchAll', () => {
    it.each([
      ['goerli', MOCK_NETWORK, 4],
      ['mainnet', MOCK_MAINNET_NETWORK, 17],
    ])(
      'retrieves all transactions from %s matching an address',
      async (_networkName, network, transactionCount) => {
        mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);

        const controller = newController({ network });

        controller.wipeTransactions();
        expect(controller.state.transactions).toHaveLength(0);

        const latestBlock = await controller.fetchAll(ACCOUNT_MOCK);

        const { transactions } = controller.state;
        expect(transactions).toHaveLength(transactionCount);
        expect(latestBlock).toBe('4535101');
        expect(transactions[0].transaction.to).toBe(ACCOUNT_MOCK);
      },
    );

    it('retrieves all transactions matching an address from a specified block', async () => {
      mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);

      const controller = newController({ network: MOCK_MAINNET_NETWORK });

      controller.wipeTransactions();
      expect(controller.state.transactions).toHaveLength(0);

      const latestBlock = await controller.fetchAll(ACCOUNT_MOCK, {
        fromBlock: '999',
      });

      expect(controller.state.transactions).toHaveLength(3);
      expect(latestBlock).toBe('4535101');
      expect(controller.state.transactions[0].transaction.to).toBe(
        ACCOUNT_MOCK,
      );
    });

    it('does not modify transactions that have the same data in local and remote', async () => {
      mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);

      const controller = newController({ network: MOCK_MAINNET_NETWORK });

      controller.wipeTransactions();
      controller.state.transactions = TRANSACTIONS_IN_STATE;

      await controller.fetchAll(ACCOUNT_MOCK);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(17);

      const tokenTransaction = transactions.find(
        ({ transactionHash }) => transactionHash === TOKEN_TRANSACTION_HASH,
      ) || { id: '' };

      const ethTransaction = transactions.find(
        ({ transactionHash }) => transactionHash === ETHER_TRANSACTION_HASH,
      ) || { id: '' };

      expect(tokenTransaction?.id).toStrictEqual('token-transaction-id');
      expect(ethTransaction?.id).toStrictEqual('eth-transaction-id');
    });

    it('updates all transactions with outdated status using remote data', async () => {
      mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);

      const controller = newController({ network: MOCK_MAINNET_NETWORK });

      controller.wipeTransactions();
      expect(controller.state.transactions).toHaveLength(0);

      controller.state.transactions =
        TRANSACTIONS_IN_STATE_WITH_OUTDATED_STATUS;

      await controller.fetchAll(ACCOUNT_MOCK);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(17);

      const tokenTransaction = transactions.find(
        ({ transactionHash }) => transactionHash === TOKEN_TRANSACTION_HASH,
      ) || { status: TransactionStatus.failed };

      const ethTransaction = transactions.find(
        ({ transactionHash }) => transactionHash === ETHER_TRANSACTION_HASH,
      ) || { status: TransactionStatus.failed };

      expect(tokenTransaction?.status).toStrictEqual(
        TransactionStatus.confirmed,
      );
      expect(ethTransaction?.status).toStrictEqual(TransactionStatus.confirmed);
    });

    it('updates all transactions with outdated gas using remote data', async () => {
      mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);

      const controller = newController({ network: MOCK_MAINNET_NETWORK });

      controller.wipeTransactions();
      expect(controller.state.transactions).toHaveLength(0);

      controller.state.transactions =
        TRANSACTIONS_IN_STATE_WITH_OUTDATED_GAS_DATA;

      await controller.fetchAll(ACCOUNT_MOCK);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(17);

      const tokenTransaction = transactions.find(
        ({ transactionHash }) => transactionHash === TOKEN_TRANSACTION_HASH,
      ) || { transaction: { gasUsed: '0' } };

      const ethTransaction = transactions.find(
        ({ transactionHash }) => transactionHash === ETHER_TRANSACTION_HASH,
      ) || { transaction: { gasUsed: '0x0' } };

      expect(tokenTransaction?.transaction.gasUsed).toStrictEqual('21000');
      expect(ethTransaction?.transaction.gasUsed).toStrictEqual('0x5208');
    });

    it('updates all transactions with outdated status and gas data using remote data', async () => {
      mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);

      const controller = newController({ network: MOCK_MAINNET_NETWORK });

      controller.wipeTransactions();
      expect(controller.state.transactions).toHaveLength(0);

      controller.state.transactions =
        TRANSACTIONS_IN_STATE_WITH_OUTDATED_STATUS_AND_GAS_DATA;

      await controller.fetchAll(ACCOUNT_MOCK);

      const { transactions } = controller.state;
      expect(transactions).toHaveLength(17);

      const tokenTransaction = transactions.find(
        ({ transactionHash }) => transactionHash === TOKEN_TRANSACTION_HASH,
      ) || { status: TransactionStatus.failed, transaction: { gasUsed: '0' } };

      const ethTransaction = transactions.find(
        ({ transactionHash }) => transactionHash === ETHER_TRANSACTION_HASH,
      ) || {
        status: TransactionStatus.failed,
        transaction: { gasUsed: '0x0' },
      };

      expect(tokenTransaction?.status).toStrictEqual(
        TransactionStatus.confirmed,
      );
      expect(ethTransaction?.status).toStrictEqual(TransactionStatus.confirmed);
      expect(tokenTransaction?.transaction.gasUsed).toStrictEqual('21000');
      expect(ethTransaction?.transaction.gasUsed).toStrictEqual('0x5208');
    });

    it('returns undefined if no matching transactions', async () => {
      mockFetchWithStaticResponse(MOCK_FETCH_TX_HISTORY_DATA_ERROR);

      const controller = newController();

      controller.wipeTransactions();
      expect(controller.state.transactions).toHaveLength(0);

      const result = await controller.fetchAll(ACCOUNT_MOCK);

      expect(controller.state.transactions).toHaveLength(0);
      expect(result).toBeUndefined();
    });
  });

  describe('handleMethodData', () => {
    it('loads method data from registry', async () => {
      const controller = newController({ network: MOCK_MAINNET_NETWORK });
      const registry = await controller.handleMethodData('0xf39b5b9b');

      expect(registry.parsedRegistryMethod).toStrictEqual({
        args: [{ type: 'uint256' }, { type: 'uint256' }],
        name: 'Eth To Token Swap Input',
      });
      expect(registry.registryMethod).toStrictEqual(
        'ethToTokenSwapInput(uint256,uint256)',
      );
    });

    it('skips reading registry if already cached in state', async () => {
      const controller = newController({ network: MOCK_MAINNET_NETWORK });

      await controller.handleMethodData('0xf39b5b9b');

      const registryLookup = jest.spyOn(controller, 'registryLookup' as any);

      await controller.handleMethodData('0xf39b5b9b');

      expect(registryLookup).not.toHaveBeenCalled();
    });
  });

  describe('stopTransaction', () => {
    it('rejects result promise', async () => {
      const controller = newController();

      const { result, transactionMeta } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x1',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await controller.stopTransaction(transactionMeta.id);

      approveTransaction();

      await expect(result).rejects.toThrow('User cancelled the transaction');
    });

    it('throws if no sign method', async () => {
      const controller = newController({ config: { sign: undefined } });

      await controller.addTransaction({ from: ACCOUNT_MOCK, to: ACCOUNT_MOCK });

      await expect(
        controller.stopTransaction(controller.state.transactions[0].id),
      ).rejects.toThrow('No sign method defined');
    });
  });

  describe('speedUpTransaction', () => {
    it('creates additional transaction with increased gas', async () => {
      const controller = newController();

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
      expect(transactions[1].transaction.gasPrice).toBe(
        '0x5916a6d6', // 1.1 * 0x50fd51da
      );
    });

    it('uses the same nonce', async () => {
      const controller = newController({ approve: true });

      const { transactionMeta, result } = await controller.addTransaction({
        from: ACCOUNT_MOCK,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: ACCOUNT_MOCK,
        value: '0x0',
      });

      await result;
      await controller.speedUpTransaction(transactionMeta.id);

      const { transactions } = controller.state;
      expect(getNonceLockSpy).toHaveBeenCalledTimes(1);
      expect(transactions).toHaveLength(2);
      expect(transactions[0].transaction.nonce).toBeDefined();
      expect(transactions[0].transaction.nonce).toStrictEqual(
        transactions[1].transaction.nonce,
      );
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
  });
});
