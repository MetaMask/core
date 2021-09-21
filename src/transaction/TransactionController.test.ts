import { stub } from 'sinon';
import HttpProvider from 'ethjs-provider-http';
import {
  NetworksChainId,
  NetworkType,
  NetworkState,
} from '../network/NetworkController';
import {
  TransactionController,
  TransactionStatus,
  TransactionMeta,
} from './TransactionController';
import {
  ethTxsMock,
  tokenTxsMock,
  txsInStateMock,
  txsInStateWithOutdatedStatusMock,
  txsInStateWithOutdatedGasDataMock,
  txsInStateWithOutdatedStatusAndGasDataMock,
} from './mocks/txsMock';

const globalAny: any = global;

const mockFlags: { [key: string]: any } = {
  estimateGas: null,
};

jest.mock('eth-query', () =>
  jest.fn().mockImplementation(() => {
    return {
      estimateGas: (_transaction: any, callback: any) => {
        if (mockFlags.estimateGas) {
          callback(new Error(mockFlags.estimateGas));
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
        callback(undefined, { gasUsed: '0x5208' });
      },
    };
  }),
);

function mockFetch(data: any) {
  return jest.fn().mockImplementation(() =>
    Promise.resolve({
      json: () => data,
      ok: true,
    }),
  );
}

function mockFetchs(data: any) {
  return jest.fn().mockImplementation((key) =>
    Promise.resolve({
      json: () => data[key],
      ok: true,
    }),
  );
}

const MOCK_PRFERENCES = { state: { selectedAddress: 'foo' } };
const PROVIDER = new HttpProvider(
  'https://ropsten.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const MOCK_NETWORK = {
  getProvider: () => PROVIDER,
  state: {
    network: '3',
    isCustomNetwork: false,
    properties: { isEIP1559Compatible: false },
    provider: {
      type: 'ropsten' as NetworkType,
      chainId: NetworksChainId.ropsten,
    },
  },
  subscribe: () => undefined,
};
const MOCK_NETWORK_CUSTOM = {
  getProvider: () => PROVIDER,
  state: {
    network: '10',
    isCustomNetwork: true,
    properties: { isEIP1559Compatible: false },
    provider: {
      type: 'optimism' as NetworkType,
      chainId: NetworksChainId.optimism,
    },
  },
  subscribe: () => undefined,
};
const MOCK_NETWORK_WITHOUT_CHAIN_ID = {
  getProvider: () => PROVIDER,
  isCustomNetwork: false,
  state: { network: '3', provider: { type: 'ropsten' as NetworkType } },
  subscribe: () => undefined,
};
const MOCK_MAINNET_NETWORK = {
  getProvider: () => MAINNET_PROVIDER,
  state: {
    network: '1',
    isCustomNetwork: false,
    properties: { isEIP1559Compatible: false },
    provider: {
      type: 'mainnet' as NetworkType,
      chainId: NetworksChainId.mainnet,
    },
  },
  subscribe: () => undefined,
};
const MOCK_CUSTOM_NETWORK = {
  getProvider: () => MAINNET_PROVIDER,
  state: {
    network: '80001',
    isCustomNetwork: true,
    properties: { isEIP1559Compatible: false },
    provider: {
      type: 'rpc' as NetworkType,
      chainId: '80001',
    },
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

const TRANSACTIONS_IN_STATE_WITH_OUTDATED_STATUS: TransactionMeta[] = txsInStateWithOutdatedStatusMock(
  ETHER_TRANSACTION_HASH,
  TOKEN_TRANSACTION_HASH,
);

const TRANSACTIONS_IN_STATE_WITH_OUTDATED_GAS_DATA: TransactionMeta[] = txsInStateWithOutdatedGasDataMock(
  ETHER_TRANSACTION_HASH,
  TOKEN_TRANSACTION_HASH,
);

const TRANSACTIONS_IN_STATE_WITH_OUTDATED_STATUS_AND_GAS_DATA: TransactionMeta[] = txsInStateWithOutdatedStatusAndGasDataMock(
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

const ETH_TX_HISTORY_DATA_ROPSTEN_NO_TRANSACTIONS_FOUND = {
  message: 'No transactions found',
  result: [],
  status: '0',
};

const MOCK_FETCH_TX_HISTORY_DATA_OK = {
  'https://api-ropsten.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=40&order=desc&action=tokentx&tag=latest&page=1': ETH_TX_HISTORY_DATA_ROPSTEN_NO_TRANSACTIONS_FOUND,
  'https://api.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=40&order=desc&action=tokentx&tag=latest&page=1': TOKEN_TX_HISTORY_DATA,
  'https://api.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&startBlock=999&offset=40&order=desc&action=tokentx&tag=latest&page=1': TOKEN_TX_HISTORY_DATA_FROM_BLOCK,
  'https://api.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=40&order=desc&action=txlist&tag=latest&page=1': ETH_TX_HISTORY_DATA,
  'https://api-ropsten.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=40&order=desc&action=txlist&tag=latest&page=1': ETH_TX_HISTORY_DATA,
  'https://api.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&startBlock=999&offset=40&order=desc&action=txlist&tag=latest&page=1': ETH_TX_HISTORY_DATA_FROM_BLOCK,
  'https://api-ropsten.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=2&order=desc&action=tokentx&tag=latest&page=1': ETH_TX_HISTORY_DATA_ROPSTEN_NO_TRANSACTIONS_FOUND,
  'https://api-ropsten.etherscan.io/api?module=account&address=0x6bf137f335ea1b8f193b8f6ea92561a60d23a207&offset=2&order=desc&action=txlist&tag=latest&page=1': ETH_TX_HISTORY_DATA,
};

const MOCK_FETCH_TX_HISTORY_DATA_ERROR = {
  status: '0',
};

describe('TransactionController', () => {
  beforeEach(() => {
    for (const key in mockFlags) {
      mockFlags[key] = null;
    }
  });

  it('should set default state', () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      getProvider: MOCK_NETWORK.getProvider,
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
      getProvider: MOCK_NETWORK.getProvider,
    });
    expect(controller.config).toStrictEqual({
      interval: 5000,
      txHistoryLimit: 40,
    });
  });

  it('should poll and update transaction statuses in the right interval', async () => {
    await new Promise((resolve) => {
      const mock = stub(
        TransactionController.prototype,
        'queryTransactionStatuses',
      );
      new TransactionController(
        {
          getNetworkState: () => MOCK_NETWORK.state,
          onNetworkStateChange: MOCK_NETWORK.subscribe,
          getProvider: MOCK_NETWORK.getProvider,
        },
        { interval: 10 },
      );
      expect(mock.called).toBe(true);
      expect(mock.calledTwice).toBe(false);
      setTimeout(() => {
        expect(mock.calledTwice).toBe(true);
        mock.restore();
        resolve('');
      }, 15);
    });
  });

  it('should clear previous interval', async () => {
    const mock = stub(global, 'clearTimeout');
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        getProvider: MOCK_NETWORK.getProvider,
      },
      { interval: 1337 },
    );
    await new Promise((resolve) => {
      setTimeout(() => {
        controller.poll(1338);
        expect(mock.called).toBe(true);
        mock.restore();
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
          getProvider: MOCK_NETWORK.getProvider,
        },
        { interval: 10 },
      );
      const func = stub(controller, 'update');
      setTimeout(() => {
        expect(func.called).toBe(false);
        func.restore();
        resolve('');
      }, 20);
    });
  });

  it('should throw when adding invalid transaction', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      getProvider: MOCK_NETWORK.getProvider,
    });
    await expect(
      controller.addTransaction({ from: 'foo' } as any),
    ).rejects.toThrow('Invalid "from" address');
  });

  it('should add a valid transaction', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      getProvider: MOCK_NETWORK.getProvider,
    });
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    await controller.addTransaction({
      from,
      to: from,
    });
    expect(controller.state.transactions[0].transaction.from).toBe(from);
    expect(controller.state.transactions[0].networkID).toBe(
      MOCK_NETWORK.state.network,
    );
    expect(controller.state.transactions[0].chainId).toBe(
      MOCK_NETWORK.state.provider.chainId,
    );
    expect(controller.state.transactions[0].status).toBe(
      TransactionStatus.unapproved,
    );
  });

  it('should add a valid transaction after a network switch', async () => {
    const getNetworkState = stub().returns(MOCK_NETWORK.state);
    let networkStateChangeListener:
      | ((state: NetworkState) => void)
      | null = null;
    const onNetworkStateChange = (listener: (state: NetworkState) => void) => {
      networkStateChangeListener = listener;
    };
    const getProvider = stub().returns(PROVIDER);
    const controller = new TransactionController({
      getNetworkState,
      onNetworkStateChange,
      getProvider,
    });

    // switch from Ropsten to Mainnet
    getNetworkState.returns(MOCK_MAINNET_NETWORK.state);
    getProvider.returns(MAINNET_PROVIDER);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    networkStateChangeListener!(MOCK_MAINNET_NETWORK.state);

    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    await controller.addTransaction({
      from,
      to: from,
    });
    expect(controller.state.transactions[0].transaction.from).toBe(from);
    expect(controller.state.transactions[0].networkID).toBe(
      MOCK_MAINNET_NETWORK.state.network,
    );
    expect(controller.state.transactions[0].chainId).toBe(
      MOCK_MAINNET_NETWORK.state.provider.chainId,
    );
    expect(controller.state.transactions[0].status).toBe(
      TransactionStatus.unapproved,
    );
  });

  it('should add a valid transaction after a switch to custom network', async () => {
    const getNetworkState = stub().returns(MOCK_NETWORK.state);
    let networkStateChangeListener:
      | ((state: NetworkState) => void)
      | null = null;
    const onNetworkStateChange = (listener: (state: NetworkState) => void) => {
      networkStateChangeListener = listener;
    };
    const getProvider = stub().returns(PROVIDER);
    const controller = new TransactionController({
      getNetworkState,
      onNetworkStateChange,
      getProvider,
    });

    // switch from Ropsten to Mainnet
    getNetworkState.returns(MOCK_NETWORK_CUSTOM.state);
    getProvider.returns(PROVIDER);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    networkStateChangeListener!(MOCK_NETWORK_CUSTOM.state);

    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    await controller.addTransaction({
      from,
      to: from,
    });
    expect(controller.state.transactions[0].transaction.from).toBe(from);
    expect(controller.state.transactions[0].networkID).toBe(
      MOCK_NETWORK_CUSTOM.state.network,
    );
    expect(controller.state.transactions[0].chainId).toBe(
      MOCK_NETWORK_CUSTOM.state.provider.chainId,
    );
    expect(controller.state.transactions[0].status).toBe(
      TransactionStatus.unapproved,
    );
  });

  it('should cancel a transaction', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      getProvider: MOCK_NETWORK.getProvider,
    });
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const { result } = await controller.addTransaction({
      from,
      to: from,
    });
    controller.cancelTransaction('foo');
    const transactionListener = new Promise(async (resolve) => {
      controller.hub.once(
        `${controller.state.transactions[0].id}:finished`,
        () => {
          expect(controller.state.transactions[0].transaction.from).toBe(from);
          expect(controller.state.transactions[0].status).toBe(
            TransactionStatus.rejected,
          );
          resolve('');
        },
      );
    });
    controller.cancelTransaction(controller.state.transactions[0].id);
    await expect(result).rejects.toThrow('User rejected the transaction');
    await transactionListener;
  });

  it('should wipe transactions', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      getProvider: MOCK_NETWORK.getProvider,
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
      getProvider: MOCK_NETWORK.getProvider,
    });
    controller.wipeTransactions();
    controller.state.transactions.push({
      from: MOCK_PRFERENCES.state.selectedAddress,
      id: 'foo',
      networkID: '3',
      status: TransactionStatus.submitted,
      transactionHash: '1337',
    } as any);
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);
  });

  it('should approve custom network transaction', async () => {
    await new Promise(async (resolve) => {
      const controller = new TransactionController(
        {
          getNetworkState: () => MOCK_CUSTOM_NETWORK.state,
          onNetworkStateChange: MOCK_CUSTOM_NETWORK.subscribe,
          getProvider: MOCK_CUSTOM_NETWORK.getProvider,
        },
        {
          sign: async (transaction: any) => transaction,
        },
      );
      const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
      await controller.addTransaction({
        from,
        gas: '0x0',
        gasPrice: '0x0',
        to: from,
        value: '0x0',
      });
      controller.hub.once(
        `${controller.state.transactions[0].id}:finished`,
        () => {
          const { transaction, status } = controller.state.transactions[0];
          expect(transaction.from).toBe(from);
          expect(status).toBe(TransactionStatus.submitted);
          resolve('');
        },
      );
      controller.approveTransaction(controller.state.transactions[0].id);
    });
  });

  it('should fail to approve an invalid transaction', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        getProvider: MOCK_NETWORK.getProvider,
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
    await controller.approveTransaction(controller.state.transactions[0].id);
    const { transaction, status } = controller.state.transactions[0];
    expect(transaction.from).toBe(from);
    expect(transaction.to).toBe(to);
    expect(status).toBe(TransactionStatus.failed);
    await expect(result).rejects.toThrow('foo');
  });

  it('should fail transaction if gas calculation fails', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      getProvider: MOCK_NETWORK.getProvider,
    });
    const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    mockFlags.estimateGas = 'Uh oh';
    await expect(
      controller.addTransaction({
        from,
        to: from,
      }),
    ).rejects.toThrow('Uh oh');
  });

  it('should fail if no sign method defined', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        getProvider: MOCK_NETWORK.getProvider,
      },
      {},
    );
    const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
    const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const { result } = await controller.addTransaction({ from, to });
    await controller.approveTransaction(controller.state.transactions[0].id);
    const { transaction, status } = controller.state.transactions[0];
    expect(transaction.from).toBe(from);
    expect(transaction.to).toBe(to);
    expect(status).toBe(TransactionStatus.failed);
    await expect(result).rejects.toThrow('No sign method defined');
  });

  it('should fail if no chainId is defined', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () =>
          MOCK_NETWORK_WITHOUT_CHAIN_ID.state as NetworkState,
        onNetworkStateChange: MOCK_NETWORK_WITHOUT_CHAIN_ID.subscribe,
        getProvider: MOCK_NETWORK_WITHOUT_CHAIN_ID.getProvider,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
    const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
    const { result } = await controller.addTransaction({ from, to });
    await controller.approveTransaction(controller.state.transactions[0].id);
    const { transaction, status } = controller.state.transactions[0];
    expect(transaction.from).toBe(from);
    expect(transaction.to).toBe(to);
    expect(status).toBe(TransactionStatus.failed);
    await expect(result).rejects.toThrow('No chainId defined');
  });

  it('should approve a transaction', async () => {
    await new Promise(async (resolve) => {
      const controller = new TransactionController(
        {
          getNetworkState: () => MOCK_NETWORK.state,
          onNetworkStateChange: MOCK_NETWORK.subscribe,
          getProvider: MOCK_NETWORK.getProvider,
        },
        {
          sign: async (transaction: any) => transaction,
        },
      );
      const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
      await controller.addTransaction({
        from,
        gas: '0x0',
        gasPrice: '0x0',
        to: from,
        value: '0x0',
      });
      controller.hub.once(
        `${controller.state.transactions[0].id}:finished`,
        () => {
          const { transaction, status } = controller.state.transactions[0];
          expect(transaction.from).toBe(from);
          expect(status).toBe(TransactionStatus.submitted);
          resolve('');
        },
      );
      controller.approveTransaction(controller.state.transactions[0].id);
    });
  });

  it('should query transaction statuses', async () => {
    await new Promise((resolve) => {
      const controller = new TransactionController(
        {
          getNetworkState: () => MOCK_NETWORK.state,
          onNetworkStateChange: MOCK_NETWORK.subscribe,
          getProvider: MOCK_NETWORK.getProvider,
        },
        {
          sign: async (transaction: any) => transaction,
        },
      );
      controller.state.transactions.push({
        from: MOCK_PRFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '3',
        chainId: '3',
        status: TransactionStatus.submitted,
        transactionHash: '1337',
      } as any);
      controller.state.transactions.push({} as any);

      controller.hub.once(
        `${controller.state.transactions[0].id}:confirmed`,
        () => {
          expect(controller.state.transactions[0].status).toBe(
            TransactionStatus.confirmed,
          );
          resolve('');
        },
      );
      controller.queryTransactionStatuses();
    });
  });
  it('should set the transaction status to failed if the query result is null or undefined', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        getProvider: MOCK_NETWORK.getProvider,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    controller.state.transactions.push({
      from: MOCK_PRFERENCES.state.selectedAddress,
      id: 'foo',
      networkID: '3',
      chainId: '3',
      status: TransactionStatus.submitted,
      transactionHash: '1111',
    } as any);

    controller.hub.once(
      `${controller.state.transactions[0].id}:finished`,
      () => {
        expect(controller.state.transactions[0].status).toBe(
          TransactionStatus.failed,
        );
      },
    );
    await controller.queryTransactionStatuses();
  });
  // This tests the fallback to networkID only when there is no chainId present. Should be removed when networkID is completely removed.
  it('should query transaction statuses with networkID only when there is no chainId', async () => {
    await new Promise((resolve) => {
      const controller = new TransactionController(
        {
          getNetworkState: () => MOCK_NETWORK.state,
          onNetworkStateChange: MOCK_NETWORK.subscribe,
          getProvider: MOCK_NETWORK.getProvider,
        },
        {
          sign: async (transaction: any) => transaction,
        },
      );
      controller.state.transactions.push({
        from: MOCK_PRFERENCES.state.selectedAddress,
        id: 'foo',
        networkID: '3',
        status: TransactionStatus.submitted,
        transactionHash: '1337',
      } as any);
      controller.state.transactions.push({} as any);

      controller.hub.once(
        `${controller.state.transactions[0].id}:confirmed`,
        () => {
          expect(controller.state.transactions[0].status).toBe(
            TransactionStatus.confirmed,
          );
          resolve('');
        },
      );
      controller.queryTransactionStatuses();
    });
  });
  it('should keep the transaction status as submitted if the transaction was not added to a block', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        getProvider: MOCK_NETWORK.getProvider,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    controller.state.transactions.push({
      from: MOCK_PRFERENCES.state.selectedAddress,
      id: 'foo',
      networkID: '3',
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
        getProvider: MOCK_NETWORK.getProvider,
      },
      {
        sign: async (transaction: any) => transaction,
      },
    );
    controller.state.transactions.push({
      from: MOCK_PRFERENCES.state.selectedAddress,
      id: 'foo',
      networkID: '3',
      chainId: '3',
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

  it('should fetch all the transactions from an address, including incoming transactions, in ropsten', async () => {
    globalAny.fetch = mockFetchs(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      getProvider: MOCK_NETWORK.getProvider,
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
    globalAny.fetch = mockFetchs(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      getProvider: MOCK_MAINNET_NETWORK.getProvider,
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
    globalAny.fetch = mockFetchs(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      getProvider: MOCK_MAINNET_NETWORK.getProvider,
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
    globalAny.fetch = mockFetchs(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      getProvider: MOCK_MAINNET_NETWORK.getProvider,
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
    globalAny.fetch = mockFetchs(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      getProvider: MOCK_MAINNET_NETWORK.getProvider,
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
    globalAny.fetch = mockFetchs(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      getProvider: MOCK_MAINNET_NETWORK.getProvider,
    });
    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);

    controller.state.transactions = TRANSACTIONS_IN_STATE_WITH_OUTDATED_GAS_DATA;

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
    globalAny.fetch = mockFetchs(MOCK_FETCH_TX_HISTORY_DATA_OK);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_MAINNET_NETWORK.state,
      onNetworkStateChange: MOCK_MAINNET_NETWORK.subscribe,
      getProvider: MOCK_MAINNET_NETWORK.getProvider,
    });
    const from = '0x6bf137f335ea1b8f193b8f6ea92561a60d23a207';
    controller.wipeTransactions();
    expect(controller.state.transactions).toHaveLength(0);

    controller.state.transactions = TRANSACTIONS_IN_STATE_WITH_OUTDATED_STATUS_AND_GAS_DATA;

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
    globalAny.fetch = mockFetch(MOCK_FETCH_TX_HISTORY_DATA_ERROR);
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      getProvider: MOCK_NETWORK.getProvider,
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
        getProvider: MOCK_MAINNET_NETWORK.getProvider,
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
        getProvider: MOCK_MAINNET_NETWORK.getProvider,
      },
      {},
    );
    const registry = await controller.handleMethodData('0xf39b5b9b');
    expect(registry.parsedRegistryMethod).toStrictEqual({
      args: [{ type: 'uint256' }, { type: 'uint256' }],
      name: 'Eth To Token Swap Input',
    });
    const registryLookup = stub(controller, 'registryLookup' as any);
    await controller.handleMethodData('0xf39b5b9b');
    expect(registryLookup.called).toBe(false);
  });

  it('should stop a transaction', async () => {
    const controller = new TransactionController(
      {
        getNetworkState: () => MOCK_NETWORK.state,
        onNetworkStateChange: MOCK_NETWORK.subscribe,
        getProvider: MOCK_NETWORK.getProvider,
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
    controller.stopTransaction(controller.state.transactions[0].id);
    await expect(result).rejects.toThrow('User cancelled the transaction');
  });

  it('should fail to stop a transaction if no sign method', async () => {
    const controller = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      getProvider: MOCK_NETWORK.getProvider,
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
          getProvider: MOCK_NETWORK.getProvider,
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
        '0x5916a6d6',
      );
      resolve('');
    });
  });
  it('should limit tx state to a length of 2', async () => {
    await new Promise(async (resolve) => {
      globalAny.fetch = mockFetchs(MOCK_FETCH_TX_HISTORY_DATA_OK);
      const controller = new TransactionController(
        {
          getNetworkState: () => MOCK_NETWORK.state,
          onNetworkStateChange: MOCK_NETWORK.subscribe,
          getProvider: MOCK_NETWORK.getProvider,
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
      resolve('');
    });
  });

  it('should allow tx state to be greater than txHistorylimit due to speed up same nonce', async () => {
    await new Promise(async (resolve) => {
      const controller = new TransactionController(
        {
          getNetworkState: () => MOCK_NETWORK.state,
          onNetworkStateChange: MOCK_NETWORK.subscribe,
          getProvider: MOCK_NETWORK.getProvider,
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
});
