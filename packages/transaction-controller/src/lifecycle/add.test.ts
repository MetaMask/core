import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildLifecycleMocks,
  buildTransactionMeta,
} from '../../tests/LifecycleMocks.js';
import type { TransactionControllerState } from '../TransactionController.js';
import { TransactionStatus } from '../types.js';
import { trimTransactionsForState } from '../utils/state.js';
import { validateTxParams } from '../utils/validation.js';
import { addTransactionToState } from './add.js';

vi.mock('../utils/state.js');
vi.mock('../utils/validation.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid controller state for use in updateState mock callbacks.
 *
 * @param transactions - Initial transaction list.
 * @returns A plain object satisfying TransactionControllerState.
 */
function buildState(
  transactions: TransactionControllerState['transactions'] = [],
): TransactionControllerState {
  return {
    batchTransactionCounts: {},
    lastFetchedBlockNumbers: {},
    methodData: {},
    submitHistory: [],
    transactionBatches: [],
    transactions,
  };
}

// ---------------------------------------------------------------------------
// addTransactionToState
// ---------------------------------------------------------------------------

describe('addTransactionToState', () => {
  beforeEach(() => {
    vi.mocked(trimTransactionsForState).mockImplementation((txs) => txs);
  });

  it('calls validateTxParams with the transaction params', () => {
    const { request } = buildLifecycleMocks();
    const transactionMeta = buildTransactionMeta();

    addTransactionToState(request.dependencies, transactionMeta);

    expect(vi.mocked(validateTxParams)).toHaveBeenCalledWith(
      transactionMeta.txParams,
    );
  });

  it('calls updateState to append the transaction', () => {
    const { request } = buildLifecycleMocks();
    const transactionMeta = buildTransactionMeta();
    const updateState = vi.mocked(request.dependencies.updateState);

    addTransactionToState(request.dependencies, transactionMeta);

    expect(updateState).toHaveBeenCalledTimes(1);
  });

  it('passes trimTransactionsForState the combined transactions list including the new one', () => {
    const existingMeta = buildTransactionMeta({ id: 'existing-tx' });
    const { request } = buildLifecycleMocks({ transactionMeta: existingMeta });
    const newMeta = buildTransactionMeta({ id: 'new-tx' });

    vi.mocked(request.dependencies.updateState).mockImplementation(
      (callback) => {
        return callback(buildState([existingMeta]));
      },
    );

    addTransactionToState(request.dependencies, newMeta);

    expect(vi.mocked(trimTransactionsForState)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'existing-tx' }),
        expect.objectContaining({ id: 'new-tx' }),
      ]),
      request.dependencies.messenger,
    );
  });

  it('assigns the trimmed list back to state.transactions', () => {
    const existingMeta = buildTransactionMeta({ id: 'existing-tx' });
    const { request } = buildLifecycleMocks({ transactionMeta: existingMeta });
    const newMeta = buildTransactionMeta({ id: 'new-tx' });

    const trimmedList = [existingMeta, newMeta];
    vi.mocked(trimTransactionsForState).mockReturnValue(trimmedList);

    const capturedState = buildState([existingMeta]);
    vi.mocked(request.dependencies.updateState).mockImplementation(
      (callback) => {
        return callback(capturedState);
      },
    );

    addTransactionToState(request.dependencies, newMeta);

    expect(capturedState.transactions).toBe(trimmedList);
  });

  it('passes the messenger to trimTransactionsForState', () => {
    const { request } = buildLifecycleMocks();
    const transactionMeta = buildTransactionMeta();

    vi.mocked(request.dependencies.updateState).mockImplementation(
      (callback) => {
        callback(buildState());
      },
    );

    addTransactionToState(request.dependencies, transactionMeta);

    expect(vi.mocked(trimTransactionsForState)).toHaveBeenCalledWith(
      expect.any(Array),
      request.dependencies.messenger,
    );
  });

  it('throws when validateTxParams throws', () => {
    const { request } = buildLifecycleMocks();
    const transactionMeta = buildTransactionMeta();

    vi.mocked(validateTxParams).mockImplementation(() => {
      throw new Error('Invalid txParams');
    });

    expect(() =>
      addTransactionToState(request.dependencies, transactionMeta),
    ).toThrow('Invalid txParams');
  });

  it('does not call updateState when validateTxParams throws', () => {
    const { request } = buildLifecycleMocks();
    const transactionMeta = buildTransactionMeta();
    const updateState = vi.mocked(request.dependencies.updateState);

    vi.mocked(validateTxParams).mockImplementation(() => {
      throw new Error('Invalid txParams');
    });

    expect(() =>
      addTransactionToState(request.dependencies, transactionMeta),
    ).toThrow('Invalid txParams');
    expect(updateState).not.toHaveBeenCalled();
  });

  it('handles a transaction with a non-default status', () => {
    const { request } = buildLifecycleMocks();
    const transactionMeta = buildTransactionMeta({
      status: TransactionStatus.approved,
    });

    vi.mocked(request.dependencies.updateState).mockImplementation(
      (callback) => {
        return callback(buildState());
      },
    );

    addTransactionToState(request.dependencies, transactionMeta);

    expect(vi.mocked(trimTransactionsForState)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: TransactionStatus.approved }),
      ]),
      expect.anything(),
    );
  });
});
