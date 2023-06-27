import * as sinon from 'sinon';
import HttpProvider from 'ethjs-provider-http';
import NonceTracker from 'nonce-tracker';
import { ChainId, NetworkType, toHex } from '@metamask/controller-utils';
import type {
  BlockTracker,
  NetworkState,
  Provider,
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
  provider: Provider;
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

const MOCK_FETCH_TX_HISTORY_DATA_OK = {
  'https://api-goerli.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=40&order=desc&action=tokentx&tag=latest&page=1':
    ETH_TX_HISTORY_DATA_GOERLI_NO_TRANSACTIONS_FOUND,
  'https://api.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=40&order=desc&action=tokentx&tag=latest&page=1':
    TOKEN_TX_HISTORY_DATA,
  'https://api.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&startBlock=999&offset=40&order=desc&action=tokentx&tag=latest&page=1':
    TOKEN_TX_HISTORY_DATA_FROM_BLOCK,
  'https://api.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=40&order=desc&action=txlist&tag=latest&page=1':
    ETH_TX_HISTORY_DATA,
  'https://api-goerli.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=40&order=desc&action=txlist&tag=latest&page=1':
    ETH_TX_HISTORY_DATA,
  'https://api.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&startBlock=999&offset=40&order=desc&action=txlist&tag=latest&page=1':
    ETH_TX_HISTORY_DATA_FROM_BLOCK,
  'https://api-goerli.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=2&order=desc&action=tokentx&tag=latest&page=1':
    ETH_TX_HISTORY_DATA_GOERLI_NO_TRANSACTIONS_FOUND,
  'https://api-goerli.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=2&order=desc&action=txlist&tag=latest&page=1':
    ETH_TX_HISTORY_DATA,
};

const MOCK_FETCH_TX_HISTORY_DATA_ERROR = {
  status: '0',
};

describe('TransactionController', () => {
  let resultCallbacksMock: AcceptResultCallbacks;
  let messengerMock: TransactionControllerMessenger;
  let rejectMessengerMock: TransactionControllerMessenger;
  let delayMessengerMock: TransactionControllerMessenger;

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
    delayMessengerMock = buildMockMessenger({
      delay: true,
      resultCallbacks: resultCallbacksMock,
    }).messenger;
  });

  afterEach(() => {
    jest.clearAllMocks();
    sinon.restore();
  });

  it('should set default state', () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });

    expect(controller.state).toStrictEqual({
      methodData: {},
      transactions: [],
    });
  });

  it('should set default config', () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    expect(controller.config).toStrictEqual({
      interval: 15000,
      txHistoryLimit: 40,
    });
  });

  it('should poll and update transaction statuses in the right interval', async () => {
    await new Promise((resolve) => {
      const mock = sinon.stub(
        TransactionController.prototype,
        'queryTransactionStatuses',
      );
      new TransactionController(
        {
          getNetworkState: () => MOCK_NETWORK.state,
          onNetworkStateChange: MOCK_NETWORK.subscribe,
          provider: MOCK_NETWORK.provider,
          blockTracker: MOCK_NETWORK.blockTracker,
          messenger: messengerMock,
        },
        { interval: 10 },
      );
      expect(mock.called).toBe(true);
      expect(mock.calledTwice).toBe(false);
      setTimeout(() => {
        expect(mock.calledTwice).toBe(true);
        resolve('');
      }, 15);
    });
  });

  it('should clear previous interval', async () => {
    const mock = sinon.stub(global, 'clearTimeout');
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      { interval: 1337 },
    );
    await new Promise((resolve) => {
      setTimeout(() => {
        controller.poll(1338);
        expect(mock.called).toBe(true);
        resolve('');
      }, 100);
    });
  });

  it('should not update the state if there are no updates on transaction statuses', async () => {
    await new Promise((resolve) => {
      const controller = new TransactionController(
        {
          getNetworkState: () => MOCK_NETWORK.state,
          onNetworkStateChange: MOCK_NETWORK.subscribe,
          provider: MOCK_NETWORK.provider,
          blockTracker: MOCK_NETWORK.blockTracker,
          messenger: messengerMock,
        },
        { interval: 10 },
      );
      const func = sinon.stub(controller, 'update');
      setTimeout(() => {
        expect(func.called).toBe(false);
        resolve('');
      }, 20);
    });
  });

  it('should on eth_estimateGas succeed when gasBn it is greater than maxGasBN', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    mockFlags.estimateGasValue = '0x12a05f200';
    const from = '0x4579d0ad79bfbdf4539a1ddf5f10b378d724a34c';
    const result = await controller.estimateGas({ from, to: from });

    expect(result.estimateGasError).toBeUndefined();
  });

  it('should on Mainnet eth_estimateGas succeed when gasBn it is higher than maxGasBN', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    mockFlags.estimateGasValue = '0x12a05f200';

    const from = '0x4579d0ad79bfbdf4539a1ddf5f10b378d724a34c';
    const result = await controller.estimateGas({ from, to: from });

    expect(result.estimateGasError).toBeUndefined();
  });

  it('should on Custom Network eth_estimateGas succeed when gasBN  is equal to maxGasBN', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_CUSTOM_NETWORK.state,
      onNetworkStateChange: MOCK_CUSTOM_NETWORK.subscribe,
      provider: MOCK_CUSTOM_NETWORK.provider,
      blockTracker: MOCK_CUSTOM_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    const from = '0x4579d0ad79bfbdf4539a1ddf5f10b378d724a34c';
    const result = await controller.estimateGas({ from, to: from });
    expect(result.estimateGasError).toBeUndefined();
  });

  it('should on Custom Network eth_estimateGas fail when gasBN  is equal to maxGasBN', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_CUSTOM_NETWORK.state,
      onNetworkStateChange: MOCK_CUSTOM_NETWORK.subscribe,
      provider: MOCK_CUSTOM_NETWORK.provider,
      blockTracker: MOCK_CUSTOM_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    mockFlags.estimateGasError = ESTIMATE_GAS_ERROR;
    const from = '0x4579d0ad79bfbdf4539a1ddf5f10b378d724a34c';
    const result = await controller.estimateGas({ from, to: from });
    expect(result.estimateGasError).toBe(ESTIMATE_GAS_ERROR);
  });

  it('should on Custom Network eth_estimateGas succeed when gasBN  is less than maxGasBN', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_CUSTOM_NETWORK.state,
      onNetworkStateChange: MOCK_CUSTOM_NETWORK.subscribe,
      provider: MOCK_CUSTOM_NETWORK.provider,
      blockTracker: MOCK_CUSTOM_NETWORK.blockTracker,
      messenger: messengerMock,
    });

    mockFlags.getBlockByNumberValue = '0x12a05f200';

    const from = '0x4579d0ad79bfbdf4539a1ddf5f10b378d724a34c';
    const result = await controller.estimateGas({ from, to: from });
    expect(result.estimateGasError).toBeUndefined();
  });

  it('should on Custom Network eth_estimateGas fail when gasBN  is less than maxGasBN', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_CUSTOM_NETWORK.state,
      onNetworkStateChange: MOCK_CUSTOM_NETWORK.subscribe,
      provider: MOCK_CUSTOM_NETWORK.provider,
      blockTracker: MOCK_CUSTOM_NETWORK.blockTracker,
      messenger: messengerMock,
    });

    mockFlags.getBlockByNumberValue = '0x12a05f200';

    mockFlags.estimateGasError = ESTIMATE_GAS_ERROR;
    const from = '0x4579d0ad79bfbdf4539a1ddf5f10b378d724a34c';
    const result = await controller.estimateGas({ from, to: from });

    expect(result.estimateGasError).toBe(ESTIMATE_GAS_ERROR);
  });

  it('should eth_estimateGas succeed when gasBN  is less than maxGasBN and paddedGasBN is less than MaxGasBN', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });

    mockFlags.getBlockByNumberValue = '0x12a05f200';

    const from = '0x4579d0ad79bfbdf4539a1ddf5f10b378d724a34c';
    const result = await controller.estimateGas({ from, to: from });

    expect(result.estimateGasError).toBeUndefined();
  });

  it('should eth_estimateGas fail when gasBN  is less than maxGasBN and paddedGasBN is less than MaxGasBN', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });

    mockFlags.getBlockByNumberValue = '0x12a05f200';
    mockFlags.estimateGasError = ESTIMATE_GAS_ERROR;

    const from = '0x4579d0ad79bfbdf4539a1ddf5f10b378d724a34c';
    const result = await controller.estimateGas({ from, to: from });

    expect(result.estimateGasError).toBe(ESTIMATE_GAS_ERROR);
  });

  it('should throw when adding invalid transaction', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    await expect(
      controller.addTransaction({ from: 'foo' } as any),
    ).rejects.toThrow('Invalid "from" address');
  });

  it('should add a valid transaction', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    await controller.addTransaction({
      from,
      to: from,
    });
    expect(controller.state.transactions[0].transaction.from).toBe(from);
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

  it('should add a valid transaction after a network switch', async () => {
    const getNetworkState = sinon.stub().returns(MOCK_NETWORK.state);
    let networkStateChangeListener: ((state: NetworkState) => void) | null =
      null;
    const onNetworkStateChange = (listener: (state: NetworkState) => void) => {
      networkStateChangeListener = listener;
    };

    const controller = new TransactionController({
      getNetworkState,
      onNetworkStateChange,
      provider: GOERLI_PROVIDER,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: delayMessengerMock,
    });

    // switch from Goerli to Mainnet
    getNetworkState.returns(MOCK_MAINNET_NETWORK.state);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    networkStateChangeListener!(MOCK_MAINNET_NETWORK.state);

    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    await controller.addTransaction({
      from,
      to: from,
    });
    expect(controller.state.transactions[0].transaction.from).toBe(from);
    expect(controller.state.transactions[0].networkID).toBe(
      MOCK_MAINNET_NETWORK.state.networkId,
    );

    expect(controller.state.transactions[0].chainId).toBe(
      MOCK_MAINNET_NETWORK.state.providerConfig.chainId,
    );

    expect(controller.state.transactions[0].status).toBe(
      TransactionStatus.unapproved,
    );
  });

  it('should add a valid transaction after a switch to custom network', async () => {
    const getNetworkState = sinon.stub().returns(MOCK_NETWORK.state);
    let networkStateChangeListener: ((state: NetworkState) => void) | null =
      null;
    const onNetworkStateChange = (listener: (state: NetworkState) => void) => {
      networkStateChangeListener = listener;
    };

    const controller = new TransactionController({
      getNetworkState,
      onNetworkStateChange,
      provider: MOCK_CUSTOM_NETWORK.provider,
      blockTracker: MOCK_CUSTOM_NETWORK.blockTracker,
      messenger: delayMessengerMock,
    });

    // switch from Goerli to Mainnet
    getNetworkState.returns(MOCK_CUSTOM_NETWORK.state);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    networkStateChangeListener!(MOCK_CUSTOM_NETWORK.state);

    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    await controller.addTransaction({
      from,
      to: from,
    });
    expect(controller.state.transactions[0].transaction.from).toBe(from);
    expect(controller.state.transactions[0].networkID).toBe(
      MOCK_CUSTOM_NETWORK.state.networkId,
    );

    expect(controller.state.transactions[0].chainId).toBe(
      MOCK_CUSTOM_NETWORK.state.providerConfig.chainId,
    );

    expect(controller.state.transactions[0].status).toBe(
      TransactionStatus.unapproved,
    );
  });

  it('should cancel a transaction', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: rejectMessengerMock,
    });

    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    const { result } = await controller.addTransaction({
      from,
      to: from,
    });

    const finishedPromise = waitForTransactionFinished(controller);

    await expect(result).rejects.toThrow('User rejected the transaction');

    const { transaction, status } = await finishedPromise;
    expect(transaction.from).toBe(from);
    expect(status).toBe(TransactionStatus.rejected);
  });

  it('should wipe transactions', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: delayMessengerMock,
    });
    controller.wipeTransactions();
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    await controller.addTransaction({
      from,
      to: from,
    });
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);
  });

  // This tests the fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
  it('should wipe transactions using networkID when there is no chainId', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });
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

  it('should fail to approve an invalid transaction', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {
        sign: () => {
          throw new Error('foo');
        },
      },
    );
    const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
    const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const { result } = await controller.addTransaction({ from, to });
    await expect(result).rejects.toThrow('foo');
    const { transaction, status } = controller.state.transactions[0];
    expect(transaction.from).toBe(from);
    expect(transaction.to).toBe(to);
    expect(status).toBe(TransactionStatus.failed);
  });

  it('should have gasEstimatedError variable on transaction object if gas calculation fails', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_MAINNET_NETWORK.state,
        onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
        provider: MOCK_MAINNET_NETWORK.provider,
        blockTracker: MOCK_MAINNET_NETWORK.blockTracker,
        messenger: delayMessengerMock,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );

    mockFlags.estimateGasError = ESTIMATE_GAS_ERROR;
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    await controller.addTransaction({
      from,
      to: from,
    });

    const {
      transaction: { estimateGasError },
    } = controller.state.transactions[0];

    expect(estimateGasError).toBe(ESTIMATE_GAS_ERROR);
  });

  it('should have gasEstimatedError variable on transaction object on custom network if gas calculation fails', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_CUSTOM_NETWORK.state,
      onNetworkStateChange: MOCK_CUSTOM_NETWORK.subscribe,
      provider: MOCK_CUSTOM_NETWORK.provider,
      blockTracker: MOCK_CUSTOM_NETWORK.blockTracker,
      messenger: delayMessengerMock,
    });

    mockFlags.estimateGasError = ESTIMATE_GAS_ERROR;
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    await controller.addTransaction({
      from,
      to: from,
    });

    const {
      transaction: { estimateGasError },
    } = controller.state.transactions[0];

    expect(estimateGasError).toBe(ESTIMATE_GAS_ERROR);
  });

  it('should fail if no sign method defined', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {},
    );
    const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
    const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const { result } = await controller.addTransaction({ from, to });
    await expect(result).rejects.toThrow('No sign method defined');
    const { transaction, status } = controller.state.transactions[0];
    expect(transaction.from).toBe(from);
    expect(transaction.to).toBe(to);
    expect(status).toBe(TransactionStatus.failed);
  });

  it('should fail if no chainId is defined', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () =>
          MOCK_NETWORK_WITHOUT_CHAIN_ID.state as NetworkState,
        onNetworkStateChange: MOCK_NETWORK_WITHOUT_CHAIN_ID.subscribe,
        provider: MOCK_NETWORK_WITHOUT_CHAIN_ID.provider,
        blockTracker: MOCK_NETWORK_WITHOUT_CHAIN_ID.blockTracker,
        messenger: messengerMock,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
    const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const { result } = await controller.addTransaction({ from, to });
    await expect(result).rejects.toThrow('No chainId defined');
    const { transaction, status } = controller.state.transactions[0];
    expect(transaction.from).toBe(from);
    expect(transaction.to).toBe(to);
    expect(status).toBe(TransactionStatus.failed);
  });

  it('should approve a transaction', async () => {
    const { messenger, approve } = buildMockMessenger({ delay: true });

    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    const { result } = await controller.addTransaction({
      from,
      gas: '0x0',
      gasPrice: '0x0',
      to: from,
      value: '0x0',
    });

    const finishedPromise = waitForTransactionFinished(controller);

    approve();
    await result;
    const { transaction, status } = await finishedPromise;

    expect(transaction.from).toBe(from);
    expect(status).toBe(TransactionStatus.submitted);
  });

  it('should query transaction statuses', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );

    controller.state.transactions.push({
      from: MOCK_PRFERENCES.state.selectedAddress,
      id: 'foo',
      networkID: '5',
      chainId: toHex(5),
      status: TransactionStatus.submitted,
      transactionHash: '1337',
    } as any);
    controller.state.transactions.push({} as any);

    const finishedPromise = waitForTransactionFinished(controller, {
      confirmed: true,
    });

    controller.queryTransactionStatuses();

    const { status } = await finishedPromise;
    expect(status).toBe(TransactionStatus.confirmed);
  });

  // This tests the fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
  it('should query transaction statuses with networkID only when there is no chainId', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );

    controller.state.transactions.push({
      from: MOCK_PRFERENCES.state.selectedAddress,
      id: 'foo',
      networkID: '5',
      status: TransactionStatus.submitted,
      transactionHash: '1337',
    } as any);

    controller.state.transactions.push({} as any);

    const finishedPromise = waitForTransactionFinished(controller, {
      confirmed: true,
    });

    controller.queryTransactionStatuses();

    const { status } = await finishedPromise;
    expect(status).toBe(TransactionStatus.confirmed);
  });

  it('should keep the transaction status as submitted if the transaction was not added to a block', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    controller.state.transactions.push({
      from: MOCK_PRFERENCES.state.selectedAddress,
      id: 'foo',
      networkID: '5',
      status: TransactionStatus.submitted,
      transactionHash: '1338',
    } as any);
    await controller.queryTransactionStatuses();
    expect(controller.state.transactions[0].status).toBe(
      TransactionStatus.submitted,
    );
  });

  it('should verify the transaction using the correct blockchain', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
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
    expect(controller.state.transactions[0].verifiedOnBlockchain).toBe(true);
    expect(controller.state.transactions[0].transaction.gasUsed).toBe('0x5208');
  });

  it('should fetch all the transactions from an address, including incoming transactions, in goerli', async () => {
    mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);

    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    const latestBlock = await controller.fetchAll(from);
    expect(controller.state.transactions).toHaveLength(4);
    expect(latestBlock).toBe('4535101');
    expect(controller.state.transactions[0].transaction.to).toBe(from);
  });

  it('should fetch all the transactions from an address, including incoming token transactions, in mainnet', async () => {
    mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      provider: MOCK_MAINNET_NETWORK.provider,
      blockTracker: MOCK_MAINNET_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);

    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    const latestBlock = await controller.fetchAll(from);
    expect(controller.state.transactions).toHaveLength(17);
    expect(latestBlock).toBe('4535101');
    expect(controller.state.transactions[0].transaction.to).toBe(from);
  });

  it('should fetch all the transactions from an address, including incoming token transactions without modifying transactions that have the same data in local and remote', async () => {
    mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      provider: MOCK_MAINNET_NETWORK.provider,
      blockTracker: MOCK_MAINNET_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    controller.wipeTransactions();
    controller.state.transactions = TRANSACTIONS_IN_STATE;
    await controller.fetchAll(from);
    expect(controller.state.transactions).toHaveLength(17);
    const tokenTransaction = controller.state.transactions.find(
      ({ transactionHash }) => transactionHash === TOKEN_TRANSACTION_HASH,
    ) || { id: '' };
    const ethTransaction = controller.state.transactions.find(
      ({ transactionHash }) => transactionHash === ETHER_TRANSACTION_HASH,
    ) || { id: '' };
    expect(tokenTransaction?.id).toStrictEqual('token-transaction-id');
    expect(ethTransaction?.id).toStrictEqual('eth-transaction-id');
  });

  it('should fetch all the transactions from an address, including incoming transactions, in mainnet from block', async () => {
    mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      provider: MOCK_MAINNET_NETWORK.provider,
      blockTracker: MOCK_MAINNET_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);

    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    const latestBlock = await controller.fetchAll(from, { fromBlock: '999' });
    expect(controller.state.transactions).toHaveLength(3);
    expect(latestBlock).toBe('4535101');
    expect(controller.state.transactions[0].transaction.to).toBe(from);
  });

  it('should fetch and updated all transactions with outdated status regarding the data provided by the remote source in mainnet', async () => {
    mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      provider: MOCK_MAINNET_NETWORK.provider,
      blockTracker: MOCK_MAINNET_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);

    controller.state.transactions = TRANSACTIONS_IN_STATE_WITH_OUTDATED_STATUS;

    await controller.fetchAll(from);
    expect(controller.state.transactions).toHaveLength(17);

    const tokenTransaction = controller.state.transactions.find(
      ({ transactionHash }) => transactionHash === TOKEN_TRANSACTION_HASH,
    ) || { status: TransactionStatus.failed };
    const ethTransaction = controller.state.transactions.find(
      ({ transactionHash }) => transactionHash === ETHER_TRANSACTION_HASH,
    ) || { status: TransactionStatus.failed };
    expect(tokenTransaction?.status).toStrictEqual(TransactionStatus.confirmed);
    expect(ethTransaction?.status).toStrictEqual(TransactionStatus.confirmed);
  });

  it('should fetch and updated all transactions with outdated gas data regarding the data provided by the remote source in mainnet', async () => {
    mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      provider: MOCK_MAINNET_NETWORK.provider,
      blockTracker: MOCK_MAINNET_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);

    controller.state.transactions =
      TRANSACTIONS_IN_STATE_WITH_OUTDATED_GAS_DATA;

    await controller.fetchAll(from);
    expect(controller.state.transactions).toHaveLength(17);

    const tokenTransaction = controller.state.transactions.find(
      ({ transactionHash }) => transactionHash === TOKEN_TRANSACTION_HASH,
    ) || { transaction: { gasUsed: '0' } };
    const ethTransaction = controller.state.transactions.find(
      ({ transactionHash }) => transactionHash === ETHER_TRANSACTION_HASH,
    ) || { transaction: { gasUsed: '0x0' } };
    expect(tokenTransaction?.transaction.gasUsed).toStrictEqual('21000');
    expect(ethTransaction?.transaction.gasUsed).toStrictEqual('0x5208');
  });

  it('should fetch and updated all transactions with outdated status and gas data regarding the data provided by the remote source in mainnet', async () => {
    mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      provider: MOCK_MAINNET_NETWORK.provider,
      blockTracker: MOCK_MAINNET_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);

    controller.state.transactions =
      TRANSACTIONS_IN_STATE_WITH_OUTDATED_STATUS_AND_GAS_DATA;

    await controller.fetchAll(from);
    expect(controller.state.transactions).toHaveLength(17);

    const tokenTransaction = controller.state.transactions.find(
      ({ transactionHash }) => transactionHash === TOKEN_TRANSACTION_HASH,
    ) || { status: TransactionStatus.failed, transaction: { gasUsed: '0' } };
    const ethTransaction = controller.state.transactions.find(
      ({ transactionHash }) => transactionHash === ETHER_TRANSACTION_HASH,
    ) || { status: TransactionStatus.failed, transaction: { gasUsed: '0x0' } };
    expect(tokenTransaction?.status).toStrictEqual(TransactionStatus.confirmed);
    expect(ethTransaction?.status).toStrictEqual(TransactionStatus.confirmed);
    expect(tokenTransaction?.transaction.gasUsed).toStrictEqual('21000');
    expect(ethTransaction?.transaction.gasUsed).toStrictEqual('0x5208');
  });

  it('should return', async () => {
    mockFetchWithStaticResponse(MOCK_FETCH_TX_HISTORY_DATA_ERROR);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);
    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    const result = await controller.fetchAll(from);
    expect(controller.state.transactions).toHaveLength(0);
    expect(result).toBeUndefined();
  });

  it('should handle new method data', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_MAINNET_NETWORK.state,
        onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
        provider: MOCK_MAINNET_NETWORK.provider,
        blockTracker: MOCK_MAINNET_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {},
    );
    const registry = await controller.handleMethodData('0xf39b5b9b');
    expect(registry.parsedRegistryMethod).toStrictEqual({
      args: [{ type: 'uint256' }, { type: 'uint256' }],
      name: 'Eth To Token Swap Input',
    });

    expect(registry.registryMethod).toStrictEqual(
      'ethToTokenSwapInput(uint256,uint256)',
    );
  });

  it('should handle known method data', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_MAINNET_NETWORK.state,
        onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
        provider: MOCK_MAINNET_NETWORK.provider,
        blockTracker: MOCK_MAINNET_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {},
    );
    const registry = await controller.handleMethodData('0xf39b5b9b');
    expect(registry.parsedRegistryMethod).toStrictEqual({
      args: [{ type: 'uint256' }, { type: 'uint256' }],
      name: 'Eth To Token Swap Input',
    });
    const registryLookup = sinon.stub(controller, 'registryLookup' as any);
    await controller.handleMethodData('0xf39b5b9b');
    expect(registryLookup.called).toBe(false);
  });

  it('should stop a transaction', async () => {
    const { messenger, approve } = buildMockMessenger({
      delay: true,
    });

    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const { result } = await controller.addTransaction({
      from,
      gas: '0x0',
      gasPrice: '0x1',
      to: from,
      value: '0x0',
    });

    await controller.stopTransaction(controller.state.transactions[0].id);
    approve();

    await expect(result).rejects.toThrow('User cancelled the transaction');
  });

  it('should fail to stop a transaction if no sign method', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: delayMessengerMock,
    });
    const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
    const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    await controller.addTransaction({ from, to });
    controller.stopTransaction('nonexistent');
    await expect(
      controller.stopTransaction(controller.state.transactions[0].id),
    ).rejects.toThrow('No sign method defined');
  });

  it('should speed up a transaction', async () => {
    await new Promise(async (resolve) => {
      const controller = new TransactionController(
        {
          getNetworkState: () => MOCK_NETWORK.state,
          onNetworkStateChange: MOCK_NETWORK.subscribe,
          provider: MOCK_NETWORK.provider,
          blockTracker: MOCK_NETWORK.blockTracker,
          messenger: messengerMock,
        },
        {
          sign: async (transaction: any) => transaction,
        },
      );
      const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
      await controller.addTransaction({
        from,
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: from,
        value: '0x0',
      });
      await controller.speedUpTransaction(controller.state.transactions[0].id);
      expect(controller.state.transactions).toHaveLength(2);
      expect(controller.state.transactions[1].transaction.gasPrice).toBe(
        '0x5916a6d6', // 1.1 * 0x50fd51da
      );
      resolve('');
    });
  });

  it('should limit tx state to a length of 2', async () => {
    mockFetchWithDynamicResponse(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: delayMessengerMock,
      },
      {
        interval: 5000,
        sign: async (transaction: any) => transaction,
        txHistoryLimit: 2,
      },
    );
    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    await controller.fetchAll(from);
    await controller.addTransaction({
      from,
      nonce: '55555',
      gas: '0x0',
      gasPrice: '0x50fd51da',
      to: from,
      value: '0x0',
    });
    expect(controller.state.transactions).toHaveLength(2);
    expect(controller.state.transactions[0].transaction.gasPrice).toBe(
      '0x4a817c800',
    );
  });

  it('should allow tx state to be greater than txHistorylimit due to speed up same nonce', async () => {
    await new Promise(async (resolve) => {
      const controller = new TransactionController(
        {
          getNetworkState: () => MOCK_NETWORK.state,
          onNetworkStateChange: MOCK_NETWORK.subscribe,
          provider: MOCK_NETWORK.provider,
          blockTracker: MOCK_NETWORK.blockTracker,
          messenger: messengerMock,
        },
        {
          interval: 5000,
          sign: async (transaction: any) => transaction,
          txHistoryLimit: 1,
        },
      );
      const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
      await controller.addTransaction({
        from,
        nonce: '1111111',
        gas: '0x0',
        gasPrice: '0x50fd51da',
        to: from,
        value: '0x0',
      });
      await controller.speedUpTransaction(controller.state.transactions[0].id);
      expect(controller.state.transactions).toHaveLength(2);
      resolve('');
    });
  });

  it('should increment nonce when adding a new non-cancel non-speedup transaction', async () => {
    v1Stub
      .mockImplementationOnce(() => 'aaaab1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')
      .mockImplementationOnce(() => 'bbbb1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');

    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    const { result: firstResult } = await controller.addTransaction({
      from,
      gas: '0x0',
      gasPrice: '0x50fd51da',
      to: from,
      value: '0x0',
    });

    await firstResult.catch(() => undefined);

    const firstTransaction = controller.state.transactions[0];

    const { result: secondResult } = await controller.addTransaction({
      from,
      gas: '0x2',
      gasPrice: '0x50fd51da',
      to: from,
      value: '0x1290',
    });

    await secondResult.catch(() => undefined);

    expect(controller.state.transactions).toHaveLength(2);
    const secondTransaction = controller.state.transactions[1];

    expect(firstTransaction.transaction.nonce).toStrictEqual('0x0');
    expect(secondTransaction.transaction.nonce).toStrictEqual('0x1');
  });

  it('fails transaction if approval fails with unrecognised error', async () => {
    const { messenger } = buildMockMessenger({
      delay: true,
    });

    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    (messenger.call as jest.MockedFunction<any>).mockImplementationOnce(() => {
      throw new Error('TestError');
    });

    const { result } = await controller.addTransaction({
      from,
      gas: '0x0',
      gasPrice: '0x0',
      to: from,
      value: '0x0',
    });

    await expect(result).rejects.toThrow('TestError');
  });

  it('throws unknown error if status not expected', async () => {
    const { messenger } = buildMockMessenger({
      delay: true,
    });

    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    (messenger.call as jest.MockedFunction<any>).mockImplementationOnce(() => {
      controller.state.transactions[0].status = TransactionStatus.confirmed;
      throw new Error('TestError');
    });

    const { result } = await controller.addTransaction({
      from,
      gas: '0x0',
      gasPrice: '0x0',
      to: from,
      value: '0x0',
    });

    await expect(result).rejects.toThrow('Unknown problem');
  });

  it('throws unknown error if transaction removed', async () => {
    const { messenger } = buildMockMessenger({
      delay: true,
    });

    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    (messenger.call as jest.MockedFunction<any>).mockImplementationOnce(() => {
      controller.state.transactions = [];
      throw new Error('TestError');
    });

    const { result } = await controller.addTransaction({
      from,
      gas: '0x0',
      gasPrice: '0x0',
      to: from,
      value: '0x0',
    });

    await expect(result).rejects.toThrow('Unknown problem');
  });

  it('requests approval using the approval controller', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: delayMessengerMock,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );

    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    await controller.addTransaction({
      from,
      to: from,
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

  it('reports success to approval acceptor', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        provider: MOCK_NETWORK.provider,
        blockTracker: MOCK_NETWORK.blockTracker,
        messenger: messengerMock,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );

    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    const { result } = await controller.addTransaction({
      from,
      to: from,
    });

    await result;

    expect(resultCallbacksMock.success).toHaveBeenCalledTimes(1);
  });

  it('reports error to approval acceptor on error', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      provider: MOCK_NETWORK.provider,
      blockTracker: MOCK_NETWORK.blockTracker,
      messenger: messengerMock,
    });

    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

    const { result } = await controller.addTransaction({
      from,
      to: from,
    });

    try {
      await result;
    } catch {
      // Expected error
    }

    expect(resultCallbacksMock.error).toHaveBeenCalledTimes(1);
  });

  describe('NonceTracker integration', () => {
    let getNonceLockSpy: jest.Mock<any, any>;
    let originalGetNonceLock: any;
    const testNonce = 12;

    beforeEach(async () => {
      originalGetNonceLock = NonceTracker.prototype.getNonceLock;

      getNonceLockSpy = jest.fn().mockResolvedValue({
        nextNonce: testNonce,
        releaseLock: () => Promise.resolve(),
      });

      NonceTracker.prototype.getNonceLock = getNonceLockSpy;
    });

    afterEach(() => {
      NonceTracker.prototype.getNonceLock = originalGetNonceLock;
    });

    it('should submit transaction with nonce from NonceTracker', async () => {
      const controller = new TransactionController(
        {
          getNetworkState: () => MOCK_CUSTOM_NETWORK.state,
          onNetworkStateChange: MOCK_CUSTOM_NETWORK.subscribe,
          provider: MOCK_CUSTOM_NETWORK.provider,
          blockTracker: MOCK_CUSTOM_NETWORK.blockTracker,
          messenger: messengerMock,
        },
        {
          sign: async (transaction: any) => transaction,
        },
      );

      const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';

      const { result } = await controller.addTransaction({
        from,
        gas: '0x0',
        gasPrice: '0x0',
        to: from,
        value: '0x0',
      });

      const finishedPromise = waitForTransactionFinished(controller);

      await result;

      const { transaction, status } = await finishedPromise;
      expect(transaction.from).toBe(from);
      expect(transaction.nonce).toBe(`0x${testNonce.toString(16)}`);
      expect(getNonceLockSpy).toHaveBeenCalledTimes(1);
      expect(status).toBe(TransactionStatus.submitted);
    });

    it('should use the same nonce when speeding up a transaction', async () => {
      await new Promise(async (resolve) => {
        const controller = new TransactionController(
          {
            getNetworkState: () => MOCK_NETWORK.state,
            onNetworkStateChange: MOCK_NETWORK.subscribe,
            provider: MOCK_NETWORK.provider,
            blockTracker: MOCK_NETWORK.blockTracker,
            messenger: messengerMock,
          },
          {
            sign: async (transaction: any) => transaction,
          },
        );
        const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
        await controller.addTransaction({
          from,
          gas: '0x0',
          gasPrice: '0x50fd51da',
          to: from,
          value: '0x0',
        });

        const originalTransaction = controller.state.transactions[0];
        await controller.speedUpTransaction(originalTransaction.id);
        expect(getNonceLockSpy).toHaveBeenCalledTimes(1);
        expect(controller.state.transactions).toHaveLength(2);
        expect(originalTransaction.transaction.nonce).toStrictEqual(
          controller.state.transactions[1].transaction.nonce,
        );
        resolve('');
      });
    });
  });
});
