import { errorCodes } from '@metamask/rpc-errors';
import { isJsonRpcError } from '@metamask/utils';
import type { JsonRpcError } from '@metamask/utils';

const EXECUTION_REVERTED_PREFIX = 'execution reverted';

/**
 * EIP-1474 JSON-RPC error code for execution reverts. Returned by Infura
 * and most production providers, alongside a message that may carry the
 * decoded reason (e.g. `"execution reverted: ERC20: transfer amount
 * exceeds balance"`).
 *
 * @see https://eips.ethereum.org/EIPS/eip-1474
 */
const EXECUTION_REVERTED_ERROR_CODE = 3;

/**
 * Determine whether a JSON-RPC error represents a contract execution revert.
 *
 * Accepts both:
 * - Geth-style: `code: -32000`, `message: "execution reverted"`
 * - EIP-1474 / Infura-style: `code: 3`, `message: "execution reverted: <reason>"`
 *
 * Public Infura RPCs and most production providers return the EIP-1474
 * form, so the previous strict check (`code === -32000` and exact
 * `"execution reverted"`) never matched real-world reverted responses,
 * causing them to be retried by `RetryOnEmptyMiddleware` and the original
 * error data to be discarded.
 *
 * @param error - The value to check.
 * @returns `true` if the error represents an execution revert.
 */
export function isExecutionRevertedError(
  error: unknown,
): error is JsonRpcError {
  if (!isJsonRpcError(error)) {
    return false;
  }

  const isExpectedCode =
    error.code === errorCodes.rpc.invalidInput ||
    error.code === EXECUTION_REVERTED_ERROR_CODE;

  return (
    isExpectedCode &&
    typeof error.message === 'string' &&
    error.message.startsWith(EXECUTION_REVERTED_PREFIX)
  );
}
