import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';

import type { TransactionPayControllerMessenger } from '../..';
import type { TransactionPayQuote } from '../../types';
import { getDirectMusdToMoneyAccountQuotes } from './fiat-direct-musd-quotes-for-money-account';
import { getFiatQuotes } from './fiat-quotes';
import { submitFiatQuotes } from './fiat-submit';
import { FiatStrategy } from './FiatStrategy';
import type { FiatQuote } from './types';

jest.mock('./fiat-quotes');
jest.mock('./fiat-submit');
jest.mock('./fiat-direct-musd-quotes-for-money-account');

const QUOTE_MOCK = {
  estimatedDuration: 5,
} as TransactionPayQuote<FiatQuote>;

const MESSENGER_MOCK = {
  call: jest.fn().mockReturnValue({ remoteFeatureFlags: {} }),
} as unknown as TransactionPayControllerMessenger;

const MONEY_ACCOUNT_DEPOSIT_TX = {
  id: 'tx-1',
  type: TransactionType.batch,
  txParams: { from: '0xMoneyAccount' },
  nestedTransactions: [
    { type: TransactionType.tokenMethodApprove },
    { type: TransactionType.moneyAccountDeposit },
  ],
} as unknown as TransactionMeta;

const DIRECT_QUOTE_MOCK = {
  estimatedDuration: 3,
} as TransactionPayQuote<FiatQuote>;

describe('FiatStrategy', () => {
  const getFiatQuotesMock = jest.mocked(getFiatQuotes);
  const submitFiatQuotesMock = jest.mocked(submitFiatQuotes);
  const getDirectMusdQuotesMock = jest.mocked(
    getDirectMusdToMoneyAccountQuotes,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    (MESSENGER_MOCK.call as jest.Mock).mockReturnValue({
      remoteFeatureFlags: {},
    });
    getFiatQuotesMock.mockResolvedValue([QUOTE_MOCK]);
    getDirectMusdQuotesMock.mockResolvedValue([]);
  });

  describe('getQuotes', () => {
    it('returns result from getFiatQuotes when flag is off', async () => {
      const result = new FiatStrategy().getQuotes({
        messenger: MESSENGER_MOCK,
        requests: [],
        transaction: {} as TransactionMeta,
      });

      expect(await result).toStrictEqual([QUOTE_MOCK]);
      expect(getDirectMusdQuotesMock).not.toHaveBeenCalled();
    });

    it('tries direct mUSD quotes when flag is on and transaction is moneyAccountDeposit', async () => {
      (MESSENGER_MOCK.call as jest.Mock).mockReturnValue({
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            useFiatMUSDQuoteToInjectForMoneyAccount: true,
          },
        },
      });
      getDirectMusdQuotesMock.mockResolvedValue([DIRECT_QUOTE_MOCK]);

      const result = await new FiatStrategy().getQuotes({
        messenger: MESSENGER_MOCK,
        requests: [],
        transaction: MONEY_ACCOUNT_DEPOSIT_TX,
      });

      expect(result).toStrictEqual([DIRECT_QUOTE_MOCK]);
      expect(getFiatQuotesMock).not.toHaveBeenCalled();
    });

    it('falls back to getFiatQuotes when direct mUSD quotes returns empty', async () => {
      (MESSENGER_MOCK.call as jest.Mock).mockReturnValue({
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            useFiatMUSDQuoteToInjectForMoneyAccount: true,
          },
        },
      });
      getDirectMusdQuotesMock.mockResolvedValue([]);

      const result = await new FiatStrategy().getQuotes({
        messenger: MESSENGER_MOCK,
        requests: [],
        transaction: MONEY_ACCOUNT_DEPOSIT_TX,
      });

      expect(result).toStrictEqual([QUOTE_MOCK]);
      expect(getDirectMusdQuotesMock).toHaveBeenCalledTimes(1);
      expect(getFiatQuotesMock).toHaveBeenCalledTimes(1);
    });

    it('does not try direct mUSD quotes for non-moneyAccountDeposit transactions', async () => {
      (MESSENGER_MOCK.call as jest.Mock).mockReturnValue({
        remoteFeatureFlags: {
          confirmations_pay_fiat: {
            useFiatMUSDQuoteToInjectForMoneyAccount: true,
          },
        },
      });

      await new FiatStrategy().getQuotes({
        messenger: MESSENGER_MOCK,
        requests: [],
        transaction: {
          type: TransactionType.predictDeposit,
        } as TransactionMeta,
      });

      expect(getDirectMusdQuotesMock).not.toHaveBeenCalled();
      expect(getFiatQuotesMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute', () => {
    it('calls util', async () => {
      await new FiatStrategy().execute({
        isSmartTransaction: () => false,
        quotes: [QUOTE_MOCK],
        messenger: {} as TransactionPayControllerMessenger,
        transaction: { txParams: { from: '0x1' } } as TransactionMeta,
      });

      expect(submitFiatQuotesMock).toHaveBeenCalledTimes(1);
      expect(
        submitFiatQuotesMock.mock.calls[0][0].transaction.txParams.from,
      ).toBe('0x1');
    });
  });
});
