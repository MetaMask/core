import type { TransactionMeta } from '@metamask/transaction-controller';

import { submitFiatQuotes } from './fiat-submit';
import type { FiatOriginalQuote } from './types';
import type { TransactionPayControllerMessenger } from '../..';
import type { TransactionPayQuote } from '../../types';

describe('submitFiatQuotes', () => {
  it('returns empty transaction hash placeholder', async () => {
    const result = await submitFiatQuotes({
      isSmartTransaction: () => false,
      quotes: [] as TransactionPayQuote<FiatOriginalQuote>[],
      messenger: {} as TransactionPayControllerMessenger,
      transaction: {} as TransactionMeta,
    });

    expect(result).toStrictEqual({ transactionHash: undefined });
  });
});
