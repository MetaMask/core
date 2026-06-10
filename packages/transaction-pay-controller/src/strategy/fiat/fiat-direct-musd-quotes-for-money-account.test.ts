import type {
  Quote as RampsQuote,
  QuotesResponse as RampsQuotesResponse,
} from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants';
import type {
  PayStrategyGetQuotesRequest,
  TransactionFiatPayment,
  TransactionPayQuote,
  TransactionPayRequiredToken,
} from '../../types';
import { buildCaipAssetType } from '../../utils/token';
import { getRelayQuotes } from '../relay/relay-quotes';
import type { RelayQuote } from '../relay/types';
import {
  DEFAULT_FIAT_CURRENCY,
  MUSD_MONAD_FIAT_ASSET,
  MUSD_PROBE_AMOUNT_USD,
} from './constants';
import { getDirectMusdToMoneyAccountQuotes } from './fiat-direct-musd-quotes-for-money-account';
import {
  buildRelayRequestFromAmountFiat,
  combineQuotes,
  getRampsQuote,
} from './fiat-quotes';

jest.mock('../relay/relay-quotes');
jest.mock('../../utils/token');
jest.mock('./fiat-quotes', () => ({
  ...jest.requireActual('./fiat-quotes'),
  buildRelayRequestFromAmountFiat: jest.fn(),
  combineQuotes: jest.fn(),
  getRampsQuote: jest.fn(),
}));

const TRANSACTION_ID = 'tx-id';
const USER_WALLET_ADDRESS =
  '0x1111111111111111111111111111111111111111' as Hex;
const MONEY_ACCOUNT_ADDRESS =
  '0x2222222222222222222222222222222222222222' as Hex;

const TRANSACTION_MOCK = {
  id: TRANSACTION_ID,
  txParams: { from: MONEY_ACCOUNT_ADDRESS },
  type: TransactionType.batch,
  nestedTransactions: [
    { type: TransactionType.tokenMethodApprove },
    { type: TransactionType.moneyAccountDeposit },
  ],
} as unknown as TransactionMeta;

const REQUIRED_TOKEN_MOCK: TransactionPayRequiredToken = {
  address: '0x3333333333333333333333333333333333333333' as Hex,
  allowUnderMinimum: false,
  amountFiat: '10',
  amountHuman: '10',
  amountRaw: '10000000',
  amountUsd: '10',
  balanceFiat: '0',
  balanceHuman: '0',
  balanceRaw: '0',
  balanceUsd: '0',
  chainId: '0x8f' as Hex,
  decimals: 6,
  skipIfBalance: false,
  symbol: 'MUSD',
};

const FIAT_QUOTE_MOCK: RampsQuote = {
  provider: '/providers/transak-native',
  quote: {
    amountIn: 20,
    amountOut: 10,
    networkFee: 0.1,
    paymentMethod: '/payments/debit-credit-card',
    providerFee: 0.3,
  },
};

const PROBE_SUCCESS_RESPONSE: RampsQuotesResponse = {
  customActions: [],
  error: [],
  sorted: [],
  success: [FIAT_QUOTE_MOCK],
};

const PROBE_EMPTY_RESPONSE: RampsQuotesResponse = {
  customActions: [],
  error: [],
  sorted: [],
  success: [],
};

const AMOUNT_MOCK = {
  fiat: '0',
  human: '0',
  raw: '0',
  usd: '0',
};

const MUSD_CAIP_ID_MOCK = 'eip155:143/erc20:0xaca92e438df0b2401ff60da7e4337b687a2435da';

const COMBINED_QUOTE_MOCK = {
  dust: { fiat: '0', usd: '0' },
  estimatedDuration: 1,
  fees: {
    metaMask: { fiat: '0', usd: '0' },
    provider: { fiat: '0', usd: '0' },
    sourceNetwork: { estimate: AMOUNT_MOCK, max: AMOUNT_MOCK },
    targetNetwork: { fiat: '0', usd: '0' },
  },
  original: {},
  request: {},
  sourceAmount: AMOUNT_MOCK,
  strategy: TransactionPayStrategy.Fiat,
  targetAmount: { fiat: '0', usd: '0' },
} as unknown as TransactionPayQuote<unknown>;

function getRelayQuoteMock(): TransactionPayQuote<RelayQuote> {
  return {
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: 1,
    fees: {
      metaMask: { fiat: '0.5', usd: '0.5' },
      provider: { fiat: '0.2', usd: '0.2' },
      sourceNetwork: {
        estimate: { fiat: '0.1', human: '0', raw: '0', usd: '0.1' },
        max: AMOUNT_MOCK,
      },
      targetNetwork: { fiat: '0.1', usd: '0.1' },
    },
    original: {} as RelayQuote,
    request: {} as never,
    sourceAmount: AMOUNT_MOCK,
    strategy: TransactionPayStrategy.Relay,
    targetAmount: { fiat: '0', usd: '0' },
  };
}

