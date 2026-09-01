import { generateEIP7702BatchTransaction } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { getMessengerMock } from '../../tests/messenger-mock.js';
import type { TransactionPayQuote } from '../../types.js';
import type { FeatureFlags } from '../../utils/feature-flags.js';
import {
  getFeatureFlags,
  getRelayPollingInterval,
  getRelayPollingTimeout,
} from '../../utils/feature-flags.js';
import {
  getRelayExecuteRequest,
  submitViaRelayExecute,
} from './relay-submit-execute.js';
import type { RelayQuote } from './types.js';

jest.mock('../../utils/feature-flags');

const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';
const REQUEST_ID_MOCK = '0x1234567890abcdef';

const FROM_MOCK = '0xabcde' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;

const DELEGATION_DATA_MOCK = '0xdelegationdata' as Hex;
const DELEGATION_MANAGER_MOCK = '0xdelegationmanager' as Hex;

const DELEGATION_RESULT_MOCK = {
  data: DELEGATION_DATA_MOCK,
  to: DELEGATION_MANAGER_MOCK,
  value: '0',
  authorizationList: [
    {
      address: '0xdelegateAddr' as Hex,
      chainId: '0x1' as Hex,
      nonce: '0x0' as Hex,
      r: '0xr' as Hex,
      s: '0xs' as Hex,
      yParity: '0x0' as Hex,
    },
  ],
};

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
    is7702: false,
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

const EXECUTE_RESPONSE_MOCK = {
  requestId: REQUEST_ID_MOCK,
};

const FEATURE_FLAGS_MOCK = {
  relayExecuteUrl: 'https://proxy.test/relay/execute',
  relayFallbackGas: { max: 123 },
} as FeatureFlags;

