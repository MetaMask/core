import type { TransactionMeta } from '@metamask/transaction-controller';

import { TestStrategy } from './TestStrategy';
import type { TransactionPayPublishHookMessenger } from '../..';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';

jest.useFakeTimers();

const REQUEST_MOCK = {} as QuoteRequest;
const QUOTE_MOCK = {} as TransactionPayQuote<void>;

describe('TestStrategy', () => {
  describe('getQuotes', () => {
    it('returns quote', async () => {
      const quotesPromise = new TestStrategy().getQuotes({
        messenger: {} as TransactionPayControllerMessenger,
        requests: [REQUEST_MOCK],
      });

      jest.runAllTimers();

      const quotes = await quotesPromise;

      expect(quotes).toStrictEqual([
        {
          dust: {
            fiat: expect.any(String),
            usd: expect.any(String),
          },
          estimatedDuration: expect.any(Number),
          fees: {
            provider: {
              fiat: expect.any(String),
              usd: expect.any(String),
            },
            sourceNetwork: {
              fiat: expect.any(String),
              usd: expect.any(String),
            },
            targetNetwork: {
              fiat: expect.any(String),
              usd: expect.any(String),
            },
          },
          original: undefined,
          request: REQUEST_MOCK,
        },
      ]);
    });
  });

  describe('execute', () => {
    it('resolves', async () => {
      const executePromise = new TestStrategy().execute({
        isSmartTransaction: () => false,
        messenger: {} as TransactionPayPublishHookMessenger,
        quotes: [QUOTE_MOCK],
        transaction: {} as TransactionMeta,
      });

      jest.runAllTimers();

      expect(await executePromise).toBeUndefined();
    });
  });
});
