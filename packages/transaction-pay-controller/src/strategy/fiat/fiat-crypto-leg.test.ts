import { BigNumber } from 'bignumber.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionPayStrategy } from '../../constants.js';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import { getFiatServerStrategyEnabled } from '../../utils/feature-flags.js';
import { getRelayQuotes } from '../relay/relay-quotes.js';
import { submitRelayQuotes } from '../relay/relay-submit.js';
import type { RelayQuote } from '../relay/types.js';
import { getServerQuotes } from '../server/server-quotes.js';
import { submitServerQuotes } from '../server/server-submit.js';
import type { ServerQuote } from '../server/types.js';
import { getFiatCryptoLeg, resolveFiatCryptoLeg } from './fiat-crypto-leg.js';
import type { FiatQuote } from './types.js';

vi.mock(import('../../utils/feature-flags.js'));
vi.mock(import('../relay/relay-quotes.js'));
vi.mock(import('../relay/relay-submit.js'));
vi.mock(import('../server/server-quotes.js'));
vi.mock(import('../server/server-submit.js'));

const MESSENGER_MOCK = {} as TransactionPayControllerMessenger;

const RELAY_QUOTE_MOCK = {
  details: {
    currencyIn: { amount: '1000000000000000000', amountUsd: '5.00' },
    currencyOut: {
      amount: '12000000',
      amountUsd: '4.85',
      minimumAmount: '11900000',
    },
    totalImpact: { usd: '-0.15' },
  },
} as unknown as RelayQuote;

const SERVER_QUOTE_MOCK = {
  id: 'server-quote',
  input: { raw: '1000000000000000000' },
  output: { raw: '12000000' },
} as ServerQuote;

function buildQuote<Quote>({
  original,
  sourceUsd = '5.00',
  targetUsd = '4.85',
}: {
  original: Quote;
  sourceUsd?: string;
  targetUsd?: string;
}): TransactionPayQuote<Quote> {
  return {
    original,
    sourceAmount: { fiat: '0', human: '0', raw: '0', usd: sourceUsd },
    strategy: TransactionPayStrategy.Fiat,
    targetAmount: { fiat: '0', usd: targetUsd },
  } as TransactionPayQuote<Quote>;
}

function buildFiatQuote(
  original: Partial<FiatQuote>,
): TransactionPayQuote<FiatQuote> {
  return buildQuote<FiatQuote>({
    original: { rampsQuote: {} as never, ...original },
  });
}