function buildCallMock({
  amountFiat = '10',
  fiatPaymentMethod = '/payments/debit-credit-card',
  probeResponse = PROBE_SUCCESS_RESPONSE,
  tokens = [REQUIRED_TOKEN_MOCK],
  probeThrows,
}: {
  amountFiat?: string;
  fiatPaymentMethod?: string;
  probeResponse?: RampsQuotesResponse;
  tokens?: TransactionPayRequiredToken[];
  probeThrows?: Error;
} = {}): jest.Mock {
  let probeCallCount = 0;

  return jest.fn(
    (action: string, requestArg?: Record<string, unknown>) => {
      if (action === 'TransactionPayController:getState') {
        return {
          transactionData: {
            [TRANSACTION_ID]: {
              fiatPayment: { amountFiat },
              isLoading: false,
              tokens,
            },
          },
        };
      }

      if (action === 'RampsController:getQuotes') {
        probeCallCount += 1;
        if (probeCallCount === 1) {
          if (probeThrows) {
            throw probeThrows;
          }
          return probeResponse;
        }
        return probeResponse;
      }

      if (action === 'TransactionPayController:updateFiatPayment') {
        const { callback } = requestArg as unknown as {
          callback: (fiatPayment: TransactionFiatPayment) => void;
        };
        const fiatPayment: TransactionFiatPayment = {};
        callback(fiatPayment);
        return undefined;
      }

      throw new Error(`Unexpected action: ${action}`);
    },
  );
}

function getRequest({
  amountFiat,
  fiatPaymentMethod = '/payments/debit-credit-card',
  probeResponse,
  tokens,
  probeThrows,
}: {
  amountFiat?: string;
  fiatPaymentMethod?: string;
  probeResponse?: RampsQuotesResponse;
  tokens?: TransactionPayRequiredToken[];
  probeThrows?: Error;
} = {}): {
  callMock: jest.Mock;
  request: PayStrategyGetQuotesRequest;
} {
  const callMock = buildCallMock({
    amountFiat,
    fiatPaymentMethod,
    probeResponse,
    tokens,
    probeThrows,
  });

  return {
    callMock,
    request: {
      accountSupports7702: false,
      fiatPaymentMethod,
      from: USER_WALLET_ADDRESS,
      messenger: {
        call: callMock,
      } as unknown as PayStrategyGetQuotesRequest['messenger'],
      requests: [],
      transaction: TRANSACTION_MOCK,
    },
  };
}

