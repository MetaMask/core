import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SERVER_ENABLED_TRANSACTION_TYPES,
  getServerUnsupportedReason,
  ServerUnsupportedReason,
} from './server-support.js';

const TRANSACTION_MOCK = {
  type: TransactionType.perpsDeposit,
} as TransactionMeta;

/**
 * Invoke the util with sensible defaults for a supported perps deposit.
 *
 * @param overrides - Values to override on the default arguments.
 * @param overrides.enabledTransactionTypes - Allowlisted transaction types.
 * @param overrides.transaction - Parent transaction.
 * @returns The unsupported reason, if any.
 */
function getReason({
  enabledTransactionTypes = [TransactionType.perpsDeposit],
  transaction = TRANSACTION_MOCK,
}: {
  enabledTransactionTypes?: TransactionType[];
  transaction?: TransactionMeta;
} = {}): ServerUnsupportedReason | undefined {
  return getServerUnsupportedReason({
    enabledTransactionTypes,
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
    it('returns undefined when the flow is allowlisted', () => {
      expect(getReason()).toBeUndefined();
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
        getReason({
          enabledTransactionTypes: [TransactionType.predictDeposit],
        }),
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
      {
        type: TransactionType.perpsLighterDeposit,
      },
      {
        type: TransactionType.perpsLighterDepositAndOrder,
      },
      {
        type: TransactionType.batch,
        nestedTransactions: [{ type: TransactionType.perpsLighterWithdraw }],
      },
    ])(
      'does not support a Lighter transaction when only the Hyperliquid types are allowlisted: $type',
      (transaction) => {
        expect(
          getReason({
            enabledTransactionTypes: [
              TransactionType.perpsDeposit,
              TransactionType.perpsDepositAndOrder,
              TransactionType.perpsWithdraw,
            ],
            transaction: transaction as TransactionMeta,
          }),
        ).toBe(ServerUnsupportedReason.DisabledTransactionType);
      },
    );

    it.each([
      TransactionType.perpsDepositAndOrder,
      TransactionType.predictDepositAndOrder,
    ])(
      'returns undefined for exact-output type %s once allowlisted',
      (transactionType) => {
        expect(
          getReason({
            enabledTransactionTypes: [transactionType],
            transaction: { type: transactionType } as TransactionMeta,
          }),
        ).toBeUndefined();
      },
    );
  });
});
