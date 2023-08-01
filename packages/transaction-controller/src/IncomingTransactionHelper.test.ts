import { NetworkType, getEthChainIdHexFromCaipChainId, isSmartContractCode } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { NetworkState } from '@metamask/network-controller';

import { IncomingTransactionHelper } from './IncomingTransactionHelper';
import type { RemoteTransactionSource, TransactionMeta } from './types';
import { TransactionStatus } from './types';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  isSmartContractCode: jest.fn(),
  query: () => Promise.resolve({}),
}));

const NETWORK_STATE_MOCK: NetworkState = {
  providerConfig: {
    caipChainId: 'eip155:1',
    type: NetworkType.mainnet,
  },
  networkId: '1',
} as unknown as NetworkState;

const CONTROLLER_ARGS_MOCK = {
  getNetworkState: () => NETWORK_STATE_MOCK,
  getEthQuery: () => ({} as unknown as EthQuery),
  transactionLimit: 1,
  remoteTransactionSource: {} as RemoteTransactionSource,
};

const TRANSACTION_MOCK: TransactionMeta = {
  transactionHash: '0x1',
  transaction: { to: '0x1', gasUsed: '0x1' },
  time: 0,
  status: TransactionStatus.submitted,
  blockNumber: '1',
  caipChainId: 'eip155:1',
} as unknown as TransactionMeta;

const TRANSACTION_MOCK_2: TransactionMeta = {
  transactionHash: '0x2',
  transaction: { to: '0x1' },
  time: 1,
  blockNumber: '2',
  caipChainId: 'eip155:1',
} as unknown as TransactionMeta;

const RECONCILE_ARGS_MOCK = {
  address: '0x1',
  localTransactions: [],
  fromBlock: '0x3',
  apiKey: 'testApiKey',
};

const createRemoteTransactionSourceMock = (
  remoteTransactions: TransactionMeta[],
): RemoteTransactionSource => ({
  fetchTransactions: jest.fn(() => Promise.resolve(remoteTransactions)),
});

