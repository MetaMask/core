import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import { describe, expect, it } from 'vitest';

import type { QuoteRequest } from '../../types.js';
import {
  DEFAULT_SERVER_ENABLED_TRANSACTION_TYPES,
  getServerUnsupportedReason,
  ServerUnsupportedReason,
} from './server-support.js';

const TRANSACTION_MOCK = {
  type: TransactionType.perpsDeposit,
} as TransactionMeta;

const TRUE_EXACT_OUTPUT_REQUEST_MOCK = {
  from: '0x1234567890123456789012345678901234567890',
  isTrueExactOutput: true,
  sourceAccountId: 'eip155:1:0x1234567890123456789012345678901234567890',
  sourceAssetId: 'eip155:1/erc20:0x0000000000000000000000000000000000000001',
  sourceBalanceRaw: '1000000',
  sourceTokenAmount: '1000',
  targetAmountMinimum: '900',
  targetChainId: '0x2105',
  targetTokenAddress: '0x0000000000000000000000000000000000000002',
} as QuoteRequest;

/**
 * Invoke the util with sensible defaults for a supported perps deposit.
 *
 * @param overrides - Values to override on the default arguments.
 * @param overrides.enabledTransactionTypes - Allowlisted transaction types.
 * @param overrides.requests - Quote requests for the transaction.
 * @param overrides.transaction - Parent transaction.
 * @returns The unsupported reason, if any.
 */
function getReason({
  enabledTransactionTypes = [TransactionType.perpsDeposit],
  requests,
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

    it('returns disabled transaction type for a true exact output request whose flow is not allowlisted', () => {
      expect(
        getReason({
          enabledTransactionTypes: [],
          requests: [TRUE_EXACT_OUTPUT_REQUEST_MOCK],
        }),
      ).toBe(ServerUnsupportedReason.DisabledTransactionType);
    });

    it('returns undefined for a true exact output request whose flow is allowlisted', () => {
      expect(
        getReason({ requests: [TRUE_EXACT_OUTPUT_REQUEST_MOCK] }),
      ).toBeUndefined();
    });

    it.each([
      ['the maximum amount', { isMaxAmount: true }],
      ['a non-atomic execution', { atomic: false }],
    ])(
      'returns unsupported true exact output when a true exact output request uses %s',
      (_title, overrides) => {
        expect(
          getReason({
            requests: [{ ...TRUE_EXACT_OUTPUT_REQUEST_MOCK, ...overrides }],
          }),
        ).toBe(ServerUnsupportedReason.UnsupportedTrueExactOutput);
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
