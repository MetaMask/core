import type {
  TraceCallback,
  TraceContext,
  TraceRequest,
} from '@metamask/controller-utils';

/**
 * Fallback function for tracing.
 * This function is used when no specific trace function is provided.
 * It executes the provided function in a trace context if available.
 *
 * @param _request - The trace request containing additional data and context.
 * @param fn - The function to execute within the trace context.
 * @returns A promise that resolves to the result of the executed function.
 * If no function is provided, it resolves to undefined.
 */
export const traceFallback: TraceCallback = async <ReturnType>(
  _request: TraceRequest,
  fn?: (context?: TraceContext) => ReturnType,
): Promise<ReturnType> => {
  if (!fn) {
    return undefined as ReturnType;
  }
  return await Promise.resolve(fn());
};

/**
 * Trace names.
 */
export enum TraceName {
  SnapDiscoverAccounts = 'Snap Discover Accounts',
  EvmDiscoverAccounts = 'EVM Discover Accounts',
  ProviderCreateAccountV1 = 'Provider Create Account (v1)',
  ProviderCreateAccounts = 'Provider Create Accounts (v2 - batched)',
}
