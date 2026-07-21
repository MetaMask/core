import { jest } from '@jest/globals';
import type { TransactionMeta } from '@metamask/transaction-controller';

import type { TransactionPayControllerMessenger } from '../../index.js';
import type { TransactionPayQuote } from '../../types.js';
import { getRelayQuotes } from './relay-quotes.js';
import { submitRelayQuotes } from './relay-submit.js';
import { RelayStrategy } from './RelayStrategy.js';
import type { RelayQuote } from './types.js';

jest.mock('./relay-quotes');
jest.mock('./relay-submit');

const QUOTE_MOCK = {
  estimatedDuration: 5,
} as TransactionPayQuote<RelayQuote>;

describe('RelayStrategy', () => {
  const getBridgeQuotesMock = jest.mocked(getRelayQuotes);
  const submitRelayQuotesMock = jest.mocked(submitRelayQuotes);

  beforeEach(() => {
    jest.resetAllMocks();
    getBridgeQuotesMock.mockResolvedValue([QUOTE_MOCK]);
  });

  describe('getQuotes', () => {
    it('returns result from util', async () => {
      const result = new RelayStrategy().getQuotes({
        messenger: {} as TransactionPayControllerMessenger,
        requests: [],
        transaction: {} as TransactionMeta,
      });

      expect(await result).toStrictEqual([QUOTE_MOCK]);
    });
  });

  describe('execute', () => {
    it('calls util', async () => {
      submitRelayQuotesMock.mockResolvedValue({ transactionHash: '0x1234' });

      await new RelayStrategy().execute({
        isSmartTransaction: () => false,
        quotes: [QUOTE_MOCK],
        messenger: {} as TransactionPayControllerMessenger,
        transaction: { txParams: { from: '0x1' } } as TransactionMeta,
      });

      expect(submitRelayQuotesMock).toHaveBeenCalledTimes(1);
      expect(
        submitRelayQuotesMock.mock.calls[0][0].transaction.txParams.from,
      ).toBe('0x1');
    });
  });
});
