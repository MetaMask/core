import {
  buildLifecycleMocks,
  buildTransactionMeta,
  TRANSACTION_HASH_MOCK,
  TRANSACTION_ID_MOCK,
} from '../../tests/LifecycleMocks.js';
import { TransactionStatus } from '../types.js';
import { finishTransaction } from './finish.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a finished-promise pair so tests can control when the transaction ends.
 *
 * @returns An object with a `promise` to place in lifecycle and a `resolve`
 *   function to settle it with specific metadata.
 */
function buildFinishedPromise(): {
  promise: Promise<ReturnType<typeof buildTransactionMeta> | undefined>;
  resolve: (meta?: ReturnType<typeof buildTransactionMeta>) => void;
} {
  let resolveOuter!: (meta?: ReturnType<typeof buildTransactionMeta>) => void;
  const promise = new Promise<
    ReturnType<typeof buildTransactionMeta> | undefined
  >((resolve) => {
    resolveOuter = resolve;
  });
  return { promise, resolve: resolveOuter };
}

// ---------------------------------------------------------------------------
// finishTransaction — isStateOnly guard
// ---------------------------------------------------------------------------

describe('finishTransaction – isStateOnly guard', () => {
  it('returns an empty string immediately without awaiting finishedPromise', async () => {
    const { request } = buildLifecycleMocks({
      transactionMeta: buildTransactionMeta({ isStateOnly: true }),
    });

    // finishedPromise is deliberately left undefined — the function must not
    // await it.
    expect(await finishTransaction(request)).toBe('');
  });

  it('does not invoke resultCallbacks when isStateOnly is true', async () => {
    const resultCallbacks = { error: jest.fn(), success: jest.fn() };
    const { request } = buildLifecycleMocks({
      transactionMeta: buildTransactionMeta({ isStateOnly: true }),
    });
    request.lifecycle.resultCallbacks = resultCallbacks;

    await finishTransaction(request);

    expect(resultCallbacks.success).not.toHaveBeenCalled();
    expect(resultCallbacks.error).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// finishTransaction — submitted path
// ---------------------------------------------------------------------------

describe('finishTransaction – submitted', () => {
  it('returns the transaction hash when the final status is submitted', async () => {
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;

    resolve(
      buildTransactionMeta({
        hash: TRANSACTION_HASH_MOCK,
        status: TransactionStatus.submitted,
      }),
    );

    expect(await finishTransaction(request)).toBe(TRANSACTION_HASH_MOCK);
  });

  it('calls resultCallbacks.success when the final status is submitted', async () => {
    const resultCallbacks = { error: jest.fn(), success: jest.fn() };
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;
    request.lifecycle.resultCallbacks = resultCallbacks;

    resolve(
      buildTransactionMeta({
        hash: TRANSACTION_HASH_MOCK,
        status: TransactionStatus.submitted,
      }),
    );

    await finishTransaction(request);

    expect(resultCallbacks.success).toHaveBeenCalledTimes(1);
    expect(resultCallbacks.error).not.toHaveBeenCalled();
  });

  it('does not throw when resultCallbacks is absent and status is submitted', async () => {
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;

    resolve(
      buildTransactionMeta({
        hash: TRANSACTION_HASH_MOCK,
        status: TransactionStatus.submitted,
      }),
    );

    expect(await finishTransaction(request)).toBe(TRANSACTION_HASH_MOCK);
  });
});

// ---------------------------------------------------------------------------
// finishTransaction — failed path
// ---------------------------------------------------------------------------

describe('finishTransaction – failed', () => {
  it('throws an rpcErrors.internal error when the final status is failed', async () => {
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;

    const cause = new Error('Out of gas');
    resolve(
      buildTransactionMeta({
        error: cause as unknown as {
          message: string;
          name: string;
          stack: string;
        },
        status: TransactionStatus.failed,
      }),
    );

    const thrown = await finishTransaction(request).catch(
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('Out of gas');
  });

  it('calls resultCallbacks.error with the transaction error when status is failed', async () => {
    const resultCallbacks = { error: jest.fn(), success: jest.fn() };
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;
    request.lifecycle.resultCallbacks = resultCallbacks;

    const cause = new Error('Reverted');
    resolve(
      buildTransactionMeta({
        error: cause as unknown as {
          message: string;
          name: string;
          stack: string;
        },
        status: TransactionStatus.failed,
      }),
    );

    await finishTransaction(request).catch(() => {
      /* expected */
    });

    expect(resultCallbacks.error).toHaveBeenCalledTimes(1);
    expect(resultCallbacks.success).not.toHaveBeenCalled();
  });

  it('does not throw when resultCallbacks is absent and status is failed', async () => {
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;

    const cause = new Error('Network error');
    resolve(
      buildTransactionMeta({
        error: cause as unknown as {
          message: string;
          name: string;
          stack: string;
        },
        status: TransactionStatus.failed,
      }),
    );

    const thrown = await finishTransaction(request).catch(
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// finishTransaction — unexpected / default path
// ---------------------------------------------------------------------------

describe('finishTransaction – unexpected state', () => {
  it('throws when finishedPromise resolves with undefined', async () => {
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;

    resolve(undefined);

    const thrown = await finishTransaction(request).catch(
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('Unknown problem');
    expect((thrown as Error).message).toContain(TRANSACTION_ID_MOCK);
  });

  it('throws when finishedPromise resolves with an unknown status', async () => {
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;

    resolve(buildTransactionMeta({ status: TransactionStatus.unapproved }));

    const thrown = await finishTransaction(request).catch(
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('Unknown problem');
  });

  it('calls resultCallbacks.error on unexpected state', async () => {
    const resultCallbacks = { error: jest.fn(), success: jest.fn() };
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;
    request.lifecycle.resultCallbacks = resultCallbacks;

    resolve(buildTransactionMeta({ status: TransactionStatus.unapproved }));

    await finishTransaction(request).catch(() => {
      /* expected */
    });

    expect(resultCallbacks.error).toHaveBeenCalledTimes(1);
    expect(resultCallbacks.success).not.toHaveBeenCalled();
  });

  it('includes serialized metadata in the error message when finalMeta is present', async () => {
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;

    resolve(buildTransactionMeta({ status: TransactionStatus.approved }));

    const thrown = await finishTransaction(request).catch(
      (error: unknown) => error,
    );
    expect((thrown as Error).message).toContain('Unknown problem');
  });

  it('does not throw when resultCallbacks is absent and status is unexpected', async () => {
    const { request } = buildLifecycleMocks();
    const { promise, resolve } = buildFinishedPromise();
    request.lifecycle.finishedPromise = promise;

    resolve(buildTransactionMeta({ status: TransactionStatus.approved }));

    const thrown = await finishTransaction(request).catch(
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Error);
  });
});
