import type { TransactionMeta } from '@metamask/transaction-controller';

import type { TransactionPayControllerMessenger } from '../..';
import type { TransactionPayQuote } from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getGenericQuotes } from './generic-quotes';
import { submitGenericQuotes } from './generic-submit';
import { GenericStrategy } from './GenericStrategy';
import type { GenericQuote } from './types';

jest.mock('./generic-quotes');
jest.mock('./generic-submit');
jest.mock('../../utils/feature-flags');

const QUOTE_MOCK = {
  estimatedDuration: 5,
} as TransactionPayQuote<GenericQuote>;

describe('GenericStrategy', () => {
  const getGenericQuotesMock = jest.mocked(getGenericQuotes);
  const submitGenericQuotesMock = jest.mocked(submitGenericQuotes);
  const getPayStrategiesConfigMock = jest.mocked(getPayStrategiesConfig);

  beforeEach(() => {
    jest.resetAllMocks();
    getGenericQuotesMock.mockResolvedValue([QUOTE_MOCK]);
    getPayStrategiesConfigMock.mockReturnValue({
      generic: { enabled: true },
      relay: { enabled: false },
    } as ReturnType<typeof getPayStrategiesConfig>);
  });

  describe('supports', () => {
    it('returns true when generic strategy is enabled', () => {
      expect(
        new GenericStrategy().supports({
          messenger: {} as TransactionPayControllerMessenger,
        } as never),
      ).toBe(true);
    });

    it('returns false when generic strategy is disabled', () => {
      getPayStrategiesConfigMock.mockReturnValue({
        generic: { enabled: false },
        relay: { enabled: true },
      } as ReturnType<typeof getPayStrategiesConfig>);

      expect(
        new GenericStrategy().supports({
          messenger: {} as TransactionPayControllerMessenger,
        } as never),
      ).toBe(false);
    });
  });

  describe('getQuotes', () => {
    it('returns result from util', async () => {
      const result = new GenericStrategy().getQuotes({
        accountSupports7702: false,
        messenger: {} as TransactionPayControllerMessenger,
        requests: [],
        transaction: {} as TransactionMeta,
      });

      expect(await result).toStrictEqual([QUOTE_MOCK]);
    });
  });

  describe('getBatchTransactions', () => {
    it('returns empty batch list', async () => {
      expect(await new GenericStrategy().getBatchTransactions()).toStrictEqual(
        [],
      );
    });
  });

  describe('execute', () => {
    it('calls util', async () => {
      await new GenericStrategy().execute({
        accountSupports7702: false,
        isSmartTransaction: () => false,
        quotes: [QUOTE_MOCK],
        messenger: {} as TransactionPayControllerMessenger,
        transaction: { txParams: { from: '0x1' } } as TransactionMeta,
      });

      expect(submitGenericQuotesMock).toHaveBeenCalledTimes(1);
      expect(
        submitGenericQuotesMock.mock.calls[0][0].transaction.txParams.from,
      ).toBe('0x1');
    });

    it('wraps errors', async () => {
      submitGenericQuotesMock.mockRejectedValue(new Error('boom'));

      await expect(
        new GenericStrategy().execute({
          accountSupports7702: false,
          isSmartTransaction: () => false,
          quotes: [QUOTE_MOCK],
          messenger: {} as TransactionPayControllerMessenger,
          transaction: { txParams: { from: '0x1' } } as TransactionMeta,
        }),
      ).rejects.toThrow('Generic submit: boom');
    });
  });
});
