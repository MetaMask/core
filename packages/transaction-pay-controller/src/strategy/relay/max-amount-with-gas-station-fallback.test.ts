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
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  GetDelegationTransactionCallback,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types';
import {
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
  getTokenInfo,
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
const FROM_MOCK = '0x1234567890123456789012345678901234567891' as Hex;
const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';

const QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: FROM_MOCK,
  sourceBalanceRaw: '10000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc',
  sourceTokenAmount: '1000000000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: '0x1234567890123456789012345678901234567890',
};

const QUOTE_MOCK = {
  details: {
    currencyIn: {
      amount: '1000000000',
      amountFormatted: '1000',
      amountUsd: '1000',
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

const GAS_FEE_TOKEN_MOCK: GasFeeToken = {
  amount: toHex(1230000),
  balance: toHex(0),
  decimals: 6,
  gas: toHex(21000),
  maxFeePerGas: toHex(1),
  maxPriorityFeePerGas: toHex(1),
  rateWei: toHex(1),
  recipient: FROM_MOCK,
  symbol: 'USDC',
  tokenAddress: '0xabc' as Hex,
};

function createQuote(sourceAmountRaw: string): RelayQuote {
  const quote = cloneDeep(QUOTE_MOCK);
  quote.details.currencyIn.amount = sourceAmountRaw;
  return quote;
}

describe('Max Amount With Gas Station Fallback', () => {
  const successfulFetchMock = jest.mocked(successfulFetch);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const calculateGasCostMock = jest.mocked(calculateGasCost);
  const calculateGasFeeTokenCostMock = jest.mocked(calculateGasFeeTokenCost);
  const getNativeTokenMock = jest.mocked(getNativeToken);
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const getTokenInfoMock = jest.mocked(getTokenInfo);
  const getEIP7702SupportedChainsMock = jest.mocked(getEIP7702SupportedChains);
  const getGasBufferMock = jest.mocked(getGasBuffer);
  const getSlippageMock = jest.mocked(getSlippage);

  const {
    messenger,
    findNetworkClientIdByChainIdMock,
    getDelegationTransactionMock,
    getGasFeeTokensMock,
    getRemoteFeatureFlagControllerStateMock,
  } = getMessengerMock();

  const getMaxRelayQuote = async (
    requestOverrides: Partial<QuoteRequest> = {},
  ): Promise<TransactionPayQuote<RelayQuote>[]> =>
    await getRelayQuotes({
      messenger,
      requests: [
        {
          ...QUOTE_REQUEST_MOCK,
          ...requestOverrides,
          isMaxAmount: true,
        },
      ],
      transaction: TRANSACTION_META_MOCK,
    });

  beforeEach(() => {
    jest.resetAllMocks();

    getTokenFiatRateMock.mockReturnValue({
      fiatRate: '1',
      usdRate: '1',
    });

    calculateGasCostMock.mockReturnValue({
      fiat: '4.56',
      human: '1.725',
      raw: '1725000000000000',
      usd: '3.45',
    });

    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '3.45',
      human: '3.45',
      raw: '3450000',
      usd: '3.45',
    });

    getNativeTokenMock.mockReturnValue(
      '0x0000000000000000000000000000000000000000' as Hex,
    );
    getTokenBalanceMock.mockReturnValue('0');
    getTokenInfoMock.mockReturnValue({ decimals: 6, symbol: 'USDC' });

    getEIP7702SupportedChainsMock.mockReturnValue([
      QUOTE_REQUEST_MOCK.sourceChainId,
    ]);
    getGasBufferMock.mockReturnValue(1.0);
    getSlippageMock.mockReturnValue(DEFAULT_SLIPPAGE);

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
    });

    getDelegationTransactionMock.mockResolvedValue(DELEGATION_RESULT_MOCK);
    getGasFeeTokensMock.mockResolvedValue([]);
    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
  });

  it('returns phase-1 quote when native balance covers gas', async () => {
    successfulFetchMock.mockResolvedValue({
      json: async () => QUOTE_MOCK,
    } as never);
    getTokenBalanceMock.mockReturnValue('1725000000000000');

    const result = await getMaxRelayQuote();

    expect(successfulFetchMock).toHaveBeenCalledTimes(1);
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
  });

  it('returns phase-1 quote when max gasless feature is disabled', async () => {
    successfulFetchMock.mockResolvedValue({
      json: async () => QUOTE_MOCK,
    } as never);

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          maxGaslessEnabled: false,
        },
      },
    });

    const result = await getMaxRelayQuote();

    expect(successfulFetchMock).toHaveBeenCalledTimes(1);
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
  });

  it('returns phase-1 quote when gas station is unsupported on source chain', async () => {
    successfulFetchMock.mockResolvedValue({
      json: async () => QUOTE_MOCK,
    } as never);
    getEIP7702SupportedChainsMock.mockReturnValue([]);

    const result = await getMaxRelayQuote();

    expect(successfulFetchMock).toHaveBeenCalledTimes(1);
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
  });

  it('uses probe quote when phase-1 gas estimation is unavailable', async () => {
    const phase1Quote = createQuote('1000000000');
    const probeQuote = createQuote('250000000');
    const phase2Quote = createQuote('996550000');

    successfulFetchMock
      .mockResolvedValueOnce({ json: async () => phase1Quote } as never)
      .mockResolvedValueOnce({ json: async () => probeQuote } as never)
      .mockResolvedValueOnce({ json: async () => phase2Quote } as never);

    getGasFeeTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([GAS_FEE_TOKEN_MOCK])
      .mockResolvedValueOnce([GAS_FEE_TOKEN_MOCK]);

    const result = await getMaxRelayQuote({ sourceTokenAmount: '1000000000' });

    expect(successfulFetchMock).toHaveBeenCalledTimes(3);

    const phase2Body = JSON.parse(
      successfulFetchMock.mock.calls[2][1]?.body as string,
    );

    expect(phase2Body.amount).toBe('996550000');
    expect(result[0].original.metamask?.twoPhaseQuoteForMaxAmount).toBe(true);
  });

  it('returns phase-1 quote when adjusted amount is not positive', async () => {
    const phase1Quote = createQuote('1000');
    successfulFetchMock.mockResolvedValue({
      json: async () => phase1Quote,
    } as never);

    getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '1000',
      usd: '0',
    });

    const result = await getMaxRelayQuote({ sourceTokenAmount: '1000' });

    expect(successfulFetchMock).toHaveBeenCalledTimes(1);
    expect(result[0].sourceAmount.raw).toBe('1000');
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
  });

  it('returns phase-1 quote when phase-2 request fails', async () => {
    const phase1Quote = createQuote('1000');
    successfulFetchMock
      .mockResolvedValueOnce({ json: async () => phase1Quote } as never)
      .mockRejectedValueOnce(new Error('phase-2 failed'));

    getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const result = await getMaxRelayQuote({ sourceTokenAmount: '1000' });

    expect(successfulFetchMock).toHaveBeenCalledTimes(2);
    expect(result[0].sourceAmount.raw).toBe('1000');
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
  });

  it('returns phase-1 quote when phase-2 validation estimate is unavailable', async () => {
    const phase1Quote = createQuote('1000');
    const phase2Quote = createQuote('900');

    successfulFetchMock
      .mockResolvedValueOnce({ json: async () => phase1Quote } as never)
      .mockResolvedValueOnce({ json: async () => phase2Quote } as never);

    getGasFeeTokensMock
      .mockResolvedValueOnce([GAS_FEE_TOKEN_MOCK])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const result = await getMaxRelayQuote({ sourceTokenAmount: '1000' });

    expect(successfulFetchMock).toHaveBeenCalledTimes(2);
    expect(result[0].sourceAmount.raw).toBe('1000');
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
  });

  it('returns phase-1 quote when adjusted quote is not affordable after validation', async () => {
    const phase1Quote = createQuote('1000');
    const phase2Quote = createQuote('900');

    successfulFetchMock
      .mockResolvedValueOnce({ json: async () => phase1Quote } as never)
      .mockResolvedValueOnce({ json: async () => phase2Quote } as never);

    getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);
    calculateGasFeeTokenCostMock
      .mockReturnValueOnce({
        fiat: '0',
        human: '0',
        raw: '100',
        usd: '0',
      })
      .mockReturnValueOnce({
        fiat: '0',
        human: '0',
        raw: '200',
        usd: '0',
      });

    const result = await getMaxRelayQuote({ sourceTokenAmount: '1000' });

    expect(successfulFetchMock).toHaveBeenCalledTimes(2);
    expect(result[0].sourceAmount.raw).toBe('1000');
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
  });

  it('returns phase-2 quote when estimate and validation are affordable', async () => {
    const phase1Quote = createQuote('1000');
    const phase2Quote = createQuote('900');

    successfulFetchMock
      .mockResolvedValueOnce({ json: async () => phase1Quote } as never)
      .mockResolvedValueOnce({ json: async () => phase2Quote } as never);

    getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);
    calculateGasFeeTokenCostMock
      .mockReturnValueOnce({
        fiat: '0',
        human: '0',
        raw: '100',
        usd: '0',
      })
      .mockReturnValueOnce({
        fiat: '0',
        human: '0',
        raw: '100',
        usd: '0',
      });

    const result = await getMaxRelayQuote({ sourceTokenAmount: '1000' });

    expect(successfulFetchMock).toHaveBeenCalledTimes(2);

    const phase2Body = JSON.parse(
      successfulFetchMock.mock.calls[1][1]?.body as string,
    );

    expect(phase2Body.amount).toBe('900');
    expect(result[0].original.metamask?.twoPhaseQuoteForMaxAmount).toBe(true);
  });
});