describe('getDirectMusdToMoneyAccountQuotes', () => {
  const buildCaipAssetTypeMock = jest.mocked(buildCaipAssetType);
  const getRelayQuotesMock = jest.mocked(getRelayQuotes);
  const buildRelayRequestMock = jest.mocked(buildRelayRequestFromAmountFiat);
  const combineQuotesMock = jest.mocked(combineQuotes);
  const getRampsQuoteMock = jest.mocked(getRampsQuote);

  beforeEach(() => {
    jest.resetAllMocks();

    buildCaipAssetTypeMock.mockReturnValue(MUSD_CAIP_ID_MOCK);
    buildRelayRequestMock.mockReturnValue({
      from: USER_WALLET_ADDRESS,
      isPostQuote: true,
      sourceBalanceRaw: '10000000',
      sourceChainId: MUSD_MONAD_FIAT_ASSET.chainId,
      sourceTokenAddress: MUSD_MONAD_FIAT_ASSET.address,
      sourceTokenAmount: '10000000',
      targetAmountMinimum: '10000000',
      targetChainId: '0x8f' as Hex,
      targetTokenAddress:
        '0x3333333333333333333333333333333333333333' as Hex,
    });
    getRelayQuotesMock.mockResolvedValue([getRelayQuoteMock()]);
    getRampsQuoteMock.mockResolvedValue(FIAT_QUOTE_MOCK);
    combineQuotesMock.mockReturnValue(
      COMBINED_QUOTE_MOCK as never,
    );
  });

  describe('probe', () => {
    it('calls RampsController:getQuotes with probe amount and mUSD asset', async () => {
      const { callMock, request } = getRequest();

      await getDirectMusdToMoneyAccountQuotes(request);

      const probeCalls = callMock.mock.calls.filter(
        ([action]: [string]) => action === 'RampsController:getQuotes',
      );
      expect(probeCalls.length).toBeGreaterThanOrEqual(1);
      expect(probeCalls[0][1]).toStrictEqual({
        amount: MUSD_PROBE_AMOUNT_USD,
        assetId: MUSD_CAIP_ID_MOCK,
        autoSelectProvider: true,
        fiat: DEFAULT_FIAT_CURRENCY,
        restrictToKnownOrNativeProviders: true,
        walletAddress: MONEY_ACCOUNT_ADDRESS,
      });
    });

    it('returns empty array when probe returns no providers', async () => {
      const { request } = getRequest({
        probeResponse: PROBE_EMPTY_RESPONSE,
      });

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when probe response has no success property', async () => {
      const { request } = getRequest({
        probeResponse: {
          customActions: [],
          error: [],
          sorted: [],
        } as unknown as RampsQuotesResponse,
      });

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when probe throws', async () => {
      const { request } = getRequest({
        probeThrows: new Error('Network error'),
      });

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('uses money account address as walletAddress for probe', async () => {
      const { callMock, request } = getRequest();

      await getDirectMusdToMoneyAccountQuotes(request);

      const probeCalls = callMock.mock.calls.filter(
        ([action]: [string]) => action === 'RampsController:getQuotes',
      );
      expect(probeCalls[0][1]).toStrictEqual(
        expect.objectContaining({
          walletAddress: MONEY_ACCOUNT_ADDRESS,
        }),
      );
    });

    it('does not pass paymentMethods in probe call', async () => {
      const { callMock, request } = getRequest();

      await getDirectMusdToMoneyAccountQuotes(request);

      const probeCalls = callMock.mock.calls.filter(
        ([action]: [string]) => action === 'RampsController:getQuotes',
      );
      expect(probeCalls[0][1]).not.toHaveProperty('paymentMethods');
    });
  });

  describe('quote flow', () => {
    it('returns combined quote when probe succeeds', async () => {
      const { request } = getRequest();

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toHaveLength(1);
      expect(combineQuotesMock).toHaveBeenCalledTimes(1);
    });

    it('passes MUSD_MONAD_FIAT_ASSET to buildRelayRequestFromAmountFiat', async () => {
      const { request } = getRequest();

      await getDirectMusdToMoneyAccountQuotes(request);

      expect(buildRelayRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fiatAsset: MUSD_MONAD_FIAT_ASSET,
        }),
      );
    });

    it('uses user wallet address for relay from', async () => {
      const { request } = getRequest();

      await getDirectMusdToMoneyAccountQuotes(request);

      expect(getRelayQuotesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: USER_WALLET_ADDRESS,
        }),
      );
    });

    it('uses money account address as walletAddress for ramps quote', async () => {
      const { request } = getRequest();

      await getDirectMusdToMoneyAccountQuotes(request);

      expect(getRampsQuoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: MONEY_ACCOUNT_ADDRESS,
        }),
      );
    });

    it('sets caipAssetId via updateFiatPayment', async () => {
      const { callMock, request } = getRequest();

      await getDirectMusdToMoneyAccountQuotes(request);

      const updateCalls = callMock.mock.calls.filter(
        ([action]: [string]) =>
          action === 'TransactionPayController:updateFiatPayment',
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][1]).toStrictEqual(
        expect.objectContaining({
          transactionId: TRANSACTION_ID,
        }),
      );
    });

    it('returns empty array when amountFiat is missing', async () => {
      const { request } = getRequest({ amountFiat: '' });

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when fiatPaymentMethod is missing', async () => {
      const { request } = getRequest({ fiatPaymentMethod: '' });

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when tokens are empty', async () => {
      const { request } = getRequest({ tokens: [] });

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when relay quotes fail', async () => {
      getRelayQuotesMock.mockResolvedValue([]);
      const { request } = getRequest();

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when buildRelayRequestFromAmountFiat returns undefined', async () => {
      buildRelayRequestMock.mockReturnValue(undefined);
      const { request } = getRequest();

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when getRampsQuote throws', async () => {
      getRampsQuoteMock.mockRejectedValue(new Error('No provider'));
      const { request } = getRequest();

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when multiple required tokens are present', async () => {
      const secondToken = {
        ...REQUIRED_TOKEN_MOCK,
        address: '0x4444444444444444444444444444444444444444' as Hex,
      };
      const { request } = getRequest({
        tokens: [REQUIRED_TOKEN_MOCK, secondToken],
      });

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when relay fee adjustment produces invalid amount', async () => {
      getRelayQuotesMock.mockResolvedValue([
        {
          ...getRelayQuoteMock(),
          fees: {
            metaMask: { fiat: 'NaN', usd: 'NaN' },
            provider: { fiat: 'NaN', usd: 'NaN' },
            sourceNetwork: {
              estimate: { fiat: 'NaN', human: '0', raw: '0', usd: 'NaN' },
              max: AMOUNT_MOCK,
            },
            targetNetwork: { fiat: 'NaN', usd: 'NaN' },
          },
        },
      ]);
      const { request } = getRequest();

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when adjusted amount is not positive', async () => {
      const { request } = getRequest({ amountFiat: '-10' });

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('returns empty array when adjusted amount overflows to Infinity', async () => {
      const { request } = getRequest({ amountFiat: '1e+309' });

      const result = await getDirectMusdToMoneyAccountQuotes(request);

      expect(result).toStrictEqual([]);
    });

    it('adds relay fee to ramps adjusted amount', async () => {
      const { request } = getRequest({ amountFiat: '100' });

      await getDirectMusdToMoneyAccountQuotes(request);

      expect(getRampsQuoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          // 100 + 0.2 + 0.1 + 0.1 + 0.5 = 100.9
          adjustedAmount: expect.any(Number),
        }),
      );
      const adjustedAmount = getRampsQuoteMock.mock.calls[0][0]
        .adjustedAmount as number;
      expect(adjustedAmount).toBeGreaterThan(100);
    });
  });
});
