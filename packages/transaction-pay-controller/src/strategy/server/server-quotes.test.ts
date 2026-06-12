import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  CHAIN_ID_HYPERCORE,
  PaymentOverride,
  TransactionPayStrategy,
} from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  GetDelegationTransactionCallback,
  QuoteRequest,
} from '../../types';
import {
  getFeatureFlags,
  getSlippage,
  isEIP7702Chain,
} from '../../utils/feature-flags';
import { calculateGasCost, getGasFee } from '../../utils/gas';
import {
  getGasStationCostInSourceTokenRaw,
  getGasStationEligibility,
} from '../../utils/gas-station';
import { estimateQuoteGasLimits } from '../../utils/quote-gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
} from '../../utils/token';
import { fetchServerQuote } from './server-api';
import { getServerQuotes } from './server-quotes';
import { ServerProviderName, ServerTradeType } from './types';

jest.mock('../../utils/feature-flags', () => ({
  ...jest.requireActual('../../utils/feature-flags'),
  getFeatureFlags: jest.fn(),
  getSlippage: jest.fn(),
  isEIP7702Chain: jest.fn(),
}));
jest.mock('./server-api');
jest.mock('../../utils/gas-station');
jest.mock('../../utils/gas');
jest.mock('../../utils/quote-gas');
jest.mock('../../utils/token');

const FROM_MOCK = '0x1234567890123456789012345678901234567891' as Hex;
const SOURCE_TOKEN_ADDRESS_MOCK =
  '0xabc0000000000000000000000000000000000000' as Hex;
const TARGET_TOKEN_ADDRESS_MOCK =
  '0x1234567890123456789012345678901234567890' as Hex;
const TOKEN_TRANSFER_RECIPIENT_MOCK =
  '0x5678901234567890123456789012345678901234' as Hex;
const TOKEN_TRANSFER_DATA_MOCK =
  '0xa9059cbb0000000000000000000000005678901234567890123456789012345678901234000000000000000000000000000000000000000000000000000000000000007b' as Hex;
const SOURCE_ACCOUNT_TRANSFER_DATA_MOCK =
  '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567891000000000000000000000000000000000000000000000000000000000000007b' as Hex;

const TRANSACTION_META_MOCK = { txParams: {} } as TransactionMeta;
const COMPLEX_TRANSACTION_META_MOCK = {
  txParams: { data: '0x1234' as Hex },
} as TransactionMeta;

const QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: FROM_MOCK,
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: SOURCE_TOKEN_ADDRESS_MOCK,
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: TARGET_TOKEN_ADDRESS_MOCK,
};

const FULFILLED_RESULT_MOCK = {
  provider: ServerProviderName.Relay,
  quote: {
    duration: 42,
    fees: { metamask: '0', provider: '0.25', subsidized: false },
    gasless: true,
    id: 'quote-id',
    input: {
      chainId: 1,
      decimals: 18,
      formatted: '1.0',
      raw: '1000000000000000000',
      token: SOURCE_TOKEN_ADDRESS_MOCK,
    },
    output: {
      chainId: 2,
      decimals: 6,
      formatted: '0.123',
      raw: '123',
      token: TARGET_TOKEN_ADDRESS_MOCK,
    },
    steps: [
      {
        type: 'transaction' as const,
        chainId: 1,
        data: '0xdef' as Hex,
        to: '0x4560000000000000000000000000000000000000' as Hex,
        value: '0',
      },
    ],
  },
};

const REJECTED_RESULT_MOCK = {
  error: { message: 'no route' },
  provider: ServerProviderName.Relay,
};

const DELEGATION_RESULT_MOCK = {
  authorizationList: [
    {
      address: '0x9990000000000000000000000000000000000000' as Hex,
      chainId: '0x1' as Hex,
      nonce: '0x2' as Hex,
      r: '0x3' as Hex,
      s: '0x4' as Hex,
      yParity: '0x1' as Hex,
    },
  ],
  data: '0x111' as Hex,
  to: '0x2220000000000000000000000000000000000000' as Hex,
  value: '0x333' as Hex,
} as Awaited<ReturnType<GetDelegationTransactionCallback>>;