describe('fiat crypto leg', () => {
  const getFiatServerStrategyEnabledMock = vi.mocked(
    getFiatServerStrategyEnabled,
  );
  const getRelayQuotesMock = vi.mocked(getRelayQuotes);
  const submitRelayQuotesMock = vi.mocked(submitRelayQuotes);
  const getServerQuotesMock = vi.mocked(getServerQuotes);
  const submitServerQuotesMock = vi.mocked(submitServerQuotes);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getFiatCryptoLeg', () => {
    it('returns relay leg if server strategy is disabled', () => {
      getFiatServerStrategyEnabledMock.mockReturnValue(false);

      expect(getFiatCryptoLeg(MESSENGER_MOCK).name).toBe('Relay');
      expect(getFiatServerStrategyEnabledMock).toHaveBeenCalledWith(
        MESSENGER_MOCK,
      );
    });

    it('returns server leg if server strategy is enabled', () => {
      getFiatServerStrategyEnabledMock.mockReturnValue(true);

      expect(getFiatCryptoLeg(MESSENGER_MOCK).name).toBe('Server');
    });
  });

  describe('resolveFiatCryptoLeg', () => {
    it('returns relay leg if fiat quote has relay quote', () => {
      const fiatQuote = buildFiatQuote({ relayQuote: RELAY_QUOTE_MOCK });

      const { leg, originalQuote } = resolveFiatCryptoLeg(fiatQuote);

      expect(leg.name).toBe('Relay');
      expect(originalQuote).toStrictEqual({
        ...fiatQuote,
        original: RELAY_QUOTE_MOCK,
      });
    });

    it('returns server leg if fiat quote has server quote', () => {
      const fiatQuote = buildFiatQuote({ serverQuote: SERVER_QUOTE_MOCK });

      const { leg, originalQuote } = resolveFiatCryptoLeg(fiatQuote);

      expect(leg.name).toBe('Server');
      expect(originalQuote).toStrictEqual({
        ...fiatQuote,
        original: SERVER_QUOTE_MOCK,
      });
    });

    it('throws if fiat quote has no crypto leg quote', () => {
      expect(() => resolveFiatCryptoLeg(buildFiatQuote({}))).toThrow(
        'Missing Relay quote',
      );
    });
  });

  describe('relay leg', () => {
    const { leg } = resolveFiatCryptoLeg(
      buildFiatQuote({ relayQuote: RELAY_QUOTE_MOCK }),
    );

    it('returns amounts from relay details', () => {
      expect(
        leg.getAmounts(buildQuote({ original: RELAY_QUOTE_MOCK })),
      ).toStrictEqual({
        sourceRaw: new BigNumber('1000000000000000000'),
        sourceUsd: new BigNumber('5.00'),
        targetMinimumRaw: new BigNumber('11900000'),
        targetUsd: new BigNumber('4.85'),
      });
    });

    it('returns fee from negative total impact', () => {
      expect(
        leg.getFeeUsd(buildQuote({ original: RELAY_QUOTE_MOCK })).toString(10),
      ).toBe('0.15');
    });

    it('returns zero fee if total impact is positive', () => {
      const original = {
        details: { ...RELAY_QUOTE_MOCK.details, totalImpact: { usd: '0.15' } },
      } as RelayQuote;

      expect(leg.getFeeUsd(buildQuote({ original })).toString(10)).toBe('0');
    });

    it('stores relay quote on fiat quote', () => {
      expect(leg.toFiatOriginal(RELAY_QUOTE_MOCK)).toStrictEqual({
        relayQuote: RELAY_QUOTE_MOCK,
      });
    });

    it('delegates to relay strategy', async () => {
      const quotesRequest = {} as PayStrategyGetQuotesRequest;
      const executeRequest = {} as PayStrategyExecuteRequest<RelayQuote>;

      getRelayQuotesMock.mockResolvedValue([]);
      submitRelayQuotesMock.mockResolvedValue({ transactionHash: '0x1' });

      expect(await leg.getQuotes(quotesRequest)).toStrictEqual([]);
      expect(await leg.submit(executeRequest)).toStrictEqual({
        transactionHash: '0x1',
      });

      expect(getRelayQuotesMock).toHaveBeenCalledWith(quotesRequest);
      expect(submitRelayQuotesMock).toHaveBeenCalledWith(executeRequest);
      expect(getServerQuotesMock).not.toHaveBeenCalled();
      expect(submitServerQuotesMock).not.toHaveBeenCalled();
    });
  });

  describe('server leg', () => {
    const { leg } = resolveFiatCryptoLeg(
      buildFiatQuote({ serverQuote: SERVER_QUOTE_MOCK }),
    );

    it('returns amounts from normalized quote and server amounts', () => {
      expect(
        leg.getAmounts(buildQuote({ original: SERVER_QUOTE_MOCK })),
      ).toStrictEqual({
        sourceRaw: new BigNumber('1000000000000000000'),
        sourceUsd: new BigNumber('5.00'),
        targetMinimumRaw: new BigNumber('12000000'),
        targetUsd: new BigNumber('4.85'),
      });
    });

    it('returns fee as difference between source and target USD', () => {
      expect(
        leg.getFeeUsd(buildQuote({ original: SERVER_QUOTE_MOCK })).toString(10),
      ).toBe('0.15');
    });

    it('returns zero fee if target USD exceeds source USD', () => {
      expect(
        leg
          .getFeeUsd(
            buildQuote({
              original: SERVER_QUOTE_MOCK,
              sourceUsd: '4.85',
              targetUsd: '5.00',
            }),
          )
          .toString(10),
      ).toBe('0');
    });

    it('stores server quote on fiat quote', () => {
      expect(leg.toFiatOriginal(SERVER_QUOTE_MOCK)).toStrictEqual({
        serverQuote: SERVER_QUOTE_MOCK,
      });
    });

    it('delegates to server strategy', async () => {
      const quotesRequest = {} as PayStrategyGetQuotesRequest;
      const executeRequest = {} as PayStrategyExecuteRequest<ServerQuote>;

      getServerQuotesMock.mockResolvedValue([]);
      submitServerQuotesMock.mockResolvedValue({ transactionHash: '0x2' });

      expect(await leg.getQuotes(quotesRequest)).toStrictEqual([]);
      expect(await leg.submit(executeRequest)).toStrictEqual({
        transactionHash: '0x2',
      });

      expect(getServerQuotesMock).toHaveBeenCalledWith(quotesRequest);
      expect(submitServerQuotesMock).toHaveBeenCalledWith(executeRequest);
      expect(getRelayQuotesMock).not.toHaveBeenCalled();
      expect(submitRelayQuotesMock).not.toHaveBeenCalled();
    });
  });
});
