import { errorCodes } from '@metamask/rpc-errors';
import { isJsonRpcError } from '@metamask/utils';
import type { JsonRpcError } from '@metamask/utils';

/**
 * Checks if a value is a JSON-RPC error that indicates an execution reverted error.
 *
 * @param error - The value to check.
 * @returns True if the value is a JSON-RPC error that indicates an execution reverted
 * error, false otherwise.
 */
export function isExecutionRevertedError(
  error: unknown,
): error is JsonRpcError {
  return (
    isJsonRpcError(error) &&
    error.code === errorCodes.rpc.invalidInput &&
    error.message === 'execution reverted'
  );
}