describe('server-quotes', () => {
  const fetchServerQuoteMock = jest.mocked(fetchServerQuote);
  const getSlippageMock = jest.mocked(getSlippage);
  const isEIP7702ChainMock = jest.mocked(isEIP7702Chain);
  const {
    getControllerStateMock,
    getDelegationTransactionMock,
    getPaymentOverrideDataMock,
    messenger,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    fetchServerQuoteMock.mockResolvedValue({
      results: [FULFILLED_RESULT_MOCK],
    });
    getDelegationTransactionMock.mockResolvedValue(DELEGATION_RESULT_MOCK);
    getSlippageMock.mockReturnValue(0.005);
    isEIP7702ChainMock.mockReturnValue(false);
    jest.mocked(getFeatureFlags).mockReturnValue({
      relayFallbackGas: '0x5208',
    } as never);
    jest
      .mocked(getNativeToken)
      .mockReturnValue('0x0000000000000000000000000000000000000000' as never);
    jest.mocked(getTokenBalance).mockReturnValue('0');
    jest.mocked(calculateGasCost).mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '0',
      usd: '0',
    } as never);
    jest.mocked(getGasFee).mockReturnValue({
      estimatedBaseFee: undefined,
      maxFeePerGas: '1000000000',
      maxPriorityFeePerGas: '500000000',
    });
    jest.mocked(estimateQuoteGasLimits).mockResolvedValue({
      gasLimits: [{ estimate: 21000, max: 25000 }],
      totalGasEstimate: '0x5208',
      totalGasLimit: '0x7530',
    } as never);
    jest.mocked(getGasStationEligibility).mockReturnValue({
      chainSupportsGasStation: false,
      isDisabledChain: false,
    } as never);
    jest
      .mocked(getGasStationCostInSourceTokenRaw)
      .mockResolvedValue(undefined as never);
  });

  it('maps standard transactions to EXPECTED_OUTPUT quote requests', async () => {
    await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(fetchServerQuoteMock).toHaveBeenCalledWith(
      messenger,
      {
        source: { chainId: 1, token: SOURCE_TOKEN_ADDRESS_MOCK },
        target: { chainId: 2, token: TARGET_TOKEN_ADDRESS_MOCK },
        amount: QUOTE_REQUEST_MOCK.targetAmountMinimum,
        tradeType: ServerTradeType.ExpectedOutput,
        sender: FROM_MOCK,
        recipient: FROM_MOCK,
        slippage: 50,
        supportsGasless: false,
      },
      undefined,
    );
  });

  it('maps max-amount transactions to EXACT_INPUT quote requests', async () => {
    await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(fetchServerQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.objectContaining({
        amount: QUOTE_REQUEST_MOCK.sourceTokenAmount,
        tradeType: ServerTradeType.ExactInput,
      }),
      undefined,
    );
  });

  it('decodes ERC-20 transfer calldata and uses the transfer recipient', async () => {
    await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: {
        txParams: { data: TOKEN_TRANSFER_DATA_MOCK },
      } as TransactionMeta,
    });

    expect(fetchServerQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.objectContaining({ recipient: TOKEN_TRANSFER_RECIPIENT_MOCK }),
      undefined,
    );
    expect(getDelegationTransactionMock).not.toHaveBeenCalled();
  });

  it('decodes ERC-20 transfer calldata from a single nested transaction', async () => {
    await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: {
        nestedTransactions: [{ data: TOKEN_TRANSFER_DATA_MOCK }],
        txParams: {},
      } as TransactionMeta,
    });

    expect(fetchServerQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.objectContaining({ recipient: TOKEN_TRANSFER_RECIPIENT_MOCK }),
      undefined,
    );
  });

  it('builds calls from delegation for complex non-transfer transactions', async () => {
    await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: COMPLEX_TRANSACTION_META_MOCK,
    });

    expect(fetchServerQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.objectContaining({
        authorizationList: [
          {
            address: DELEGATION_RESULT_MOCK.authorizationList?.[0].address,
            chainId: 1,
            nonce: 2,
            r: '0x3',
            s: '0x4',
            yParity: 1,
          },
        ],
        calls: [
          {
            data: SOURCE_ACCOUNT_TRANSFER_DATA_MOCK,
            to: TARGET_TOKEN_ADDRESS_MOCK,
            value: '0x0',
          },
          {
            data: DELEGATION_RESULT_MOCK.data,
            to: DELEGATION_RESULT_MOCK.to,
            value: DELEGATION_RESULT_MOCK.value,
          },
        ],
      }),
      undefined,
    );
  });

  it('does not build delegation calls for Hypercore transactions', async () => {
    await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [
        {
          ...QUOTE_REQUEST_MOCK,
          targetChainId: CHAIN_ID_HYPERCORE,
        },
      ],
      transaction: COMPLEX_TRANSACTION_META_MOCK,
    });

    expect(fetchServerQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.not.objectContaining({ calls: expect.any(Array) }),
      undefined,
    );
    expect(getDelegationTransactionMock).not.toHaveBeenCalled();
  });

  it('sets supportsGasless when the account supports 7702 and the source chain is EIP-7702-capable', async () => {
    isEIP7702ChainMock.mockReturnValue(true);

    await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(fetchServerQuoteMock).toHaveBeenCalledWith(
      messenger,
      expect.objectContaining({ supportsGasless: true }),
      undefined,
    );
  });

  it.each([
    ['account does not support 7702', false, true],
    ['source chain is not an EIP-7702 chain', true, false],
  ])(
    'leaves supportsGasless false when %s',
    async (_label, supports7702, eip7702Chain) => {
      isEIP7702ChainMock.mockReturnValue(eip7702Chain);

      await getServerQuotes({
        accountSupports7702: supports7702,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(fetchServerQuoteMock).toHaveBeenCalledWith(
        messenger,
        expect.objectContaining({ supportsGasless: false }),
        undefined,
      );
    },
  );

  it('returns an empty array when all providers return only rejected results', async () => {
    fetchServerQuoteMock.mockResolvedValue({
      results: [REJECTED_RESULT_MOCK],
    });

    const result = await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(result).toStrictEqual([]);
  });

  it('passes gasless through to the normalized quote', async () => {
    fetchServerQuoteMock.mockResolvedValue({
      results: [
        {
          ...FULFILLED_RESULT_MOCK,
          quote: { ...FULFILLED_RESULT_MOCK.quote, gasless: true },
        },
      ],
    });

    const result = await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(result[0].original.gasless).toBe(true);
  });

  it('normalizes network fees to zero for gasless quotes and uses the server strategy', async () => {
    const result = await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    const { quote } = FULFILLED_RESULT_MOCK;

    expect(result).toStrictEqual([
      {
        dust: { fiat: '0', usd: '0' },
        estimatedDuration: quote.duration,
        fees: {
          metaMask: { fiat: '0', usd: '0' },
          provider: { fiat: quote.fees.provider, usd: quote.fees.provider },
          sourceNetwork: {
            estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
            max: { fiat: '0', human: '0', raw: '0', usd: '0' },
          },
          targetNetwork: { fiat: '0', usd: '0' },
        },
        original: {
          client: {
            gasLimits: [],
            is7702: false,
            maxFeePerGas: undefined,
            maxPriorityFeePerGas: undefined,
          },
          duration: quote.duration,
          fees: quote.fees,
          gasless: true,
          id: quote.id,
          input: quote.input,
          output: quote.output,
          provider: FULFILLED_RESULT_MOCK.provider,
          steps: quote.steps,
        },
        request: QUOTE_REQUEST_MOCK,
        sourceAmount: {
          fiat: '0',
          human: quote.input.formatted,
          raw: quote.input.raw,
          usd: '0',
        },
        strategy: TransactionPayStrategy.Server,
        targetAmount: { fiat: '0', usd: '0' },
      },
    ]);
  });

  it('computes sourceAmount fiat and usd from token fiat rate when available', async () => {
    jest.mocked(getTokenFiatRate).mockReturnValue({
      fiatRate: '2',
      usdRate: '1.5',
    });

    const result = await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    const { quote } = FULFILLED_RESULT_MOCK;

    expect(result[0].sourceAmount).toStrictEqual({
      fiat: '2',
      human: quote.input.formatted,
      raw: quote.input.raw,
      usd: '1.5',
    });
  });

  it('filters zero target amount requests unless they are post-quote or max amount requests', async () => {
    await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [
        { ...QUOTE_REQUEST_MOCK, targetAmountMinimum: '0' },
        { ...QUOTE_REQUEST_MOCK, isPostQuote: true, targetAmountMinimum: '0' },
        { ...QUOTE_REQUEST_MOCK, isMaxAmount: true, targetAmountMinimum: '0' },
      ],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(fetchServerQuoteMock).toHaveBeenCalledTimes(2);
  });

  it('logs and returns empty array when fetchServerQuote throws', async () => {
    fetchServerQuoteMock.mockRejectedValue(new Error('network error'));

    const result = await getServerQuotes({
      accountSupports7702: true,
      messenger,
      requests: [QUOTE_REQUEST_MOCK],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(result).toStrictEqual([]);
  });

  describe('non-gasless source network cost', () => {
    const GAS_ESTIMATE_MOCK = {
      fiat: '0',
      human: '0.001',
      raw: '1000000000000000',
      usd: '0',
    };

    const NON_GASLESS_RESULT_MOCK = {
      ...FULFILLED_RESULT_MOCK,
      quote: {
        ...FULFILLED_RESULT_MOCK.quote,
        gasless: false,
        steps: [
          {
            type: 'transaction' as const,
            chainId: 1,
            data: '0xdef' as Hex,
            maxFeePerGas: '0x1',
            maxPriorityFeePerGas: '0x1',
            to: '0x4560000000000000000000000000000000000000' as Hex,
            value: '0',
          },
        ],
      },
    };

    beforeEach(() => {
      jest.mocked(calculateGasCost).mockReturnValue(GAS_ESTIMATE_MOCK as never);
      jest.mocked(getTokenBalance).mockReturnValue('999999999999999999999');
      jest.mocked(getGasStationEligibility).mockReturnValue({
        chainSupportsGasStation: true,
        isDisabledChain: false,
      } as never);
      fetchServerQuoteMock.mockResolvedValue({
        results: [NON_GASLESS_RESULT_MOCK],
      });
    });

    it('returns gas cost estimate and max when native balance is sufficient', async () => {
      jest.mocked(getTokenBalance).mockReturnValue('9999999999999999999999');

      const result = await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.sourceNetwork.estimate).toBe(GAS_ESTIMATE_MOCK);
      expect(result[0].fees.sourceNetwork.max).toBe(GAS_ESTIMATE_MOCK);
    });

    it('returns estimate and max when gas station is not supported', async () => {
      jest.mocked(getTokenBalance).mockReturnValue('0');
      jest.mocked(getGasStationEligibility).mockReturnValue({
        chainSupportsGasStation: false,
        isDisabledChain: false,
      } as never);

      const result = await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.sourceNetwork.estimate).toBe(GAS_ESTIMATE_MOCK);
    });

    it('returns estimate and max when gas station cost is unavailable', async () => {
      jest.mocked(getTokenBalance).mockReturnValue('0');
      jest
        .mocked(getGasStationCostInSourceTokenRaw)
        .mockResolvedValue(undefined as never);

      const result = await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.sourceNetwork.estimate).toBe(GAS_ESTIMATE_MOCK);
    });

    it('returns gas fee token cost when gas station provides a cost', async () => {
      const GAS_FEE_TOKEN_COST = {
        fiat: '0',
        human: '0.5',
        raw: '500000',
        usd: '0',
      };

      jest.mocked(getTokenBalance).mockReturnValue('0');

      jest
        .mocked(getGasStationCostInSourceTokenRaw)
        .mockResolvedValue(GAS_FEE_TOKEN_COST as never);

      const result = await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.sourceNetwork.estimate).toBe(GAS_FEE_TOKEN_COST);
      expect(result[0].fees.isSourceGasFeeToken).toBe(true);
    });

    it('zeroes source network fees when steps array is empty', async () => {
      fetchServerQuoteMock.mockResolvedValue({
        results: [
          {
            ...NON_GASLESS_RESULT_MOCK,
            quote: { ...NON_GASLESS_RESULT_MOCK.quote, steps: [] },
          },
        ],
      });

      const result = await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.sourceNetwork.estimate).toStrictEqual({
        fiat: '0',
        human: '0',
        raw: '0',
        usd: '0',
      });
    });

    it('falls back to zero when step does not include gas fee fields', async () => {
      jest.mocked(getTokenBalance).mockReturnValue('0');
      fetchServerQuoteMock.mockResolvedValue({
        results: [
          {
            ...NON_GASLESS_RESULT_MOCK,
            quote: {
              ...NON_GASLESS_RESULT_MOCK.quote,
              steps: [
                {
                  type: 'transaction' as const,
                  chainId: 1,
                  data: '0xdef' as Hex,
                  to: '0x4560000000000000000000000000000000000000' as Hex,
                  value: '0',
                },
              ],
            },
          },
        ],
      });

      const result = await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.sourceNetwork.estimate).toBe(GAS_ESTIMATE_MOCK);
    });

    it('trims gasLimits to single entry when is7702 is true', async () => {
      jest.mocked(getTokenBalance).mockReturnValue('9999999999999999999999');
      jest.mocked(estimateQuoteGasLimits).mockResolvedValue({
        gasLimits: [
          { estimate: 21000, max: 25000 },
          { estimate: 21000, max: 25000 },
        ],
        is7702: true,
        totalGasEstimate: '0x5208',
        totalGasLimit: '0x7530',
      } as never);

      const result = await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].original.client.gasLimits).toHaveLength(1);
    });

    it('passes zero maxFeePerGas to calculateGasCost when gas fee estimate returns undefined', async () => {
      jest.mocked(getTokenBalance).mockReturnValue('9999999999999999999999');
      jest.mocked(getGasFee).mockReturnValue({
        estimatedBaseFee: undefined,
        maxFeePerGas: undefined,
        maxPriorityFeePerGas: undefined,
      });
      fetchServerQuoteMock.mockResolvedValue({
        results: [
          {
            ...NON_GASLESS_RESULT_MOCK,
            quote: {
              ...NON_GASLESS_RESULT_MOCK.quote,
              steps: [
                {
                  type: 'transaction' as const,
                  chainId: 1,
                  data: '0xdef' as Hex,
                  to: '0x4560000000000000000000000000000000000000' as Hex,
                  value: '0',
                },
              ],
            },
          },
        ],
      });

      const result = await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.sourceNetwork.estimate).toBe(GAS_ESTIMATE_MOCK);
      expect(jest.mocked(calculateGasCost)).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFeePerGas: '0',
          maxPriorityFeePerGas: '0',
        }),
      );
    });

    it('zeroes source network fees when quote has no steps and is not gasless', async () => {
      fetchServerQuoteMock.mockResolvedValue({
        results: [
          {
            ...FULFILLED_RESULT_MOCK,
            quote: {
              ...FULFILLED_RESULT_MOCK.quote,
              gasless: false,
              steps: [],
            },
          },
        ],
      });

      const result = await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [QUOTE_REQUEST_MOCK],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result[0].fees.sourceNetwork.estimate).toStrictEqual(
        expect.objectContaining({ raw: '0' }),
      );
    });
  });

  describe('processMoneyAccountPostQuote', () => {
    const OVERRIDE_CALL_MOCK = {
      data: '0xoverride' as Hex,
      to: '0xcccc000000000000000000000000000000000000' as Hex,
      value: '0x0' as Hex,
    };

    beforeEach(() => {
      getControllerStateMock.mockReturnValue({
        transactionData: {
          [TRANSACTION_META_MOCK.id]: {
            tokens: [{ amountHuman: '1.5' }],
          },
        },
      } as never);

      getPaymentOverrideDataMock.mockResolvedValue({
        calls: [OVERRIDE_CALL_MOCK],
        recipient: TOKEN_TRANSFER_RECIPIENT_MOCK,
        authorizationList: undefined,
      } as never);
    });

    it('adds override calls and transfer call to server quote body when isPostQuote + MoneyAccount', async () => {
      await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            isPostQuote: true,
            paymentOverride: PaymentOverride.MoneyAccount,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(fetchServerQuoteMock).toHaveBeenCalledWith(
        messenger,
        expect.objectContaining({
          calls: expect.arrayContaining([
            expect.objectContaining({ to: OVERRIDE_CALL_MOCK.to }),
          ]),
        }),
        undefined,
      );
    });

    it('falls back to request.from as recipient when getPaymentOverrideData returns no recipient', async () => {
      getPaymentOverrideDataMock.mockResolvedValue({
        calls: [OVERRIDE_CALL_MOCK],
        recipient: undefined,
        authorizationList: undefined,
      } as never);

      await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            isPostQuote: true,
            paymentOverride: PaymentOverride.MoneyAccount,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      // The transfer call targets the source token address with FROM_MOCK as recipient.
      expect(fetchServerQuoteMock).toHaveBeenCalledWith(
        messenger,
        expect.objectContaining({
          calls: expect.arrayContaining([
            expect.objectContaining({
              to: TARGET_TOKEN_ADDRESS_MOCK,
              // data encodes FROM_MOCK (lower-cased, no 0x prefix) as the recipient
              data: expect.stringContaining(
                FROM_MOCK.slice(2).toLowerCase(),
              ) as string,
            }),
          ]),
        }),
        undefined,
      );
    });

    it('attaches authorizationList when getPaymentOverrideData returns one', async () => {
      getPaymentOverrideDataMock.mockResolvedValue({
        calls: [OVERRIDE_CALL_MOCK],
        recipient: TOKEN_TRANSFER_RECIPIENT_MOCK,
        authorizationList: [
          {
            address: '0xaaaa000000000000000000000000000000000000' as Hex,
            chainId: '0x1' as Hex,
            nonce: '0x1' as Hex,
            r: '0xr' as Hex,
            s: '0xs' as Hex,
            yParity: '0x1' as Hex,
          },
        ],
      } as never);

      await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            isPostQuote: true,
            paymentOverride: PaymentOverride.MoneyAccount,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(fetchServerQuoteMock).toHaveBeenCalledWith(
        messenger,
        expect.objectContaining({
          authorizationList: expect.arrayContaining([
            expect.objectContaining({
              address: '0xaaaa000000000000000000000000000000000000',
            }),
          ]),
        }),
        undefined,
      );
    });

    it('falls back to 0 amount when transactionData has no tokens', async () => {
      getControllerStateMock.mockReturnValue({
        transactionData: {},
      } as never);

      await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            isPostQuote: true,
            paymentOverride: PaymentOverride.MoneyAccount,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(getPaymentOverrideDataMock).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '0' }),
      );
    });

    it('defaults override call value to 0x0 when call.value is undefined', async () => {
      getPaymentOverrideDataMock.mockResolvedValue({
        calls: [
          {
            to: '0xcccc000000000000000000000000000000000000' as Hex,
            data: '0xdata' as Hex,
          },
        ],
        recipient: TOKEN_TRANSFER_RECIPIENT_MOCK,
        authorizationList: undefined,
      } as never);

      await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            isPostQuote: true,
            paymentOverride: PaymentOverride.MoneyAccount,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(fetchServerQuoteMock).toHaveBeenCalledWith(
        messenger,
        expect.objectContaining({
          calls: expect.arrayContaining([
            expect.objectContaining({
              to: '0xcccc000000000000000000000000000000000000',
              value: '0x0',
            }),
          ]),
        }),
        undefined,
      );
    });

    it('skips override when getPaymentOverrideData returns empty calls', async () => {
      getPaymentOverrideDataMock.mockResolvedValue({
        calls: [],
        recipient: undefined,
        authorizationList: undefined,
      } as never);

      await getServerQuotes({
        accountSupports7702: true,
        messenger,
        requests: [
          {
            ...QUOTE_REQUEST_MOCK,
            isPostQuote: true,
            paymentOverride: PaymentOverride.MoneyAccount,
          },
        ],
        transaction: TRANSACTION_META_MOCK,
      });

      expect(fetchServerQuoteMock).toHaveBeenCalledWith(
        messenger,
        expect.not.objectContaining({ calls: expect.anything() }),
        undefined,
      );
    });
  });
});
