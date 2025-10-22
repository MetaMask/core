import { errorCodes } from '@metamask/rpc-errors';
import { isJsonRpcError } from '@metamask/utils';
import type { JsonRpcError } from '@metamask/utils';

export function isExecutionRevertedError(
  error: unknown,
): error is JsonRpcError {
  return (
    isJsonRpcError(error) &&
    error.code === errorCodes.rpc.invalidInput &&
    error.message === 'execution reverted'
  );
}
