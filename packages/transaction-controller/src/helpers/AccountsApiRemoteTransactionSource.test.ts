import {
  AccountsApiRemoteTransactionSource,
  SUPPORTED_CHAIN_IDS,
} from './AccountsApiRemoteTransactionSource';
import type {
  GetAccountTransactionsResponse,
  TransactionResponse,
} from '../api/accounts-api';
import { getAccountTransactions } from '../api/accounts-api';
import type { RemoteTransactionSourceRequest } from '../types';

jest.mock('../api/accounts-api');

jest.useFakeTimers();

const ADDRESS_MOCK = '0x123';
const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const NOW_MOCK = 789000 + ONE_DAY_MS;
const CURSOR_MOCK = 'abcdef';
const CACHED_TIMESTAMP_MOCK = 456;
const INITIAL_TIMESTAMP_MOCK = 789;

const REQUEST_MOCK: RemoteTransactionSourceRequest = {
  address: ADDRESS_MOCK,
  cache: {},
  includeTokenTransfers: true,
  queryEntireHistory: true,
  updateCache: jest.fn(),
  updateTransactions: true,
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
  networkClientId: '',
  status: 'confirmed',
  time: 123000,
  toSmartContract: false,
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
  const getAccountTransactionsMock = jest.mocked(getAccountTransactions);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.setSystemTime(NOW_MOCK);

    getAccountTransactionsMock.mockResolvedValue(
      {} as GetAccountTransactionsResponse,
    );
  });

  describe('getSupportedChains', () => {
    it('returns supported chains', () => {
      const supportedChains =
        new AccountsApiRemoteTransactionSource().getSupportedChains();
      expect(supportedChains.length).toBeGreaterThan(0);
    });
  });

  describe('fetchTransactions', () => {
    it('queries accounts API', async () => {
      await new AccountsApiRemoteTransactionSource().fetchTransactions(
        REQUEST_MOCK,
      );

      expect(getAccountTransactionsMock).toHaveBeenCalledTimes(1);
      expect(getAccountTransactionsMock).toHaveBeenCalledWith({
        address: ADDRESS_MOCK,
        chainIds: SUPPORTED_CHAIN_IDS,
        cursor: undefined,
        sortDirection: 'ASC',
      });
    });

    it('queries accounts API with start timestamp if queryEntireHistory is false', async () => {
      await new AccountsApiRemoteTransactionSource().fetchTransactions({
        ...REQUEST_MOCK,
        queryEntireHistory: false,
      });

      expect(getAccountTransactionsMock).toHaveBeenCalledTimes(1);
      expect(getAccountTransactionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          startTimestamp: INITIAL_TIMESTAMP_MOCK,
        }),
      );
    });

    it('queries accounts API with cursor from cache', async () => {
      await new AccountsApiRemoteTransactionSource().fetchTransactions({
        ...REQUEST_MOCK,
        cache: {
          [`accounts-api#${SUPPORTED_CHAIN_IDS.join(',')}#${ADDRESS_MOCK}`]:
            CURSOR_MOCK,
        },
      });

      expect(getAccountTransactionsMock).toHaveBeenCalledTimes(1);
      expect(getAccountTransactionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: CURSOR_MOCK,
        }),
      );
    });

    it('queries accounts API with timestamp from cache', async () => {
      await new AccountsApiRemoteTransactionSource().fetchTransactions({
        ...REQUEST_MOCK,
        queryEntireHistory: false,
        cache: {
          [`accounts-api#timestamp#${SUPPORTED_CHAIN_IDS.join(',')}#${ADDRESS_MOCK}`]:
            CACHED_TIMESTAMP_MOCK,
        },
      });

      expect(getAccountTransactionsMock).toHaveBeenCalledTimes(1);
      expect(getAccountTransactionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          startTimestamp: CACHED_TIMESTAMP_MOCK,
        }),
      );
    });

    it('returns normalized standard transaction', async () => {
      getAccountTransactionsMock.mockResolvedValue({
        data: [RESPONSE_STANDARD_MOCK],
        pageInfo: { hasNextPage: false, count: 1 },
      });

      const transactions =
        await new AccountsApiRemoteTransactionSource().fetchTransactions(
          REQUEST_MOCK,
        );

      expect(transactions).toStrictEqual([TRANSACTION_STANDARD_MOCK]);
    });

    it('returns normalized token transfer transaction', async () => {
      getAccountTransactionsMock.mockResolvedValue({
        data: [RESPONSE_TOKEN_TRANSFER_MOCK],
        pageInfo: { hasNextPage: false, count: 1 },
      });

      const transactions =
        await new AccountsApiRemoteTransactionSource().fetchTransactions(
          REQUEST_MOCK,
        );

      expect(transactions).toStrictEqual([TRANSACTION_TOKEN_TRANSFER_MOCK]);
    });

    it('queries multiple times if response has next page', async () => {
      getAccountTransactionsMock
        .mockResolvedValueOnce({
          data: [RESPONSE_STANDARD_MOCK],
          pageInfo: { hasNextPage: true, count: 1, cursor: CURSOR_MOCK },
        })
        .mockResolvedValueOnce({
          data: [RESPONSE_STANDARD_MOCK],
          pageInfo: { hasNextPage: true, count: 1, cursor: CURSOR_MOCK },
        });

      await new AccountsApiRemoteTransactionSource().fetchTransactions(
        REQUEST_MOCK,
      );

      expect(getAccountTransactionsMock).toHaveBeenCalledTimes(3);
      expect(getAccountTransactionsMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ cursor: undefined }),
      );
      expect(getAccountTransactionsMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ cursor: CURSOR_MOCK }),
      );
      expect(getAccountTransactionsMock).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ cursor: CURSOR_MOCK }),
      );
    });

    it('updates cache if response has cursor', async () => {
      getAccountTransactionsMock
        .mockResolvedValueOnce({
          data: [RESPONSE_STANDARD_MOCK],
          pageInfo: { hasNextPage: true, count: 1, cursor: CURSOR_MOCK },
        })
        .mockResolvedValueOnce({
          data: [RESPONSE_STANDARD_MOCK],
          pageInfo: { hasNextPage: true, count: 1, cursor: CURSOR_MOCK },
        });

      const cacheMock = {};

      const updateCacheMock = jest
        .fn()
        .mockImplementation((fn) => fn(cacheMock));

      await new AccountsApiRemoteTransactionSource().fetchTransactions({
        ...REQUEST_MOCK,
        updateCache: updateCacheMock,
      });

      expect(updateCacheMock).toHaveBeenCalledTimes(2);
      expect(cacheMock).toStrictEqual({
        [`accounts-api#${SUPPORTED_CHAIN_IDS.join(',')}#${ADDRESS_MOCK}`]:
          CURSOR_MOCK,
      });
    });

    it('removes timestamp cache entry if response has cursor', async () => {
      getAccountTransactionsMock.mockResolvedValueOnce({
        data: [RESPONSE_STANDARD_MOCK],
        pageInfo: { hasNextPage: false, count: 1, cursor: CURSOR_MOCK },
      });

      const cacheMock = {
        [`accounts-api#timestamp#${SUPPORTED_CHAIN_IDS.join(',')}#${ADDRESS_MOCK}`]:
          CACHED_TIMESTAMP_MOCK,
      };

      const updateCacheMock = jest
        .fn()
        .mockImplementation((fn) => fn(cacheMock));

      await new AccountsApiRemoteTransactionSource().fetchTransactions({
        ...REQUEST_MOCK,
        updateCache: updateCacheMock,
      });

      expect(updateCacheMock).toHaveBeenCalledTimes(1);
      expect(cacheMock).toStrictEqual({
        [`accounts-api#${SUPPORTED_CHAIN_IDS.join(',')}#${ADDRESS_MOCK}`]:
          CURSOR_MOCK,
      });
    });

    it('updates cache with timestamp if response does not have cursor', async () => {
      getAccountTransactionsMock.mockResolvedValueOnce({
        data: [],
        pageInfo: { hasNextPage: false, count: 0, cursor: undefined },
      });

      const cacheMock = {};

      const updateCacheMock = jest
        .fn()
        .mockImplementation((fn) => fn(cacheMock));

      await new AccountsApiRemoteTransactionSource().fetchTransactions({
        ...REQUEST_MOCK,
        queryEntireHistory: false,
        updateCache: updateCacheMock,
      });

      expect(updateCacheMock).toHaveBeenCalledTimes(1);
      expect(cacheMock).toStrictEqual({
        [`accounts-api#timestamp#${SUPPORTED_CHAIN_IDS.join(',')}#${ADDRESS_MOCK}`]:
          INITIAL_TIMESTAMP_MOCK,
      });
    });

    it('ignores outgoing transactions if updateTransactions is false', async () => {
      getAccountTransactionsMock.mockResolvedValue({
        data: [{ ...RESPONSE_STANDARD_MOCK, to: '0x456' }],
        pageInfo: { hasNextPage: false, count: 1 },
      });

      const transactions =
        await new AccountsApiRemoteTransactionSource().fetchTransactions({
          ...REQUEST_MOCK,
          updateTransactions: false,
        });

      expect(transactions).toStrictEqual([]);
    });

    it('ignores incoming token transfers if includeTokenTransfers is false', async () => {
      getAccountTransactionsMock.mockResolvedValue({
        data: [RESPONSE_TOKEN_TRANSFER_MOCK],
        pageInfo: { hasNextPage: false, count: 1 },
      });

      const transactions =
        await new AccountsApiRemoteTransactionSource().fetchTransactions({
          ...REQUEST_MOCK,
          includeTokenTransfers: false,
        });

      expect(transactions).toStrictEqual([]);
    });
  });
});
