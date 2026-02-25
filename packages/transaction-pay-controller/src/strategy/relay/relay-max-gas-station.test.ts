import type {
  GasFeeToken,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getRelayMaxGasStationQuote } from './relay-max-gas-station';
import type { RelayQuote } from './types';
import { TransactionPayStrategy } from '../..';
import { getDefaultRemoteFeatureFlagControllerState } from '../../../../remote-feature-flag-controller/src/remote-feature-flag-controller';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  Amount,
  FiatValue,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types';
import { calculateGasFeeTokenCost } from '../../utils/gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenInfo,
} from '../../utils/token';

jest.mock('../../utils/token');
jest.mock('../../utils/gas');

const TRANSACTION_META_MOCK = { txParams: {} } as TransactionMeta;
const FROM_MOCK = '0x1234567890123456789012345678901234567891' as Hex;

const BASE_REQUEST: QuoteRequest = {
  from: FROM_MOCK,
  sourceBalanceRaw: '10000000000000000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc',
  sourceTokenAmount: '1000',
  targetAmountMinimum: '123',
  targetChainId: '0x2',
  targetTokenAddress: '0x1234567890123456789012345678901234567890',
  isMaxAmount: true,
};

const STEP_DATA = {
  data: '0x123' as Hex,
  from: FROM_MOCK,
  to: '0x2' as Hex,
  value: '0x0' as Hex,
};

const MATCHING_GAS_FEE_TOKEN: GasFeeToken = {
  amount: '0x12c',
  balance: '0x0',
  decimals: 6,
  gas: '0x64',
  maxFeePerGas: '0x1',
  maxPriorityFeePerGas: '0x1',
  rateWei: '0x1',
  recipient: FROM_MOCK,
  symbol: 'USDC',
  tokenAddress: BASE_REQUEST.sourceTokenAddress,
};

const NON_MATCHING_GAS_FEE_TOKEN: GasFeeToken = {
  ...MATCHING_GAS_FEE_TOKEN,
  tokenAddress: '0xdef' as Hex,
};

function makeFiatValue(value = '0'): FiatValue {
  return {
    fiat: value,
    usd: value,
  };
}

function makeAmount(raw = '0'): Amount {
  return {
    ...makeFiatValue(),
    human: raw,
    raw,
  };
}

function makeRelayQuoteOriginal({
  gasLimits = [21000],
  steps,
}: {
  gasLimits?: number[];
  steps?: RelayQuote['steps'];
} = {}): RelayQuote {
  return {
    metamask: {
      gasLimits,
    },
    steps: steps ?? [
      {
        id: 'swap',
        items: [
          {
            data: STEP_DATA,
          },
        ],
        kind: 'transaction',
      },
    ],
  } as RelayQuote;
}

function makeQuote({
  isSourceGasFeeToken = false,
  sourceAmountRaw = '1000',
  sourceNetworkGasRaw = '100',
  gasLimits,
  steps,
}: {
  isSourceGasFeeToken?: boolean;
  sourceAmountRaw?: string;
  sourceNetworkGasRaw?: string;
  gasLimits?: number[];
  steps?: RelayQuote['steps'];
} = {}): TransactionPayQuote<RelayQuote> {
  return {
    dust: makeFiatValue(),
    estimatedDuration: 300,
    fees: {
      isSourceGasFeeToken,
      provider: makeFiatValue(),
      sourceNetwork: {
        estimate: makeAmount(sourceNetworkGasRaw),
        max: makeAmount(sourceNetworkGasRaw),
      },
      targetNetwork: makeFiatValue(),
    },
    original: makeRelayQuoteOriginal({ gasLimits, steps }),
    request: BASE_REQUEST,
    sourceAmount: makeAmount(sourceAmountRaw),
    strategy: TransactionPayStrategy.Relay,
    targetAmount: makeFiatValue(),
  };
}

function makeFullRequest(
  messenger: PayStrategyGetQuotesRequest['messenger'],
  request: QuoteRequest,
): PayStrategyGetQuotesRequest {
  return {
    messenger,
    requests: [request],
    transaction: TRANSACTION_META_MOCK,
  };
}

