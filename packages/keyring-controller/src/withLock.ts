import type { Mutex, MutexInterface } from 'async-mutex';

import { lockLogger as log } from './logger.js';

/** An operation which may explicitly release its mutex before completing. */
export type MutuallyExclusiveCallback<Result> = (options: {
  releaseLock: MutexInterface.Releaser;
  setLogContext: (context: LogContext) => void;
}) => Promise<Result>;

/** The keyring identity and access path, not its serialized state. */
export type LogContext = {
  keyring: {
    type: string;
    kind: 'v1' | 'v2' | 'commit';
    id: string;
  };
};

/** Diagnostic labels only; never include operation arguments or secrets. */
export type LockContext = {
  lock: 'controller' | 'vault';
  operation: string;
};

let nextLockId = 0;

/**
 * Run an operation under a mutex, measuring queue wait and actual lock hold
 * time separately. Completion includes persistence and rollback by the caller.
 *
 * @param mutex - The mutex to acquire.
 * @param context - Non-sensitive labels identifying the lock and operation.
 * @param callback - The operation to run while holding the lock.
 * @returns The operation's result.
 */
export async function withLock<Result>(
  mutex: Mutex,
  context: LockContext,
  callback: MutuallyExclusiveCallback<Result>,
): Promise<Result> {
  const details = { ...context, id: nextLockId };
  nextLockId += 1;
  const requestedAt = performance.now();
  log('Lock requested', details);
  const release = await mutex.acquire();
  const acquiredAt = performance.now();
  const waitMs = acquiredAt - requestedAt;
  let holdMs: number | undefined;
  let success = false;
  let logContext: LogContext | undefined;

  const releaseLock = (): void => {
    if (holdMs === undefined) {
      holdMs = performance.now() - acquiredAt;
      release();
      log('Lock released', { ...details, ...logContext, waitMs, holdMs });
    }
  };

  try {
    log('Lock acquired', { ...details, waitMs });
    const result = await callback({
      releaseLock,
      setLogContext: (additionalContext) => {
        logContext = { keyring: { ...additionalContext.keyring } };
      },
    });
    success = true;
    return result;
  } finally {
    releaseLock();
    log('Locked operation finished', {
      ...details,
      ...logContext,
      waitMs,
      holdMs,
      totalMs: performance.now() - requestedAt,
      success,
    });
  }
}
