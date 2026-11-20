import type {
  BatchOperationStatus,
  CancelOrdersResult,
  ClosePositionsResult,
  WithBatchOperationStatus,
} from '../types/index.js';

/**
 * Classify a batch cancel or close. `all` needs at least one success and no
 * failure or batch-level error; `none` means nothing succeeded, including an
 * empty batch.
 *
 * @param result - Counts and batch-level error of the operation.
 * @returns The batch status.
 */
export function getBatchOperationStatus(
  result: Pick<CancelOrdersResult, 'successCount' | 'failureCount' | 'error'>,
): BatchOperationStatus {
  if (result.successCount <= 0) {
    return 'none';
  }
  return result.failureCount === 0 && result.error === undefined
    ? 'all'
    : 'partial';
}

/**
 * Attach the derived `status` to a batch result.
 *
 * @param result - Batch cancel or close result.
 * @returns The result with its `status`.
 */
export function withBatchOperationStatus<
  Result extends CancelOrdersResult | ClosePositionsResult,
>(result: Result): WithBatchOperationStatus<Result> {
  return { ...result, status: getBatchOperationStatus(result) };
}
