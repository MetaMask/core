import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import { isPerpsProviderType } from '../routing/isPerpsProviderType.js';
import type {
  CancelOrdersParams,
  CancelOrdersResult,
  PerpsProvider,
} from '../types/index.js';

/** Normalized cancel selector; empty filters never become cancel-all. */
export type CancelSelection =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'orders'; orders: NonNullable<CancelOrdersParams['orders']> }
  | { kind: 'orderIds'; orderIds: string[] }
  | { kind: 'symbols'; symbols: string[] };

/**
 * Reject malformed batch filters at the runtime API boundary.
 *
 * @param params - Batch cancellation request.
 */
function assertCancelOrderFilters(params: CancelOrdersParams): void {
  for (const key of ['orders', 'orderIds', 'symbols'] as const) {
    if (params[key] !== undefined && !Array.isArray(params[key])) {
      throw new Error(PERPS_ERROR_CODES.BATCH_CANCEL_FAILED, {
        cause: new TypeError(`${key} must be an array`),
      });
    }
  }

  const selection: readonly unknown[] = params.orders ?? [];
  for (const order of selection) {
    if (
      typeof order !== 'object' ||
      order === null ||
      !('providerId' in order) ||
      !isPerpsProviderType(order.providerId) ||
      !('orderId' in order) ||
      typeof order.orderId !== 'string' ||
      !order.orderId.trim()
    ) {
      throw new Error(PERPS_ERROR_CODES.BATCH_CANCEL_FAILED, {
        cause: new TypeError(
          'Each qualified order requires a venue and order ID',
        ),
      });
    }
  }
}

/**
 * Resolve cancel-all > scoped orders > bare IDs > symbols in one place.
 *
 * @param params - The caller's cancellation selectors.
 * @returns The winning selector, including explicit empty selections.
 */
export function resolveCancelSelection(
  params: CancelOrdersParams,
): CancelSelection {
  assertCancelOrderFilters(params);
  if (params.cancelAll === true) {
    return { kind: 'all' };
  }
  if (params.orders !== undefined) {
    return params.orders.length === 0
      ? { kind: 'none' }
      : { kind: 'orders', orders: params.orders };
  }
  if (params.orderIds !== undefined) {
    return params.orderIds.length === 0
      ? { kind: 'none' }
      : { kind: 'orderIds', orderIds: params.orderIds };
  }
  if (params.symbols !== undefined) {
    return params.symbols.length === 0
      ? { kind: 'none' }
      : { kind: 'symbols', symbols: params.symbols };
  }
  return { kind: 'all' };
}

/**
 * Refuse legacy selectors that cannot identify one execution venue.
 *
 * @param provider - The resolved execution provider.
 * @param selection - The normalized cancel selection.
 * @returns A stable refusal, or undefined for an unambiguous selection.
 */
export function getUnroutedCancelOrdersRefusal(
  provider: PerpsProvider,
  selection: CancelSelection,
): CancelOrdersResult | undefined {
  if (selection.kind !== 'orderIds' && selection.kind !== 'symbols') {
    return undefined;
  }
  const venueCount =
    provider.getProviderIds?.().length ??
    (provider.protocolId === 'aggregated' ? 2 : 1);
  if (venueCount <= 1) {
    return undefined;
  }
  return {
    success: false,
    successCount: 0,
    failureCount: 0,
    results: [],
    error: PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED,
  };
}
