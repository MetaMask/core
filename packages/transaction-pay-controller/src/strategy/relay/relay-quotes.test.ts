import { successfulFetch, toHex } from '@metamask/controller-utils';
import type {
  GasFeeToken,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { getRelayQuotes } from './relay-quotes';
import type { RelayQuote } from './types';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
} from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  GetDelegationTransactionCallback,
  QuoteRequest,
} from '../../types';
import {
  DEFAULT_RELAY_QUOTE_URL,
  DEFAULT_SLIPPAGE,
  getEIP7702SupportedChains,
  getGasBuffer,
  getSlippage,
} from '../../utils/feature-flags';
import { calculateGasCost, calculateGasFeeTokenCost } from '../../utils/gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
} from '../../utils/token';

jest.mock('../../utils/token');
jest.mock('../../utils/gas');
jest.mock('../../utils/feature-flags', () => ({
  ...jest.requireActual('../../utils/feature-flags'),
  getEIP7702SupportedChains: jest.fn(),
  getGasBuffer: jest.fn(),
  getSlippage: jest.fn(),
}));

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));

const TRANSACTION_META_MOCK = { txParams: {} } as TransactionMeta;
const TOKEN_TRANSFER_RECIPIENT_MOCK =
  '0x5678901234567890123456789012345678901234';
const NESTED_TRANSACTION_DATA_MOCK = '0xdef' as Hex;
const FROM_MOCK = '0x1234567890123456789012345678901234567891' as Hex;
const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';
const CHAIN_ID_LINEA = '0xe708' as Hex;

const QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: FROM_MOCK,
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc',
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: '0x1234567890123456789012345678901234567890',
};

const QUOTE_MOCK = {
  details: {
    currencyIn: {
      amount: '1240000000000000000',
      amountFormatted: '1.24',
      amountUsd: '1.24',
    },
    currencyOut: {
      amount: '100',
      amountFormatted: '1.0',
      amountUsd: '1.23',
      currency: {
        decimals: 2,
      },
      minimumAmount: '125',
    },
    timeEstimate: 300,
    totalImpact: {
      usd: '1.11',
    },
  },
  fees: {
    relayer: {
      amountUsd: '1.11',
    },
  },
  metamask: {
    gasLimits: [21000],
  },
  steps: [
    {
      id: 'swap',
      items: [
        {
          check: {
            endpoint: '/test',
            method: 'GET',
          },
          data: {
            chainId: 1,
            data: '0x123' as Hex,
            from: FROM_MOCK,
            gas: '21000',
            maxFeePerGas: '1000000000',
            maxPriorityFeePerGas: '2000000000',
            to: '0x2' as Hex,
            value: '300000',
          },
          status: 'complete',
        },
      ],
      kind: 'transaction',
    },
  ],
} as RelayQuote;

const DELEGATION_RESULT_MOCK = {
  authorizationList: [
    {
      chainId: '0x1' as Hex,
      nonce: '0x2' as Hex,
      yParity: '0x1' as Hex,
    },
  ],
  data: '0x111' as Hex,
  to: '0x222' as Hex,
  value: '0x333' as Hex,
} as Awaited<ReturnType<GetDelegationTransactionCallback>>;

const GAS_FEE_TOKEN_MOCK = {
  amount: toHex(1230000),
  gas: toHex(21000),
  tokenAddress: '0xabc' as Hex,
} as GasFeeToken;

const TOKEN_TRANSFER_DATA_MOCK =
  '0xa9059cbb0000000000000000000000005678901234567890123456789012345678901234000000000000000000000000000000000000000000000000000000000000007b' as Hex;

