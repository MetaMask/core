import type { TransactionMeta } from '@metamask/transaction-controller';
import type {
  CaipAccountId,
  CaipAssetType,
  CaipChainId,
  Hex,
} from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants.js';
import { getMessengerMock } from '../../tests/messenger-mock.js';
import type {
  NonEvmQuoteRequest,
  PayStrategyGetQuotesRequest,
} from '../../types.js';
import { isRelaySolanaEnabled } from '../../utils/feature-flags.js';
import { calculateTotals } from '../../utils/totals.js';
import { QuoteError } from '../../utils/validation.js';
import { fetchRelayQuote, fetchRelaySolanaQuote } from './relay-api.js';
import { getRelaySolanaQuotes } from './relay-solana-quotes.js';
import {
  compileRelaySolanaTransaction,
  computeSolanaFeeRaw,
  getAccountSnapId,
  getSolanaRentReserveRaw,
} from './solana-transaction.js';
import type { RelaySolanaQuote, RelaySolanaQuoteRequest } from './types.js';

jest.mock('./relay-api');
jest.mock('../../utils/gas', () => ({
  ...jest.requireActual('../../utils/gas'),
  calculateTransactionGasCost: jest.fn().mockReturnValue({
    fiat: '1',
    human: '1',
    raw: '1',
    usd: '1',
  }),
}));
jest.mock('./solana-transaction');
jest.mock('../../utils/feature-flags', () => ({
  ...jest.requireActual('../../utils/feature-flags'),
  isRelaySolanaEnabled: jest.fn(),
}));

