import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants';
import type {
  PayStrategyExecuteRequest,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types';
import {
  getFiatFeeReserveMultiplier,
  getFiatMaxRateDriftPercent,
} from '../../utils/feature-flags';
import { getTransaction, updateTransaction } from '../../utils/transaction';
import { getRelayQuotes } from '../relay/relay-quotes';
import { submitRelayQuotes } from '../relay/relay-submit';
import type { RelayQuote } from '../relay/types';
import { submitWithTransactionData } from './fiat-submit-with-transaction-data';
import type { FiatQuote } from './types';

jest.mock('../../utils/feature-flags');
jest.mock('../../utils/transaction');
jest.mock('../relay/relay-quotes');
jest.mock('../relay/relay-submit');

const TRANSACTION_ID_MOCK = 'tx-id';
const WALLET_ADDRESS_MOCK = '0x1111111111111111111111111111111111111111' as Hex;

const TRANSACTION_MOCK = {
  id: TRANSACTION_ID_MOCK,
  txParams: { from: WALLET_ADDRESS_MOCK },
  type: TransactionType.batch,
  nestedTransactions: [
    { to: '0xaaa' as Hex, data: '0x1111' as Hex },
    { to: '0xbbb' as Hex, data: '0x2222' as Hex },
  ],
} as unknown as TransactionMeta;

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
      totalImpact: { usd: '-0.15' },
    },
  } as unknown as RelayQuote,
  request: BASE_QUOTE_REQUEST_MOCK,
  sourceAmount: { fiat: '0', human: '0', raw: '0', usd: '0' },
  strategy: TransactionPayStrategy.Relay,
  targetAmount: { fiat: '0', usd: '0' },
} as TransactionPayQuote<RelayQuote>;

function buildFiatQuote(
  relayQuoteOverride?: Partial<RelayQuote>,
): TransactionPayQuote<FiatQuote> {
  const relayQuote = {
    ...(RELAY_QUOTE_MOCK.original as unknown as RelayQuote),
    ...relayQuoteOverride,
  } as RelayQuote;
  return {
    ...RELAY_QUOTE_MOCK,
    original: { rampsQuote: {} as never, relayQuote },
    strategy: TransactionPayStrategy.Fiat,
  } as unknown as TransactionPayQuote<FiatQuote>;
}

function buildCallMock({
  getAmountDataUpdates = [
    { nestedTransactionIndex: 0, data: '0xNewApprove' },
    { nestedTransactionIndex: 1, data: '0xNewDeposit' },
  ],
  featureFlags = {},
}: {
  getAmountDataUpdates?: { nestedTransactionIndex: number; data: string }[];
  featureFlags?: Record<string, unknown>;
} = {}): jest.Mock {
  return jest.fn((action: string) => {
    if (action === 'TransactionPayController:getAmountData') {
      return Promise.resolve({ updates: getAmountDataUpdates });
    }
    if (action === 'RemoteFeatureFlagController:getState') {
      return { remoteFeatureFlags: featureFlags };
    }
    throw new Error(`Unexpected action: ${action}`);
  });
}

function buildRequest({
  callMock = buildCallMock(),
  quotes = [buildFiatQuote()],
  transaction = TRANSACTION_MOCK,
}: {
  callMock?: jest.Mock;
  quotes?: TransactionPayQuote<FiatQuote>[];
  transaction?: TransactionMeta;
} = {}): PayStrategyExecuteRequest<FiatQuote> {
  return {
    accountSupports7702: false,
    isSmartTransaction: () => false,
    messenger: { call: callMock } as never,
    quotes,
    transaction,
  };
}

