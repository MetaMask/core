import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';

import type { TransactionPayControllerMessenger } from '../../index.js';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getServerQuotes } from './server-quotes.js';
import { submitServerQuotes } from './server-submit.js';
import { ServerStrategy } from './ServerStrategy.js';
import type { ServerQuote } from './types.js';

jest.mock('./server-quotes');
jest.mock('./server-submit');
jest.mock('../../utils/feature-flags');

const QUOTE_MOCK = {
  estimatedDuration: 5,
} as TransactionPayQuote<ServerQuote>;

const QUOTE_REQUEST_MOCK = {
  from: '0x1234567890123456789012345678901234567890',
  sourceBalanceRaw: '1000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0x0000000000000000000000000000000000000001',
  sourceTokenAmount: '1000',
  targetAmountMinimum: '900',
  targetChainId: '0xa4b1',
  targetTokenAddress: '0x0000000000000000000000000000000000000002',
} as QuoteRequest;

const SUPPORTS_REQUEST_MOCK = {
  messenger: {} as TransactionPayControllerMessenger,
  requests: [QUOTE_REQUEST_MOCK],
  transaction: { type: TransactionType.perpsDeposit } as TransactionMeta,
} as PayStrategyGetQuotesRequest;

describe('ServerStrategy', () => {
  const getServerQuotesMock = jest.mocked(getServerQuotes);
  const submitServerQuotesMock = jest.mocked(submitServerQuotes);
  const getPayStrategiesConfigMock = jest.mocked(getPayStrategiesConfig);

  beforeEach(() => {
    jest.resetAllMocks();
    getServerQuotesMock.mockResolvedValue([QUOTE_MOCK]);
    getPayStrategiesConfigMock.mockReturnValue({
      server: {
        enabled: true,
        enabledTransactionTypes: [TransactionType.perpsDeposit],
      },
      relay: { enabled: false },
    } as ReturnType<typeof getPayStrategiesConfig>);
  });

  describe('supports', () => {
    it('returns true when enabled and the flow is allowlisted', () => {
      expect(new ServerStrategy().supports(SUPPORTS_REQUEST_MOCK)).toBe(true);
    });

    it('returns false when server strategy is disabled', () => {
      getPayStrategiesConfigMock.mockReturnValue({
        server: {
          enabled: false,
          enabledTransactionTypes: [TransactionType.perpsDeposit],
        },
        relay: { enabled: true },
      } as ReturnType<typeof getPayStrategiesConfig>);

      expect(new ServerStrategy().supports(SUPPORTS_REQUEST_MOCK)).toBe(false);
    });

    it('returns false when the flow is not allowlisted', () => {
      getPayStrategiesConfigMock.mockReturnValue({
        server: {
          enabled: true,
          enabledTransactionTypes: [] as TransactionType[],
        },
        relay: { enabled: false },
      } as ReturnType<typeof getPayStrategiesConfig>);

      expect(new ServerStrategy().supports(SUPPORTS_REQUEST_MOCK)).toBe(false);
    });

    it('returns false when a request uses an unsupported capability', () => {
      expect(
        new ServerStrategy().supports({
          ...SUPPORTS_REQUEST_MOCK,
          requests: [{ ...QUOTE_REQUEST_MOCK, isMaxAmount: true }],
        }),
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
