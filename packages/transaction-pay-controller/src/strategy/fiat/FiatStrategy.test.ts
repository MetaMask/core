import type { TransactionMeta } from '@metamask/transaction-controller';

import type { TransactionPayControllerMessenger } from '../..';
import type { TransactionPayQuote } from '../../types';
import { getFiatQuotes } from './fiat-quotes';
import { submitFiatQuotes } from './fiat-submit';
import { FiatStrategy } from './FiatStrategy';
import type { FiatQuote } from './types';

jest.mock('./fiat-quotes');
jest.mock('./fiat-submit');

const QUOTE_MOCK = {
  estimatedDuration: 5,
} as TransactionPayQuote<FiatQuote>;

const MESSENGER_MOCK = {
  call: jest.fn().mockReturnValue({ remoteFeatureFlags: {} }),
} as unknown as TransactionPayControllerMessenger;

describe('FiatStrategy', () => {
  const getFiatQuotesMock = jest.mocked(getFiatQuotes);
  const submitFiatQuotesMock = jest.mocked(submitFiatQuotes);

  beforeEach(() => {
    jest.resetAllMocks();
    getFiatQuotesMock.mockResolvedValue([QUOTE_MOCK]);
  });

  describe('getQuotes', () => {
    it('delegates to getFiatQuotes', async () => {
      const request = {
        messenger: MESSENGER_MOCK,
        requests: [],
        transaction: {} as TransactionMeta,
      };

      const result = await new FiatStrategy().getQuotes(request);

      expect(result).toStrictEqual([QUOTE_MOCK]);
      expect(getFiatQuotesMock).toHaveBeenCalledWith(request);
    });
  });

  describe('execute', () => {
    it('delegates to submitFiatQuotes', async () => {
      submitFiatQuotesMock.mockResolvedValue({ transactionHash: '0x1234' });

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

    it('prefixes execute errors with the Fiat prefix without replacing the Error object', async () => {
      const error = new Error('Missing order ID');
      submitFiatQuotesMock.mockRejectedValue(error);

      const thrown = await new FiatStrategy()
        .execute({
          isSmartTransaction: () => false,
          quotes: [QUOTE_MOCK],
          messenger: {} as TransactionPayControllerMessenger,
          transaction: { txParams: { from: '0x1' } } as TransactionMeta,
        })
        .catch((caught) => caught);

      expect(thrown).toBe(error);
      expect(thrown.message).toBe('Fiat: Missing order ID');
    });

    it('throws if fiat submission returns no transaction hash', async () => {
      submitFiatQuotesMock.mockResolvedValue({ transactionHash: undefined });

      await expect(
        new FiatStrategy().execute({
          isSmartTransaction: () => false,
          quotes: [QUOTE_MOCK],
          messenger: {} as TransactionPayControllerMessenger,
          transaction: { txParams: { from: '0x1' } } as TransactionMeta,
        }),
      ).rejects.toThrow('Fiat: Missing transaction hash');
    });

    it('preserves nested Post-Ramp and Vault prefixes', async () => {
      submitFiatQuotesMock.mockRejectedValue(
        new Error('Post-Ramp: Direct mUSD: Vault: Missing transaction hash'),
      );

      await expect(
        new FiatStrategy().execute({
          isSmartTransaction: () => false,
          quotes: [QUOTE_MOCK],
          messenger: {} as TransactionPayControllerMessenger,
          transaction: { txParams: { from: '0x1' } } as TransactionMeta,
        }),
      ).rejects.toThrow(
        'Fiat: Post-Ramp: Direct mUSD: Vault: Missing transaction hash',
      );
    });
  });
});