describe('Relay Quotes Utils', () => {
  const successfulFetchMock = jest.mocked(successfulFetch);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const calculateGasCostMock = jest.mocked(calculateGasCost);
  const calculateGasFeeTokenCostMock = jest.mocked(calculateGasFeeTokenCost);
  const getNativeTokenMock = jest.mocked(getNativeToken);
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const getEIP7702SupportedChainsMock = jest.mocked(getEIP7702SupportedChains);
  const getGasBufferMock = jest.mocked(getGasBuffer);
  const getSlippageMock = jest.mocked(getSlippage);

  const {
    messenger,
    estimateGasMock,
    estimateGasBatchMock,
    findNetworkClientIdByChainIdMock,
    getDelegationTransactionMock,
    getGasFeeTokensMock,
    getRemoteFeatureFlagControllerStateMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenFiatRateMock.mockReturnValue({
      usdRate: '2.0',
      fiatRate: '4.0',
    });

    calculateGasCostMock.mockReturnValue({
      fiat: '4.56',
      human: '1.725',
      raw: '1725000000000000',
      usd: '3.45',
    });

    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '5.56',
      human: '2.725',
      raw: '2725000000000000',
      usd: '4.45',
    });

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
    });

    getEIP7702SupportedChainsMock.mockReturnValue([
      QUOTE_REQUEST_MOCK.sourceChainId,
    ]);
    getGasBufferMock.mockReturnValue(1.0);
    getSlippageMock.mockReturnValue(DEFAULT_SLIPPAGE);
    getDelegationTransactionMock.mockResolvedValue(DELEGATION_RESULT_MOCK);
    getGasFeeTokensMock.mockResolvedValue([]);
    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
  });

  describe('getRelayQuotes', () => {
    it('returns quotes from Relay', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result).toStrictEqual([
        expect.objectContaining({
          original: QUOTE_MOCK,
        }),
      ]);
    });

    it('sends request to Relay', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledWith(
        DEFAULT_RELAY_QUOTE_URL,
        expect.anything(),
      );

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          amount: QUOTE_REQUEST_MOCK.targetAmountMinimum,
          destinationChainId: 2,
          destinationCurrency: QUOTE_REQUEST_MOCK.targetTokenAddress,
          originChainId: 1,
          originCurrency: QUOTE_REQUEST_MOCK.sourceTokenAddress,
          recipient: QUOTE_REQUEST_MOCK.from,
          tradeType: 'EXPECTED_OUTPUT',
          user: QUOTE_REQUEST_MOCK.from,
        }),
      );
    });

    it('sends request with EXACT_INPUT trade type when isMaxAmount is true', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          amount: QUOTE_REQUEST_MOCK.sourceTokenAmount,
          tradeType: 'EXACT_INPUT',
        }),
      );
    });

    it('throws if isMaxAmount is true and transaction includes data', async () => {
      await expect(
        getRelayQuotes({
          messenger,
          requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
          transaction: {
            ...TRANSACTION_META_MOCK,
            txParams: {
              data: '0xabc' as Hex,
            },
          } as TransactionMeta,
        }),
      ).rejects.toThrow(
        'Max amount quotes do not support included transactions',
      );
    });

    it('includes transactions in request', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          authorizationList: [
            {
              chainId: 1,
              nonce: 2,
              yParity: 1,
            },
          ],
          tradeType: 'EXACT_OUTPUT',
          txs: [
            {
              to: QUOTE_REQUEST_MOCK.targetTokenAddress,
              data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567891000000000000000000000000000000000000000000000000000000000000007b',
              value: '0x0',
            },
            {
              to: DELEGATION_RESULT_MOCK.to,
              data: DELEGATION_RESULT_MOCK.data,
              value: DELEGATION_RESULT_MOCK.value,
            },
          ],
        }),
      );
    });

    it('includes request in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].original.request).toStrictEqual({
        amount: QUOTE_REQUEST_MOCK.targetAmountMinimum,
        destinationChainId: 2,
        destinationCurrency: QUOTE_REQUEST_MOCK.targetTokenAddress,
        originChainId: 1,
        originCurrency: QUOTE_REQUEST_MOCK.sourceTokenAddress,
        recipient: QUOTE_REQUEST_MOCK.from,
        slippageTolerance: '50',
        tradeType: 'EXPECTED_OUTPUT',
        user: QUOTE_REQUEST_MOCK.from,
      });
    });

    it('skips delegation for token transfers', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: TOKEN_TRANSFER_DATA_MOCK,
          },
        } as TransactionMeta,
      });

      expect(getDelegationTransactionMock).not.toHaveBeenCalled();
    });

    it('extracts recipient from token transfer', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: TOKEN_TRANSFER_DATA_MOCK,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.recipient).toBe(TOKEN_TRANSFER_RECIPIENT_MOCK.toLowerCase());
    });

    it('includes transactions from nested transactions', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [
            {
              data: NESTED_TRANSACTION_DATA_MOCK,
            },
          ],
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          authorizationList: [
            {
              chainId: 1,
              nonce: 2,
              yParity: 1,
            },
          ],
          recipient: QUOTE_REQUEST_MOCK.from,
          tradeType: 'EXACT_OUTPUT',
          txs: [
            {
              to: QUOTE_REQUEST_MOCK.targetTokenAddress,
              data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567891000000000000000000000000000000000000000000000000000000000000007b',
              value: '0x0',
            },
            {
              to: DELEGATION_RESULT_MOCK.to,
              data: DELEGATION_RESULT_MOCK.data,
              value: DELEGATION_RESULT_MOCK.value,
            },
          ],
        }),
      );
    });

    it('skips delegation for token transfers in nested transactions', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [
            {
              data: TOKEN_TRANSFER_DATA_MOCK,
            },
          ],
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      expect(getDelegationTransactionMock).not.toHaveBeenCalled();
    });

    it('extracts recipient from token transfer in nested transactions', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [
            {
              data: TOKEN_TRANSFER_DATA_MOCK,
            },
          ],
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.recipient).toBe(TOKEN_TRANSFER_RECIPIENT_MOCK.toLowerCase());
    });

    it('extracts recipient and sets refundTo when nested transactions include token transfer with delegation', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: {
          ...TRANSACTION_META_MOCK,
          nestedTransactions: [
            {
              data: NESTED_TRANSACTION_DATA_MOCK,
            },
            {
              data: TOKEN_TRANSFER_DATA_MOCK,
            },
          ],
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.recipient).toBe(TOKEN_TRANSFER_RECIPIENT_MOCK);
      expect(body.refundTo).toBe(QUOTE_REQUEST_MOCK.from);
    });

    it('skips delegation for Hypercore deposits', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetChainId: CHAIN_ID_HYPERCORE,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: '0xabc' as Hex,
          },
        } as TransactionMeta,
      });

      expect(getDelegationTransactionMock).not.toHaveBeenCalled();
    });

    it('does not extract recipient for Hypercore deposits with token transfer signature', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetChainId: CHAIN_ID_HYPERCORE,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          txParams: {
            data: TOKEN_TRANSFER_DATA_MOCK,
          },
        } as TransactionMeta,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.recipient).toBe(QUOTE_REQUEST_MOCK.from);
    });

    it('sends request to url from feature flag', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const relayQuoteUrl = 'https://test.com/quote';

      getRemoteFeatureFlagControllerStateMock.mockReturnValue({
        ...getDefaultRemoteFeatureFlagControllerState(),
        remoteFeatureFlags: {
          confirmations_pay: {
            relayQuoteUrl,
          },
        },
      });

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalledWith(
        relayQuoteUrl,
        expect.anything(),
      );
    });

    it('ignores gas fee token requests (target=0 and source=0)', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            sourceTokenAmount: '0',
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).not.toHaveBeenCalled();
    });

    it('processes post-quote requests', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(successfulFetchMock).toHaveBeenCalled();

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.tradeType).toBe('EXACT_INPUT');
      expect(body.amount).toBe(QUOTE_REQUEST_MOCK.sourceTokenAmount);
    });

    it('estimates only relay transactions for post-quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const postQuoteTransaction = {
        ...TRANSACTION_META_MOCK,
        chainId: '0x1' as Hex,
        txParams: {
          from: FROM_MOCK,
          to: '0x9' as Hex,
          data: '0xaaa' as Hex,
          gas: '79000',
          value: '0',
        },
      } as TransactionMeta;

      await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: postQuoteTransaction,
      });

      // Original transaction should NOT be included in gas estimation.
      // Only relay step params are estimated.
      expect(estimateGasBatchMock).not.toHaveBeenCalled();
    });

    it('prepends original transaction gas to relay gas limits for post-quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      getGasBufferMock.mockReturnValue(1);

      const result = await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            gas: '0x13498',
            value: '0',
          },
        } as TransactionMeta,
      });

      // Original tx gas (0x13498 = 79000) prepended, relay gas (21000) from params
      expect(result[0].original.metamask.gasLimits).toStrictEqual([
        79000, 21000,
      ]);
    });

    it('prefers nestedTransactions gas over txParams.gas for post-quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      getGasBufferMock.mockReturnValue(1);

      const result = await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            gas: '0x13498',
            value: '0',
          },
          nestedTransactions: [{ gas: '0xC350' }],
        } as TransactionMeta,
      });

      // nestedTransactions gas (0xC350 = 50000) used instead of txParams.gas (79000)
      expect(result[0].original.metamask.gasLimits).toStrictEqual([
        50000, 21000,
      ]);
    });

    it('adds original transaction gas to EIP-7702 combined gas limit for post-quote', async () => {
      const multiStepQuote = {
        ...QUOTE_MOCK,
        steps: [
          {
            ...QUOTE_MOCK.steps[0],
            items: [
              QUOTE_MOCK.steps[0].items[0],
              {
                ...QUOTE_MOCK.steps[0].items[0],
                data: {
                  ...QUOTE_MOCK.steps[0].items[0].data,
                  gas: '30000',
                },
              },
            ],
          },
        ],
      } as RelayQuote;

      successfulFetchMock.mockResolvedValue({
        json: async () => multiStepQuote,
      } as never);

      getGasBufferMock.mockReturnValue(1);

      // EIP-7702: batch returns single combined gas for multiple relay txs
      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 51000,
        gasLimits: [51000],
      });

      const result = await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            gas: '0x13498',
            value: '0',
          },
        } as TransactionMeta,
      });

      // EIP-7702: original tx gas (79000) added to combined relay gas (51000)
      expect(result[0].original.metamask.gasLimits).toStrictEqual([130000]);
    });

    it('skips original transaction gas when txParams.gas is missing for post-quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            value: '0',
          },
        } as TransactionMeta,
      });

      // No gas on txParams or nestedTransactions — only relay gas limits
      expect(result[0].original.metamask.gasLimits).toStrictEqual([21000]);
    });

    it('preserves estimate vs limit distinction when using fallback gas for post-quote', async () => {
      // Use a quote whose relay step has NO gas param so the single-path
      // estimation is attempted; make it fail to trigger the fallback path
      // where estimate (900 000) != max (1 500 000).
      const noGasQuote = cloneDeep(QUOTE_MOCK);
      delete noGasQuote.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        json: async () => noGasQuote,
      } as never);

      estimateGasMock.mockRejectedValue(new Error('Estimation failed'));

      await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: {
          ...TRANSACTION_META_MOCK,
          chainId: '0x1' as Hex,
          txParams: {
            from: FROM_MOCK,
            to: '0x9' as Hex,
            data: '0xaaa' as Hex,
            gas: '0x13498', // 79 000
            value: '0',
          },
        } as TransactionMeta,
      });

      // Fallback: estimate=900000, max=1500000.
      // With originalTxGas=79000 added independently:
      //   estimate call should receive 900000+79000 = 979000
      //   max call should receive      1500000+79000 = 1579000
      const estimateCall = calculateGasCostMock.mock.calls.find(
        ([args]) => !args.isMax,
      );
      const maxCall = calculateGasCostMock.mock.calls.find(
        ([args]) => args.isMax,
      );

      expect(estimateCall?.[0].gas).toBe(979000);
      expect(maxCall?.[0].gas).toBe(1579000);
    });

    it('does not prepend original transaction for post-quote when txParams.to is missing', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      // With no txParams.to the original tx should be skipped, so only
      // the relay step params are sent to gas estimation (single path).
      expect(estimateGasBatchMock).not.toHaveBeenCalled();
    });

    it('sets isSourceGasFeeToken for post-quote when insufficient native balance', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      getTokenBalanceMock.mockReturnValue('0');
      getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

      const result = await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetAmountMinimum: '0',
            isPostQuote: true,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.isSourceGasFeeToken).toBe(true);
    });

    it('includes duration in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].estimatedDuration).toBe(300);
    });

    it('includes zero metaMask fee when app fee is absent', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.metaMask).toStrictEqual({
        usd: '0',
        fiat: '0',
      });
    });

    it('includes metaMask fee from app fee in quote', async () => {
      const quoteMock = {
        ...QUOTE_MOCK,
        fees: {
          ...QUOTE_MOCK.fees,
          app: {
            amountUsd: '0.75',
          },
        },
      } as RelayQuote;

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.metaMask).toStrictEqual({
        usd: '0.75',
        fiat: '1.5',
      });
    });

    it('subtracts app fee from provider fee', async () => {
      const quoteMock = {
        ...QUOTE_MOCK,
        fees: {
          ...QUOTE_MOCK.fees,
          app: {
            amountUsd: '0.75',
          },
        },
      } as RelayQuote;

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider).toStrictEqual({
        usd: '0.36',
        fiat: '0.72',
      });
    });

    it('includes provider fee', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider).toStrictEqual({
        usd: '1.11',
        fiat: '2.22',
      });
    });

    it('sets provider fee to zero when subsidized fee is present', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.fees.subsidized = {
        amount: '500000',
        amountFormatted: '0.50',
        amountUsd: '0.50',
        currency: {
          address: '0xdef' as Hex,
          chainId: 1,
          decimals: 6,
        },
        minimumAmount: '500000',
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.provider).toStrictEqual({
        usd: '0',
        fiat: '0',
      });
    });

    it('includes dust in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].dust).toStrictEqual({
        usd: '0.0246',
        fiat: '0.0492',
      });
    });

    describe('includes source network fee', () => {
      it('in quote', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
          max: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
        });
      });

      it('using fallback if gas missing', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        delete quoteMock.steps[0].items[0].data.gas;

        successfulFetchMock.mockResolvedValue({
          json: async () => quoteMock,
        } as never);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 900000 }),
        );
      });

      it('using gas total from multiple transactions', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);

        quoteMock.steps[0].items.push({
          data: {
            gas: '480000',
          },
        } as never);

        quoteMock.steps.push({
          items: [
            {
              data: {
                gas: '1000',
              },
            },
            {
              data: {
                gas: '2000',
              },
            },
          ],
        } as never);

        successfulFetchMock.mockResolvedValue({
          json: async () => quoteMock,
        } as never);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 504000 }),
        );
      });

      it('using gas fee token cost if insufficient native balance', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.isSourceGasFeeToken).toBe(true);
        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '5.56',
            human: '2.725',
            raw: '2725000000000000',
            usd: '4.45',
          },
          max: {
            fiat: '5.56',
            human: '2.725',
            raw: '2725000000000000',
            usd: '4.45',
          },
        });
      });

      it('using estimated gas fee token cost if insufficient native balance and batch', async () => {
        const quote = cloneDeep(QUOTE_MOCK);

        quote.steps[0].items.push({
          data: {
            gas: '21000',
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          json: async () => quote,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasFeeTokenCostMock).toHaveBeenCalledWith(
          expect.objectContaining({
            gasFeeToken: {
              ...GAS_FEE_TOKEN_MOCK,
              amount: toHex(1230000 * 2),
            },
          }),
        );
      });

      it('not using gas fee token if sufficient native balance', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1725000000000000');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
          max: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
        });
      });

      it('not using gas fee token if source token not found', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([
          { ...GAS_FEE_TOKEN_MOCK, tokenAddress: '0xdef' as Hex },
        ]);

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
          max: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
        });
      });

      it('not using gas fee token if calculation fails', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);
        calculateGasFeeTokenCostMock.mockReturnValue(undefined);

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
          max: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
        });
      });

      it('using gas fee token cost with normalized value', async () => {
        const quote = cloneDeep(QUOTE_MOCK);
        quote.steps[0].items[0].data.value = undefined as never;

        successfulFetchMock.mockResolvedValue({
          json: async () => quote,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(getGasFeeTokensMock).toHaveBeenCalledWith(
          expect.objectContaining({
            value: '0x0',
          }),
        );
      });

      it('not using gas fee token cost if chain disabled in feature flag', async () => {
        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

        getRemoteFeatureFlagControllerStateMock.mockReturnValue({
          ...getDefaultRemoteFeatureFlagControllerState(),
          remoteFeatureFlags: {
            confirmations_pay: {
              relayDisabledGasStationChains: [QUOTE_REQUEST_MOCK.sourceChainId],
            },
          },
        });

        const result = await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
          max: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
        });
      });

      it('not using gas fee token if insufficient native balance and chain does not support EIP-7702', async () => {
        const lineaQuoteRequest: QuoteRequest = {
          ...QUOTE_REQUEST_MOCK,
          sourceChainId: CHAIN_ID_LINEA,
        };

        successfulFetchMock.mockResolvedValue({
          json: async () => QUOTE_MOCK,
        } as never);

        getTokenBalanceMock.mockReturnValue('1724999999999999');
        getEIP7702SupportedChainsMock.mockReturnValue([
          QUOTE_REQUEST_MOCK.sourceChainId,
        ]);

        const result = await getRelayQuotes({
          messenger,
          requests: [lineaQuoteRequest],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(result[0].fees.isSourceGasFeeToken).toBeUndefined();
        expect(result[0].fees.sourceNetwork).toStrictEqual({
          estimate: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
          max: {
            fiat: '4.56',
            human: '1.725',
            raw: '1725000000000000',
            usd: '3.45',
          },
        });
      });
    });

    it('includes target network fee in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.targetNetwork).toStrictEqual({
        usd: '0',
        fiat: '0',
      });
    });

    it('includes target amount in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount).toStrictEqual({
        usd: '1.23',
        fiat: '2.46',
      });
    });

    it('adds subsidized fee to target amount fiat values when trade type is EXACT_INPUT', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.fees.subsidized = {
        amount: '500000000000000',
        amountFormatted: '0.0005',
        amountUsd: '0.50',
        currency: {
          address: '0xdef' as Hex,
          chainId: 1,
          decimals: 18,
        },
        minimumAmount: '500000000000000',
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount).toStrictEqual({
        usd: '1.73',
        fiat: '3.46',
      });
    });

    it('uses amountFormatted for subsidized fee when fee token is a stablecoin', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.fees.subsidized = {
        amount: '500000',
        amountFormatted: '0.50',
        amountUsd: '0.49',
        currency: {
          address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Hex,
          chainId: 1,
          decimals: 6,
        },
        minimumAmount: '500000',
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount).toStrictEqual({
        usd: '1.73',
        fiat: '3.46',
      });
    });

    it('does not add subsidized fee to target amount when trade type is not EXACT_INPUT', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.fees.subsidized = {
        amount: '500000000000000',
        amountFormatted: '0.0005',
        amountUsd: '0.50',
        currency: {
          address: '0xdef' as Hex,
          chainId: 1,
          decimals: 18,
        },
        minimumAmount: '500000000000000',
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount).toStrictEqual({
        usd: '1.23',
        fiat: '2.46',
      });
    });

    it('uses amountFormatted as usd for target amount when target is a stablecoin', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            targetChainId: CHAIN_ID_ARBITRUM,
            targetTokenAddress: ARBITRUM_USDC_ADDRESS,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount).toStrictEqual({
        usd: '1',
        fiat: '2',
      });
    });

    it('uses amountUsd for target amount when target is not a stablecoin', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].targetAmount).toStrictEqual({
        usd: '1.23',
        fiat: '2.46',
      });
    });

    it('throws if fetching quote fails', async () => {
      successfulFetchMock.mockRejectedValue(new Error('Fetch error'));

      await expect(
        getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow('Fetch error');
    });

    it('throws if source token fiat rate is unavailable', async () => {
      getTokenFiatRateMock.mockReturnValue(undefined);

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await expect(
        getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        }),
      ).rejects.toThrow(`Source token fiat rate not found`);
    });

    it('updates request if Arbitrum deposit to Hyperliquid', async () => {
      const arbitrumToHyperliquidRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        targetChainId: CHAIN_ID_ARBITRUM,
        targetTokenAddress: ARBITRUM_USDC_ADDRESS,
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [arbitrumToHyperliquidRequest],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          amount: '12300',
          destinationChainId: 1337,
          destinationCurrency: '0x00000000000000000000000000000000',
        }),
      );
    });

    it('does not convert to Hyperliquid deposit for post-quote requests targeting Arbitrum USDC', async () => {
      const postQuoteRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        isPostQuote: true,
        targetAmountMinimum: '0',
        targetChainId: CHAIN_ID_ARBITRUM,
        targetTokenAddress: ARBITRUM_USDC_ADDRESS,
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [postQuoteRequest],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body.destinationChainId).toBe(Number(CHAIN_ID_ARBITRUM));
      expect(body.destinationCurrency).toBe(ARBITRUM_USDC_ADDRESS);
    });

    it('updates request if source is polygon native', async () => {
      getNativeTokenMock.mockReturnValue(
        '0x0000000000000000000000000000000000001010',
      );

      getEIP7702SupportedChainsMock.mockReturnValue([CHAIN_ID_POLYGON]);

      const polygonToHyperliquidRequest: QuoteRequest = {
        ...QUOTE_REQUEST_MOCK,
        sourceChainId: CHAIN_ID_POLYGON,
        sourceTokenAddress: '0x0000000000000000000000000000000000001010',
      };

      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [polygonToHyperliquidRequest],
        transaction: TRANSACTION_META_MOCK,
      });

      const body = JSON.parse(
        successfulFetchMock.mock.calls[0][1]?.body as string,
      );

      expect(body).toStrictEqual(
        expect.objectContaining({
          originCurrency: NATIVE_TOKEN_ADDRESS,
        }),
      );
    });

    it('estimates gas for single transaction', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      estimateGasMock.mockResolvedValue({
        gas: toHex(50000),
        simulationFails: undefined,
      });

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasMock).toHaveBeenCalledWith(
        {
          data: quoteMock.steps[0].items[0].data.data,
          from: quoteMock.steps[0].items[0].data.from,
          to: quoteMock.steps[0].items[0].data.to,
          value: toHex(300000),
        },
        NETWORK_CLIENT_ID_MOCK,
      );

      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: 50000 }),
      );
    });

    it('uses fallback gas when estimateGas throws', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      estimateGasMock.mockRejectedValue(new Error('Estimation failed'));

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: 900000 }),
      );
    });

    it('uses fallback gas when estimation fails', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      estimateGasMock.mockResolvedValue({
        gas: toHex(50000),
        simulationFails: {
          debug: {},
        },
      });

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: 900000 }),
      );
    });

    it('uses estimated gas for multiple transactions', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps[0].items.push({
        data: {
          chainId: 1,
          from: FROM_MOCK,
          to: '0x3' as Hex,
          data: '0x456' as Hex,
        },
      } as never);

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 100000,
        gasLimits: [50000, 50000],
      });

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasBatchMock).toHaveBeenCalledWith({
        chainId: '0x1',
        from: FROM_MOCK,
        transactions: [
          expect.objectContaining({
            data: quoteMock.steps[0].items[0].data.data,
            to: quoteMock.steps[0].items[0].data.to,
          }),
          expect.objectContaining({
            data: quoteMock.steps[0].items[1].data.data,
            to: quoteMock.steps[0].items[1].data.to,
          }),
        ],
      });

      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: 100000 }),
      );
    });

    it('uses fallback gas when estimateGasBatch fails', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      quoteMock.steps[0].items.push({
        data: {
          chainId: 1,
          from: FROM_MOCK,
          to: '0x3' as Hex,
          data: '0x456' as Hex,
        },
      } as never);

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      estimateGasBatchMock.mockRejectedValue(
        new Error('Batch estimation failed'),
      );

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(calculateGasCostMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: 900000 + 21000 }),
      );
    });

    it('includes gas limits in quote', async () => {
      successfulFetchMock.mockResolvedValue({
        json: async () => QUOTE_MOCK,
      } as never);

      const result = await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].original.metamask).toStrictEqual({
        gasLimits: [21000],
      });
    });

    it('includes empty value when not defined', async () => {
      const quoteMock = cloneDeep(QUOTE_MOCK);
      delete quoteMock.steps[0].items[0].data.value;
      delete quoteMock.steps[0].items[0].data.gas;

      successfulFetchMock.mockResolvedValue({
        json: async () => quoteMock,
      } as never);

      await getRelayQuotes({
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(estimateGasMock).toHaveBeenCalledWith(
        expect.objectContaining({ value: '0x0' }),
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    describe('gas buffer support', () => {
      it('applies buffer to single transaction gas estimate', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        delete quoteMock.steps[0].items[0].data.gas;

        successfulFetchMock.mockResolvedValue({
          json: async () => quoteMock,
        } as never);

        estimateGasMock.mockResolvedValue({
          gas: toHex(50000),
          simulationFails: undefined,
        });

        getGasBufferMock.mockReturnValue(1.5);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 75000 }),
        );
      });

      it('applies buffer to batch transaction gas estimates when estimates do not match params', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        quoteMock.steps[0].items[0].data.gas = '30000';
        quoteMock.steps[0].items.push({
          data: {
            chainId: 1,
            from: FROM_MOCK,
            to: '0x3' as Hex,
            data: '0x456' as Hex,
            gas: '40000',
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          json: async () => quoteMock,
        } as never);

        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 80000,
          gasLimits: [35000, 45000],
        });

        getGasBufferMock.mockReturnValue(1.5);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 120000 }),
        );
      });

      it('does not apply buffer to batch transaction gas estimates when estimates match params', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        quoteMock.steps[0].items[0].data.gas = '30000';
        quoteMock.steps[0].items.push({
          data: {
            chainId: 1,
            from: FROM_MOCK,
            to: '0x3' as Hex,
            data: '0x456' as Hex,
            gas: '40000',
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          json: async () => quoteMock,
        } as never);

        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 70000,
          gasLimits: [30000, 40000],
        });

        getGasBufferMock.mockReturnValue(1.5);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 70000 }),
        );
      });

      it('applies buffer to batch with single transaction', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        quoteMock.steps[0].items[0].data.gas = '30000';
        quoteMock.steps[0].items.push({
          data: {
            chainId: 1,
            from: FROM_MOCK,
            to: '0x3' as Hex,
            data: '0x456' as Hex,
            gas: '40000',
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          json: async () => quoteMock,
        } as never);

        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 60000,
          gasLimits: [60000],
        });

        getGasBufferMock.mockReturnValue(1.5);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 90000 }),
        );
      });

      it('applies mixed buffer to batch transactions when some match params and others do not', async () => {
        const quoteMock = cloneDeep(QUOTE_MOCK);
        quoteMock.steps[0].items[0].data.gas = '30000';
        quoteMock.steps[0].items.push({
          data: {
            chainId: 1,
            from: FROM_MOCK,
            to: '0x3' as Hex,
            data: '0x456' as Hex,
            gas: '40000',
          },
        } as never);

        successfulFetchMock.mockResolvedValue({
          json: async () => quoteMock,
        } as never);

        estimateGasBatchMock.mockResolvedValue({
          totalGasLimit: 70000,
          gasLimits: [30000, 50000],
        });

        getGasBufferMock.mockReturnValue(1.5);

        await getRelayQuotes({
          messenger,
          requests: [QUOTE_REQUEST_MOCK],
          transaction: TRANSACTION_META_MOCK,
        });

        expect(calculateGasCostMock).toHaveBeenCalledWith(
          expect.objectContaining({ gas: 105000 }),
        );
      });
    });
  });
});
