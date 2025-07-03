import {
  AccountsApiRemoteTransactionSource,
  SUPPORTED_CHAIN_IDS,
} from './AccountsApiRemoteTransactionSource';
import { determineTransactionType } from '..';
import type {
  GetAccountTransactionsResponse,
  TransactionResponse,
} from '../api/accounts-api';
import { getAccountTransactions } from '../api/accounts-api';
import { TransactionType, type RemoteTransactionSourceRequest } from '../types';

jest.mock('../api/accounts-api');
jest.mock('../utils/transaction-type');

jest.useFakeTimers();

const MOCK_ACCESS_TOKEN = 'mock-access-token';
const mockAuthenticationControllerGetBearerToken = jest.fn();

const ADDRESS_MOCK = '0x123';
const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const NOW_MOCK = 789000 + ONE_DAY_MS;

const REQUEST_MOCK: RemoteTransactionSourceRequest = {
  address: ADDRESS_MOCK,
  includeTokenTransfers: true,
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
  methodId: '0x12345678',
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
    data: '0x12345678',
    from: '0x2',
    gas: '0x1',
    gasPrice: '0x1',
    gasUsed: '0x1',
    nonce: '0x1',
    to: '0x123',
    value: '0x1',
  },
  type: TransactionType.incoming,
  verifiedOnBlockchain: false,
};

const TRANSACTION_TOKEN_TRANSFER_MOCK = {
  ...TRANSACTION_STANDARD_MOCK,
  isTransfer: true,
  transferInformation: {
    amount: '1',
    contractAddress: '0x123',
    decimals: 18,
    symbol: 'ABC',
  },
};

describe('AccountsApiRemoteTransactionSource', () => {
  const getAccountTransactionsMock = jest.mocked(getAccountTransactions);
  const determineTransactionTypeMock = jest.mocked(determineTransactionType);
  const baseOptions = {
    getAuthenticationControllerBearerToken:
      mockAuthenticationControllerGetBearerToken,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.setSystemTime(NOW_MOCK);

    mockAuthenticationControllerGetBearerToken.mockResolvedValue(
      MOCK_ACCESS_TOKEN,
    );

    getAccountTransactionsMock.mockResolvedValue(
      {} as GetAccountTransactionsResponse,
    );

    determineTransactionTypeMock.mockResolvedValue({
      type: TransactionType.tokenMethodTransfer,
      getCodeResponse: undefined,
    });
  });

  describe('getSupportedChains', () => {
    it('returns supported chains', () => {
      const supportedChains = new AccountsApiRemoteTransactionSource(
        baseOptions,
      ).getSupportedChains();
      expect(supportedChains.length).toBeGreaterThan(0);
    });
  });

  describe('fetchTransactions', () => {
    it('queries accounts API', async () => {
      await new AccountsApiRemoteTransactionSource(
        baseOptions,
      ).fetchTransactions(REQUEST_MOCK);

      expect(getAccountTransactionsMock).toHaveBeenCalledTimes(1);
      expect(getAccountTransactionsMock).toHaveBeenCalledWith({
        address: ADDRESS_MOCK,
        chainIds: SUPPORTED_CHAIN_IDS,
        sortDirection: 'DESC',
      });
    });

    it('returns normalized standard transaction', async () => {
      getAccountTransactionsMock.mockResolvedValue({
        data: [RESPONSE_STANDARD_MOCK],
        pageInfo: { hasNextPage: false, count: 1 },
      });

      const transactions = await new AccountsApiRemoteTransactionSource(
        baseOptions,
      ).fetchTransactions(REQUEST_MOCK);

      expect(transactions).toStrictEqual([TRANSACTION_STANDARD_MOCK]);
    });

    it('returns normalized token transfer transaction', async () => {
      getAccountTransactionsMock.mockResolvedValue({
        data: [RESPONSE_TOKEN_TRANSFER_MOCK],
        pageInfo: { hasNextPage: false, count: 1 },
      });

      const transactions = await new AccountsApiRemoteTransactionSource(
        baseOptions,
      ).fetchTransactions(REQUEST_MOCK);

      expect(transactions).toStrictEqual([TRANSACTION_TOKEN_TRANSFER_MOCK]);
    });

    it('ignores outgoing transactions if updateTransactions is false', async () => {
      getAccountTransactionsMock.mockResolvedValue({
        data: [{ ...RESPONSE_STANDARD_MOCK, to: '0x456' }],
        pageInfo: { hasNextPage: false, count: 1 },
      });

      const transactions = await new AccountsApiRemoteTransactionSource(
        baseOptions,
      ).fetchTransactions({
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

      const transactions = await new AccountsApiRemoteTransactionSource(
        baseOptions,
      ).fetchTransactions({
        ...REQUEST_MOCK,
        includeTokenTransfers: false,
      });

      expect(transactions).toStrictEqual([]);
    });

    it('determines transaction type if outgoing', async () => {
      getAccountTransactionsMock.mockResolvedValue({
        data: [{ ...RESPONSE_TOKEN_TRANSFER_MOCK, from: ADDRESS_MOCK }],
        pageInfo: { hasNextPage: false, count: 1 },
      });

      const transactions = await new AccountsApiRemoteTransactionSource(
        baseOptions,
      ).fetchTransactions(REQUEST_MOCK);

      expect(transactions[0].type).toBe(TransactionType.tokenMethodTransfer);
    });
  });
});
