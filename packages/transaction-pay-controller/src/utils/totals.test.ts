import type { TransactionMeta } from '@metamask/transaction-controller';

import { calculateTransactionGasCost } from './gas';
import { calculateTotals } from './totals';
import { TransactionPayStrategy } from '..';
import type { TransactionPayControllerMessenger } from '..';
import type {
  QuoteRequest,
  TransactionPayQuote,
  TransactionPayRequiredToken,
} from '../types';

jest.mock('./gas');

const MESSENGER_MOCK = {} as TransactionPayControllerMessenger;

const QUOTE_1_MOCK: TransactionPayQuote<unknown> = {
  dust: {
    fiat: '0.00',
    usd: '0.00',
  },
  estimatedDuration: 123,
  fees: {
    metaMask: {
      fiat: '0.50',
      usd: '0.25',
    },
    provider: {
      fiat: '1.11',
      usd: '2.22',
    },
    sourceNetwork: {
      estimate: {
        fiat: '3.33',
        human: '3.33',
        raw: '333000000000000',
        usd: '4.44',
      },
      max: {
        fiat: '3.34',
        human: '3.34',
        raw: '334000000000000',
        usd: '4.45',
      },
    },
    targetNetwork: {
      fiat: '5.55',
      usd: '6.66',
    },
  },
  original: undefined,
  request: {} as QuoteRequest,
  sourceAmount: {
    human: '7.77',
    fiat: '7.77',
    raw: '777000000000000',
    usd: '8.88',
  },
  strategy: TransactionPayStrategy.Test,
  targetAmount: {
    fiat: '9.99',
    usd: '10.10',
  },
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
    isSourceGasFeeToken: true,
    metaMask: {
      fiat: '1.00',
      usd: '0.75',
    },
    provider: {
      fiat: '7.77',
      usd: '8.88',
    },
    sourceNetwork: {
      estimate: {
        fiat: '9.99',
        human: '9.99',
        raw: '999000000000000',
        usd: '10.10',
      },
      max: {
        fiat: '9.999',
        human: '9.999',
        raw: '999900000000000',
        usd: '10.11',
      },
    },
    targetNetwork: {
      fiat: '11.11',
      usd: '12.12',
    },
  },
  original: undefined,
  request: {} as QuoteRequest,
  sourceAmount: {
    human: '13.13',
    fiat: '13.13',
    raw: '1313000000000000',
    usd: '14.14',
  },
  strategy: TransactionPayStrategy.Test,
  targetAmount: {
    fiat: '15.15',
    usd: '16.16',
  },
};

const TRANSACTION_META_MOCK = {} as TransactionMeta;

describe('Totals Utils', () => {
  const calculateTransactionGasCostMock = jest.mocked(
    calculateTransactionGasCost,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    calculateTransactionGasCostMock.mockReturnValue({
      isGasFeeToken: true,
      fiat: '1.23',
      human: '1.23',
      raw: '1230000000000000',
      usd: '2.34',
    });
  });

  describe('calculateTotals', () => {
    it('returns estimated duration', () => {
      const result = calculateTotals({
        quotes: [QUOTE_1_MOCK, QUOTE_2_MOCK],
        tokens: [],
        messenger: MESSENGER_MOCK,
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result.estimatedDuration).toBe(357);
    });

    it('returns total', () => {
      const result = calculateTotals({
        quotes: [QUOTE_1_MOCK, QUOTE_2_MOCK],
        tokens: [TOKEN_1_MOCK, TOKEN_2_MOCK],
        messenger: MESSENGER_MOCK,
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result.total.fiat).toBe('44.8');
      expect(result.total.usd).toBe('52.08');
    });

    it('returns adjusted total when isMaxAmount is true', () => {
      const result = calculateTotals({
        isMaxAmount: true,
        quotes: [QUOTE_1_MOCK, QUOTE_2_MOCK],
        tokens: [TOKEN_1_MOCK, TOKEN_2_MOCK],
        messenger: MESSENGER_MOCK,
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result.total.fiat).toBe('65.5');
      expect(result.total.usd).toBe('71.68');
    });

    it('returns total excluding token amount not in quote', () => {
      const result = calculateTotals({
        quotes: [QUOTE_1_MOCK, QUOTE_2_MOCK],
        tokens: [
          TOKEN_1_MOCK,
          {
            ...TOKEN_2_MOCK,
            balanceRaw: '10',
            amountRaw: '9',
            skipIfBalance: true,
          },
        ],
        messenger: MESSENGER_MOCK,
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result.total.fiat).toBe('41.47');
      expect(result.total.usd).toBe('47.64');
    });

    it('returns metaMask fees', () => {
      const result = calculateTotals({
        quotes: [QUOTE_1_MOCK, QUOTE_2_MOCK],
        tokens: [],
        messenger: MESSENGER_MOCK,
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result.fees.metaMask.fiat).toBe('1.5');
      expect(result.fees.metaMask.usd).toBe('1');
    });

    it('returns provider fees', () => {
      const result = calculateTotals({
        quotes: [QUOTE_1_MOCK, QUOTE_2_MOCK],
        tokens: [],
        messenger: MESSENGER_MOCK,
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result.fees.provider.fiat).toBe('8.88');
      expect(result.fees.provider.usd).toBe('11.1');
    });

    it('returns source network fees', () => {
      const result = calculateTotals({
        quotes: [QUOTE_1_MOCK, QUOTE_2_MOCK],
        tokens: [],
        messenger: MESSENGER_MOCK,
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result.fees.sourceNetwork.estimate.fiat).toBe('13.32');
      expect(result.fees.sourceNetwork.estimate.usd).toBe('14.54');
      expect(result.fees.sourceNetwork.max.fiat).toBe('13.339');
      expect(result.fees.sourceNetwork.max.usd).toBe('14.56');
    });

    it('returns target network fees', () => {
      const result = calculateTotals({
        quotes: [QUOTE_1_MOCK, QUOTE_2_MOCK],
        tokens: [],
        messenger: MESSENGER_MOCK,
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result.fees.targetNetwork.fiat).toBe('16.66');
      expect(result.fees.targetNetwork.usd).toBe('18.78');
    });

    it('returns target network fee as transaction fee if no quotes', () => {
      const result = calculateTotals({
        quotes: [],
        tokens: [],
        messenger: MESSENGER_MOCK,
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result.fees.targetNetwork.fiat).toBe('1.23');
      expect(result.fees.targetNetwork.usd).toBe('2.34');
      expect(result.fees.isTargetGasFeeToken).toBe(true);
    });

    it('returns source amount', () => {
      const result = calculateTotals({
        quotes: [QUOTE_1_MOCK, QUOTE_2_MOCK],
        tokens: [],
        messenger: MESSENGER_MOCK,
        transaction: TRANSACTION_META_MOCK,
      });

      expect(result.sourceAmount.fiat).toBe('20.9');
      expect(result.sourceAmount.usd).toBe('23.02');
      expect(result.fees.isSourceGasFeeToken).toBe(true);
    });
  });
});
