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
import { getServerQuotes } from '../server/server-quotes.js';
import { submitServerQuotes } from '../server/server-submit.js';
import type { ServerQuote } from '../server/types.js';
import { submitSimpleRelay } from './fiat-submit-simple.js';
import type { FiatQuote } from './types.js';

vi.mock(import('../../utils/feature-flags.js'));
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
  sourceAccountId: `eip155:137:${WALLET_ADDRESS_MOCK}`,
  sourceAssetId: 'eip155:137/slip44:966',
  sourceBalanceRaw: '1000000000000000000',
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
    input: { raw: '1000000000000000000' },
    output: { raw: '12000000' },
  } as ServerQuote,
  request: BASE_QUOTE_REQUEST_MOCK,
  sourceAmount: {
    fiat: '5.00',
    human: '1',
    raw: '1000000000000000000',
    usd: '5.00',
  },
  strategy: TransactionPayStrategy.Relay,
  targetAmount: { fiat: '4.85', usd: '4.85' },
} as TransactionPayQuote<ServerQuote>;

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

describe('submitSimpleRelay', () => {
  const getRelayQuotesMock = vi.mocked(getServerQuotes);
  const submitRelayQuotesMock = vi.mocked(submitServerQuotes);
  const getFiatMaxRateDriftPercentMock = vi.mocked(getFiatMaxRateDriftPercent);

  beforeEach(() => {
    vi.resetAllMocks();
    getRelayQuotesMock.mockResolvedValue([RELAY_QUOTE_MOCK]);
    submitRelayQuotesMock.mockResolvedValue({ transactionHash: '0xabc' });
    getFiatMaxRateDriftPercentMock.mockReturnValue(10);
  });

  it('builds an EXACT_INPUT relay request with the full settled amount', async () => {
    const req = buildRequest();

    await submitSimpleRelay({
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

    const result = await submitSimpleRelay({
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
      submitSimpleRelay({
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
      submitSimpleRelay({
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
        targetAmount: { fiat: '2.00', usd: '2.00' },
      },
    ]);

    const req = buildRequest();

    await expect(
      submitSimpleRelay({
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
        targetAmount: { fiat: '6.00', usd: '6.00' },
      },
    ]);

    const req = buildRequest();

    const result = await submitSimpleRelay({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request: req,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(result).toStrictEqual({ transactionHash: '0xabc' });
  });

  it('skips rate drift check when original relay amounts are zero', async () => {
    const fiatQuote = buildFiatQuote();
    fiatQuote.sourceAmount = { fiat: '0', human: '0', raw: '0', usd: '0' };
    fiatQuote.targetAmount = { fiat: '0', usd: '0' };
    getRelayQuotesMock.mockResolvedValue([
      { ...RELAY_QUOTE_MOCK, targetAmount: { fiat: '2.00', usd: '2.00' } },
    ]);

    const req = buildRequest({ quotes: [fiatQuote] });

    const result = await submitSimpleRelay({
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

    await submitSimpleRelay({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request: req,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(getFiatMaxRateDriftPercentMock).toHaveBeenCalledWith(req.messenger);
  });
});
