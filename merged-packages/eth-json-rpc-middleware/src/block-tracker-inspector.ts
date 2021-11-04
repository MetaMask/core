import { PollingBlockTracker } from 'eth-block-tracker';
import { createAsyncMiddleware, JsonRpcMiddleware } from 'json-rpc-engine';

import { Block } from './utils/cache';

const futureBlockRefRequests: string[] = [
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
];

interface BlockTrackerInspectorMiddlewareOptions {
  blockTracker: PollingBlockTracker;
}

// inspect if response contains a block ref higher than our latest block
export function createBlockTrackerInspectorMiddleware({
  blockTracker,
}: BlockTrackerInspectorMiddlewareOptions): JsonRpcMiddleware<string[], Block> {
  return createAsyncMiddleware(async (req, res, next) => {
    if (!futureBlockRefRequests.includes(req.method)) {
      return next();
    }
    // eslint-disable-next-line node/callback-return
    await next();
    // abort if no result or no block number
    if (!res.result?.blockNumber) {
      return undefined;
    }

    if (typeof res.result.blockNumber === 'string') {
      // if number is higher, suggest block-tracker check for a new block
      const blockNumber: number = Number.parseInt(res.result.blockNumber, 16);
      // Typecast: If getCurrentBlock returns null, currentBlockNumber will be NaN, which is fine.
      const currentBlockNumber: number = Number.parseInt(
        blockTracker.getCurrentBlock() as any,
        16,
      );
      if (blockNumber > currentBlockNumber) {
        await blockTracker.checkForLatestBlock();
      }
    }
    return undefined;
  });
}
