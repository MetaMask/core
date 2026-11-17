import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionPayStrategy } from '../constants.js';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types.js';
import { getGasStationCostBuffer } from './feature-flags.js';
import { resolveGasStationCost, shouldUseGasStation } from './gas-payment.js';
import { getMaxGasStationQuote } from './max-gas-station.js';
import type { MaxGasStationQuoteDetails } from './max-gas-station.js';
import { getTokenInfo } from './token.js';

vi.mock(import('./feature-flags.js'));
vi.mock(import('./gas-payment.js'));
vi.mock(import('./token.js'));

type OriginalQuoteMock = MaxGasStationQuoteDetails;

const MESSENGER_MOCK = {} as TransactionPayControllerMessenger;

const REQUEST_MOCK: QuoteRequest = {
  from: '0x1234567890123456789012345678901234567891',
  isMaxAmount: true,
  sourceBalanceRaw: '100000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0xabc',
  sourceTokenAmount: '100000',
  targetAmountMinimum: '0',
  targetChainId: '0x2',
  targetTokenAddress: '0xdef',
};

const STEP_DATA_MOCK = { data: '0x123' as Hex, to: '0x456' as Hex };

function makeAmount(
  raw: string,
  usd = '0',
): {
  fiat: string;
  human: string;
  raw: string;
  usd: string;
} {
  return { fiat: usd, human: raw, raw, usd };
}

function makeQuote({
  gasCostRaw = '100',
  gasCostUsd = '0',
  gasLimits = [21000],
  isGasless = false,
  isSourceGasFeeToken = false,
  request = REQUEST_MOCK,
  withTransactions = true,
}: {
  gasCostRaw?: string;
  gasCostUsd?: string;
  gasLimits?: number[];
  isGasless?: boolean;
  isSourceGasFeeToken?: boolean;
  request?: QuoteRequest;
  withTransactions?: boolean;
} = {}): TransactionPayQuote<OriginalQuoteMock> {
  return {
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: 0,
    fees: {
      isSourceGasFeeToken,
      metaMask: { fiat: '0', usd: '0' },
      provider: { fiat: '0', usd: '0' },
      sourceNetwork: {
        estimate: makeAmount(gasCostRaw, gasCostUsd),
        max: makeAmount(gasCostRaw, gasCostUsd),
      },
      targetNetwork: { fiat: '0', usd: '0' },
    },
    original: {
      gasLimits,
      gasStationTransactions: withTransactions
        ? { firstStepData: STEP_DATA_MOCK, totalItemCount: 2 }
        : undefined,
      isGasless,
    },
    request,
    sourceAmount: makeAmount(request.sourceTokenAmount),
    strategy: TransactionPayStrategy.Relay,
    targetAmount: { fiat: '0', usd: '0' },
  };
}

