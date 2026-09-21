import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';

import type { QuoteRequest } from '../../types.js';
import {
  DEFAULT_SERVER_ENABLED_TRANSACTION_TYPES,
  getServerUnsupportedReason,
  ServerUnsupportedReason,
} from './server-support.js';

const REQUEST_MOCK: QuoteRequest = {
  from: '0x1234567890123456789012345678901234567890',
  sourceBalanceRaw: '1000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0x0000000000000000000000000000000000000001',
  sourceTokenAmount: '1000',
  targetAmountMinimum: '900',
  targetChainId: '0xa4b1',
  targetTokenAddress: '0x0000000000000000000000000000000000000002',
};

const TRANSACTION_MOCK = {
  type: TransactionType.perpsDeposit,
} as TransactionMeta;

/**
 * Invoke the util with sensible defaults for a supported perps deposit.
 *
 * @param overrides - Values to override on the default arguments.
 * @param overrides.enabledTransactionTypes - Allowlisted transaction types.
 * @param overrides.requests - Quote requests.
 * @param overrides.transaction - Parent transaction.
 * @returns The unsupported reason, if any.
 */
function getReason({
  enabledTransactionTypes = [TransactionType.perpsDeposit],
  requests = [REQUEST_MOCK],
  transaction = TRANSACTION_MOCK,
}: {
  enabledTransactionTypes?: TransactionType[];
  requests?: QuoteRequest[];
  transaction?: TransactionMeta;
} = {}): ServerUnsupportedReason | undefined {
  return getServerUnsupportedReason({
    enabledTransactionTypes,
    requests,
    transaction,
  });
}

describe('server-support', () => {
  describe('DEFAULT_SERVER_ENABLED_TRANSACTION_TYPES', () => {
    it('is empty so enabling the strategy alone diverts no traffic', () => {
      expect(DEFAULT_SERVER_ENABLED_TRANSACTION_TYPES).toStrictEqual([]);
    });
  });

  describe('getServerUnsupportedReason', () => {
    it('returns undefined when the flow is allowlisted and uses no unsupported capability', () => {
      expect(getReason()).toBeUndefined();
    });

    it('returns undefined when there are no requests', () => {
      expect(getReason({ requests: [] })).toBeUndefined();
    });

    it('supports a flow only once it is added to the allowlist', () => {
      expect(getReason({ enabledTransactionTypes: [] })).toBe(
        ServerUnsupportedReason.DisabledTransactionType,
      );

      expect(
        getReason({ enabledTransactionTypes: [TransactionType.perpsDeposit] }),
      ).toBeUndefined();
    });

    it('returns disabled transaction type when the flow is not allowlisted', () => {
      expect(
        getReason({ enabledTransactionTypes: [TransactionType.predictDeposit] }),
      ).toBe(ServerUnsupportedReason.DisabledTransactionType);
    });

    it('returns disabled transaction type when the transaction has no type', () => {
      expect(getReason({ transaction: {} as TransactionMeta })).toBe(
        ServerUnsupportedReason.DisabledTransactionType,
      );
    });

    it('returns undefined when a nested transaction has an allowlisted type', () => {
      expect(
        getReason({
          transaction: {
            nestedTransactions: [{ type: TransactionType.perpsDeposit }],
            type: TransactionType.batch,
          } as TransactionMeta,
        }),
      ).toBeUndefined();
    });

    it.each([
      TransactionType.perpsDepositAndOrder,
      TransactionType.predictDepositAndOrder,
    ])(
      'returns exact output for %s even when explicitly allowlisted',
      (transactionType) => {
        expect(
          getReason({
            enabledTransactionTypes: [transactionType],
            transaction: { type: transactionType } as TransactionMeta,
          }),
        ).toBe(ServerUnsupportedReason.ExactOutput);
      },
    );

    it('returns exact output when a nested transaction requires it', () => {
      expect(
        getReason({
          transaction: {
            nestedTransactions: [
              { type: TransactionType.perpsDepositAndOrder },
            ],
            type: TransactionType.perpsDeposit,
          } as TransactionMeta,
        }),
      ).toBe(ServerUnsupportedReason.ExactOutput);
    });

    it.each([
      ['atomic', { atomic: false }, ServerUnsupportedReason.NonAtomic],
      [
        'hyperliquidActivationFeeUsd',
        { hyperliquidActivationFeeUsd: '1' },
        ServerUnsupportedReason.HyperliquidActivationFee,
      ],
      [
        'isDirectMusdMoneyAccount',
        { isDirectMusdMoneyAccount: true },
        ServerUnsupportedReason.DirectMusdMoneyAccount,
      ],
      ['isMaxAmount', { isMaxAmount: true }, ServerUnsupportedReason.MaxAmount],
      [
        'isPolymarketDepositWallet',
        { isPolymarketDepositWallet: true },
        ServerUnsupportedReason.PolymarketDepositWallet,
      ],
    ] as const)(
      'returns %s reason for an unsupported capability',
      (_name, overrides, expected) => {
        expect(
          getReason({ requests: [{ ...REQUEST_MOCK, ...overrides }] }),
        ).toBe(expected);
      },
    );

    it('returns a reason when any request is unsupported', () => {
      expect(
        getReason({
          requests: [REQUEST_MOCK, { ...REQUEST_MOCK, isMaxAmount: true }],
        }),
      ).toBe(ServerUnsupportedReason.MaxAmount);
    });

    it('ignores capability flags that are explicitly false or undefined', () => {
      expect(
        getReason({
          requests: [
            {
              ...REQUEST_MOCK,
              atomic: true,
              isDirectMusdMoneyAccount: false,
              isMaxAmount: false,
              isPolymarketDepositWallet: false,
            },
          ],
        }),
      ).toBeUndefined();
    });
  });
});