describe('submitWithCalldataReEncoding', () => {
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const submitRelayQuotesMock = jest.mocked(submitRelayQuotes);
  const getTransactionMock = jest.mocked(getTransaction);
  const updateTransactionMock = jest.mocked(updateTransaction);
  const getFiatFeeReserveMultiplierMock = jest.mocked(
    getFiatFeeReserveMultiplier,
  );
  const getFiatMaxRateDriftPercentMock = jest.mocked(
    getFiatMaxRateDriftPercent,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    getRelayQuotesMock.mockResolvedValue([RELAY_QUOTE_MOCK]);
    submitRelayQuotesMock.mockResolvedValue({ transactionHash: '0xabc' });
    getTransactionMock.mockReturnValue(TRANSACTION_MOCK);
    getFiatFeeReserveMultiplierMock.mockReturnValue(1);
    getFiatMaxRateDriftPercentMock.mockReturnValue(10);
  });

  it('performs three-phase flow: discovery, calldata re-encoding, delegation quote', async () => {
    const request = buildRequest();

    const result = await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    // Phase 1: discovery (EXACT_INPUT)
    expect(getRelayQuotesMock).toHaveBeenCalledTimes(2);
    expect(getRelayQuotesMock.mock.calls[0][0].requests[0]).toStrictEqual(
      expect.objectContaining({
        isPostQuote: true,
        isMaxAmount: false,
      }),
    );

    // Phase 3: delegation (EXACT_OUTPUT)
    expect(getRelayQuotesMock.mock.calls[1][0].requests[0]).toStrictEqual(
      expect.objectContaining({
        isPostQuote: false,
        isMaxAmount: false,
      }),
    );

    expect(submitRelayQuotesMock).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({ transactionHash: '0xabc' });
  });

  it('reserves original relay fee from discovery source amount', async () => {
    const request = buildRequest();

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    // Fee quote: sourceUsd=5.00, targetUsd=4.85, sourceRaw=1e18
    // feeUsd = 0.15, feeReserveRaw = 0.15 / (5.00/1e18) = 3e16
    // discoverySource = 1e18 - 3e16 = 970000000000000000
    const discoveryRequest = getRelayQuotesMock.mock.calls[0][0].requests[0];
    expect(discoveryRequest.sourceTokenAmount).toBe('970000000000000000');
    expect(discoveryRequest.sourceBalanceRaw).toBe('1000000000000000000');
  });

  it('applies fee reserve multiplier from feature flag', async () => {
    getFiatFeeReserveMultiplierMock.mockReturnValue(1.5);
    const request = buildRequest();

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    // feeReserveRaw = 3e16 * 1.5 = 4.5e16
    // discoverySource = 1e18 - 4.5e16 = 955000000000000000
    const discoveryRequest = getRelayQuotesMock.mock.calls[0][0].requests[0];
    expect(discoveryRequest.sourceTokenAmount).toBe('955000000000000000');
  });

  it('clamps discovery source to minimum 1 when fee reserve exceeds settled amount', async () => {
    const request = buildRequest();

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '10000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    // feeReserve (3e16) > settled (1e16) → clamped to 1
    const discoveryRequest = getRelayQuotesMock.mock.calls[0][0].requests[0];
    expect(discoveryRequest.sourceTokenAmount).toBe('1');
  });

  it('skips fee reserve when original relay quote has zero source USD', async () => {
    const fiatQuote = buildFiatQuote({
      details: {
        currencyIn: { amount: '1000000000000000000', amountUsd: '0' },
        currencyOut: {
          amount: '12000000',
          amountUsd: '0',
          minimumAmount: '11900000',
        },
        totalImpact: { usd: '0' },
      },
    } as unknown as Partial<RelayQuote>);

    const request = buildRequest({ quotes: [fiatQuote] });

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    // Zero USD → fee reserve = 0 → full amount used
    const discoveryRequest = getRelayQuotesMock.mock.calls[0][0].requests[0];
    expect(discoveryRequest.sourceTokenAmount).toBe('1000000000000000000');
  });

  it('skips fee reserve when original relay fee is not positive', async () => {
    const fiatQuote = buildFiatQuote({
      details: {
        currencyIn: { amount: '1000000000000000000', amountUsd: '4.85' },
        currencyOut: {
          amount: '12000000',
          amountUsd: '5.00',
          minimumAmount: '11900000',
        },
        totalImpact: { usd: '0.15' },
      },
    } as unknown as Partial<RelayQuote>);

    const request = buildRequest({ quotes: [fiatQuote] });

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    const discoveryRequest = getRelayQuotesMock.mock.calls[0][0].requests[0];
    expect(discoveryRequest.sourceTokenAmount).toBe('1000000000000000000');
  });

  it('adds discovery fee back to adjusted target amount', async () => {
    const request = buildRequest();

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    // Discovery returns minimumAmount=11900000 with sourceUsd=5.00, targetUsd=4.85
    // discoveryFeeUsd=0.15, usdPerTargetRaw=4.85/11900000
    // discoveryFeeInTargetRaw=0.15/(4.85/11900000)=368041
    // adjustedTarget=11900000+368041=12268041
    const finalRequest = getRelayQuotesMock.mock.calls[1][0].requests[0];
    expect(finalRequest.targetAmountMinimum).toBe('12268041');
  });

  it('passes adjusted target to getAmountData', async () => {
    const callMock = buildCallMock();
    const request = buildRequest({ callMock });

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(callMock).toHaveBeenCalledWith(
      'TransactionPayController:getAmountData',
      expect.objectContaining({ amount: '12268041' }),
    );
  });

  it('updates nested calldata and requiredAssets with adjusted amount', async () => {
    const request = buildRequest();

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    const settledAmountCall = updateTransactionMock.mock.calls.find(
      ([opts]) => opts.note === 'Fiat deposit: update settled amount',
    );
    expect(settledAmountCall).toBeDefined();

    const txDraft = {
      nestedTransactions: [
        { to: '0xaaa', data: '0x1111' },
        { to: '0xbbb', data: '0x2222' },
      ],
      requiredAssets: [{ address: '0xaaa', amount: '0x0' }],
    } as unknown as TransactionMeta;

    const updateFn = settledAmountCall?.[1];
    (updateFn as (tx: TransactionMeta) => void)(txDraft);

    expect(txDraft.nestedTransactions?.[0].data).toBe('0xNewApprove');
    expect(txDraft.nestedTransactions?.[1].data).toBe('0xNewDeposit');
    expect(txDraft.requiredAssets?.[0].amount).toBe('0xbb3209');
  });

  it('throws when discovery relay returns no quotes', async () => {
    getRelayQuotesMock.mockResolvedValue([]);
    const request = buildRequest();

    await expect(
      submitWithTransactionData({
        baseRequest: BASE_QUOTE_REQUEST_MOCK,
        request,
        sourceAmountRaw: '1000000000000000000',
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('No relay quotes returned for fiat discovery');
  });

  it('throws when final relay re-quote returns no quotes', async () => {
    getRelayQuotesMock
      .mockResolvedValueOnce([RELAY_QUOTE_MOCK])
      .mockResolvedValueOnce([]);
    const request = buildRequest();

    await expect(
      submitWithTransactionData({
        baseRequest: BASE_QUOTE_REQUEST_MOCK,
        request,
        sourceAmountRaw: '1000000000000000000',
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('No relay quotes returned for completed fiat order');
  });

  it('throws when getAmountData returns no updates', async () => {
    const callMock = buildCallMock({ getAmountDataUpdates: [] });
    const request = buildRequest({ callMock });

    await expect(
      submitWithTransactionData({
        baseRequest: BASE_QUOTE_REQUEST_MOCK,
        request,
        sourceAmountRaw: '1000000000000000000',
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow(
      'getAmountData returned no updates for transaction with nested calldata',
    );
  });

  it('throws when the original fiat quote is missing a relay quote', async () => {
    const fiatQuote = buildFiatQuote();
    fiatQuote.original.relayQuote = undefined;
    const request = buildRequest({ quotes: [fiatQuote] });

    await expect(
      submitWithTransactionData({
        baseRequest: BASE_QUOTE_REQUEST_MOCK,
        request,
        sourceAmountRaw: '1000000000000000000',
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('Missing Relay quote');
  });

  it('falls back to original transaction when getTransaction returns undefined', async () => {
    getTransactionMock.mockReturnValue(undefined);
    const request = buildRequest();

    const result = await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(submitRelayQuotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ transaction: TRANSACTION_MOCK }),
    );
    expect(result).toStrictEqual({ transactionHash: '0xabc' });
  });

  it('falls back to discovery minimum when discovery quote has zero target USD', async () => {
    getRelayQuotesMock.mockResolvedValue([
      {
        ...RELAY_QUOTE_MOCK,
        original: {
          details: {
            currencyIn: { amount: '1000000000000000000', amountUsd: '0' },
            currencyOut: {
              amount: '12000000',
              amountUsd: '0',
              minimumAmount: '11900000',
            },
          },
        } as unknown as RelayQuote,
      },
    ]);

    const callMock = buildCallMock();
    const request = buildRequest({ callMock });

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(callMock).toHaveBeenCalledWith(
      'TransactionPayController:getAmountData',
      expect.objectContaining({ amount: '11900000' }),
    );
  });

  it('falls back to discovery minimum when discovery fee is not positive', async () => {
    getRelayQuotesMock.mockResolvedValue([
      {
        ...RELAY_QUOTE_MOCK,
        original: {
          details: {
            currencyIn: { amount: '1000000000000000000', amountUsd: '4.85' },
            currencyOut: {
              amount: '12000000',
              amountUsd: '5.00',
              minimumAmount: '11900000',
            },
          },
        } as unknown as RelayQuote,
      },
    ]);

    const callMock = buildCallMock();
    const request = buildRequest({ callMock });

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(callMock).toHaveBeenCalledWith(
      'TransactionPayController:getAmountData',
      expect.objectContaining({ amount: '11900000' }),
    );
  });

  it('reads maxRateDriftPercent from feature flags', async () => {
    getFiatMaxRateDriftPercentMock.mockReturnValue(15);
    const request = buildRequest();

    await submitWithTransactionData({
      baseRequest: BASE_QUOTE_REQUEST_MOCK,
      request,
      sourceAmountRaw: '1000000000000000000',
      transaction: TRANSACTION_MOCK,
    });

    expect(getFiatMaxRateDriftPercentMock).toHaveBeenCalledWith(
      request.messenger,
    );
  });
});
