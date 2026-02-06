import { ORIGIN_METAMASK, successfulFetch } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { RELAY_STATUS_URL } from './constants';
import { submitRelayQuotes } from './relay-submit';
import type { RelayQuote } from './types';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import type { FeatureFlags } from '../../utils/feature-flags';
import { getFeatureFlags } from '../../utils/feature-flags';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';

jest.mock('../../utils/transaction');
jest.mock('../../utils/feature-flags');

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';
const TRANSACTION_HASH_MOCK = '0x1234';
const REQUEST_ID_MOCK = '0x1234567890abcdef';
const ORIGINAL_TRANSACTION_ID_MOCK = '456-789';
const FROM_MOCK = '0xabcde' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
const TOKEN_ADDRESS_MOCK = '0x123' as Hex;

const TRANSACTION_META_MOCK = {
  id: '123-456',
  hash: TRANSACTION_HASH_MOCK,
} as TransactionMeta;

const ORIGINAL_QUOTE_MOCK = {
  details: {
    currencyIn: {
      currency: {
        chainId: 1,
      },
    },
    currencyOut: {
      currency: {
        chainId: 2,
      },
    },
  },
  metamask: {
    gasLimits: [21000, 21000],
  },
  request: {},
  steps: [
    {
      id: 'swap',
      kind: 'transaction',
      requestId: REQUEST_ID_MOCK,
      items: [
        {
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

const STATUS_RESPONSE_MOCK = {
  status: 'success',
  txHashes: [TRANSACTION_HASH_MOCK],
};

const REQUEST_MOCK: PayStrategyExecuteRequest<RelayQuote> = {
  quotes: [
    {
      fees: {
        sourceNetwork: {},
      },
      original: ORIGINAL_QUOTE_MOCK,
      request: {
        from: FROM_MOCK,
        sourceChainId: CHAIN_ID_MOCK,
        sourceTokenAddress: TOKEN_ADDRESS_MOCK,
      },
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
  const getFeatureFlagsMock = jest.mocked(getFeatureFlags);

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

    getFeatureFlagsMock.mockReturnValue({
      relayFallbackGas: {
        max: 123,
      },
    } as FeatureFlags);

    collectTransactionIdsMock.mockImplementation(
      (_chainId, _from, _messenger, fn) => {
        fn(TRANSACTION_META_MOCK.id);
        return { end: jest.fn() };
      },
    );

    successfulFetchMock.mockResolvedValue({
      json: async () => STATUS_RESPONSE_MOCK,
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
          type: TransactionType.relayDeposit,
        },
      );
    });

    it('adds transaction with gas fee token if isSourceGasFeeToken', async () => {
      request.quotes[0].fees.isSourceGasFeeToken = true;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          gasFeeToken: TOKEN_ADDRESS_MOCK,
        }),
      );
    });

    it('adds transaction with authorization list if same chain and authorization list present', async () => {
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;
      request.quotes[0].original.request = {
        authorizationList: [
          {
            address: '0xabc' as Hex,
            chainId: 1,
            nonce: 2,
            r: '0xr' as Hex,
            s: '0xs' as Hex,
            yParity: 1,
          },
          {
            address: '0xdef' as Hex,
            chainId: 1,
            nonce: 3,
            r: '0xr2' as Hex,
            s: '0xs2' as Hex,
            yParity: 0,
          },
        ],
      } as never;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationList: [
            {
              address: '0xabc',
              chainId: '0x1',
            },
            {
              address: '0xdef',
              chainId: '0x1',
            },
          ],
        }),
        expect.anything(),
      );
    });

    it('does not add authorization list if different chains', async () => {
      request.quotes[0].original.request = {
        authorizationList: [
          {
            address: '0xabc' as Hex,
            chainId: 1,
            nonce: 2,
            r: '0xr' as Hex,
            s: '0xs' as Hex,
            yParity: 1,
          },
        ],
      } as never;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.not.objectContaining({
          authorizationList: expect.anything(),
        }),
        expect.anything(),
      );
    });

    it('does not add authorization list if same chain but no authorization list', async () => {
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;
      request.quotes[0].original.request = {} as never;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.not.objectContaining({
          authorizationList: expect.anything(),
        }),
        expect.anything(),
      );
    });

    it('adds transaction batch if multiple params', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith({
        disable7702: true,
        disableHook: false,
        disableSequential: false,
        from: FROM_MOCK,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        origin: ORIGIN_METAMASK,
        overwriteUpgrade: true,
        requireApproval: false,
        transactions: [
          {
            params: {
              data: '0x1234',
              gas: '0x5208',
              maxFeePerGas: '0x5d21dba00',
              maxPriorityFeePerGas: '0x3b9aca00',
              to: '0xfedcb',
              value: '0x4d2',
            },
            type: TransactionType.tokenMethodApprove,
          },
          {
            params: {
              data: '0x1234',
              gas: '0x5208',
              maxFeePerGas: '0x5d21dba00',
              maxPriorityFeePerGas: '0x3b9aca00',
              to: '0xfedcb',
              value: '0x4d2',
            },
            type: TransactionType.relayDeposit,
          },
        ],
      });
    });

    it('adds transaction batch with gas fee token if isSourceGasFeeToken', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      request.quotes[0].fees.isSourceGasFeeToken = true;

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gasFeeToken: TOKEN_ADDRESS_MOCK,
        }),
      );
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
          gas: '0x5208',
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
        `${RELAY_STATUS_URL}?requestId=${REQUEST_ID_MOCK}`,
        {
          method: 'GET',
        },
      );
    });

    it('does not wait for relay status if same chain', async () => {
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;

      await submitRelayQuotes(request);

      expect(successfulFetchMock).toHaveBeenCalledTimes(0);
    });

    it('waits for relay status if same chain with single deposit step', async () => {
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;
      request.quotes[0].original.steps = [
        {
          ...request.quotes[0].original.steps[0],
          id: 'deposit',
        },
      ];

      await submitRelayQuotes(request);

      expect(successfulFetchMock).toHaveBeenCalledTimes(1);
      expect(successfulFetchMock).toHaveBeenCalledWith(
        `${RELAY_STATUS_URL}?requestId=${REQUEST_ID_MOCK}`,
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

    it.each(['failure', 'refund', 'refunded'])(
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

    it('updates transaction', async () => {
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

    it('returns target hash', async () => {
      const result = await submitRelayQuotes(request);
      expect(result.transactionHash).toBe(TRANSACTION_HASH_MOCK);
    });

    it('returns fallback hash if none included', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => ({
          ...STATUS_RESPONSE_MOCK,
          txHashes: [],
        }),
      } as Response);

      const result = await submitRelayQuotes(request);
      expect(result.transactionHash).toBe('0x0');
    });

    it('adds required transaction IDs', async () => {
      await submitRelayQuotes(request);

      const txDraft = { txParams: {} } as TransactionMeta;
      updateTransactionMock.mock.calls.map((call) => call[1](txDraft));

      expect(txDraft.requiredTransactionIds).toStrictEqual([
        TRANSACTION_META_MOCK.id,
      ]);
    });

    describe('post-quote flow', () => {
      beforeEach(() => {
        request.quotes[0].request.isPostQuote = true;
        request.transaction = {
          id: ORIGINAL_TRANSACTION_ID_MOCK,
          txParams: {
            from: FROM_MOCK,
            to: '0xrecipient' as Hex,
            data: '0xorigdata' as Hex,
            value: '0x100' as Hex,
          },
          type: TransactionType.simpleSend,
        } as TransactionMeta;
      });

      it('adds transaction batch with original transaction prepended', async () => {
        await submitRelayQuotes(request);

        expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
        expect(addTransactionBatchMock).toHaveBeenCalledWith({
          from: FROM_MOCK,
          gasFeeToken: undefined,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          origin: ORIGIN_METAMASK,
          overwriteUpgrade: true,
          requireApproval: false,
          transactions: [
            {
              params: {
                data: '0xorigdata',
                to: '0xrecipient',
                value: '0x100',
              },
              type: TransactionType.simpleSend,
            },
            {
              params: {
                data: '0x1234',
                gas: '0x5208',
                maxFeePerGas: '0x5d21dba00',
                maxPriorityFeePerGas: '0x3b9aca00',
                to: '0xfedcb',
                value: '0x4d2',
              },
              type: TransactionType.relayDeposit,
            },
          ],
        });
      });

      it('sets gas to undefined when gasLimits entry is missing', async () => {
        request.quotes[0].original.metamask.gasLimits = [];

        await submitRelayQuotes(request);

        expect(addTransactionBatchMock).toHaveBeenCalledWith(
          expect.objectContaining({
            transactions: expect.arrayContaining([
              expect.objectContaining({
                params: expect.objectContaining({
                  gas: undefined,
                }),
                type: TransactionType.relayDeposit,
              }),
            ]),
          }),
        );
      });

      it('marks original transaction as intent complete', async () => {
        await submitRelayQuotes(request);

        const dummyCall = updateTransactionMock.mock.calls.find(
          (call) => call[0].note === 'Mark as dummy - handled by post-quote batch',
        );

        expect(dummyCall).toBeDefined();

        const txDraft = {} as TransactionMeta;
        dummyCall?.[1](txDraft);

        expect(txDraft.isIntentComplete).toBe(true);
      });
    });

    it('adds transaction batch with single gasLimit7702', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      request.quotes[0].original.metamask.gasLimits = [42000];

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          disable7702: false,
          disableHook: true,
          disableSequential: true,
          gasLimit7702: '0xa410',
          transactions: [
            expect.objectContaining({
              params: expect.objectContaining({
                gas: undefined,
              }),
            }),
            expect.objectContaining({
              params: expect.objectContaining({
                gas: undefined,
              }),
            }),
          ],
        }),
      );
    });

    it('adds transaction batch without gasLimit7702 when multiple gas limits', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      request.quotes[0].original.metamask.gasLimits = [21000, 22000];

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          disable7702: true,
          disableHook: false,
          disableSequential: false,
          gasLimit7702: undefined,
          transactions: [
            expect.objectContaining({
              params: expect.objectContaining({
                gas: '0x5208',
              }),
            }),
            expect.objectContaining({
              params: expect.objectContaining({
                gas: '0x55f0',
              }),
            }),
          ],
        }),
      );
    });
  });
});
