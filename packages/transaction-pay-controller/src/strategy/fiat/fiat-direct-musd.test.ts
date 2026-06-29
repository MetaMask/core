import type { Quote as RampsQuote } from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { TransactionPayStrategy } from '../../constants';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionFiatPayment,
  TransactionPayRequiredToken,
  TransactionPayQuote,
} from '../../types';
import { getFiatVaultDisabled } from '../../utils/feature-flags';
import { getNetworkClientId } from '../../utils/provider';
import { buildCaipAssetType, getTokenInfo } from '../../utils/token';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';
import { DEFAULT_FIAT_CURRENCY, MUSD_MONAD_FIAT_ASSET } from './constants';
import {
  getDirectMusdFiatQuote,
  isDirectMusdMoneyAccountQuote,
} from './fiat-direct-musd';
import type { FiatQuote } from './types';

jest.mock('../../utils/feature-flags');
jest.mock('../../utils/provider');
jest.mock('../../utils/token');
jest.mock('../../utils/transaction');


const TRANSACTION_ID_MOCK = 'tx-id';
const MONEY_ACCOUNT_ADDRESS_MOCK =
  '0x1111111111111111111111111111111111111111' as Hex;
const MUSD_CAIP_ASSET_ID_MOCK =
  'eip155:143/erc20:0xaca92e438df0b2401ff60da7e4337b687a2435da';
const NETWORK_CLIENT_ID_MOCK = 'network-client-id-mock';

const RAMPS_QUOTE_MOCK: RampsQuote = {
  provider: '/providers/transak-native-staging',
  quote: {
    amountIn: 10,
    amountOut: 5,
    networkFee: 0.2,
    paymentMethod: '/payments/debit-credit-card',
    providerFee: 0.5,
  },
};

const REQUIRED_TOKEN_MOCK: TransactionPayRequiredToken = {
  address: '0x2222222222222222222222222222222222222222' as Hex,
  allowUnderMinimum: false,
  amountFiat: '10',
  amountHuman: '10',
  amountRaw: '10000000',
  amountUsd: '10',
  balanceFiat: '0',
  balanceHuman: '0',
  balanceRaw: '0',
  balanceUsd: '0',
  chainId: MUSD_MONAD_FIAT_ASSET.chainId,
  decimals: 6,
  skipIfBalance: false,
  symbol: 'MUSD',
};

const TRANSACTION_MOCK = {
  id: TRANSACTION_ID_MOCK,
  nestedTransactions: [
    { data: '0xoldApprove' as Hex, to: '0xapprove' as Hex },
    { data: '0xoldDeposit' as Hex, to: '0xdeposit' as Hex },
  ],
  requiredAssets: [{ amount: '0x0' }],
  txParams: { from: MONEY_ACCOUNT_ADDRESS_MOCK },
  type: TransactionType.batch,
} as unknown as TransactionMeta;

function getQuotesMessenger({
  quotes = [RAMPS_QUOTE_MOCK],
  quoteError,
}: {
  quotes?: RampsQuote[];
  quoteError?: Error;
} = {}): {
  callMock: jest.Mock;
  messenger: PayStrategyGetQuotesRequest['messenger'];
} {
  const callMock = jest.fn(
    (action: string, request?: Record<string, unknown>) => {
      if (action === 'RampsController:getQuotes') {
        if (quoteError) {
          throw quoteError;
        }

        return {
          customActions: [],
          error: [],
          sorted: [],
          success: quotes,
        };
      }

      if (action === 'TransactionPayController:updateFiatPayment') {
        const { callback } = request as unknown as {
          callback: (fiatPayment: TransactionFiatPayment) => void;
        };
        const fiatPayment: TransactionFiatPayment = {};

        callback(fiatPayment);

        return undefined;
      }

      throw new Error(`Unexpected action: ${action}`);
    },
  );

  return {
    callMock,
    messenger: {
      call: callMock,
    } as unknown as PayStrategyGetQuotesRequest['messenger'],
  };
}

function getExecuteRequest({
  callMock = jest.fn(),
}: { callMock?: jest.Mock } = {}): PayStrategyExecuteRequest<FiatQuote> {
  return {
    accountSupports7702: true,
    isSmartTransaction: () => false,
    messenger: {
      call: callMock,
    } as unknown as PayStrategyExecuteRequest<FiatQuote>['messenger'],
    quotes: [],
    transaction: TRANSACTION_MOCK,
  };
}