describe('getMaxGasStationQuote', () => {
  const getGasStationCostBufferMock = vi.mocked(getGasStationCostBuffer);
  const getTokenInfoMock = vi.mocked(getTokenInfo);
  const resolveGasStationCostMock = vi.mocked(resolveGasStationCost);
  const shouldUseGasStationMock = vi.mocked(shouldUseGasStation);

  beforeEach(() => {
    vi.resetAllMocks();

    getGasStationCostBufferMock.mockReturnValue(1);
    getTokenInfoMock.mockReturnValue({ decimals: 2, symbol: 'USDC' });
    shouldUseGasStationMock.mockReturnValue(true);
  });

  function run(
    quote: TransactionPayQuote<OriginalQuoteMock>,
    requote: (
      request: QuoteRequest,
    ) => Promise<TransactionPayQuote<OriginalQuoteMock>>,
  ): Promise<TransactionPayQuote<OriginalQuoteMock>> {
    return getMaxGasStationQuote({
      getQuoteDetails: ({ original }) => original,
      messenger: MESSENGER_MOCK,
      quote,
      requote,
    });
  }

  it('returns the adjusted quote when the probe and validation succeed', async () => {
    const quote = makeQuote();
    const probeQuote = makeQuote({ isSourceGasFeeToken: true });
    const adjustedQuote = makeQuote({ isSourceGasFeeToken: true });

    const requote = vi
      .fn()
      .mockResolvedValueOnce(probeQuote)
      .mockResolvedValueOnce(adjustedQuote);

    const result = await run(quote, requote);

    expect(result).toStrictEqual(adjustedQuote);
    expect(requote).toHaveBeenNthCalledWith(1, {
      ...REQUEST_MOCK,
      sourceTokenAmount: '25000',
    });
    expect(requote).toHaveBeenNthCalledWith(2, {
      ...REQUEST_MOCK,
      sourceTokenAmount: '99900',
    });
  });

  it('reserves the gas station cost buffer on top of the probe gas cost', async () => {
    getGasStationCostBufferMock.mockReturnValue(1.02);

    const quote = makeQuote();
    const adjustedQuote = makeQuote({
      gasCostRaw: '102',
      isSourceGasFeeToken: true,
    });

    const requote = vi
      .fn()
      .mockResolvedValueOnce(makeQuote({ isSourceGasFeeToken: true }))
      .mockResolvedValueOnce(adjustedQuote);

    expect(await run(quote, requote)).toBe(adjustedQuote);
    expect(getGasStationCostBufferMock).toHaveBeenCalledWith(MESSENGER_MOCK);
    expect(requote).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceTokenAmount: '99898' }),
    );
  });

  it('accepts an adjusted quote with different gas limits', async () => {
    const quote = makeQuote();
    const adjustedQuote = makeQuote({
      gasLimits: [10000, 20000],
      isSourceGasFeeToken: true,
    });

    const requote = vi
      .fn()
      .mockResolvedValueOnce(makeQuote({ isSourceGasFeeToken: true }))
      .mockResolvedValueOnce(adjustedQuote);

    expect(await run(quote, requote)).toBe(adjustedQuote);
  });

  it('returns the original quote when gasless', async () => {
    const quote = makeQuote({ isGasless: true });
    const requote = vi.fn();

    expect(await run(quote, requote)).toBe(quote);
    expect(requote).not.toHaveBeenCalled();
    expect(shouldUseGasStationMock).not.toHaveBeenCalled();
  });

  it('returns the original quote when the gas station is not needed', async () => {
    shouldUseGasStationMock.mockReturnValue(false);

    const quote = makeQuote();
    const requote = vi.fn();

    expect(await run(quote, requote)).toBe(quote);
    expect(shouldUseGasStationMock).toHaveBeenCalledWith({
      messenger: MESSENGER_MOCK,
      nativeGasCostRaw: '100',
      request: REQUEST_MOCK,
    });
    expect(requote).not.toHaveBeenCalled();
  });

  it('skips the native balance check when already priced in the source token', async () => {
    shouldUseGasStationMock.mockReturnValue(false);

    await run(makeQuote({ isSourceGasFeeToken: true }), vi.fn());

    expect(shouldUseGasStationMock).toHaveBeenCalledWith(
      expect.objectContaining({ nativeGasCostRaw: undefined }),
    );
  });

  it('returns the original quote when source token info is missing', async () => {
    getTokenInfoMock.mockReturnValue(undefined);

    const quote = makeQuote();
    const requote = vi.fn();

    expect(await run(quote, requote)).toBe(quote);
    expect(requote).not.toHaveBeenCalled();
  });

  it('returns the original quote when the probe amount equals the source amount', async () => {
    getTokenInfoMock.mockReturnValue({ decimals: 6, symbol: 'USDC' });

    const quote = makeQuote({
      request: { ...REQUEST_MOCK, sourceTokenAmount: '50' },
    });
    const requote = vi.fn();

    expect(await run(quote, requote)).toBe(quote);
    expect(requote).not.toHaveBeenCalled();
  });

  it('returns the original quote when the source amount is zero', async () => {
    const quote = makeQuote({
      request: { ...REQUEST_MOCK, sourceTokenAmount: '0' },
    });
    const requote = vi.fn();

    expect(await run(quote, requote)).toBe(quote);
    expect(requote).not.toHaveBeenCalled();
  });

  it('returns the original quote when the probe fails', async () => {
    const quote = makeQuote();
    const requote = vi.fn().mockRejectedValueOnce(new Error('probe'));

    expect(await run(quote, requote)).toBe(quote);
    expect(requote).toHaveBeenCalledTimes(1);
  });

  it('returns the original quote when the probe amount rounds down to zero', async () => {
    const quote = makeQuote({
      request: { ...REQUEST_MOCK, sourceTokenAmount: '0.5' },
    });
    const requote = vi.fn();

    expect(await run(quote, requote)).toBe(quote);
    expect(requote).not.toHaveBeenCalled();
  });

  it('returns the original quote when the probe is undefined', async () => {
    const quote = makeQuote();
    const requote = vi.fn().mockResolvedValue(undefined);

    expect(await run(quote, requote)).toBe(quote);
    expect(requote).toHaveBeenCalledTimes(1);
  });

  it('prices the probe with the gas station when not already in the source token', async () => {
    resolveGasStationCostMock.mockResolvedValue({
      amount: makeAmount('300'),
      isAvailable: true,
    });

    const quote = makeQuote({ gasLimits: [1000, 2000] });
    const probeQuote = makeQuote({ gasLimits: [1000, 2000] });
    const adjustedQuote = makeQuote({
      gasLimits: [1000, 2000],
      isSourceGasFeeToken: true,
    });

    const requote = vi
      .fn()
      .mockResolvedValueOnce(probeQuote)
      .mockResolvedValueOnce(adjustedQuote);

    expect(await run(quote, requote)).toBe(adjustedQuote);
    expect(resolveGasStationCostMock).toHaveBeenCalledWith({
      firstStepData: STEP_DATA_MOCK,
      messenger: MESSENGER_MOCK,
      request: {
        from: REQUEST_MOCK.from,
        sourceChainId: REQUEST_MOCK.sourceChainId,
        sourceTokenAddress: REQUEST_MOCK.sourceTokenAddress,
      },
      totalGasEstimate: 3000,
      totalItemCount: 2,
    });
    expect(requote).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceTokenAmount: '99700' }),
    );
  });

  it('returns the original quote when the probe has no gas station transactions', async () => {
    const quote = makeQuote();
    const requote = vi
      .fn()
      .mockResolvedValueOnce(makeQuote({ withTransactions: false }));

    expect(await run(quote, requote)).toBe(quote);
    expect(resolveGasStationCostMock).not.toHaveBeenCalled();
  });

  it('returns the original quote when the gas station has no source token cost', async () => {
    resolveGasStationCostMock.mockResolvedValue({ isAvailable: true });

    const quote = makeQuote();
    const requote = vi.fn().mockResolvedValueOnce(makeQuote());

    expect(await run(quote, requote)).toBe(quote);
    expect(requote).toHaveBeenCalledTimes(1);
  });

  it('returns the original quote when gas exceeds the source amount', async () => {
    const quote = makeQuote();
    const requote = vi
      .fn()
      .mockResolvedValueOnce(
        makeQuote({ gasCostRaw: '100000', isSourceGasFeeToken: true }),
      );

    expect(await run(quote, requote)).toBe(quote);
    expect(requote).toHaveBeenCalledTimes(1);
  });

  it('returns the original quote when the adjusted quote fails', async () => {
    const quote = makeQuote();
    const requote = vi
      .fn()
      .mockResolvedValueOnce(makeQuote({ isSourceGasFeeToken: true }))
      .mockRejectedValueOnce(new Error('adjusted'));

    expect(await run(quote, requote)).toBe(quote);
  });

  it('returns the original quote when the adjusted quote is not priced in the source token', async () => {
    const quote = makeQuote();
    const requote = vi
      .fn()
      .mockResolvedValueOnce(makeQuote({ isSourceGasFeeToken: true }))
      .mockResolvedValueOnce(makeQuote({ isSourceGasFeeToken: false }));

    expect(await run(quote, requote)).toBe(quote);
  });

  it('returns the original quote when the adjusted quote is unaffordable', async () => {
    const quote = makeQuote({ gasLimits: [] });

    const requote = vi
      .fn()
      .mockResolvedValueOnce(
        makeQuote({ gasLimits: [], isSourceGasFeeToken: true }),
      )
      .mockResolvedValueOnce(
        makeQuote({
          gasCostRaw: '101',
          gasLimits: [],
          isSourceGasFeeToken: true,
        }),
      );

    expect(await run(quote, requote)).toBe(quote);
  });
});
