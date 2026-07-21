import type {
  TraceCallback,
  TraceContext,
  TraceRequest,
} from '@metamask/controller-utils';

import { createModuleLogger, projectLogger } from '../logger';
import { now } from './timer';

export const log = createModuleLogger(projectLogger, 'perf');

/**
 * Returns true when DEBUG=metamask:multichain-account-service, DEBUG=metamask:multichain-account-service:perf
 * or a matching glob is set.
 * Re-uses the same enable/disable logic as the rest of the package loggers.
 *
 * @returns True if performance logging is enabled, false otherwise.
 */
export function isPerfEnabled(): boolean {
  return projectLogger.enabled || log.enabled;
}

/**
 * Starts a local performance timer. Returns a `tock` function that, when called,
 * logs the elapsed time for `label`.
 *
 * @example
 * ```ts
 * const tock = tick(request);
 * await createAccounts(...);
 * tock(); // logs: "${request.name}: 123.45ms"
 * ```
 *
 * @param request - A trace request object containing the name and optional data.
 * @returns A function that, when called, logs the elapsed time since `tick` was called.
 */
export function tick(request: TraceRequest): () => void {
  if (!isPerfEnabled()) {
    return () => undefined;
  }

  const start = now();
  return function tock(): void {
    const duration = now() - start;

    const context = request.data ? ` (${JSON.stringify(request.data)})` : '';

    log(`${request.name}${context}: ${duration.toFixed(2)}ms`);
  };
}

/**
 * Wraps a trace callback with local performance logging.
 *
 * @param trace - The original trace callback to wrap.
 * @returns A new trace callback that logs the duration of the traced operation.
 */
export function withLocalPerfTrace(trace: TraceCallback): TraceCallback {
  return async <ReturnType>(
    request: TraceRequest,
    fn?: (context?: TraceContext) => ReturnType,
  ): Promise<ReturnType> => {
    if (!isPerfEnabled()) {
      return await trace(request, fn);
    }

    const tock = tick(request);
    try {
      return await trace(request, fn);
    } finally {
      tock();
    }
  };
}
