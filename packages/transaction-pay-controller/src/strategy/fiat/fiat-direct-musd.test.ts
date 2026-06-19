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
  submitDirectMusdVaultDeposit,
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

  describe('submitDirectMusdVaultDeposit', () => {
    it('submits a sponsored Money Account vault batch with refreshed calldata', async () => {
      updateTransactionMock.mockImplementation((_request, callback) => {
        callback({
          ...TRANSACTION_MOCK,
          nestedTransactions: TRANSACTION_MOCK.nestedTransactions?.map(
            (nestedTransaction) => ({ ...nestedTransaction }),
          ),
          requiredAssets: [{ amount: '0x0' }],
        } as TransactionMeta);
      });

      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({
            updates: [
              { data: '0xnewApprove', nestedTransactionIndex: 0 },
              { data: '0xnewDeposit', nestedTransactionIndex: 1 },
            ],
          });
        }

        if (action === 'TransactionController:addTransactionBatch') {
          return Promise.resolve({ batchId: 'batch-id' });
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      const result = await submitDirectMusdVaultDeposit({
        request: getExecuteRequest({ callMock }),
        sourceAmountRaw: '5000000',
        transaction: TRANSACTION_MOCK,
      });

      expect(callMock).toHaveBeenCalledWith(
        'TransactionPayController:getAmountData',
        { amount: '5000000', transaction: TRANSACTION_MOCK },
      );
      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          note: 'Direct mUSD fiat: update vault amount',
          transactionId: TRANSACTION_ID_MOCK,
        }),
        expect.any(Function),
      );
      expect(callMock).toHaveBeenCalledWith(
        'TransactionController:addTransactionBatch',
        expect.objectContaining({
          from: MONEY_ACCOUNT_ADDRESS_MOCK,
          isGasFeeSponsored: true,
          isInternal: true,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          origin: 'metamask',
          requireApproval: false,
          transactions: [
            {
              params: { data: '0xnewApprove', to: '0xapprove', value: '0x0' },
              type: TransactionType.tokenMethodApprove,
            },
            {
              params: { data: '0xnewDeposit', to: '0xdeposit', value: '0x0' },
              type: TransactionType.contractInteraction,
            },
          ],
        }),
      );
      expect(updateTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          note: 'Add required transaction ID from direct mUSD vault submission',
          transactionId: TRANSACTION_ID_MOCK,
        }),
        expect.any(Function),
      );
      expect(waitForTransactionConfirmedMock).toHaveBeenCalledWith(
        'direct-child-1',
        expect.anything(),
      );
      expect(waitForTransactionConfirmedMock).toHaveBeenCalledWith(
        'direct-child-2',
        expect.anything(),
      );
      expect(result).toStrictEqual({ transactionHash: '0xdirect' });
    });

    it('throws when getAmountData returns no updates', async () => {
      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({ updates: [] });
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      await expect(
        submitDirectMusdVaultDeposit({
          request: getExecuteRequest({ callMock }),
          sourceAmountRaw: '5000000',
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('No amount updates');
    });

    it('throws when nested transactions are missing', async () => {
      const transaction = {
        ...TRANSACTION_MOCK,
        nestedTransactions: undefined,
      } as TransactionMeta;
      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({
            updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
          });
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      getTransactionMock.mockReturnValue(transaction);

      await expect(
        submitDirectMusdVaultDeposit({
          request: getExecuteRequest({ callMock }),
          sourceAmountRaw: '5000000',
          transaction,
        }),
      ).rejects.toThrow('Missing nested transactions');
    });

    it('prefixes addTransactionBatch errors with Vault', async () => {
      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({
            updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
          });
        }

        if (action === 'TransactionController:addTransactionBatch') {
          throw new Error('batch failed');
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      await expect(
        submitDirectMusdVaultDeposit({
          request: getExecuteRequest({ callMock }),
          sourceAmountRaw: '5000000',
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('Vault: batch failed');
    });

    it('throws when no vault transactions are collected', async () => {
      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({
            updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
          });
        }

        if (action === 'TransactionController:addTransactionBatch') {
          return Promise.resolve({ batchId: 'batch-id' });
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      collectTransactionIdsMock.mockReturnValue({ end: jest.fn() });

      await expect(
        submitDirectMusdVaultDeposit({
          request: getExecuteRequest({ callMock }),
          sourceAmountRaw: '5000000',
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('No transactions submitted');
    });

    it('throws when the confirmed vault transaction has no hash', async () => {
      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({
            updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
          });
        }

        if (action === 'TransactionController:addTransactionBatch') {
          return Promise.resolve({ batchId: 'batch-id' });
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      getTransactionMock.mockImplementation((transactionId) => {
        if (transactionId === TRANSACTION_ID_MOCK) {
          return TRANSACTION_MOCK;
        }

        return undefined;
      });

      await expect(
        submitDirectMusdVaultDeposit({
          request: getExecuteRequest({ callMock }),
          sourceAmountRaw: '5000000',
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('Missing transaction hash');
    });

    it('skips the vault batch when vaultDisabled is enabled', async () => {
      const callMock = jest.fn();

      getFiatVaultDisabledMock.mockReturnValue(true);

      const result = await submitDirectMusdVaultDeposit({
        request: getExecuteRequest({ callMock }),
        sourceAmountRaw: '5000000',
        transaction: TRANSACTION_MOCK,
      });

      expect(result).toStrictEqual({ transactionHash: '0x' });
      expect(callMock).not.toHaveBeenCalled();
      expect(updateTransactionMock).not.toHaveBeenCalled();
      expect(collectTransactionIdsMock).not.toHaveBeenCalled();
    });

    it('throws if the Money Account address is missing', async () => {
      const transaction = {
        ...TRANSACTION_MOCK,
        txParams: {},
      } as TransactionMeta;

      await expect(
        submitDirectMusdVaultDeposit({
          request: getExecuteRequest(),
          sourceAmountRaw: '5000000',
          transaction,
        }),
      ).rejects.toThrow('Missing Money Account address');
    });
  });
});
