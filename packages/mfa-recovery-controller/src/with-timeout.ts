import { MfaRecoveryError } from './errors.js';

export type WithTimeoutKind = 'prompt' | 'request';

export type WithTimeoutOptions = {
  ms: number;
  signal?: AbortSignal;
  kind: WithTimeoutKind;
};

function createTimeoutError(kind: WithTimeoutKind): MfaRecoveryError {
  return kind === 'prompt'
    ? new MfaRecoveryError('Prompt timed out', 'prompt_timeout')
    : new MfaRecoveryError('Request timed out', 'request_timeout');
}

function createAbortedError(): MfaRecoveryError {
  return new MfaRecoveryError('Operation aborted', 'operation_aborted');
}

/**
 * Runs an async operation with a timeout and optional parent abort signal.
 *
 * A child {@link AbortSignal} is passed to `run` and is aborted when the timer
 * expires or when the parent signal aborts.
 * Cancellation is cooperative: if `run` ignores the child signal, a timeout
 * rejection still stands even if `run` settles later.
 *
 * @param run - Operation to run with the child abort signal.
 * @param options - Timeout and cancellation options.
 * @returns The result of `run` when it settles before the timeout.
 */
export async function withTimeout<Result>(
  run: (signal: AbortSignal) => Promise<Result>,
  options: WithTimeoutOptions,
): Promise<Result> {
  const { ms, signal: parentSignal, kind } = options;

  if (parentSignal?.aborted) {
    throw createAbortedError();
  }

  const child = new AbortController();

  let timer: ReturnType<typeof setTimeout> | undefined;
  let parentAbortListener: (() => void) | undefined;
  let settled = false;

  const cleanup = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (parentSignal && parentAbortListener) {
      parentSignal.removeEventListener('abort', parentAbortListener);
      parentAbortListener = undefined;
    }
  };

  try {
    return await new Promise<Result>((resolve, reject) => {
      const settleResolve = (value: Result): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      };

      const settleReject = (reason: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(reason);
      };

      timer = setTimeout(() => {
        child.abort();
        settleReject(createTimeoutError(kind));
      }, ms);

      if (parentSignal) {
        parentAbortListener = (): void => {
          child.abort();
          settleReject(createAbortedError());
        };
        parentSignal.addEventListener('abort', parentAbortListener);
      }

      let runPromise: Promise<Result>;
      try {
        runPromise = run(child.signal);
      } catch (error) {
        settleReject(error);
        return;
      }
      // Both handlers settle the outer promise and return void, so the
      // chained promise cannot reject.
      // oxlint-disable-next-line promise/catch-or-return
      runPromise.then(settleResolve, settleReject);
    });
  } finally {
    cleanup();
  }
}
