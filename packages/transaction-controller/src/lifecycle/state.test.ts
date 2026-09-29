import {
  buildLifecycleMocks,
  buildTransactionMeta,
  TRANSACTION_ID_MOCK,
} from '../../tests/LifecycleMocks.js';
import {
  cleanupTransaction,
  isTransactionApproving,
  releaseTransactionExecution,
  startTransactionApproval,
} from './state.js';
import type { TransactionLifecycleState } from './state.js';

// ---------------------------------------------------------------------------
// isTransactionApproving
// ---------------------------------------------------------------------------

describe('isTransactionApproving', () => {
  it('returns false when no approval has been started for the dependencies', () => {
    const { request } = buildLifecycleMocks();

    expect(
      isTransactionApproving(request.dependencies, TRANSACTION_ID_MOCK),
    ).toBe(false);
  });

  it('returns true after startTransactionApproval for that id', () => {
    const { request } = buildLifecycleMocks();

    startTransactionApproval(request.dependencies, TRANSACTION_ID_MOCK);

    expect(
      isTransactionApproving(request.dependencies, TRANSACTION_ID_MOCK),
    ).toBe(true);
  });

  it('returns false for a different transaction id on the same dependencies', () => {
    const { request } = buildLifecycleMocks();

    startTransactionApproval(request.dependencies, TRANSACTION_ID_MOCK);

    expect(isTransactionApproving(request.dependencies, 'other-tx-id')).toBe(
      false,
    );
  });

  it('returns false after the release callback is called', () => {
    const { request } = buildLifecycleMocks();

    const release = startTransactionApproval(
      request.dependencies,
      TRANSACTION_ID_MOCK,
    );
    release();

    expect(
      isTransactionApproving(request.dependencies, TRANSACTION_ID_MOCK),
    ).toBe(false);
  });

  it('isolates approval state across different dependencies objects', () => {
    const first = buildLifecycleMocks();
    const second = buildLifecycleMocks();

    startTransactionApproval(first.request.dependencies, TRANSACTION_ID_MOCK);

    expect(
      isTransactionApproving(second.request.dependencies, TRANSACTION_ID_MOCK),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// startTransactionApproval
// ---------------------------------------------------------------------------

describe('startTransactionApproval', () => {
  it('returns a function', () => {
    const { request } = buildLifecycleMocks();

    const release = startTransactionApproval(
      request.dependencies,
      TRANSACTION_ID_MOCK,
    );

    expect(typeof release).toBe('function');
  });

  it('marks the transaction id as approving', () => {
    const { request } = buildLifecycleMocks();

    startTransactionApproval(request.dependencies, TRANSACTION_ID_MOCK);

    expect(
      isTransactionApproving(request.dependencies, TRANSACTION_ID_MOCK),
    ).toBe(true);
  });

  it('can track multiple transaction ids on the same dependencies', () => {
    const { request } = buildLifecycleMocks();

    startTransactionApproval(request.dependencies, 'tx-1');
    startTransactionApproval(request.dependencies, 'tx-2');

    expect(isTransactionApproving(request.dependencies, 'tx-1')).toBe(true);
    expect(isTransactionApproving(request.dependencies, 'tx-2')).toBe(true);
  });

  it('releasing one id does not affect another tracked id on the same dependencies', () => {
    const { request } = buildLifecycleMocks();

    const release1 = startTransactionApproval(request.dependencies, 'tx-1');
    startTransactionApproval(request.dependencies, 'tx-2');

    release1();

    expect(isTransactionApproving(request.dependencies, 'tx-1')).toBe(false);
    expect(isTransactionApproving(request.dependencies, 'tx-2')).toBe(true);
  });

  it('the release callback is idempotent — calling it twice does not throw', () => {
    const { request } = buildLifecycleMocks();

    const release = startTransactionApproval(
      request.dependencies,
      TRANSACTION_ID_MOCK,
    );
    release();

    expect(() => release()).not.toThrow();
  });

  it('starting a second approval for the same id on the same dependencies is a no-op (still tracked once)', () => {
    const { request } = buildLifecycleMocks();

    startTransactionApproval(request.dependencies, TRANSACTION_ID_MOCK);
    const release2 = startTransactionApproval(
      request.dependencies,
      TRANSACTION_ID_MOCK,
    );

    release2();

    // After releasing the second handle the id should no longer be tracked.
    expect(
      isTransactionApproving(request.dependencies, TRANSACTION_ID_MOCK),
    ).toBe(false);
  });

  it('does not share state with a second call using fresh dependencies', () => {
    const first = buildLifecycleMocks();
    const second = buildLifecycleMocks();

    startTransactionApproval(first.request.dependencies, TRANSACTION_ID_MOCK);

    expect(
      isTransactionApproving(second.request.dependencies, TRANSACTION_ID_MOCK),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// releaseTransactionExecution
// ---------------------------------------------------------------------------

describe('releaseTransactionExecution', () => {
  it('calls releaseApproval when present', () => {
    const releaseApproval = jest.fn();
    const lifecycle: TransactionLifecycleState = {
      execution: {
        networkClientId: 'mainnet',
        releaseApproval,
      },
    };

    releaseTransactionExecution(lifecycle);

    expect(releaseApproval).toHaveBeenCalledTimes(1);
  });

  it('calls releaseNonce when present', () => {
    const releaseNonce = jest.fn();
    const lifecycle: TransactionLifecycleState = {
      execution: {
        networkClientId: 'mainnet',
        releaseNonce,
      },
    };

    releaseTransactionExecution(lifecycle);

    expect(releaseNonce).toHaveBeenCalledTimes(1);
  });

  it('calls both releaseApproval and releaseNonce when both are present', () => {
    const releaseApproval = jest.fn();
    const releaseNonce = jest.fn();
    const lifecycle: TransactionLifecycleState = {
      execution: {
        networkClientId: 'mainnet',
        releaseApproval,
        releaseNonce,
      },
    };

    releaseTransactionExecution(lifecycle);

    expect(releaseApproval).toHaveBeenCalledTimes(1);
    expect(releaseNonce).toHaveBeenCalledTimes(1);
  });

  it('deletes the execution property from lifecycle', () => {
    const lifecycle: TransactionLifecycleState = {
      execution: {
        networkClientId: 'mainnet',
      },
    };

    releaseTransactionExecution(lifecycle);

    expect(lifecycle.execution).toBeUndefined();
  });

  it('does not throw when execution is absent', () => {
    const lifecycle: TransactionLifecycleState = {};

    expect(() => releaseTransactionExecution(lifecycle)).not.toThrow();
  });

  it('does not throw when releaseApproval is absent but releaseNonce is present', () => {
    const releaseNonce = jest.fn();
    const lifecycle: TransactionLifecycleState = {
      execution: {
        networkClientId: 'mainnet',
        releaseNonce,
      },
    };

    expect(() => releaseTransactionExecution(lifecycle)).not.toThrow();
    expect(releaseNonce).toHaveBeenCalledTimes(1);
  });

  it('does not throw when releaseNonce is absent but releaseApproval is present', () => {
    const releaseApproval = jest.fn();
    const lifecycle: TransactionLifecycleState = {
      execution: {
        networkClientId: 'mainnet',
        releaseApproval,
      },
    };

    expect(() => releaseTransactionExecution(lifecycle)).not.toThrow();
    expect(releaseApproval).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// cleanupTransaction
// ---------------------------------------------------------------------------

describe('cleanupTransaction', () => {
  it('releases execution resources', () => {
    const releaseApproval = jest.fn();
    const releaseNonce = jest.fn();
    const { request } = buildLifecycleMocks();

    request.lifecycle.execution = {
      networkClientId: 'mainnet',
      releaseApproval,
      releaseNonce,
    };

    cleanupTransaction(request);

    expect(releaseApproval).toHaveBeenCalledTimes(1);
    expect(releaseNonce).toHaveBeenCalledTimes(1);
    expect(request.lifecycle.execution).toBeUndefined();
  });

  it('removes the transaction id from skipSimulationTransactionIds when onError is set', () => {
    const transactionMeta = buildTransactionMeta();
    const { request } = buildLifecycleMocks({ transactionMeta });

    // Assign a plain function so onError is truthy without triggering prefer-spy-on.
    // The implementation only checks truthiness; we verify the side-effect instead.
    request.lifecycle.onError = (_error: Error): void => {
      // intentional no-op
    };
    request.dependencies.skipSimulationTransactionIds.add(transactionMeta.id);

    cleanupTransaction(request);

    expect(
      request.dependencies.skipSimulationTransactionIds.has(transactionMeta.id),
    ).toBe(false);
  });

  it('does not remove from skipSimulationTransactionIds when onError is absent', () => {
    const transactionMeta = buildTransactionMeta();
    const { request } = buildLifecycleMocks({ transactionMeta });

    request.dependencies.skipSimulationTransactionIds.add(transactionMeta.id);

    cleanupTransaction(request);

    // onError is not set, so the id should remain
    expect(
      request.dependencies.skipSimulationTransactionIds.has(transactionMeta.id),
    ).toBe(true);
  });

  it('does not throw when execution is absent and onError is not set', () => {
    const { request } = buildLifecycleMocks();

    expect(() => cleanupTransaction(request)).not.toThrow();
  });

  it('does not throw when the transaction id is not in skipSimulationTransactionIds but onError is set', () => {
    const { request } = buildLifecycleMocks();

    // Assign a plain function so onError is truthy without triggering prefer-spy-on.
    request.lifecycle.onError = (_error: Error): void => {
      // intentional no-op
    };

    expect(() => cleanupTransaction(request)).not.toThrow();
  });
});