describe('fiat-direct-musd', () => {
  const buildCaipAssetTypeMock = jest.mocked(buildCaipAssetType);
  const collectTransactionIdsMock = jest.mocked(collectTransactionIds);
  const getFiatVaultDisabledMock = jest.mocked(getFiatVaultDisabled);
  const getNetworkClientIdMock = jest.mocked(getNetworkClientId);
  const getTokenInfoMock = jest.mocked(getTokenInfo);
  const getTransactionMock = jest.mocked(getTransaction);
  const updateTransactionMock = jest.mocked(updateTransaction);
  const waitForTransactionConfirmedMock = jest.mocked(
    waitForTransactionConfirmed,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    buildCaipAssetTypeMock.mockReturnValue(MUSD_CAIP_ASSET_ID_MOCK);
    getFiatVaultDisabledMock.mockReturnValue(false);
    getNetworkClientIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
    getTokenInfoMock.mockReturnValue({ decimals: 6 } as never);
    collectTransactionIdsMock.mockImplementation(
      (_chainId, _from, _messenger, onTransaction) => {
        onTransaction('direct-child-1');
        onTransaction('direct-child-2');

        return { end: jest.fn() };
      },
    );
    getTransactionMock.mockImplementation((transactionId) => {
      if (transactionId === TRANSACTION_ID_MOCK) {
        return TRANSACTION_MOCK;
      }

      if (transactionId === 'direct-child-2') {
        return { hash: '0xdirect' } as TransactionMeta;
      }

      return undefined;
    });
    waitForTransactionConfirmedMock.mockResolvedValue();
  });

  describe('isDirectMusdMoneyAccountQuote', () => {
    it('returns true when quote request has the direct mUSD marker', () => {
      const quote = {
        request: { isDirectMusdMoneyAccount: true },
      } as TransactionPayQuote<unknown>;

      expect(isDirectMusdMoneyAccountQuote(quote)).toBe(true);
    });

    it('returns false when quote is missing or unmarked', () => {
      expect(isDirectMusdMoneyAccountQuote(undefined)).toBe(false);
      expect(
        isDirectMusdMoneyAccountQuote({
          request: {},
        } as TransactionPayQuote<unknown>),
      ).toBe(false);
    });
  });

  describe('getDirectMusdFiatQuote', () => {
    it('returns a direct pure-fiat mUSD quote when quote succeeds', async () => {
      const { callMock, messenger } = getQuotesMessenger();

      const result = await getDirectMusdFiatQuote({
        amountFiat: '10',
        fiatPaymentMethod: '/payments/debit-credit-card',
        messenger,
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS_MOCK,
        requiredToken: REQUIRED_TOKEN_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      });

      expect(callMock).toHaveBeenNthCalledWith(1, 'RampsController:getQuotes', {
        amount: 10,
        assetId: MUSD_CAIP_ASSET_ID_MOCK,
        autoSelectProvider: true,
        fiat: DEFAULT_FIAT_CURRENCY,
        paymentMethods: ['/payments/debit-credit-card'],
        restrictToKnownOrNativeProviders: true,
        walletAddress: MONEY_ACCOUNT_ADDRESS_MOCK,
      });
      expect(callMock).toHaveBeenCalledWith(
        'TransactionPayController:updateFiatPayment',
        expect.objectContaining({ transactionId: TRANSACTION_ID_MOCK }),
      );
      expect(result).toStrictEqual(
        expect.objectContaining({
          fees: expect.objectContaining({
            provider: { fiat: '0.7', usd: '0.7' },
            providerFiat: { fiat: '0.7', usd: '0.7' },
            sourceNetwork: {
              estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
              max: { fiat: '0', human: '0', raw: '0', usd: '0' },
            },
            targetNetwork: { fiat: '0', usd: '0' },
          }),
          original: { rampsQuote: RAMPS_QUOTE_MOCK, relayQuote: undefined },
          request: expect.objectContaining({
            from: MONEY_ACCOUNT_ADDRESS_MOCK,
            isDirectMusdMoneyAccount: true,
            recipient: MONEY_ACCOUNT_ADDRESS_MOCK,
            sourceBalanceRaw: '5000000',
            sourceChainId: MUSD_MONAD_FIAT_ASSET.chainId,
            sourceTokenAddress: MUSD_MONAD_FIAT_ASSET.address,
            sourceTokenAmount: '5000000',
            targetAmountMinimum: '5000000',
          }),
          sourceAmount: { fiat: '10', human: '5', raw: '5000000', usd: '10' },
          strategy: TransactionPayStrategy.Fiat,
          targetAmount: { fiat: '10', usd: '10' },
        }),
      );
    });

    it('returns undefined when ramps returns no mUSD provider', async () => {
      const { callMock, messenger } = getQuotesMessenger({ quotes: [] });

      const result = await getDirectMusdFiatQuote({
        amountFiat: '10',
        fiatPaymentMethod: '/payments/debit-credit-card',
        messenger,
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS_MOCK,
        requiredToken: REQUIRED_TOKEN_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      });

      expect(result).toBeUndefined();
      expect(callMock).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when ramps quote throws', async () => {
      const { callMock, messenger } = getQuotesMessenger({
        quoteError: new Error('Network error'),
      });

      const result = await getDirectMusdFiatQuote({
        amountFiat: '10',
        fiatPaymentMethod: '/payments/debit-credit-card',
        messenger,
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS_MOCK,
        requiredToken: REQUIRED_TOKEN_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      });

      expect(result).toBeUndefined();
      expect(callMock).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when mUSD token info cannot be resolved', async () => {
      const { messenger } = getQuotesMessenger();

      getTokenInfoMock.mockReturnValue(undefined);

      const result = await getDirectMusdFiatQuote({
        amountFiat: '10',
        fiatPaymentMethod: '/payments/debit-credit-card',
        messenger,
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS_MOCK,
        requiredToken: REQUIRED_TOKEN_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      });

      expect(result).toBeUndefined();
    });

    it('sets provider fees to zero when ramps provider fees are missing', async () => {
      const quoteWithoutFees: RampsQuote = {
        provider: '/providers/transak-native-staging',
        quote: {
          amountIn: 10,
          amountOut: 5,
          paymentMethod: '/payments/debit-credit-card',
        },
      };
      const { messenger } = getQuotesMessenger({ quotes: [quoteWithoutFees] });

      const result = await getDirectMusdFiatQuote({
        amountFiat: '10',
        fiatPaymentMethod: '/payments/debit-credit-card',
        messenger,
        moneyAccountAddress: MONEY_ACCOUNT_ADDRESS_MOCK,
        requiredToken: REQUIRED_TOKEN_MOCK,
        transactionId: TRANSACTION_ID_MOCK,
      });

      expect(result?.fees.provider).toStrictEqual({ fiat: '0', usd: '0' });
      expect(result?.fees.providerFiat).toStrictEqual({
        fiat: '0',
        usd: '0',
      });
    });
  });

});

