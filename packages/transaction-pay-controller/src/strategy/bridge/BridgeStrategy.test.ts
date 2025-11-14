import type { TransactionMeta } from '@metamask/transaction-controller';
import type { BatchTransaction } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';

import {
  getBridgeBatchTransactions,
  getBridgeQuotes,
  getBridgeRefreshInterval,
} from './bridge-quotes';
import { submitBridgeQuotes } from './bridge-submit';
import { BridgeStrategy } from './BridgeStrategy';
import type { TransactionPayBridgeQuote } from './types';
import type { TransactionPayControllerMessenger } from '../..';
import type {
  PayStrategyGetBatchRequest,
  TransactionPayQuote,
} from '../../types';

jest.mock('./bridge-quotes');
jest.mock('./bridge-submit');

const REFRESH_INTERVAL_MOCK = 123000;

const QUOTE_MOCK = {
  estimatedDuration: 5,
} as TransactionPayQuote<TransactionPayBridgeQuote>;

const BATCH_TRANSACTION_MOCK = {
  type: TransactionType.simpleSend,
  txParams: {
    from: '0x1' as const,
    to: '0x2' as const,
    value: '0x0' as const,
    data: '0x' as const,
  },
} as BatchTransaction;

describe('BridgeStrategy', () => {
  const getBridgeQuotesMock = jest.mocked(getBridgeQuotes);
  const submitBridgeQuotesMock = jest.mocked(submitBridgeQuotes);
  const getBridgeRefreshIntervalMock = jest.mocked(getBridgeRefreshInterval);
  const getBridgeBatchTransactionsMock = jest.mocked(
    getBridgeBatchTransactions,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    getBridgeQuotesMock.mockResolvedValue([QUOTE_MOCK]);
    getBridgeBatchTransactionsMock.mockResolvedValue([BATCH_TRANSACTION_MOCK]);
    getBridgeRefreshIntervalMock.mockReturnValue(REFRESH_INTERVAL_MOCK);
  });

  describe('getQuotes', () => {
    it('returns result from util', async () => {
      const result = new BridgeStrategy().getQuotes({
        messenger: {} as TransactionPayControllerMessenger,
        requests: [],
        transaction: {} as TransactionMeta,
      });

      expect(await result).toStrictEqual([QUOTE_MOCK]);
    });
  });

  describe('getBatchTransactions', () => {
    it('returns result from util', async () => {
      const result = await new BridgeStrategy().getBatchTransactions({
        quotes: [QUOTE_MOCK],
      } as PayStrategyGetBatchRequest<TransactionPayBridgeQuote>);

      expect(result).toStrictEqual([BATCH_TRANSACTION_MOCK]);
    });
  });

  describe('getRefreshInterval', () => {
    it('returns result from util', async () => {
      const result = await new BridgeStrategy().getRefreshInterval({
        chainId: '0x1',
        messenger: {} as TransactionPayControllerMessenger,
      });

      expect(result).toBe(REFRESH_INTERVAL_MOCK);
    });
  });

  describe('execute', () => {
    it('calls util', async () => {
      await new BridgeStrategy().execute({
        isSmartTransaction: () => false,
        quotes: [QUOTE_MOCK],
        messenger: {} as TransactionPayControllerMessenger,
        transaction: { txParams: { from: '0x1' } } as TransactionMeta,
      });

      expect(submitBridgeQuotesMock).toHaveBeenCalledTimes(1);
      expect(submitBridgeQuotesMock.mock.calls[0][0].from).toBe('0x1');
    });
  });
});
