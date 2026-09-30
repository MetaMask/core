import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';

import { getQuotePricing, TradeType } from './trade-type.js';

const SOURCE_TOKEN_AMOUNT_MOCK = '1000000000000000000';
const TARGET_AMOUNT_MINIMUM_MOCK = '123';

/**
 * Get the pricing for a quote request, with defaults for unrelated arguments.
 *
 * @param overrides - Arguments to override.
 * @param overrides.hasCalls - Whether the request bundles calls.
 * @param overrides.transaction - Metadata of the original target transaction.
 * @returns The amount to quote and the pricing basis to quote it on.
 */
function getPricing(
  overrides: {
    hasCalls?: boolean;
    transaction?: TransactionMeta;
  } = {},
): { amount: string; tradeType: TradeType } {
  return getQuotePricing({
    hasCalls: false,
    sourceTokenAmount: SOURCE_TOKEN_AMOUNT_MOCK,
    targetAmountMinimum: TARGET_AMOUNT_MINIMUM_MOCK,
    ...overrides,
  });
}

describe('trade-type', () => {
  describe('getQuotePricing', () => {
    it('prices on the source amount when no calls are bundled', () => {
      expect(getPricing()).toStrictEqual({
        amount: SOURCE_TOKEN_AMOUNT_MOCK,
        tradeType: TradeType.ExactInput,
      });
    });

    it('prices on the target amount when calls are bundled', () => {
      expect(getPricing({ hasCalls: true })).toStrictEqual({
        amount: TARGET_AMOUNT_MINIMUM_MOCK,
        tradeType: TradeType.ExactOutput,
      });
    });

    it.each([
      TransactionType.perpsDepositAndOrder,
      TransactionType.predictDepositAndOrder,
    ])('prices %s on the target amount without calls', (type) => {
      expect(
        getPricing({ transaction: { type } as TransactionMeta }),
      ).toStrictEqual({
        amount: TARGET_AMOUNT_MINIMUM_MOCK,
        tradeType: TradeType.ExactOutput,
      });
    });

    it('prices on the target amount when a nested transaction requires it', () => {
      const transaction = {
        nestedTransactions: [{ type: TransactionType.perpsDepositAndOrder }],
        type: TransactionType.batch,
      } as TransactionMeta;

      expect(getPricing({ transaction })).toStrictEqual({
        amount: TARGET_AMOUNT_MINIMUM_MOCK,
        tradeType: TradeType.ExactOutput,
      });
    });

    it('prices on the source amount for unrelated transaction types', () => {
      const transaction = {
        type: TransactionType.perpsDeposit,
      } as TransactionMeta;

      expect(getPricing({ transaction })).toStrictEqual({
        amount: SOURCE_TOKEN_AMOUNT_MOCK,
        tradeType: TradeType.ExactInput,
      });
    });
  });
});
