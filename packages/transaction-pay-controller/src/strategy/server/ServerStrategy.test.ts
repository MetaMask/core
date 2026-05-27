import type { TransactionMeta } from '@metamask/transaction-controller';

import type { TransactionPayControllerMessenger } from '../..';
import type { TransactionPayQuote } from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getServerQuotes } from './server-quotes';
import { submitServerQuotes } from './server-submit';
import { ServerStrategy } from './ServerStrategy';
import type { ServerQuote } from './types';

jest.mock('./server-quotes');
jest.mock('./server-submit');
jest.mock('../../utils/feature-flags');

const QUOTE_MOCK = {
  estimatedDuration: 5,
} as TransactionPayQuote<ServerQuote>;

describe('ServerStrategy', () => {
  const getServerQuotesMock = jest.mocked(getServerQuotes);
  const submitServerQuotesMock = jest.mocked(submitServerQuotes);
  const getPayStrategiesConfigMock = jest.mocked(getPayStrategiesConfig);

  beforeEach(() => {
    jest.resetAllMocks();
    getServerQuotesMock.mockResolvedValue([QUOTE_MOCK]);
    getPayStrategiesConfigMock.mockReturnValue({
      server: { enabled: true },
      relay: { enabled: false },
    } as ReturnType<typeof getPayStrategiesConfig>);
  });

  describe('supports', () => {
    it('returns true when server strategy is enabled', () => {
      expect(
        new ServerStrategy().supports({
          messenger: {} as TransactionPayControllerMessenger,
        } as never),
      ).toBe(true);
    });

    it('returns false when server strategy is disabled', () => {
      getPayStrategiesConfigMock.mockReturnValue({
        server: { enabled: false },
        relay: { enabled: true },
      } as ReturnType<typeof getPayStrategiesConfig>);

      expect(
        new ServerStrategy().supports({
          messenger: {} as TransactionPayControllerMessenger,
        } as never),
      ).toBe(false);
    });
  });

  describe('getQuotes', () => {
    it('returns result from util', async () => {
      const result = new ServerStrategy().getQuotes({
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
      expect(await new ServerStrategy().getBatchTransactions()).toStrictEqual(
        [],
      );
    });
  });

  describe('execute', () => {
    it('calls util', async () => {
      await new ServerStrategy().execute({
        accountSupports7702: false,
        isSmartTransaction: () => false,
        quotes: [QUOTE_MOCK],
        messenger: {} as TransactionPayControllerMessenger,
        transaction: { txParams: { from: '0x1' } } as TransactionMeta,
      });

      expect(submitServerQuotesMock).toHaveBeenCalledTimes(1);
      expect(
        submitServerQuotesMock.mock.calls[0][0].transaction.txParams.from,
      ).toBe('0x1');
    });

    it('wraps errors', async () => {
      submitServerQuotesMock.mockRejectedValue(new Error('boom'));

      await expect(
        new ServerStrategy().execute({
          accountSupports7702: false,
          isSmartTransaction: () => false,
          quotes: [QUOTE_MOCK],
          messenger: {} as TransactionPayControllerMessenger,
          transaction: { txParams: { from: '0x1' } } as TransactionMeta,
        }),
      ).rejects.toThrow('Server submit: boom');
    });

    it('wraps non-Error throws using String()', async () => {
      submitServerQuotesMock.mockRejectedValue('plain string error');

      await expect(
        new ServerStrategy().execute({
          accountSupports7702: false,
          isSmartTransaction: () => false,
          quotes: [QUOTE_MOCK],
          messenger: {} as TransactionPayControllerMessenger,
          transaction: { txParams: { from: '0x1' } } as TransactionMeta,
        }),
      ).rejects.toThrow('Server submit: plain string error');
    });
  });
});