describe('IncomingTransactionHelper', () => {
  const isSmartContractCodeMock = isSmartContractCode as jest.MockedFn<
    typeof isSmartContractCode
  >;

  beforeEach(() => {
    jest.resetAllMocks();

    TRANSACTION_MOCK.toSmartContract = undefined;
    TRANSACTION_MOCK_2.toSmartContract = undefined;
  });

  describe('reconcile', () => {
    describe('fetches remote transactions', () => {
      it('using remote transaction source', async () => {
        const remoteTransactionSource = createRemoteTransactionSourceMock([]);

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource,
        });

        await helper.reconcile(RECONCILE_ARGS_MOCK);

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledTimes(
          1,
        );

        expect(remoteTransactionSource.fetchTransactions).toHaveBeenCalledWith({
          address: RECONCILE_ARGS_MOCK.address,
          apiKey: RECONCILE_ARGS_MOCK.apiKey,
          currentChainId: getEthChainIdHexFromCaipChainId(NETWORK_STATE_MOCK.providerConfig.caipChainId),
          currentNetworkId: NETWORK_STATE_MOCK.networkId,
          fromBlock: RECONCILE_ARGS_MOCK.fromBlock,
          limit: CONTROLLER_ARGS_MOCK.transactionLimit,
          networkType: NETWORK_STATE_MOCK.providerConfig.type,
        });
      });

      it('sorts transactions by time in ascending order', async () => {
        const firstTransaction = { ...TRANSACTION_MOCK_2, time: 5 };
        const secondTransaction = { ...TRANSACTION_MOCK, time: 6 };

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            firstTransaction,
          ]),
        });

        const { transactions } = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [secondTransaction],
        });

        expect(transactions).toStrictEqual([
          firstTransaction,
          secondTransaction,
        ]);
      });
    });

    describe('returns update required', () => {
      it('as false if current network is not supported', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          getNetworkState: () => ({ ...NETWORK_STATE_MOCK, networkId: '0x2' }),
        });

        const result = await helper.reconcile(RECONCILE_ARGS_MOCK);

        expect(result).toStrictEqual({
          updateRequired: false,
          transactions: [],
        });
      });

      it('as true if new transaction fetched', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK_2,
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [TRANSACTION_MOCK],
        });

        expect(result.updateRequired).toBe(true);
        expect(result.transactions).toStrictEqual([
          TRANSACTION_MOCK,
          TRANSACTION_MOCK_2,
        ]);
      });

      it('as true if existing transaction fetched with different status', async () => {
        const updatedTransaction = {
          ...TRANSACTION_MOCK,
          status: TransactionStatus.confirmed,
        } as TransactionMeta;

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            updatedTransaction,
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [TRANSACTION_MOCK],
        });

        expect(result.updateRequired).toBe(true);
        expect(result.transactions).toStrictEqual([updatedTransaction]);
      });

      it('as true if existing transaction fetched with different gas used', async () => {
        const updatedTransaction = {
          ...TRANSACTION_MOCK,
          transaction: {
            ...TRANSACTION_MOCK.transaction,
            gasUsed: '0x2',
          },
        } as TransactionMeta;

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            updatedTransaction,
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [TRANSACTION_MOCK],
        });

        expect(result.updateRequired).toBe(true);
        expect(result.transactions).toStrictEqual([updatedTransaction]);
      });
    });

    describe('returns latest block number', () => {
      it('of transactions with matching caip chain ID and to address', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK_2,
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [TRANSACTION_MOCK],
        });

        expect(result.latestBlockNumber).toBeDefined();
        expect(result.latestBlockNumber).toStrictEqual(
          TRANSACTION_MOCK_2.blockNumber,
        );
      });

      it('of transactions with matching network ID if no caip chain ID', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            { ...TRANSACTION_MOCK_2, caipChainId: undefined, networkID: '1' },
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [
            { ...TRANSACTION_MOCK, caipChainId: undefined, networkID: '1' },
          ],
        });

        expect(result.latestBlockNumber).toBeDefined();
        expect(result.latestBlockNumber).toStrictEqual(
          TRANSACTION_MOCK_2.blockNumber,
        );
      });

      it('of transactions with block number', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            { ...TRANSACTION_MOCK_2, blockNumber: undefined },
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [TRANSACTION_MOCK],
        });

        expect(result.latestBlockNumber).toBeDefined();
        expect(result.latestBlockNumber).toStrictEqual(
          TRANSACTION_MOCK.blockNumber,
        );
      });
    });

    describe('updates toSmartContract property on transactions', () => {
      it('to false if no to address', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            {
              ...TRANSACTION_MOCK_2,
              transaction: { ...TRANSACTION_MOCK_2.transaction, to: undefined },
            },
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [
            {
              ...TRANSACTION_MOCK,
              transaction: { ...TRANSACTION_MOCK.transaction, to: undefined },
            },
          ],
        });

        expect(result.transactions[0].toSmartContract).toBe(false);
        expect(result.transactions[1].toSmartContract).toBe(false);
      });

      it('to false if data is explicitly empty', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            {
              ...TRANSACTION_MOCK_2,
              transaction: { ...TRANSACTION_MOCK_2.transaction, data: '0x' },
            },
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [
            {
              ...TRANSACTION_MOCK,
              transaction: { ...TRANSACTION_MOCK.transaction, data: '0x' },
            },
          ],
        });

        expect(result.transactions[0].toSmartContract).toBe(false);
        expect(result.transactions[1].toSmartContract).toBe(false);
      });

      it('to false if isSmartContractCode returns false', async () => {
        isSmartContractCodeMock.mockReturnValue(false);

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK_2,
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [TRANSACTION_MOCK],
        });

        expect(result.transactions[0].toSmartContract).toBe(false);
        expect(result.transactions[1].toSmartContract).toBe(false);
      });

      it('to true if isSmartContractCode returns true', async () => {
        isSmartContractCodeMock.mockReturnValue(true);

        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            TRANSACTION_MOCK_2,
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [TRANSACTION_MOCK],
        });

        expect(result.transactions[0].toSmartContract).toBe(true);
        expect(result.transactions[1].toSmartContract).toBe(true);
      });

      it('to existing value if already set', async () => {
        const helper = new IncomingTransactionHelper({
          ...CONTROLLER_ARGS_MOCK,
          remoteTransactionSource: createRemoteTransactionSourceMock([
            { ...TRANSACTION_MOCK_2, toSmartContract: false },
          ]),
        });

        const result = await helper.reconcile({
          ...RECONCILE_ARGS_MOCK,
          localTransactions: [{ ...TRANSACTION_MOCK, toSmartContract: true }],
        });

        expect(result.transactions[0].toSmartContract).toBe(true);
        expect(result.transactions[1].toSmartContract).toBe(false);
      });
    });
  });
});
