import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { describe, expect, it } from 'vitest';

import { getPayTransactionType } from './transaction-type.js';

function getTransactionMock(
  overrides: Partial<TransactionMeta> = {},
): TransactionMeta {
  return {
    id: 'transaction-id',
    chainId: '0x1',
    time: 0,
    txParams: {},
    ...overrides,
  } as TransactionMeta;
}

describe('getPayTransactionType', () => {
  it('returns undefined if transaction is undefined', () => {
    expect(getPayTransactionType(undefined)).toBeUndefined();
  });

  it('returns transaction type if not a batch', () => {
    expect(
      getPayTransactionType(
        getTransactionMock({ type: TransactionType.moneyAccountDeposit }),
      ),
    ).toBe(TransactionType.moneyAccountDeposit);
  });

  it('returns first non-generic nested type if batch', () => {
    expect(
      getPayTransactionType(
        getTransactionMock({
          type: TransactionType.batch,
          nestedTransactions: [
            { type: TransactionType.tokenMethodApprove },
            { type: TransactionType.contractInteraction },
            { type: TransactionType.simpleSend },
            { type: TransactionType.batch },
            { type: TransactionType.predictDeposit },
            { type: TransactionType.perpsDeposit },
          ],
        }),
      ),
    ).toBe(TransactionType.predictDeposit);
  });

  it('skips nested transactions without a type', () => {
    expect(
      getPayTransactionType(
        getTransactionMock({
          type: TransactionType.batch,
          nestedTransactions: [{}, { type: TransactionType.perpsDeposit }],
        }),
      ),
    ).toBe(TransactionType.perpsDeposit);
  });

  it('returns undefined if batch has only generic nested types', () => {
    expect(
      getPayTransactionType(
        getTransactionMock({
          type: TransactionType.batch,
          nestedTransactions: [
            { type: TransactionType.tokenMethodApprove },
            { type: TransactionType.contractInteraction },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it('returns undefined if batch has no nested transactions', () => {
    expect(
      getPayTransactionType(
        getTransactionMock({ type: TransactionType.batch }),
      ),
    ).toBeUndefined();
  });
});