describe('Relay Submit Execute', () => {
  const getFeatureFlagsMock = jest.mocked(getFeatureFlags);
  const getRelayPollingIntervalMock = jest.mocked(getRelayPollingInterval);
  const getRelayPollingTimeoutMock = jest.mocked(getRelayPollingTimeout);

  const {
    getDelegationTransactionMock,
    findNetworkClientIdByChainIdMock,
    messenger,
  } = getMessengerMock();

  let successfulFetchMock: jest.SpyInstance;
  let quote: TransactionPayQuote<RelayQuote>;
  let transaction: TransactionMeta;
  let allParams: { to?: Hex; data?: Hex; value?: Hex }[];

  beforeEach(() => {
    jest.resetAllMocks();

    successfulFetchMock = jest.spyOn(global, 'fetch');

    getRelayPollingIntervalMock.mockReturnValue(1);
    getRelayPollingTimeoutMock.mockReturnValue(undefined);
    getFeatureFlagsMock.mockReturnValue(FEATURE_FLAGS_MOCK);

    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

    getDelegationTransactionMock.mockResolvedValue(DELEGATION_RESULT_MOCK);

    successfulFetchMock.mockResolvedValue({
      ok: true,
      json: async () => EXECUTE_RESPONSE_MOCK,
    } as Response);

    quote = {
      fees: {
        sourceNetwork: {},
      },
      original: cloneDeep(ORIGINAL_QUOTE_MOCK),
      request: {
        from: FROM_MOCK,
        sourceChainId: CHAIN_ID_MOCK,
      },
      sourceAmount: {
        raw: '1000000',
        human: '1',
        fiat: '1',
        usd: '1',
      },
    } as TransactionPayQuote<RelayQuote>;

    transaction = {
      id: '123-456',
      chainId: CHAIN_ID_MOCK,
      networkClientId: NETWORK_CLIENT_ID_MOCK,
      txParams: {
        from: FROM_MOCK,
      },
    } as TransactionMeta;

    allParams = [
      {
        to: '0xfedcb' as Hex,
        data: '0x1234' as Hex,
        value: '0x4d2' as Hex,
      },
    ];
  });

  afterEach(() => {
    successfulFetchMock.mockRestore();
  });

  describe('submitViaRelayExecute', () => {
    beforeEach(() => {
      quote.original.metamask.isExecute = true;
      quote.original.metamask.signature = 'normal-execute-sig-mock';
    });

    it('calls getDelegationTransaction with source calls as nestedTransactions', async () => {
      await submitViaRelayExecute(quote, transaction, messenger, allParams);

      expect(getDelegationTransactionMock).toHaveBeenCalledTimes(1);
      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({
          chainId: CHAIN_ID_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          nestedTransactions: [
            {
              data: '0x1234',
              to: '0xfedcb',
              value: '0x4d2',
            },
          ],
        }),
        isSubsidized: false,
      });
    });

    it('regenerates txParams from the single nested transaction', async () => {
      await submitViaRelayExecute(quote, transaction, messenger, allParams);

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({
          txParams: expect.objectContaining({
            from: FROM_MOCK,
            to: '0xfedcb',
            data: '0x1234',
            value: '0x4d2',
          }),
        }),
        isSubsidized: false,
      });
    });

    it('regenerates txParams as an EIP-7702 batch for multiple nested transactions', async () => {
      const batchFrom = '0x1111111111111111111111111111111111111111' as Hex;
      quote.request.from = batchFrom;

      const multiParams = [
        {
          to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
          data: '0x1111' as Hex,
          value: '0x1' as Hex,
        },
        {
          to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
          data: '0x2222' as Hex,
          value: '0x2' as Hex,
        },
      ];

      const expectedBatch = generateEIP7702BatchTransaction(
        batchFrom,
        multiParams,
      );

      await submitViaRelayExecute(quote, transaction, messenger, multiParams);

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({
          txParams: expect.objectContaining({
            from: batchFrom,
            to: expectedBatch.to,
            data: expectedBatch.data,
            value: '0x0',
          }),
        }),
        isSubsidized: false,
      });
    });

    it('does not use stale txParams.data from the incoming transaction', async () => {
      transaction.txParams.data = '0xstaledata' as Hex;
      transaction.txParams.to = '0xstaleto' as Hex;

      await submitViaRelayExecute(quote, transaction, messenger, allParams);

      const call = getDelegationTransactionMock.mock.calls[0][0] as {
        transaction: TransactionMeta;
      };

      expect(call.transaction.txParams.data).toBe('0x1234');
      expect(call.transaction.txParams.to).toBe('0xfedcb');
    });

    it('submits to /execute with delegation data and metamask envelope', async () => {
      await submitViaRelayExecute(quote, transaction, messenger, allParams);

      const fetchCall = successfulFetchMock.mock.calls[0];
      const body = JSON.parse(
        (fetchCall[1] as RequestInit).body as string,
      ) as Record<string, unknown>;

      expect(fetchCall[0]).toBe(FEATURE_FLAGS_MOCK.relayExecuteUrl);
      expect(body.executionKind).toBe('rawCalls');
      expect(body.requestId).toBe(REQUEST_ID_MOCK);
      expect(body.metamask).toStrictEqual({
        isSubsidized: false,
        quoteRequest: ORIGINAL_QUOTE_MOCK.request,
        signature: 'normal-execute-sig-mock',
      });
    });

    it('throws when metamask.signature is missing', async () => {
      quote.original.metamask.signature = undefined as never;

      await expect(
        submitViaRelayExecute(quote, transaction, messenger, allParams),
      ).rejects.toThrow(
        'Execute: Missing metamask.signature — cannot submit to /relay/execute without the HMAC token',
      );
    });

    it('throws when the quote step has no requestId', async () => {
      quote.original.steps[0].requestId = undefined as never;

      await expect(
        submitViaRelayExecute(quote, transaction, messenger, allParams),
      ).rejects.toThrow('Execute: Missing requestId in quote step');
    });

    it('strips marker from requestId', async () => {
      const markedRequestId = `${REQUEST_ID_MOCK}#mmmarkerdata`;
      quote.original.steps[0].requestId = markedRequestId;

      await submitViaRelayExecute(quote, transaction, messenger, allParams);

      const fetchCall = successfulFetchMock.mock.calls[0];
      const body = JSON.parse(
        (fetchCall[1] as RequestInit).body as string,
      ) as Record<string, unknown>;

      expect(body.requestId).toBe(REQUEST_ID_MOCK);
      expect(body.requestId).not.toContain('#mm');
    });

    it('omits authorizationList when delegation has none', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        ...DELEGATION_RESULT_MOCK,
        authorizationList: undefined,
      });

      await submitViaRelayExecute(quote, transaction, messenger, allParams);

      const fetchCall = successfulFetchMock.mock.calls[0];
      const body = JSON.parse(
        (fetchCall[1] as RequestInit).body as string,
      ) as Record<string, unknown>;
      const data = body.data as Record<string, unknown>;

      expect(data.authorizationList).toBeUndefined();
    });

    it('uses fallback values for missing data and value in source params', async () => {
      const paramsWithoutDataOrValue = [
        {
          to: '0xfedcb' as Hex,
          data: undefined,
          value: undefined,
        },
      ];

      await submitViaRelayExecute(
        quote,
        transaction,
        messenger,
        paramsWithoutDataOrValue,
      );

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({
          nestedTransactions: [
            {
              data: '0x',
              to: '0xfedcb',
              value: '0x0',
            },
          ],
        }),
        isSubsidized: false,
      });
    });

    it('wraps /execute submission failures with the Execute prefix', async () => {
      successfulFetchMock.mockReset();
      successfulFetchMock.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          message: 'failed to decode param in array[0] invalid JSON input',
        }),
      } as Response);

      await expect(
        submitViaRelayExecute(quote, transaction, messenger, allParams),
      ).rejects.toThrow(
        'Execute: 422 - failed to decode param in array[0] invalid JSON input',
      );
    });
  });

  describe('submitViaRelayExecute with subsidized execute', () => {
    const SUBSIDY_SIGNATURE_MOCK = 'hmac-v1-token-mock';

    beforeEach(() => {
      quote.original.metamask.isExecute = true;
      quote.original.metamask.signature = SUBSIDY_SIGNATURE_MOCK;
      quote.original.fees = {
        relayer: { amountUsd: '0' },
        subsidized: {
          amount: '1000000',
          amountFormatted: '1.00',
          amountUsd: '1.00',
          currency: {
            address: '0xtoken' as Hex,
            chainId: 137,
            decimals: 6,
          },
          minimumAmount: '900000',
        },
      };

      getDelegationTransactionMock.mockResolvedValue({
        data: '0xaabbccdd11223344' as Hex,
        to: '0xdelegationmgr0000000000000000000000' as Hex,
        value: '0x0' as Hex,
      });

      allParams = [
        {
          to: '0xfedcb' as Hex,
          data: '0xa9059cbb000000000000000000000000abcdef1234567890abcdef1234567890abcdef120000000000000000000000000000000000000000000000000000000000989680' as Hex,
          value: '0x4d2' as Hex,
        },
      ];
    });

    it('calls getDelegationTransaction with isSubsidized flag', async () => {
      await submitViaRelayExecute(quote, transaction, messenger, allParams);

      expect(getDelegationTransactionMock).toHaveBeenCalledTimes(1);
      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({
          chainId: CHAIN_ID_MOCK,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          nestedTransactions: [
            {
              data: '0xa9059cbb000000000000000000000000abcdef1234567890abcdef1234567890abcdef120000000000000000000000000000000000000000000000000000000000989680',
              to: '0xfedcb',
              value: '0x4d2',
            },
          ],
        }),
        isSubsidized: true,
      });
    });

    it('posts to relayExecuteUrl with metamask envelope containing isSubsidized, quoteRequest, and signature', async () => {
      await submitViaRelayExecute(quote, transaction, messenger, allParams);

      const fetchCall = successfulFetchMock.mock.calls[0];
      const body = JSON.parse(
        (fetchCall[1] as RequestInit).body as string,
      ) as Record<string, unknown>;

      expect(fetchCall[0]).toBe(FEATURE_FLAGS_MOCK.relayExecuteUrl);
      expect(body.metamask).toStrictEqual({
        isSubsidized: true,
        quoteRequest: ORIGINAL_QUOTE_MOCK.request,
        signature: SUBSIDY_SIGNATURE_MOCK,
      });
    });

    it('throws when quote is missing metamask.signature', async () => {
      quote.original.metamask.signature = undefined as never;

      await expect(
        submitViaRelayExecute(quote, transaction, messenger, allParams),
      ).rejects.toThrow(
        'Execute: Missing metamask.signature — cannot submit to /relay/execute without the HMAC token',
      );
    });
  });

  describe('getRelayExecuteRequest', () => {
    beforeEach(() => {
      getDelegationTransactionMock.mockResolvedValue(DELEGATION_RESULT_MOCK);
    });

    it('builds execute request with authorizationList when delegation has one', async () => {
      const result = await getRelayExecuteRequest({
        allParams,
        messenger,
        quote,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      expect(result.data.authorizationList).toStrictEqual([
        {
          chainId: 1,
          address: '0xdelegateAddr',
          nonce: 0,
          yParity: 0,
          r: '0xr',
          s: '0xs',
        },
      ]);
    });

    it('omits authorizationList when delegation has none', async () => {
      getDelegationTransactionMock.mockResolvedValue({
        ...DELEGATION_RESULT_MOCK,
        authorizationList: undefined,
      });

      const result = await getRelayExecuteRequest({
        allParams,
        messenger,
        quote,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      expect(result.data.authorizationList).toBeUndefined();
    });

    it('returns correct executionKind and requestId', async () => {
      const result = await getRelayExecuteRequest({
        allParams,
        messenger,
        quote,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      expect(result.executionKind).toBe('rawCalls');
      expect(result.requestId).toBe(REQUEST_ID_MOCK);
    });

    it('sets nestedTransactions from allParams', async () => {
      await getRelayExecuteRequest({
        allParams,
        messenger,
        quote,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({
          nestedTransactions: [
            {
              data: '0x1234',
              to: '0xfedcb',
              value: '0x4d2',
            },
          ],
        }),
        isSubsidized: false,
      });
    });

    it('uses 0x fallback when params.data is undefined', async () => {
      const paramsWithoutData = [
        {
          to: '0xfedcb' as Hex,
          data: undefined,
          value: '0x4d2' as Hex,
        },
      ];

      await getRelayExecuteRequest({
        allParams: paramsWithoutData,
        messenger,
        quote,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({
          nestedTransactions: [
            expect.objectContaining({
              data: '0x',
            }),
          ],
        }),
        isSubsidized: false,
      });
    });

    it('does not regenerate batch txParams when regenerateBatchParams is false (default)', async () => {
      transaction.txParams.data = '0xoriginaldata2' as Hex;
      transaction.txParams.to = '0xoriginalto2' as Hex;

      await getRelayExecuteRequest({
        allParams,
        messenger,
        quote,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      const call = getDelegationTransactionMock.mock.calls[0][0] as {
        transaction: TransactionMeta;
      };

      // Without regenerateBatchParams, txParams retains the original to/data
      expect(call.transaction.txParams.to).toBe('0xoriginalto2');
      expect(call.transaction.txParams.data).toBe('0xoriginaldata2');
    });

    it('does not regenerate txParams when regenerateBatchParams is false (default)', async () => {
      transaction.txParams.data = '0xoriginaldata' as Hex;
      transaction.txParams.to = '0xoriginalto' as Hex;

      await getRelayExecuteRequest({
        allParams,
        messenger,
        quote,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      const call = getDelegationTransactionMock.mock.calls[0][0] as {
        transaction: TransactionMeta;
      };

      expect(call.transaction.txParams.from).toBe(FROM_MOCK);
      expect(call.transaction.txParams.data).toBe('0xoriginaldata');
      expect(call.transaction.txParams.to).toBe('0xoriginalto');
    });

    it('uses single nested transaction directly without batch wrapping when regenerateBatchParams is true and single param', async () => {
      // Single param: no EIP-7702 batch wrapping; txParams.to/data/value come from the single nested tx
      await getRelayExecuteRequest({
        allParams,
        messenger,
        quote,
        regenerateBatchParams: true,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      const call = getDelegationTransactionMock.mock.calls[0][0] as {
        transaction: TransactionMeta;
      };

      // txParams should reflect the single nested transaction directly (not a batch wrapper)
      expect(call.transaction.txParams.to).toBe(allParams[0].to);
      expect(call.transaction.txParams.data).toBe(allParams[0].data);
      expect(call.transaction.txParams.value).toBe(allParams[0].value);
    });

    it('uses single nested transaction directly in txParams when regenerateBatchParams is true', async () => {
      await getRelayExecuteRequest({
        allParams,
        messenger,
        quote,
        regenerateBatchParams: true,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({
          txParams: expect.objectContaining({
            from: FROM_MOCK,
            to: '0xfedcb',
            data: '0x1234',
            value: '0x4d2',
          }),
        }),
        isSubsidized: false,
      });
    });

    it('calls generateEIP7702BatchTransaction for multiple params when regenerateBatchParams is true', async () => {
      const batchFrom = '0x1111111111111111111111111111111111111111' as Hex;
      quote.request.from = batchFrom;

      const multiParams = [
        {
          to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
          data: '0x1111' as Hex,
          value: '0x1' as Hex,
        },
        {
          to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
          data: '0x2222' as Hex,
          value: '0x2' as Hex,
        },
      ];

      const expectedBatch = generateEIP7702BatchTransaction(
        batchFrom,
        multiParams,
      );

      await getRelayExecuteRequest({
        allParams: multiParams,
        messenger,
        quote,
        regenerateBatchParams: true,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({
          txParams: expect.objectContaining({
            from: batchFrom,
            to: expectedBatch.to,
            data: expectedBatch.data,
            value: '0x0',
          }),
        }),
        isSubsidized: false,
      });
    });

    it('calls getDelegationTransaction with isSubsidized: true when specified', async () => {
      await getRelayExecuteRequest({
        allParams,
        isSubsidized: true,
        messenger,
        quote,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({}),
        isSubsidized: true,
      });
    });

    it('calls getDelegationTransaction with isSubsidized: false by default', async () => {
      await getRelayExecuteRequest({
        allParams,
        messenger,
        quote,
        requestId: REQUEST_ID_MOCK,
        transaction,
      });

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: expect.objectContaining({}),
        isSubsidized: false,
      });
    });
  });
});