describe('relay-max-gas-station', () => {
  const calculateGasFeeTokenCostMock = jest.mocked(calculateGasFeeTokenCost);
  const getNativeTokenMock = jest.mocked(getNativeToken);
  const getTokenBalanceMock = jest.mocked(getTokenBalance);
  const getTokenInfoMock = jest.mocked(getTokenInfo);

  const {
    messenger,
    getGasFeeTokensMock,
    getRemoteFeatureFlagControllerStateMock,
  } = getMessengerMock();

  beforeEach(() => {
    jest.resetAllMocks();

    getNativeTokenMock.mockReturnValue(
      '0x0000000000000000000000000000000000000000' as Hex,
    );
    getTokenBalanceMock.mockReturnValue('0');
    getTokenInfoMock.mockReturnValue({ decimals: 6, symbol: 'USDC' });
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    getGasFeeTokensMock.mockResolvedValue([]);

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_eip_7702: {
          supportedChains: [BASE_REQUEST.sourceChainId],
        },
      },
    });
  });

  it('returns phase-1 quote when native balance is sufficient', async () => {
    const phase1Quote = makeQuote({ sourceNetworkGasRaw: '100' });
    const getSingleQuote = jest.fn().mockResolvedValue(phase1Quote);
    getTokenBalanceMock.mockReturnValue('100');

    const request = { ...BASE_REQUEST };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(1);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when source chain is not gas-station eligible', async () => {
    const phase1Quote = makeQuote();
    const getSingleQuote = jest.fn().mockResolvedValue(phase1Quote);

    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_eip_7702: {
          supportedChains: [],
        },
      },
    });

    const request = { ...BASE_REQUEST };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(1);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when phase-1 has no executable step params', async () => {
    const phase1Quote = makeQuote({
      steps: [
        {
          id: 'swap',
          items: [],
          kind: 'transaction',
          requestId: 'request-id',
        },
      ] as unknown as RelayQuote['steps'],
    });
    const getSingleQuote = jest.fn().mockResolvedValue(phase1Quote);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(1);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when gas fee token estimation throws', async () => {
    const phase1Quote = makeQuote();
    const getSingleQuote = jest.fn().mockResolvedValue(phase1Quote);

    getGasFeeTokensMock.mockRejectedValueOnce(new Error('estimation failure'));

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(1);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when source token is missing in gas fee token response', async () => {
    const phase1Quote = makeQuote();
    const getSingleQuote = jest.fn().mockResolvedValue(phase1Quote);

    getGasFeeTokensMock.mockResolvedValue([NON_MATCHING_GAS_FEE_TOKEN]);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(1);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when gas fee token cost cannot be calculated', async () => {
    const phase1Quote = makeQuote();
    const getSingleQuote = jest.fn().mockResolvedValue(phase1Quote);

    getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);
    calculateGasFeeTokenCostMock.mockReturnValue(undefined);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(1);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-2 quote when gas-station estimation and validation are affordable', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '1000' });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      sourceAmountRaw: '900',
      sourceNetworkGasRaw: '100',
    });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);
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

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(getSingleQuote).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sourceTokenAmount: '900' }),
      expect.any(Object),
    );
    expect(result.original.metamask.isMaxGasStation).toBe(true);
  });

  it('uses aggregated gas limits for multi-item quotes when normalizing gas-fee-token amount', async () => {
    const phase1Quote = makeQuote({
      sourceAmountRaw: '500',
      gasLimits: [100, 200],
      steps: [
        {
          id: 'swap',
          items: [{ data: STEP_DATA }, { data: STEP_DATA }],
          kind: 'transaction',
          requestId: 'request-id',
        },
      ] as unknown as RelayQuote['steps'],
    });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      gasLimits: [100, 200],
      sourceAmountRaw: '200',
      sourceNetworkGasRaw: '300',
    });

    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValue([
      {
        ...MATCHING_GAS_FEE_TOKEN,
        amount: '0x64',
        gas: '0x64',
      },
    ]);

    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '300',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '500' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(calculateGasFeeTokenCostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gasFeeToken: expect.objectContaining({ amount: '0x12c' }),
      }),
    );
    expect(result.original.metamask.isMaxGasStation).toBe(true);
  });

  it('handles missing tx value and missing gas limits in multi-item gas-station estimation', async () => {
    const phase1Quote = makeQuote({
      sourceAmountRaw: '1000',
      steps: [
        {
          id: 'swap',
          items: [
            {
              data: {
                ...STEP_DATA,
                value: undefined,
              },
            },
            {
              data: STEP_DATA,
            },
          ],
          kind: 'transaction',
          requestId: 'request-id',
        },
      ] as unknown as RelayQuote['steps'],
    });
    phase1Quote.original.metamask = {} as RelayQuote['metamask'];

    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      gasLimits: [],
      sourceAmountRaw: '900',
      sourceNetworkGasRaw: '100',
    });

    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValue([
      {
        ...MATCHING_GAS_FEE_TOKEN,
        amount: '0x64',
        gas: '0x64',
      },
    ]);

    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getGasFeeTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({ value: '0x0' }),
    );
    expect(result.original.metamask.isMaxGasStation).toBe(true);
  });

  it('handles decimal gas fee token fields from simulation responses', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '1000' });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      sourceAmountRaw: '700',
      sourceNetworkGasRaw: '300',
    });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValue([
      {
        ...MATCHING_GAS_FEE_TOKEN,
        amount: '300' as Hex,
        gas: '100' as Hex,
      },
    ]);

    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '300',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sourceTokenAmount: '700' }),
      expect.any(Object),
    );
    expect(result.original.metamask.isMaxGasStation).toBe(true);
  });

  it('returns phase-1 quote when adjusted source amount is zero or negative', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '1000' });
    const getSingleQuote = jest.fn().mockResolvedValue(phase1Quote);

    getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '1000',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(1);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when adjusted phase-2 quote request throws', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '1000' });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockRejectedValueOnce(new Error('phase2 failed'));

    getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when phase-2 quote is not source-gas-fee-token', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '1000' });
    const phase2Quote = makeQuote({ sourceAmountRaw: '900' });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValueOnce([MATCHING_GAS_FEE_TOKEN]);
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when phase-2 gas limits differ from phase-1', async () => {
    const phase1Quote = makeQuote({
      sourceAmountRaw: '1000',
      gasLimits: [21000],
    });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      gasLimits: [22000],
      sourceAmountRaw: '900',
      sourceNetworkGasRaw: '100',
    });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValueOnce([MATCHING_GAS_FEE_TOKEN]);
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-2 quote when phase-2 gas limits differ but total gas is lower', async () => {
    const phase1Quote = makeQuote({
      sourceAmountRaw: '1000',
      gasLimits: [10000, 20000],
    });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      gasLimits: [9000, 19000],
      sourceAmountRaw: '900',
      sourceNetworkGasRaw: '100',
    });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValueOnce([MATCHING_GAS_FEE_TOKEN]);
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase2Quote);
    expect(result.original.metamask.isMaxGasStation).toBe(true);
  });

  it('returns phase-1 quote when phase-2 gas limits are missing', async () => {
    const phase1Quote = makeQuote({
      sourceAmountRaw: '1000',
      gasLimits: [21000],
    });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      sourceAmountRaw: '900',
      sourceNetworkGasRaw: '100',
    });
    phase2Quote.original.metamask = {} as RelayQuote['metamask'];

    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValueOnce([MATCHING_GAS_FEE_TOKEN]);
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when phase-2 gas limit array length differs', async () => {
    const phase1Quote = makeQuote({
      sourceAmountRaw: '1000',
      gasLimits: [21000, 30000],
    });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      gasLimits: [21000],
      sourceAmountRaw: '900',
      sourceNetworkGasRaw: '100',
    });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValueOnce([MATCHING_GAS_FEE_TOKEN]);
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when adjusted amount is not affordable after validation', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '1000' });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      sourceAmountRaw: '900',
      sourceNetworkGasRaw: '200',
    });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValue([MATCHING_GAS_FEE_TOKEN]);
    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase1Quote);
  });

  it('handles phase-1 quotes where source gas fee token is already selected', async () => {
    const phase1Quote = makeQuote({
      isSourceGasFeeToken: true,
      sourceAmountRaw: '1000',
      sourceNetworkGasRaw: '100',
    });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      sourceAmountRaw: '900',
      sourceNetworkGasRaw: '100',
    });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(phase2Quote);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '1000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(getGasFeeTokensMock).not.toHaveBeenCalled();
    expect(result.original.metamask.isMaxGasStation).toBe(true);
  });

  it('uses probe quote source-network cost when probe already uses source gas fee token', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '100000' });
    const probeQuote = makeQuote({
      isSourceGasFeeToken: true,
      sourceAmountRaw: '25000',
      sourceNetworkGasRaw: '100',
    });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      sourceAmountRaw: '99900',
      sourceNetworkGasRaw: '100',
    });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(probeQuote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock.mockResolvedValue([]);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '100000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(3);
    expect(result.original.metamask.isMaxGasStation).toBe(true);
  });

  it('returns phase-1 quote when probe quote request fails', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '100000' });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockRejectedValueOnce(new Error('probe quote failed'));

    getGasFeeTokensMock.mockResolvedValue([]);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '100000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when probe quote is unexpectedly undefined', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '100000' });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(
        undefined as unknown as TransactionPayQuote<RelayQuote>,
      );

    getGasFeeTokensMock.mockResolvedValue([]);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '100000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when probe quote has no executable step params', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '100000' });
    const probeQuote = makeQuote({
      isSourceGasFeeToken: false,
      sourceAmountRaw: '25000',
      steps: [
        {
          id: 'swap',
          items: [],
          kind: 'transaction',
          requestId: 'request-id',
        },
      ] as unknown as RelayQuote['steps'],
    });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(probeQuote);

    getGasFeeTokensMock.mockResolvedValue([]);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '100000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when probe gas-station estimation has no source token cost', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '100000' });
    const probeQuote = makeQuote({
      isSourceGasFeeToken: false,
      sourceAmountRaw: '25000',
    });
    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(probeQuote);

    getGasFeeTokensMock.mockResolvedValue([]);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '100000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(2);
    expect(result).toBe(phase1Quote);
  });

  it('uses probe estimation when probe quote has missing gas limits', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '100000' });
    const probeQuote = makeQuote({
      isSourceGasFeeToken: false,
      sourceAmountRaw: '25000',
    });
    probeQuote.original.metamask = {} as RelayQuote['metamask'];

    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      sourceAmountRaw: '99900',
      sourceNetworkGasRaw: '100',
    });

    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(probeQuote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([MATCHING_GAS_FEE_TOKEN]);

    calculateGasFeeTokenCostMock.mockReturnValue({
      fiat: '0',
      human: '0',
      raw: '100',
      usd: '0',
    });

    const request = { ...BASE_REQUEST, sourceTokenAmount: '100000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(3);
    expect(result.original.metamask.isMaxGasStation).toBe(true);
  });

  it('uses probe quote gas-station estimation when probe does not use source gas fee token directly', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '100000' });
    const probeQuote = makeQuote({
      isSourceGasFeeToken: false,
      sourceAmountRaw: '25000',
    });
    const phase2Quote = makeQuote({
      isSourceGasFeeToken: true,
      sourceAmountRaw: '99900',
      sourceNetworkGasRaw: '100',
    });

    const getSingleQuote = jest
      .fn()
      .mockResolvedValueOnce(phase1Quote)
      .mockResolvedValueOnce(probeQuote)
      .mockResolvedValueOnce(phase2Quote);

    getGasFeeTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([MATCHING_GAS_FEE_TOKEN])
      .mockResolvedValueOnce([MATCHING_GAS_FEE_TOKEN]);

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

    const request = { ...BASE_REQUEST, sourceTokenAmount: '100000' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(3);
    expect(result.original.metamask.isMaxGasStation).toBe(true);
  });

  it('returns phase-1 quote when source amount is zero', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '0' });
    const getSingleQuote = jest.fn().mockResolvedValue(phase1Quote);

    getGasFeeTokensMock.mockResolvedValue([]);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '0' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(1);
    expect(result).toBe(phase1Quote);
  });

  it('returns phase-1 quote when probe amount rounds down to zero', async () => {
    const phase1Quote = makeQuote({ sourceAmountRaw: '0.1' });
    const getSingleQuote = jest.fn().mockResolvedValue(phase1Quote);

    getGasFeeTokensMock.mockResolvedValue([]);

    const request = { ...BASE_REQUEST, sourceTokenAmount: '0.1' };
    const result = await getRelayMaxGasStationQuote(
      request,
      makeFullRequest(messenger, request),
      getSingleQuote,
    );

    expect(getSingleQuote).toHaveBeenCalledTimes(1);
    expect(result).toBe(phase1Quote);
  });
});