const SOLANA_CHAIN_ID =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId;
const SOLANA_ADDRESS = '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z';
const SOLANA_ACCOUNT = `${SOLANA_CHAIN_ID}:${SOLANA_ADDRESS}` as CaipAccountId;
const SOLANA_NATIVE = `${SOLANA_CHAIN_ID}/slip44:501` as CaipAssetType;
const SOLANA_USDC =
  `${SOLANA_CHAIN_ID}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as CaipAssetType;
const WALLET_ACCOUNT_ID = 'wallet-account-uuid';
const FROM = '0x1234567890123456789012345678901234567890' as Hex;
const TARGET_TOKEN = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Hex;
const FEE_RAW = '5000';
const RENT_RAW = '890880';

function getRequest(
  overrides: Partial<NonEvmQuoteRequest> = {},
): NonEvmQuoteRequest {
  return {
    from: FROM,
    sourceAccountId: SOLANA_ACCOUNT,
    sourceAssetId: SOLANA_USDC,
    sourceBalanceRaw: '20000000',
    sourceChainId: SOLANA_CHAIN_ID,
    sourceTokenAmount: '10000000',
    sourceWalletAccountId: WALLET_ACCOUNT_ID,
    targetAmountMinimum: '9900000',
    targetChainId: '0xa4b1',
    targetTokenAddress: TARGET_TOKEN,
    ...overrides,
  };
}

function getRelaySolanaQuote(
  request: RelaySolanaQuoteRequest,
): RelaySolanaQuote {
  return {
    details: {
      currencyIn: {
        amount: request.amount,
        amountFormatted: '10',
        amountUsd: '10',
        currency: { chainId: 792703809, decimals: 6 },
      },
      currencyOut: {
        amount: '9950000',
        amountFormatted: '9.95',
        amountUsd: '9.95',
        currency: { chainId: 42161, decimals: 6 },
        minimumAmount: '9900000',
      },
      timeEstimate: 12,
      totalImpact: { usd: '-0.05' },
    },
    fees: {
      app: { amountUsd: '0.01' },
      relayer: { amountUsd: '0.04' },
    },
    request,
    requestId: 'relay-request-123',
    steps: [
      {
        id: 'deposit',
        items: [
          {
            check: { endpoint: '/intents/status', method: 'GET' },
            data: {
              instructions: [
                {
                  data: '02000000',
                  keys: [
                    {
                      isSigner: true,
                      isWritable: true,
                      pubkey: SOLANA_ADDRESS,
                    },
                  ],
                  programId: '11111111111111111111111111111111',
                },
              ],
            },
            status: 'incomplete',
          },
        ],
        kind: 'transaction',
        requestId: 'relay-request-123',
      },
    ],
  };
}

describe('getRelaySolanaQuotes', () => {
  const fetchRelaySolanaQuoteMock = jest.mocked(fetchRelaySolanaQuote);
  const fetchRelayQuoteMock = jest.mocked(fetchRelayQuote);
  const compileMock = jest.mocked(compileRelaySolanaTransaction);
  const computeFeeMock = jest.mocked(computeSolanaFeeRaw);
  const getSnapIdMock = jest.mocked(getAccountSnapId);
  const getRentMock = jest.mocked(getSolanaRentReserveRaw);
  const isRelaySolanaEnabledMock = jest.mocked(isRelaySolanaEnabled);

  const {
    getAssetsControllerStateMock,
    getRemoteFeatureFlagControllerStateMock,
    messenger,
  } = getMessengerMock();

  function getFullRequest(
    nonEvmRequests: NonEvmQuoteRequest[],
  ): PayStrategyGetQuotesRequest {
    return {
      accountSupports7702: false,
      from: FROM,
      messenger,
      nonEvmRequests,
      requests: [],
      transaction: {
        chainId: '0xa4b1',
        id: 'transaction-1',
        networkClientId: 'arbitrum',
        status: 'unapproved',
        time: 0,
        txParams: { from: FROM },
      } as TransactionMeta,
    };
  }

  function mockAssets(nativeBalance: string): void {
    getAssetsControllerStateMock.mockReturnValue({
      assetsBalance: {
        [WALLET_ACCOUNT_ID]: { [SOLANA_NATIVE]: { amount: nativeBalance } },
      },
      assetsInfo: {
        [SOLANA_NATIVE]: { decimals: 9, symbol: 'SOL' },
      },
      assetsPrice: {
        [SOLANA_NATIVE]: {
          assetPriceType: 'fungible',
          lastUpdated: 0,
          price: 300,
          usdPrice: 150,
        },
      },
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    isRelaySolanaEnabledMock.mockReturnValue(true);
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      cacheTimestamp: 0,
      remoteFeatureFlags: {},
    });
    getSnapIdMock.mockReturnValue('npm:@metamask/solana-wallet-snap');
    getRentMock.mockResolvedValue(RENT_RAW);
    computeFeeMock.mockResolvedValue(FEE_RAW);
    compileMock.mockResolvedValue({
      lastValidBlockHeight: 1234,
      transaction: 'base64-transaction',
    });
    fetchRelaySolanaQuoteMock.mockImplementation(async (_messenger, body) =>
      getRelaySolanaQuote(body),
    );
    mockAssets('0.1');
  });

  it('returns an ordinary Relay Pay quote with the Snap fee as the source network fee', async () => {
    const quotes = await getRelaySolanaQuotes(getFullRequest([getRequest()]));

    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      estimatedDuration: 12,
      fees: {
        metaMask: { fiat: '0.02', usd: '0.01' },
        provider: { fiat: '0.08', usd: '0.04' },
        sourceNetwork: {
          estimate: {
            fiat: '0.0015',
            human: '0.000005',
            raw: FEE_RAW,
            usd: '0.00075',
          },
          max: { raw: FEE_RAW },
        },
        targetNetwork: { fiat: '0', usd: '0' },
      },
      isInputBased: true,
      request: getRequest(),
      sourceAmount: {
        fiat: '20',
        human: '10',
        raw: '10000000',
        usd: '10',
      },
      strategy: TransactionPayStrategy.Relay,
      targetAmount: { fiat: '19.9', usd: '9.95' },
    });
    expect(quotes[0].original.metamask).toStrictEqual({
      affordability: {
        isAffordable: true,
        nativeShortfallRaw: '0',
        requiredNativeBalanceRaw: '895880',
        requiredSourceBalanceRaw: '10000000',
        sourceShortfallRaw: '0',
      },
      feeRaw: FEE_RAW,
      lastValidBlockHeight: 1234,
      rentReserveRaw: RENT_RAW,
      transaction: 'base64-transaction',
    });
    expect(computeFeeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: WALLET_ACCOUNT_ID,
        scope: SOLANA_CHAIN_ID,
        transaction: 'base64-transaction',
      }),
    );
  });

  it('calculates totals for a Solana quote with the unchanged calculateTotals', async () => {
    const quotes = await getRelaySolanaQuotes(getFullRequest([getRequest()]));

    const totals = calculateTotals({
      messenger,
      quotes,
      tokens: [],
      transaction: getFullRequest([]).transaction,
    });

    expect(totals).toMatchObject({
      estimatedDuration: 12,
      fees: {
        metaMask: { fiat: '0.02', usd: '0.01' },
        provider: { fiat: '0.08', usd: '0.04' },
        sourceNetwork: {
          estimate: { fiat: '0.0015', raw: FEE_RAW, usd: '0.00075' },
        },
        targetNetwork: { fiat: '0', usd: '0' },
      },
      isInputBased: true,
      sourceAmount: { raw: '10000000' },
      targetAmount: { fiat: '19.9', usd: '9.95' },
      total: { fiat: '20.0015', usd: '10.00075' },
    });
  });

  it('sends Solana requests to /quote/v2 and never to the EVM /quote endpoint', async () => {
    await getRelaySolanaQuotes(getFullRequest([getRequest()]));

    expect(fetchRelaySolanaQuoteMock).toHaveBeenCalledTimes(1);
    expect(fetchRelayQuoteMock).not.toHaveBeenCalled();
  });

  it('returns no quotes and fetches nothing when Solana is disabled', async () => {
    isRelaySolanaEnabledMock.mockReturnValue(false);

    const quotes = await getRelaySolanaQuotes(getFullRequest([getRequest()]));

    expect(quotes).toStrictEqual([]);
    expect(fetchRelaySolanaQuoteMock).not.toHaveBeenCalled();
  });

  it('rejects multiple Solana requests for one transaction', async () => {
    await expect(
      getRelaySolanaQuotes(getFullRequest([getRequest(), getRequest()])),
    ).rejects.toThrow('Multiple Solana quote requests are not supported');
  });

  it('surfaces an SPL native SOL fee and rent shortfall as a quote error with the quotes', async () => {
    mockAssets('0.0001');

    const error = await getRelaySolanaQuotes(
      getFullRequest([getRequest()]),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QuoteError);
    expect((error as QuoteError).info).toStrictEqual({
      detail: [
        'Network fee: 0.000005 SOL',
        'Rent reserve: 0.00089088 SOL',
        'Missing native: 0.00079588 SOL',
        'Missing source: 0',
      ],
      message: 'Insufficient Solana balance for quote',
      reason: 'insufficient-source-balance',
    });
    expect((error as QuoteError).quotes).toHaveLength(1);
  });

  it('surfaces a native SOL shortfall when the amount leaves no room for fee and rent', async () => {
    const error = await getRelaySolanaQuotes(
      getFullRequest([
        getRequest({
          sourceAssetId: SOLANA_NATIVE,
          sourceBalanceRaw: '10000000',
          sourceTokenAmount: '10000000',
        }),
      ]),
    ).catch((caught: unknown) => caught);

    expect((error as QuoteError).info.reason).toBe(
      'insufficient-source-balance',
    );
  });

  it('withholds the fee and rent reserve from a native SOL max amount', async () => {
    const quotes = await getRelaySolanaQuotes(
      getFullRequest([
        getRequest({
          isMaxAmount: true,
          sourceAssetId: SOLANA_NATIVE,
          sourceBalanceRaw: '100000000',
          sourceTokenAmount: '100000000',
        }),
      ]),
    );

    expect(fetchRelaySolanaQuoteMock).toHaveBeenCalledTimes(2);
    expect(fetchRelaySolanaQuoteMock.mock.calls[1][1].amount).toBe('99104120');
    expect(quotes[0].sourceAmount.raw).toBe('99104120');
    expect(quotes[0].original.metamask.affordability.isAffordable).toBe(true);
  });

  it('throws a quote error when a native SOL max balance cannot cover fee and rent', async () => {
    await expect(
      getRelaySolanaQuotes(
        getFullRequest([
          getRequest({
            isMaxAmount: true,
            sourceAssetId: SOLANA_NATIVE,
            sourceBalanceRaw: '800000',
            sourceTokenAmount: '800000',
          }),
        ]),
      ),
    ).rejects.toThrow('Insufficient Solana balance for quote');
  });

  it('does not adjust an SPL max amount', async () => {
    await getRelaySolanaQuotes(
      getFullRequest([getRequest({ isMaxAmount: true })]),
    );

    expect(fetchRelaySolanaQuoteMock).toHaveBeenCalledTimes(1);
  });

  it('retries once with maxRouteLength 4 when Relay rejects the transaction as too large', async () => {
    fetchRelaySolanaQuoteMock.mockRejectedValueOnce(
      new Error('400 - SOLANA_TX_TOO_LARGE'),
    );

    await getRelaySolanaQuotes(getFullRequest([getRequest()]));

    expect(fetchRelaySolanaQuoteMock).toHaveBeenCalledTimes(2);
    expect(fetchRelaySolanaQuoteMock.mock.calls[1][1]).toMatchObject({
      maxRouteLength: 4,
    });
  });

  it('surfaces a second SOLANA_TX_TOO_LARGE rejection', async () => {
    fetchRelaySolanaQuoteMock.mockRejectedValue(
      new Error('400 - SOLANA_TX_TOO_LARGE'),
    );

    await expect(
      getRelaySolanaQuotes(getFullRequest([getRequest()])),
    ).rejects.toThrow('SOLANA_TX_TOO_LARGE');
    expect(fetchRelaySolanaQuoteMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry other Relay errors', async () => {
    fetchRelaySolanaQuoteMock.mockRejectedValue(new Error('500 - Internal'));

    await expect(
      getRelaySolanaQuotes(getFullRequest([getRequest()])),
    ).rejects.toThrow('500 - Internal');
    expect(fetchRelaySolanaQuoteMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an exact-input quote whose source amount differs from the request', async () => {
    fetchRelaySolanaQuoteMock.mockImplementation(async (_messenger, body) => {
      const quote = getRelaySolanaQuote(body);
      quote.details.currencyIn.amount = '1';
      return quote;
    });

    await expect(
      getRelaySolanaQuotes(getFullRequest([getRequest()])),
    ).rejects.toThrow('Relay Solana source amount mismatch');
  });

  it('zeroes the provider fee for a subsidized quote', async () => {
    fetchRelaySolanaQuoteMock.mockImplementation(async (_messenger, body) => ({
      ...getRelaySolanaQuote(body),
      fees: {
        relayer: { amountUsd: '0.04' },
        subsidized: {
          amount: '40000',
          amountFormatted: '0.04',
          amountUsd: '0.04',
          currency: { address: TARGET_TOKEN, chainId: 42161, decimals: 6 },
          minimumAmount: '40000',
        },
      },
    }));

    const quotes = await getRelaySolanaQuotes(getFullRequest([getRequest()]));

    expect(quotes[0].fees.provider).toStrictEqual({ fiat: '0', usd: '0' });
    expect(quotes[0].fees.metaMask).toStrictEqual({ fiat: '0', usd: '0' });
  });

  it('returns no quotes when there are no non-EVM requests', async () => {
    const quotes = await getRelaySolanaQuotes({
      ...getFullRequest([]),
      nonEvmRequests: undefined,
    });

    expect(quotes).toStrictEqual([]);
  });

  it('uses the stablecoin target amount as its USD value', async () => {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      cacheTimestamp: 0,
      remoteFeatureFlags: {
        stableTokens: { '0xa4b1': [TARGET_TOKEN.toLowerCase()] },
      },
    });
    fetchRelaySolanaQuoteMock.mockImplementation(async (_messenger, body) => {
      const quote = getRelaySolanaQuote(body);
      quote.details.currencyOut.amountUsd = '9.9';
      return quote;
    });

    const quotes = await getRelaySolanaQuotes(getFullRequest([getRequest()]));

    expect(quotes[0].targetAmount.usd).toBe('9.95');
  });

  it('throws if the native SOL price is unavailable', async () => {
    getAssetsControllerStateMock.mockReturnValue({
      assetsBalance: {},
      assetsInfo: {},
      assetsPrice: {},
    });

    await expect(
      getRelaySolanaQuotes(
        getFullRequest([getRequest({ sourceAssetId: SOLANA_NATIVE })]),
      ),
    ).rejects.toThrow('Solana native fiat rate not found');
  });
});
