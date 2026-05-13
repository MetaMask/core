import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  PayStrategyExecuteRequest,
  TransactionPayQuote,
} from '../../types';
import {
  getGenericPollingInterval,
  getGenericPollingTimeout,
} from '../../utils/feature-flags';
import { getGenericStatus, submitGenericIntent } from './generic-api';
import { submitGenericQuotes } from './generic-submit';
import { GenericProviderName, GenericStatus } from './types';
import type { GenericQuote } from './types';

jest.mock('../../utils/feature-flags');
jest.mock('./generic-api');

const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';
const ORIGINAL_TRANSACTION_ID_MOCK = 'original-transaction-id';
const ORIGINAL_FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const QUOTE_FROM_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const SOURCE_CHAIN_ID_MOCK = '0x89' as Hex;
const TARGET_HASH_MOCK = '0xtarget' as Hex;
const SOURCE_HASH_MOCK = '0xsource' as Hex;

const TRANSACTION_META_MOCK = {
  chainId: '0x1',
  id: ORIGINAL_TRANSACTION_ID_MOCK,
  networkClientId: 'mainnet',
  status: TransactionStatus.unapproved,
  time: 12345,
  txParams: {
    from: ORIGINAL_FROM_MOCK,
    nonce: '0x7' as Hex,
    to: '0x3333333333333333333333333333333333333333' as Hex,
    value: '0x0' as Hex,
  },
} as TransactionMeta;

const ORIGINAL_QUOTE_MOCK: GenericQuote = {
  duration: 30,
  id: 'generic-intent-id',
  input: { formatted: '1.23', raw: '1230000' },
  output: { formatted: '1', raw: '1000000' },
  provider: GenericProviderName.Relay,
  providerFeeUsd: '0.01',
  steps: [
    {
      chainId: 137,
      data: '0xstepdata' as Hex,
      to: '0x4444444444444444444444444444444444444444' as Hex,
      value: '0x10',
    },
  ],
};

const QUOTE_MOCK = {
  dust: { fiat: '0', usd: '0' },
  estimatedDuration: 30,
  fees: {
    metaMask: { fiat: '0', usd: '0' },
    provider: { fiat: '0', usd: '0' },
    sourceNetwork: {
      estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
      max: { fiat: '0', human: '0', raw: '0', usd: '0' },
    },
    targetNetwork: { fiat: '0', usd: '0' },
  },
  original: ORIGINAL_QUOTE_MOCK,
  request: {
    from: QUOTE_FROM_MOCK,
    sourceBalanceRaw: '10000000',
    sourceChainId: SOURCE_CHAIN_ID_MOCK,
    sourceTokenAddress: '0x5555555555555555555555555555555555555555' as Hex,
    sourceTokenAmount: '1230000',
    targetAmountMinimum: '1000000',
    targetChainId: '0x1' as Hex,
    targetTokenAddress: '0x6666666666666666666666666666666666666666' as Hex,
  },
  sourceAmount: { fiat: '1', human: '1', raw: '1230000', usd: '1' },
  strategy: 'generic',
  targetAmount: { fiat: '1', usd: '1' },
} as TransactionPayQuote<GenericQuote>;

const DELEGATION_MOCK = {
  authorizationList: [
    {
      address: '0x7777777777777777777777777777777777777777' as Hex,
      chainId: '0x89' as Hex,
      nonce: '0x2' as Hex,
      r: '0xr' as Hex,
      s: '0xs' as Hex,
      yParity: '0x1' as Hex,
    },
  ],
  data: '0xdelegationdata' as Hex,
  to: '0x8888888888888888888888888888888888888888' as Hex,
  value: '0x10' as Hex,
};

