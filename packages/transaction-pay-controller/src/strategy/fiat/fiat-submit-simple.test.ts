import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionPayStrategy } from '../../constants.js';
import type {
  PayStrategyExecuteRequest,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getFiatMaxRateDriftPercent } from '../../utils/feature-flags.js';
import { getRelayQuotes } from '../relay/relay-quotes.js';
import { submitRelayQuotes } from '../relay/relay-submit.js';
import type { RelayQuote } from '../relay/types.js';
import { getServerQuotes } from '../server/server-quotes.js';
import { submitServerQuotes } from '../server/server-submit.js';
import type { ServerQuote } from '../server/types.js';
import { resolveFiatCryptoLeg } from './fiat-crypto-leg.js';
import { submitSimpleCryptoLeg } from './fiat-submit-simple.js';
import type { FiatQuote } from './types.js';

vi.mock(import('../../utils/feature-flags.js'));
vi.mock(import('../relay/relay-quotes.js'));
vi.mock(import('../relay/relay-submit.js'));
vi.mock(import('../server/server-quotes.js'));
vi.mock(import('../server/server-submit.js'));

const TRANSACTION_ID_MOCK = 'tx-id';
const WALLET_ADDRESS_MOCK = '0x1111111111111111111111111111111111111111' as Hex;

const TRANSACTION_MOCK = {
  id: TRANSACTION_ID_MOCK,
  txParams: { from: WALLET_ADDRESS_MOCK },
  type: TransactionType.predictDeposit,
} as TransactionMeta;

const BASE_QUOTE_REQUEST_MOCK: QuoteRequest = {
  from: WALLET_ADDRESS_MOCK,
  sourceBalanceRaw: '1000000000000000000',
  sourceChainId: '0x89',
  sourceTokenAddress: '0x0000000000000000000000000000000000001010',
  sourceTokenAmount: '1000000000000000000',
  targetAmountMinimum: '12000000',
  targetChainId: '0x89',
  targetTokenAddress: '0x2222222222222222222222222222222222222222',
};

const RELAY_QUOTE_MOCK = {
  dust: { fiat: '0', usd: '0' },
  estimatedDuration: 1,
  fees: {
    metaMask: { fiat: '0', usd: '0' },
    provider: { fiat: '0', usd: '0' },
    sourceNetwork: {
      estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
      max: { fiat: '0', human: '0', raw: '0', usd: '0' },
    },
    targetNetwork: { fiat: '0', usd: '0' },
  },
  original: {
    details: {
      currencyIn: { amount: '1000000000000000000', amountUsd: '5.00' },
      currencyOut: {
        amount: '12000000',
        amountUsd: '4.85',
        minimumAmount: '11900000',
      },
    },
  } as unknown as RelayQuote,
  request: BASE_QUOTE_REQUEST_MOCK,
  sourceAmount: { fiat: '0', human: '0', raw: '0', usd: '0' },
  strategy: TransactionPayStrategy.Relay,
  targetAmount: { fiat: '0', usd: '0' },
} as TransactionPayQuote<RelayQuote>;

function buildFiatQuote(): TransactionPayQuote<FiatQuote> {
  return {
    ...RELAY_QUOTE_MOCK,
    original: {
      rampsQuote: {} as never,
      relayQuote: RELAY_QUOTE_MOCK.original,
    },
    strategy: TransactionPayStrategy.Fiat,
  };
}

function buildServerQuote({
  sourceUsd = '5.00',
  targetUsd = '4.85',
}: {
  sourceUsd?: string;
  targetUsd?: string;
} = {}): TransactionPayQuote<ServerQuote> {
  return {
    ...RELAY_QUOTE_MOCK,
    original: {
      id: 'server-quote',
      input: { raw: '1000000000000000000' },
      output: { raw: '12000000' },
    } as ServerQuote,
    sourceAmount: { fiat: '0', human: '0', raw: '0', usd: sourceUsd },
    strategy: TransactionPayStrategy.Server,
    targetAmount: { fiat: '0', usd: targetUsd },
  };
}

