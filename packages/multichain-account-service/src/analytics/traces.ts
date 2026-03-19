import type {
  TraceCallback,
  TraceContext,
  TraceRequest,
} from '@metamask/controller-utils';

import { Bip44AccountProvider } from '../providers';

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
 * Compute trace data for a list of providers.
 *
 * @param providers Providers to be included in the trace data.
 * @returns An object mapping provider names to true, indicating their presence in the trace.
 */
export function toProviderDataTraces(
  providers: Bip44AccountProvider[],
): Record<string, boolean> {
  // We cannot use complex objects within traces, so we just map provider names with true.
  return providers.reduce(
    (data, provider) => ({
      ...data,
      [provider.getName()]: true,
    }),
    {},
  );
}

/**
 * Trace names.
 */
export enum TraceName {
  SnapDiscoverAccounts = 'Snap Discover Accounts',
  EvmDiscoverAccounts = 'EVM Discover Accounts',
  ProviderCreateAccountV1 = 'Provider Create Account (v1)',
  ProviderCreateAccounts = 'Provider Create Accounts (v2 - batched)',
  WalletAlignment = 'Wallet Alignment',
  WalletCreateMultichainAccountGroup = 'Wallet Create Multichain Account Group',
  WalletCreateMultichainAccountGroups = 'Wallet Create Multichain Account Groups',
}
