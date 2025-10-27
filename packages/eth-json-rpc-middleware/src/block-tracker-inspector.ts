import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import { hasProperty } from '@metamask/utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import { projectLogger, createModuleLogger } from './logging-utils';

const log = createModuleLogger(projectLogger, 'block-tracker-inspector');
const futureBlockRefRequests: readonly string[] = [
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
];

/**
 * Creates a middleware that checks whether response block references are higher than the current block.
 * If the block reference is higher, the middleware will make the block tracker check for a new block.
 *
 * @param options - The options for the middleware.
 * @param options.blockTracker - The block tracker to use.
 * @returns The middleware.
 */
export function createBlockTrackerInspectorMiddleware({
  blockTracker,
}: {
  blockTracker: PollingBlockTracker;
}): JsonRpcMiddleware<JsonRpcRequest, Json> {
  return async ({ request, next }) => {
    if (!futureBlockRefRequests.includes(request.method)) {
      return next();
    }
    const result = await next();

    const responseBlockNumber = getResultBlockNumber(result);
    if (responseBlockNumber) {
      log('res.result.blockNumber exists, proceeding. res = %o', result);

      // If number is higher, suggest block-tracker check for a new block
      const blockNumber: number = Number.parseInt(responseBlockNumber, 16);
      const currentBlockNumber: number = Number.parseInt(
        // Typecast: If getCurrentBlock returns null, currentBlockNumber will be NaN, which is fine.
        blockTracker.getCurrentBlock() as string,
        16,
      );

      if (blockNumber > currentBlockNumber) {
        log(
          'blockNumber from response is greater than current block number, refreshing current block number',
        );
        await blockTracker.checkForLatestBlock();
      }
    }
    return result;
  };
}

/**
 * Extracts the block number from the result.
 *
 * @param result - The result to extract the block number from.
 * @returns The block number, or undefined if the result is not an object with a
 * `blockNumber` property.
 */
function getResultBlockNumber(
  result: Readonly<Json> | undefined,
): string | undefined {
  if (
    !result ||
    typeof result !== 'object' ||
    !hasProperty(result, 'blockNumber')
  ) {
    return undefined;
  }

  return typeof result.blockNumber === 'string'
    ? result.blockNumber
    : undefined;
}
