import { calculateTotals } from './totals';
import {
  TransactionPayStrategy,
  type TransactionPayControllerMessenger,
} from '..';
import type {
  QuoteRequest,
  TransactionPayQuote,
  TransactionPayRequiredToken,
} from '../types';

const MESSENGER_MOCK = {} as TransactionPayControllerMessenger;

const QUOTE_1_MOCK: TransactionPayQuote<unknown> = {
  dust: {
    fiat: '0.00',
    usd: '0.00',
  },
  estimatedDuration: 123,
  fees: {
    provider: {
      fiat: '1.11',
      usd: '2.22',
    },
    sourceNetwork: {
      fiat: '3.33',
      usd: '4.44',
    },
    targetNetwork: {
      fiat: '5.55',
      usd: '6.66',
    },
  },
  original: undefined,
  request: {} as QuoteRequest,
  strategy: TransactionPayStrategy.Test,
};

const TOKEN_1_MOCK = {
  amountFiat: '1.11',
  amountUsd: '2.22',
} as TransactionPayRequiredToken;

const TOKEN_2_MOCK = {
  amountFiat: '3.33',
  amountUsd: '4.44',
} as TransactionPayRequiredToken;

const QUOTE_2_MOCK: TransactionPayQuote<unknown> = {
  dust: {
    fiat: '0.00',
    usd: '0.00',
  },
  estimatedDuration: 234,
  fees: {
    provider: {
      fiat: '7.77',
      usd: '8.88',
    },
    sourceNetwork: {
      fiat: '9.99',
      usd: '10.10',
    },
    targetNetwork: {
      fiat: '11.11',
      usd: '12.12',
    },
  },
  original: undefined,
  request: {} as QuoteRequest,
  strategy: TransactionPayStrategy.Test,
};

describe('Totals Utils', () => {
  describe('calculateTotals', () => {
    it('returns estimated duration', () => {
      const result = calculateTotals(
        [QUOTE_1_MOCK, QUOTE_2_MOCK],
        [],
        MESSENGER_MOCK,
      );

      expect(result.estimatedDuration).toBe(357);
    });

    it('returns total', () => {
      const result = calculateTotals(
        [QUOTE_1_MOCK, QUOTE_2_MOCK],
        [TOKEN_1_MOCK, TOKEN_2_MOCK],
        MESSENGER_MOCK,
      );

      expect(result.total.fiat).toBe('43.3');
      expect(result.total.usd).toBe('51.08');
    });

    it('returns provider fees', () => {
      const result = calculateTotals(
        [QUOTE_1_MOCK, QUOTE_2_MOCK],
        [],
        MESSENGER_MOCK,
      );

      expect(result.fees.provider.fiat).toBe('8.88');
      expect(result.fees.provider.usd).toBe('11.1');
    });

    it('returns source network fees', () => {
      const result = calculateTotals(
        [QUOTE_1_MOCK, QUOTE_2_MOCK],
        [],
        MESSENGER_MOCK,
      );

      expect(result.fees.sourceNetwork.fiat).toBe('13.32');
      expect(result.fees.sourceNetwork.usd).toBe('14.54');
    });

    it('returns target network fees', () => {
      const result = calculateTotals(
        [QUOTE_1_MOCK, QUOTE_2_MOCK],
        [],
        MESSENGER_MOCK,
      );

      expect(result.fees.targetNetwork.fiat).toBe('16.66');
      expect(result.fees.targetNetwork.usd).toBe('18.78');
    });
  });
});