function buildServerFiatQuote(): TransactionPayQuote<FiatQuote> {
  const serverQuote = buildServerQuote();

  return {
    ...serverQuote,
    original: {
      rampsQuote: {} as never,
      serverQuote: serverQuote.original,
    },
    strategy: TransactionPayStrategy.Fiat,
  };
}

function buildRequest(
  overrides?: Partial<PayStrategyExecuteRequest<FiatQuote>>,
): PayStrategyExecuteRequest<FiatQuote> {
  return {
    accountSupports7702: false,
    isSmartTransaction: () => false,
    messenger: { call: vi.fn() } as never,
    quotes: [buildFiatQuote()],
    transaction: TRANSACTION_MOCK,
    ...overrides,
  };
}

async function submitSimple(
  options: Omit<
    Parameters<typeof submitSimpleCryptoLeg>[0],
    'leg' | 'originalQuote'
  >,
): ReturnType<typeof submitSimpleCryptoLeg> {
  return await submitSimpleCryptoLeg({
    ...options,
    ...resolveFiatCryptoLeg(options.request.quotes[0]),
  });
}

describe('submitSimpleCryptoLeg', () => {
  const getRelayQuotesMock = vi.mocked(getRelayQuotes);
  const submitRelayQuotesMock = vi.mocked(submitRelayQuotes);
  const getFiatMaxRateDriftPercentMock = vi.mocked(getFiatMaxRateDriftPercent);

  beforeEach(() => {
    vi.resetAllMocks();
    getRelayQuotesMock.mockResolvedValue([RELAY_QUOTE_MOCK]);
    submitRelayQuotesMock.mockResolvedValue({ transactionHash: '0xabc' });
    getFiatMaxRateDriftPercentMock.mockReturnValue(10);
  });

  it('builds an EXACT_INPUT relay request with the full settled amount', async () => {
    const req = buildRequest();

    await submitSimple({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request: req,
      sourceAmountRaw: '5000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(getRelayQuotesMock).toHaveBeenCalledTimes(1);
    expect(getRelayQuotesMock.mock.calls[0][0].requests).toStrictEqual([
      expect.objectContaining({
        isMaxAmount: false,
        isPostQuote: true,
        skipProcessTransactions: false,
        sourceBalanceRaw: '5000000000000000000',
        sourceTokenAmount: '5000000000000000000',
      }),
    ]);
  });

  it('submits relay quotes after rate drift validation', async () => {
    const req = buildRequest();

    const result = await submitSimple({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request: req,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(submitRelayQuotesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quotes: [RELAY_QUOTE_MOCK],
        transaction: TRANSACTION_MOCK,
      }),
    );
    expect(result).toStrictEqual({ transactionHash: '0xabc' });
  });

  it('throws when relay returns no quotes', async () => {
    getRelayQuotesMock.mockResolvedValue([]);
    const req = buildRequest();

    await expect(
      submitSimple({
        baseRequest: BASE_QUOTE_REQUEST_MOCK,
        request: req,
        sourceAmountRaw: '1000000000000000000',
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('No relay quotes returned for completed fiat order');
  });

  it('throws when the original fiat quote is missing a relay quote', async () => {
    const fiatQuote = buildFiatQuote();
    fiatQuote.original.relayQuote = undefined;
    const req = buildRequest({ quotes: [fiatQuote] });

    await expect(
      submitSimple({
        baseRequest: BASE_QUOTE_REQUEST_MOCK,
        request: req,
        sourceAmountRaw: '1000000000000000000',
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('Missing Relay quote');
  });

  it('throws when rate drift exceeds configured threshold', async () => {
    getFiatMaxRateDriftPercentMock.mockReturnValue(5);
    getRelayQuotesMock.mockResolvedValue([
      {
        ...RELAY_QUOTE_MOCK,
        original: {
          details: {
            currencyIn: { amount: '1000000000000000000', amountUsd: '5.00' },
            currencyOut: {
              amount: '10000000',
              amountUsd: '2.00',
              minimumAmount: '9800000',
            },
          },
        } as unknown as RelayQuote,
      },
    ]);

    const req = buildRequest();

    await expect(
      submitSimple({
        baseRequest: BASE_QUOTE_REQUEST_MOCK,
        request: req,
        sourceAmountRaw: '1000000000000000000',
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow(/Relay rate drift too high/u);
  });

  it('passes rate drift when discovery rate is better than original', async () => {
    getRelayQuotesMock.mockResolvedValue([
      {
        ...RELAY_QUOTE_MOCK,
        original: {
          details: {
            currencyIn: { amount: '1000000000000000000', amountUsd: '5.00' },
            currencyOut: {
              amount: '14000000',
              amountUsd: '6.00',
              minimumAmount: '13800000',
            },
          },
        } as unknown as RelayQuote,
      },
    ]);

    const req = buildRequest();

    const result = await submitSimple({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request: req,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(result).toStrictEqual({ transactionHash: '0xabc' });
  });

  it('skips rate drift check when original relay amounts are zero', async () => {
    const fiatQuote = buildFiatQuote();
    fiatQuote.original.relayQuote = {
      details: {
        currencyIn: { amount: '0', amountUsd: '0' },
        currencyOut: { amount: '0', amountUsd: '0', minimumAmount: '0' },
      },
    } as unknown as RelayQuote;

    const req = buildRequest({ quotes: [fiatQuote] });

    const result = await submitSimple({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request: req,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(result).toStrictEqual({ transactionHash: '0xabc' });
  });

  it('reads maxRateDriftPercent from feature flags', async () => {
    getFiatMaxRateDriftPercentMock.mockReturnValue(25);
    const req = buildRequest();

    await submitSimple({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request: req,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(getFiatMaxRateDriftPercentMock).toHaveBeenCalledWith(req.messenger);
  });

  describe('with server crypto leg', () => {
    const getServerQuotesMock = vi.mocked(getServerQuotes);
    const submitServerQuotesMock = vi.mocked(submitServerQuotes);

    beforeEach(() => {
      getServerQuotesMock.mockResolvedValue([buildServerQuote()]);
      submitServerQuotesMock.mockResolvedValue({ transactionHash: '0xdef' });
    });

    it('submits server quotes if the fiat quote has a server quote', async () => {
      const serverQuote = buildServerQuote();
      getServerQuotesMock.mockResolvedValue([serverQuote]);

      const req = buildRequest({ quotes: [buildServerFiatQuote()] });

      const result = await submitSimple({
        baseRequest: BASE_QUOTE_REQUEST_MOCK,
        request: req,
        sourceAmountRaw: '1000000000000000000',
        transaction: TRANSACTION_MOCK,
      });

      expect(getRelayQuotesMock).not.toHaveBeenCalled();
      expect(submitRelayQuotesMock).not.toHaveBeenCalled();
      expect(getServerQuotesMock.mock.calls[0][0].requests).toStrictEqual([
        expect.objectContaining({
          isPostQuote: true,
          sourceTokenAmount: '1000000000000000000',
        }),
      ]);
      expect(submitServerQuotesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          quotes: [serverQuote],
          transaction: TRANSACTION_MOCK,
        }),
      );
      expect(result).toStrictEqual({ transactionHash: '0xdef' });
    });

    it('throws when server returns no quotes', async () => {
      getServerQuotesMock.mockResolvedValue([]);
      const req = buildRequest({ quotes: [buildServerFiatQuote()] });

      await expect(
        submitSimple({
          baseRequest: BASE_QUOTE_REQUEST_MOCK,
          request: req,
          sourceAmountRaw: '1000000000000000000',
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('No server quotes returned for completed fiat order');
    });

    it('throws when server rate drift exceeds configured threshold', async () => {
      getFiatMaxRateDriftPercentMock.mockReturnValue(5);
      getServerQuotesMock.mockResolvedValue([
        buildServerQuote({ targetUsd: '2.00' }),
      ]);

      const req = buildRequest({ quotes: [buildServerFiatQuote()] });

      await expect(
        submitSimple({
          baseRequest: BASE_QUOTE_REQUEST_MOCK,
          request: req,
          sourceAmountRaw: '1000000000000000000',
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow(/Server rate drift too high/u);

      expect(submitServerQuotesMock).not.toHaveBeenCalled();
    });
  });
});
