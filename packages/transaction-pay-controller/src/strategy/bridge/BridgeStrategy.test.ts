import type { QuoteResponse } from '@metamask/bridge-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import { getBridgeQuotes } from './bridge-quotes';
import { submitBridgeQuotes } from './bridge-submit';
import { BridgeStrategy } from './BridgeStrategy';
import type {
  TransactionPayControllerMessenger,
  TransactionPayPublishHookMessenger,
} from '../..';
import type { TransactionPayQuote } from '../../types';

jest.mock('./bridge-quotes');
jest.mock('./bridge-submit');

const QUOTE_MOCK = {
  estimatedDuration: 5,
} as TransactionPayQuote<QuoteResponse>;

describe('BridgeStrategy', () => {
  const getBridgeQuotesMock = jest.mocked(getBridgeQuotes);
  const submitBridgeQuotesMock = jest.mocked(submitBridgeQuotes);

  beforeEach(() => {
    jest.resetAllMocks();
    getBridgeQuotesMock.mockResolvedValue([QUOTE_MOCK]);
  });

  describe('getQuotes', () => {
    it('returns result from util', async () => {
      const result = new BridgeStrategy().getQuotes({
        messenger: {} as TransactionPayControllerMessenger,
        requests: [],
      });

      expect(await result).toStrictEqual([QUOTE_MOCK]);
    });
  });

  describe('execute', () => {
    it('calls util', async () => {
      await new BridgeStrategy().execute({
        isSmartTransaction: () => false,
        quotes: [QUOTE_MOCK],
        messenger: {} as TransactionPayPublishHookMessenger,
        transaction: { txParams: { from: '0x1' } } as TransactionMeta,
      });

      expect(submitBridgeQuotesMock).toHaveBeenCalledTimes(1);
      expect(submitBridgeQuotesMock.mock.calls[0][0].from).toBe('0x1');
    });
  });
});
