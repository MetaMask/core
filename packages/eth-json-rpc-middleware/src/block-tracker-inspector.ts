import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import { hasProperty } from '@metamask/utils';
import type {
  Json,
  JsonRpcParams,
  PendingJsonRpcResponse,
} from '@metamask/utils';

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
}): JsonRpcMiddleware<JsonRpcParams, Json> {
  return createAsyncMiddleware(async (req, res, next) => {
    if (!futureBlockRefRequests.includes(req.method)) {
      return next();
    }
    await next();

    const responseBlockNumber = getResultBlockNumber(res);
    if (!responseBlockNumber) {
      return undefined;
    }

    log('res.result.blockNumber exists, proceeding. res = %o', res);

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
    return undefined;
  });
}

function getResultBlockNumber(
  response: PendingJsonRpcResponse,
): string | undefined {
  const { result } = response;
  if (
    !result ||
    typeof result !== 'object' ||
    !hasProperty(result, 'blockNumber')
  ) {
    return undefined;
  }

  if (typeof result.blockNumber === 'string') {
    return result.blockNumber;
  }
  return undefined;
}
