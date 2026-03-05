import type { TransactionMeta } from '@metamask/transaction-controller';

import { getFiatQuotes } from './fiat-quotes';
import { submitFiatQuotes } from './fiat-submit';
import { FiatStrategy } from './FiatStrategy';
import type { FiatOriginalQuote } from './types';
import type { TransactionPayControllerMessenger } from '../..';
import type { TransactionPayQuote } from '../../types';

jest.mock('./fiat-quotes');
jest.mock('./fiat-submit');

const QUOTE_MOCK = {
  estimatedDuration: 5,
} as TransactionPayQuote<FiatOriginalQuote>;

describe('FiatStrategy', () => {
  const getFiatQuotesMock = jest.mocked(getFiatQuotes);
  const submitFiatQuotesMock = jest.mocked(submitFiatQuotes);

  beforeEach(() => {
    jest.resetAllMocks();
    getFiatQuotesMock.mockResolvedValue([QUOTE_MOCK]);
  });

  describe('getQuotes', () => {
    it('returns result from util', async () => {
      const result = new FiatStrategy().getQuotes({
        messenger: {} as TransactionPayControllerMessenger,
        requests: [],
        transaction: {} as TransactionMeta,
      });

      expect(await result).toStrictEqual([QUOTE_MOCK]);
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