describe('submitGenericQuotes', () => {
  const getGenericPollingIntervalMock = jest.mocked(getGenericPollingInterval);
  const getGenericPollingTimeoutMock = jest.mocked(getGenericPollingTimeout);
  const getGenericStatusMock = jest.mocked(getGenericStatus);
  const submitGenericIntentMock = jest.mocked(submitGenericIntent);

  const messengerMocks = getMessengerMock();
  const {
    findNetworkClientIdByChainIdMock,
    getDelegationTransactionMock,
    getTransactionControllerStateMock,
    messenger,
    updateTransactionMock,
  } = messengerMocks;
  const addTxMock = messengerMocks[
    `add${'Transaction'}Mock` as keyof typeof messengerMocks
  ] as jest.Mock;
  const addTxBatchMock = messengerMocks[
    `add${'TransactionBatch'}Mock` as keyof typeof messengerMocks
  ] as jest.Mock;

  let currentTransaction: TransactionMeta;
  let request: PayStrategyExecuteRequest<GenericQuote>;

  beforeEach(() => {
    jest.resetAllMocks();

    currentTransaction = cloneDeep(TRANSACTION_META_MOCK);
    request = {
      accountSupports7702: true,
      isSmartTransaction: (): boolean => false,
      messenger,
      quotes: [cloneDeep(QUOTE_MOCK)],
      transaction: cloneDeep(TRANSACTION_META_MOCK),
    };

    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
    getDelegationTransactionMock.mockResolvedValue(DELEGATION_MOCK);
    getGenericPollingIntervalMock.mockReturnValue(0);
    getGenericPollingTimeoutMock.mockReturnValue(undefined);
    getGenericStatusMock.mockResolvedValue({
      status: GenericStatus.Confirmed,
      targetHash: TARGET_HASH_MOCK,
    });
    getTransactionControllerStateMock.mockImplementation(
      () => ({ transactions: [currentTransaction] }) as never,
    );
    submitGenericIntentMock.mockResolvedValue({ success: true });
    updateTransactionMock.mockImplementation((transaction) => {
      currentTransaction = transaction;
    });
  });

  it('submits with mapped fields from the quote and delegation', async () => {
    await submitGenericQuotes(request);

    expect(submitGenericIntentMock).toHaveBeenCalledWith(messenger, {
      authorizationList: [
        {
          address: DELEGATION_MOCK.authorizationList[0].address,
          chainId: 137,
          nonce: 2,
          r: DELEGATION_MOCK.authorizationList[0].r,
          s: DELEGATION_MOCK.authorizationList[0].s,
          yParity: 1,
        },
      ],
      chainId: 137,
      data: DELEGATION_MOCK.data,
      id: ORIGINAL_QUOTE_MOCK.id,
      provider: GenericProviderName.Relay,
      to: DELEGATION_MOCK.to,
      value: '16',
    });
  });

  it('uses quote.request.from for the delegation transaction', async () => {
    await submitGenericQuotes(request);

    expect(getDelegationTransactionMock).toHaveBeenCalledWith({
      transaction: expect.objectContaining({
        chainId: SOURCE_CHAIN_ID_MOCK,
        nestedTransactions: [
          {
            data: ORIGINAL_QUOTE_MOCK.steps[0].data,
            to: ORIGINAL_QUOTE_MOCK.steps[0].to,
            value: ORIGINAL_QUOTE_MOCK.steps[0].value,
          },
        ],
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        txParams: expect.objectContaining({ from: QUOTE_FROM_MOCK }),
      }),
    });
  });

  it('throws when the submit response is unsuccessful', async () => {
    submitGenericIntentMock.mockResolvedValue({
      error: 'provider rejected',
      success: false,
    });

    await expect(submitGenericQuotes(request)).rejects.toThrow(
      'Generic submit failed: provider rejected',
    );
  });

  it('polls until confirmed and returns the target hash', async () => {
    getGenericStatusMock
      .mockResolvedValueOnce({ status: GenericStatus.Submitted })
      .mockResolvedValueOnce({
        status: GenericStatus.Confirmed,
        targetHash: TARGET_HASH_MOCK,
      });

    const result = await submitGenericQuotes(request);

    expect(result).toStrictEqual({ transactionHash: TARGET_HASH_MOCK });
    expect(getGenericStatusMock).toHaveBeenCalledTimes(2);
  });

  it('throws on failed status', async () => {
    getGenericStatusMock.mockResolvedValue({ status: GenericStatus.Failed });

    await expect(submitGenericQuotes(request)).rejects.toThrow(
      'Generic intent failed',
    );
  });

  it('throws on refunded status', async () => {
    getGenericStatusMock.mockResolvedValue({ status: GenericStatus.Refunded });

    await expect(submitGenericQuotes(request)).rejects.toThrow(
      'Generic intent refunded',
    );
  });

  it('honors the polling timeout and includes the last status', async () => {
    const dateNowMock = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110);

    getGenericPollingTimeoutMock.mockReturnValue(5);
    getGenericStatusMock.mockResolvedValue({ status: GenericStatus.Pending });

    await expect(submitGenericQuotes(request)).rejects.toThrow(
      'Generic polling timed out (last status: PENDING)',
    );

    dateNowMock.mockRestore();
  });

  it('emits the source hash once when it appears in status', async () => {
    getGenericStatusMock
      .mockResolvedValueOnce({
        sourceHash: SOURCE_HASH_MOCK,
        status: GenericStatus.Submitted,
      })
      .mockResolvedValueOnce({
        sourceHash: '0xsecondsource' as Hex,
        status: GenericStatus.Confirmed,
        targetHash: TARGET_HASH_MOCK,
      });

    await submitGenericQuotes(request);

    const sourceHashUpdates = updateTransactionMock.mock.calls.filter(
      ([, note]) => note === 'Add source hash from generic status',
    );

    expect(sourceHashUpdates).toHaveLength(1);
    expect(currentTransaction.metamaskPay?.sourceHash).toBe(SOURCE_HASH_MOCK);
  });

  it('does not call TransactionController submit actions', async () => {
    await submitGenericQuotes(request);

    expect(addTxMock).not.toHaveBeenCalled();
    expect(addTxBatchMock).not.toHaveBeenCalled();
  });
});
