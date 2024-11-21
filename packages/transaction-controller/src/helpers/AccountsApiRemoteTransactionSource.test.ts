import type { Hex } from '@metamask/utils';

import type { TransactionResponse } from '../api/accounts-api';
import { getAccountTransactionsAllPages } from '../api/accounts-api';
import { CHAIN_IDS } from '../constants';
import { AccountsApiRemoteTransactionSource } from './AccountsApiRemoteTransactionSource';

jest.mock('../api/accounts-api');

jest.useFakeTimers();

const ADDRESS_MOCK = '0x123';
const CHAIN_IDS_MOCK = [CHAIN_IDS.MAINNET, CHAIN_IDS.LINEA_MAINNET] as Hex[];
const END_TIMESTAMP_MOCK = 789;
const LIMIT_MOCK = 10;
const NOW_MOCK = 789000;

const START_TIMESTAMP_BY_CHAIN_ID_MOCK = {
  [CHAIN_IDS.MAINNET]: 123000,
  [CHAIN_IDS.LINEA_MAINNET]: 456000,
};

const RESPONSE_STANDARD_MOCK: TransactionResponse = {
  hash: '0x1',
  timestamp: new Date(123000).toISOString(),
  chainId: 1,
  blockNumber: 1,
  blockHash: '0x2',
  gas: 1,
  gasUsed: 1,
  gasPrice: '1',
  effectiveGasPrice: '1',
  nonce: 1,
  cumulativeGasUsed: 1,
  methodId: null,
  value: '1',
  to: ADDRESS_MOCK,
  from: '0x2',
  isError: false,
  valueTransfers: [],
};

const RESPONSE_TOKEN_TRANSFER_MOCK: TransactionResponse = {
  ...RESPONSE_STANDARD_MOCK,
  to: '0x456',
  valueTransfers: [
    {
      contractAddress: '0x123',
      decimal: 18,
      symbol: 'ABC',
      from: '0x2',
      to: ADDRESS_MOCK,
      amount: '1',
    },
  ],
};

const TRANSACTION_STANDARD_MOCK = {
  blockNumber: '1',
  chainId: '0x1',
  error: undefined,
  hash: '0x1',
  id: expect.any(String),
  isTransfer: false,
  status: 'confirmed',
  time: 123000,
  transferInformation: undefined,
  txParams: {
    chainId: '0x1',
    from: '0x2',
    gas: '0x1',
    gasPrice: '0x1',
    gasUsed: '0x1',
    nonce: '0x1',
    to: '0x123',
    value: '0x1',
  },
  type: 'incoming',
  verifiedOnBlockchain: false,
};

const TRANSACTION_TOKEN_TRANSFER_MOCK = {
  ...TRANSACTION_STANDARD_MOCK,
  isTransfer: true,
  transferInformation: {
    contractAddress: '0x123',
    decimals: 18,
    symbol: 'ABC',
  },
};

describe('AccountsApiRemoteTransactionSource', () => {
  const getAccountTransactionsAllPagesMock = jest.mocked(
    getAccountTransactionsAllPages,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jest.setSystemTime(NOW_MOCK);

    getAccountTransactionsAllPagesMock.mockResolvedValue([]);
  });

  describe('getSupportedChains', () => {
    it('returns supported chains', () => {
      const supportedChains =
        new AccountsApiRemoteTransactionSource().getSupportedChains();
      expect(supportedChains.length).toBeGreaterThan(0);
    });
  });

  describe('fetchTransactions', () => {
    it('queries accounts API with correct parameters', async () => {
      await new AccountsApiRemoteTransactionSource().fetchTransactions({
        address: ADDRESS_MOCK,
        chainIds: [...CHAIN_IDS_MOCK, '0x123'],
        endTimestamp: END_TIMESTAMP_MOCK,
        limit: LIMIT_MOCK,
        startTimestampByChainId: START_TIMESTAMP_BY_CHAIN_ID_MOCK,
      });

      expect(getAccountTransactionsAllPagesMock).toHaveBeenCalledTimes(1);
      expect(getAccountTransactionsAllPagesMock).toHaveBeenCalledWith({
        address: ADDRESS_MOCK,
        chainIds: CHAIN_IDS_MOCK,
        startTimestamp: 123000,
        endTimestamp: 789,
      });
    });

    it('returns normalized standard transaction from accounts API', async () => {
      getAccountTransactionsAllPagesMock.mockResolvedValue([
        RESPONSE_STANDARD_MOCK,
      ]);

      const transactions =
        await new AccountsApiRemoteTransactionSource().fetchTransactions({
          address: ADDRESS_MOCK,
          chainIds: CHAIN_IDS_MOCK,
          endTimestamp: END_TIMESTAMP_MOCK,
          limit: LIMIT_MOCK,
          startTimestampByChainId: START_TIMESTAMP_BY_CHAIN_ID_MOCK,
        });

      expect(transactions).toStrictEqual([TRANSACTION_STANDARD_MOCK]);
    });

    it('returns normalized token transfer transaction from accounts API', async () => {
      getAccountTransactionsAllPagesMock.mockResolvedValue([
        RESPONSE_TOKEN_TRANSFER_MOCK,
      ]);

      const transactions =
        await new AccountsApiRemoteTransactionSource().fetchTransactions({
          address: ADDRESS_MOCK,
          chainIds: CHAIN_IDS_MOCK,
          endTimestamp: END_TIMESTAMP_MOCK,
          limit: LIMIT_MOCK,
          startTimestampByChainId: START_TIMESTAMP_BY_CHAIN_ID_MOCK,
        });

      expect(transactions).toStrictEqual([TRANSACTION_TOKEN_TRANSFER_MOCK]);
    });

    it('filters out transactions that are older than the start timestamp', async () => {
      getAccountTransactionsAllPagesMock.mockResolvedValue([
        RESPONSE_STANDARD_MOCK,
      ]);

      const transactions =
        await new AccountsApiRemoteTransactionSource().fetchTransactions({
          address: ADDRESS_MOCK,
          chainIds: CHAIN_IDS_MOCK,
          endTimestamp: END_TIMESTAMP_MOCK,
          limit: LIMIT_MOCK,
          startTimestampByChainId: { '0x1': 123001, '0x2': 123000 },
        });

      expect(transactions).toStrictEqual([]);
    });

    it('filters out transactions that exceed limit', async () => {
      getAccountTransactionsAllPagesMock.mockResolvedValue([
        RESPONSE_STANDARD_MOCK,
      ]);

      const transactions =
        await new AccountsApiRemoteTransactionSource().fetchTransactions({
          address: ADDRESS_MOCK,
          chainIds: CHAIN_IDS_MOCK,
          endTimestamp: END_TIMESTAMP_MOCK,
          limit: 0,
          startTimestampByChainId: START_TIMESTAMP_BY_CHAIN_ID_MOCK,
        });

      expect(transactions).toStrictEqual([]);
    });
  });
});
