import type {
  TraceCallback,
  TraceContext,
  TraceRequest,
} from '@metamask/controller-utils';

export const traceFallback: TraceCallback = async <ReturnType>(
  _request: TraceRequest,
  fn?: (context?: TraceContext) => ReturnType,
): Promise<ReturnType> => {
  if (!fn) {
    return undefined as ReturnType;
  }
  return await Promise.resolve(fn());
};

export const TraceName = {
  AccountSyncFull: 'Multichain Account Syncing - Full',
} as const;
