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
} from '../../types';
import {
  DEFAULT_SLIPPAGE,
  getEIP7702SupportedChains,
  getGasBuffer,
  getSlippage,
} from '../../utils/feature-flags';
import {
  calculateGasCost,
  calculateGasFeeTokenCost,
  calculateTransactionGasCost,
} from '../../utils/gas';
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

describe('Max Amount With Gas Station Fallback', () => {
  const successfulFetchMock = jest.mocked(successfulFetch);
  const getTokenFiatRateMock = jest.mocked(getTokenFiatRate);
  const calculateGasCostMock = jest.mocked(calculateGasCost);
  const calculateGasFeeTokenCostMock = jest.mocked(calculateGasFeeTokenCost);
  jest.mocked(getNativeToken);
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const getTokenInfoMock = jest.mocked(getTokenInfo);
  const getEIP7702SupportedChainsMock = jest.mocked(getEIP7702SupportedChains);
  const getGasBufferMock = jest.mocked(getGasBuffer);
  const getSlippageMock = jest.mocked(getSlippage);

  const calculateTransactionGasCostMock = jest.mocked(
    calculateTransactionGasCost,
  );

  const {
    messenger,
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

    calculateTransactionGasCostMock.mockReturnValue({
      fiat: '2.34',
      human: '0.615',
      raw: '6150000000000000',
      usd: '1.23',
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

    getTokenInfoMock.mockReturnValue({ decimals: 18, symbol: 'ETH' });
    getEIP7702SupportedChainsMock.mockReturnValue([
      QUOTE_REQUEST_MOCK.sourceChainId,
    ]);
    getGasBufferMock.mockReturnValue(1.0);
    getSlippageMock.mockReturnValue(DEFAULT_SLIPPAGE);
    getDelegationTransactionMock.mockResolvedValue(DELEGATION_RESULT_MOCK);
    getGasFeeTokensMock.mockResolvedValue([]);
    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
  });

  it('keeps max flow single-phase when native balance is sufficient', async () => {
    successfulFetchMock.mockResolvedValue({
      json: async () => QUOTE_MOCK,
    } as never);

    getTokenBalanceMock.mockReturnValue('1725000000000000');

    const result = await getRelayQuotes({
      messenger,
      requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(successfulFetchMock).toHaveBeenCalledTimes(1);
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
  });

  it('skips two-phase flow when maxGasless.enabled is false', async () => {
    successfulFetchMock.mockResolvedValue({
      json: async () => QUOTE_MOCK,
    } as never);

    getTokenBalanceMock.mockReturnValue('1724999999999999');
    getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          maxGasless: {
            enabled: false,
          },
        },
      },
    });

    await getRelayQuotes({
      messenger,
      requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(successfulFetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns phase-1 quote when no matching gas fee token is available', async () => {
    successfulFetchMock.mockResolvedValue({
      json: async () => QUOTE_MOCK,
    } as never);

    getTokenBalanceMock.mockReturnValue('1724999999999999');
    getGasFeeTokensMock.mockResolvedValue([]);

    const result = await getRelayQuotes({
      messenger,
      requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(successfulFetchMock).toHaveBeenCalledTimes(1);
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
  });

  it('uses configured buffer percentage from feature flags', async () => {
    const phase1Quote = cloneDeep(QUOTE_MOCK);
    const phase2Quote = cloneDeep(QUOTE_MOCK);
    phase2Quote.details.currencyIn.amount = '900000000000000000';

    successfulFetchMock
      .mockResolvedValueOnce({ json: async () => phase1Quote } as never)
      .mockResolvedValueOnce({ json: async () => phase2Quote } as never);

    getTokenBalanceMock.mockReturnValue('1724999999999999');
    getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          maxGasless: {
            enabled: true,
            bufferPercentage: 0.1,
          },
        },
      },
    });

    const result = await getRelayQuotes({
      messenger,
      requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(successfulFetchMock).toHaveBeenCalledTimes(2);
    expect(result[0].original.metamask?.twoPhaseQuoteForMaxAmount).toBe(true);

    // Verify the adjusted amount uses configured 10% buffer
    // gasFeeTokenCost.raw = 2725000000000000
    // bufferedGasCost = 2725000000000000 * 1.1 = 2997500000000000
    // adjustedAmount = 1000000000000000000 - 2997500000000000 = 997002500000000000
    const phase2Body = JSON.parse(
      successfulFetchMock.mock.calls[1][1]?.body as string,
    );
    expect(phase2Body.amount).toBe('997002500000000000');
  });

  it('returns phase-1 quote when adjusted amount is not viable', async () => {
    const phase1Quote = cloneDeep(QUOTE_MOCK);

    successfulFetchMock.mockResolvedValue({
      json: async () => phase1Quote,
    } as never);

    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '1000',
      human: '1000',
      raw: '1000000000000000000',
      usd: '1000',
    });

    getTokenBalanceMock.mockReturnValue('1724999999999999');
    getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

    const result = await getRelayQuotes({
      messenger,
      requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(successfulFetchMock).toHaveBeenCalledTimes(1);
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
  });

  it('proceeds to phase-2 when adjusted amount is viable', async () => {
    const phase1Quote = cloneDeep(QUOTE_MOCK);
    const phase2Quote = cloneDeep(QUOTE_MOCK);
    phase2Quote.details.currencyIn.amount = '900000000000000000';

    successfulFetchMock
      .mockResolvedValueOnce({ json: async () => phase1Quote } as never)
      .mockResolvedValueOnce({ json: async () => phase2Quote } as never);

    getTokenBalanceMock.mockReturnValue('1724999999999999');
    getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          maxGasless: {
            enabled: true,
            bufferPercentage: 0.15,
          },
        },
      },
    });

    const result = await getRelayQuotes({
      messenger,
      requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(successfulFetchMock).toHaveBeenCalledTimes(2);
    expect(result[0].original.metamask?.twoPhaseQuoteForMaxAmount).toBe(true);
  });

  it('falls back to phase-1 quote when phase-2 request fails', async () => {
    const phase1Quote = cloneDeep(QUOTE_MOCK);

    successfulFetchMock
      .mockResolvedValueOnce({ json: async () => phase1Quote } as never)
      .mockRejectedValueOnce(new Error('phase-2 failed'));

    getTokenBalanceMock.mockReturnValue('1724999999999999');
    getGasFeeTokensMock.mockResolvedValue([GAS_FEE_TOKEN_MOCK]);

    const result = await getRelayQuotes({
      messenger,
      requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(successfulFetchMock).toHaveBeenCalledTimes(2);
    expect(
      result[0].original.metamask?.twoPhaseQuoteForMaxAmount,
    ).toBeUndefined();
    expect(result[0].sourceAmount.raw).toBe(
      QUOTE_MOCK.details.currencyIn.amount,
    );
  });

  it('converts native gas cost to source token units via USD when gas fee token not available', async () => {
    const phase1Quote = cloneDeep(QUOTE_MOCK);
    const phase2Quote = cloneDeep(QUOTE_MOCK);
    phase2Quote.details.currencyIn.amount = '900000000';

    successfulFetchMock
      .mockResolvedValueOnce({ json: async () => phase1Quote } as never)
      .mockResolvedValueOnce({ json: async () => phase2Quote } as never);

    // No gas fee token available (simulates max-send spending all source tokens)
    getTokenBalanceMock.mockReturnValue('0');
    getGasFeeTokensMock.mockResolvedValue([]);

    // Native gas cost in ETH: usd = '3.45'
    calculateGasCostMock.mockReturnValue({
      fiat: '4.56',
      human: '1.725',
      raw: '1725000000000000',
      usd: '3.45',
    });

    // Source token is USDC: $1 per unit, 6 decimals
    getTokenFiatRateMock.mockReturnValue({
      usdRate: '1.0',
      fiatRate: '1.0',
    });
    getTokenInfoMock.mockReturnValue({ decimals: 6, symbol: 'USDC' });

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay: {
          maxGasless: {
            enabled: true,
            bufferPercentage: 0.15,
          },
        },
      },
    });

    const result = await getRelayQuotes({
      messenger,
      requests: [
        {
          ...QUOTE_REQUEST_MOCK,
          isMaxAmount: true,
          sourceTokenAmount: '1000000000',
        },
      ],
      transaction: TRANSACTION_META_MOCK,
    });

    expect(successfulFetchMock).toHaveBeenCalledTimes(2);
    expect(result[0].original.metamask?.twoPhaseQuoteForMaxAmount).toBe(true);

    // Gas cost USD = $3.45, source token rate = $1/USDC, decimals = 6
    // gasCostInSourceRaw = (3.45 / 1.0) * 10^6 = 3450000
    // bufferedGasCost = 3450000 * 1.15 = 3967500
    // adjustedAmount = 1000000000 - 3967500 = 996032500
    const phase2Body = JSON.parse(
      successfulFetchMock.mock.calls[1][1]?.body as string,
    );
    expect(phase2Body.amount).toBe('996032500');
  });
});
