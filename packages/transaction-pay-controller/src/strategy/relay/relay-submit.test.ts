import { ORIGIN_METAMASK, successfulFetch } from '@metamask/controller-utils';
import {
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { RELAY_URL_BASE } from './constants';
import { submitRelayQuotes } from './relay-submit';
import type { RelayQuote } from './types';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';

jest.mock('../../utils/transaction');

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';
const TRANSACTION_HASH_MOCK = '0x1234';
const ENDPOINT_MOCK = '/test123';
const ORIGINAL_TRANSACTION_ID_MOCK = '456-789';
const FROM_MOCK = '0xabcde' as Hex;

const TRANSACTION_META_MOCK = {
  id: '123-456',
  hash: TRANSACTION_HASH_MOCK,
} as TransactionMeta;

const ORIGINAL_QUOTE_MOCK = {
  steps: [
    {
      kind: 'transaction',
      items: [
        {
          check: {
            endpoint: ENDPOINT_MOCK,
            method: 'GET',
          },
          data: {
            chainId: 1,
            data: '0x1234' as Hex,
            from: FROM_MOCK,
            gas: '21000',
            maxFeePerGas: '25000000000',
            maxPriorityFeePerGas: '1000000000',
            to: '0xfedcb' as Hex,
            value: '1234',
          },
          status: 'complete',
        },
      ],
    },
  ],
} as RelayQuote;

const REQUEST_MOCK: PayStrategyExecuteRequest<RelayQuote> = {
  quotes: [
    {
      original: ORIGINAL_QUOTE_MOCK,
    } as TransactionPayQuote<RelayQuote>,
  ],
  messenger: {} as TransactionPayControllerMessenger,
  isSmartTransaction: () => false,
  transaction: {
    id: ORIGINAL_TRANSACTION_ID_MOCK,
  } as TransactionMeta,
};

describe('Relay Submit Utils', () => {
  const updateTransactionMock = jest.mocked(updateTransaction);
  const successfulFetchMock = jest.mocked(successfulFetch);
  const getTransactionMock = jest.mocked(getTransaction);
  const collectTransactionIdsMock = jest.mocked(collectTransactionIds);

  const {
    addTransactionMock,
    addTransactionBatchMock,
    findNetworkClientIdByChainIdMock,
    messenger,
  } = getMessengerMock();

  let request: PayStrategyExecuteRequest<RelayQuote>;

  const waitForTransactionConfirmedMock = jest.mocked(
    waitForTransactionConfirmed,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

    addTransactionMock.mockResolvedValue({
      result: Promise.resolve(TRANSACTION_HASH_MOCK),
      transactionMeta: TRANSACTION_META_MOCK,
    });

    waitForTransactionConfirmedMock.mockResolvedValue();
    getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);

    collectTransactionIdsMock.mockImplementation(
      (_chainId, _from, _messenger, fn) => {
        fn(TRANSACTION_META_MOCK.id);
        return { end: jest.fn() };
      },
    );

    successfulFetchMock.mockResolvedValue({
      json: async () => ({ status: 'success' }),
    } as Response);

    request = cloneDeep(REQUEST_MOCK);
    request.messenger = messenger;
  });

  describe('submitRelayQuotes', () => {
    it('adds transaction', async () => {
      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        {
          data: '0x1234',
          from: '0xabcde',
          gas: '0x5208',
          maxFeePerGas: '0x5d21dba00',
          maxPriorityFeePerGas: '0x3b9aca00',
          to: '0xfedcb',
          value: '0x4d2',
        },
        {
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          origin: ORIGIN_METAMASK,
          requireApproval: false,
        },
      );
    });

    it('adds batch transaction if multiple params', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith({
        from: FROM_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        origin: ORIGIN_METAMASK,
        requireApproval: false,
        transactions: [
          {
            params: {
              data: '0x1234',
              gas: '0x5208',
              to: '0xfedcb',
              value: '0x4d2',
            },
            type: TransactionType.tokenMethodApprove,
          },
          {
            params: {
              data: '0x1234',
              gas: '0x5208',
              to: '0xfedcb',
              value: '0x4d2',
            },
          },
        ],
      });
    });

    it('adds transaction if params missing', async () => {
      request.quotes[0].original.steps[0].items[0].data.value =
        undefined as never;

      request.quotes[0].original.steps[0].items[0].data.gas =
        undefined as never;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gas: '0xdbba0',
          value: '0x0',
        }),
        expect.anything(),
      );
    });

    it('throws if step kind is unsupported', async () => {
      request.quotes[0].original.steps[0].kind = 'unsupported' as never;

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Unsupported step kind: unsupported',
      );
    });

    it('waits for relay status to be success', async () => {
      successfulFetchMock.mockResolvedValueOnce({
        json: async () => ({ status: 'pending' }),
      } as Response);

      await submitRelayQuotes(request);

      expect(successfulFetchMock).toHaveBeenCalledTimes(2);
      expect(successfulFetchMock).toHaveBeenCalledWith(
        `${RELAY_URL_BASE}${ENDPOINT_MOCK}`,
        {
          method: 'GET',
        },
      );
    });

    it('throws if transaction fails to confirm', async () => {
      waitForTransactionConfirmedMock.mockRejectedValue(
        new Error('Transaction failed'),
      );

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Transaction failed',
      );
    });

    it.each(['failure', 'refund'])(
      'throws if relay status is %s',
      async (status) => {
        successfulFetchMock.mockResolvedValue({
          json: async () => ({ status }),
        } as Response);

        await expect(submitRelayQuotes(request)).rejects.toThrow(
          `Relay request failed with status: ${status}`,
        );
      },
    );

    it('updates transaction if skipTransaction is true', async () => {
      request.quotes[0].original.skipTransaction = true;

      await submitRelayQuotes(request);

      expect(updateTransactionMock).toHaveBeenCalledWith(
        {
          transactionId: ORIGINAL_TRANSACTION_ID_MOCK,
          messenger,
          note: expect.any(String),
        },
        expect.any(Function),
      );

      const txDraft = { txParams: { nonce: '0x1' } } as TransactionMeta;
      updateTransactionMock.mock.calls.map((call) => call[1](txDraft));

      expect(txDraft).toStrictEqual({
        isIntentComplete: true,
        requiredTransactionIds: [TRANSACTION_META_MOCK.id],
        txParams: {
          nonce: undefined,
        },
      });
    });

    it('returns hash if skipTransaction is true', async () => {
      request.quotes[0].original.skipTransaction = true;
      const result = await submitRelayQuotes(request);
      expect(result.transactionHash).toBe(TRANSACTION_HASH_MOCK);
    });

    it('does not return hash if skipTransaction is false', async () => {
      const result = await submitRelayQuotes(request);
      expect(result.transactionHash).toBeUndefined();
    });

    it('adds required transaction IDs', async () => {
      await submitRelayQuotes(request);

      const updateFn = updateTransactionMock.mock.calls[0][1];
      const txDraft = {} as TransactionMeta;
      updateFn(txDraft);

      expect(txDraft.requiredTransactionIds).toStrictEqual([
        TRANSACTION_META_MOCK.id,
      ]);
    });
  });
});
