import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams } from '@metamask/utils';

import { blockTagParamIndex } from './utils/cache';

type BlockRefRewriteMiddlewareOptions = {
  blockTracker?: PollingBlockTracker;
};

/**
 * Creates a middleware that rewrites "latest" block references to the known
 * latest block number from a block tracker.
 *
 * @param options - The options for the middleware.
 * @param options.blockTracker - The block tracker to use.
 * @returns The middleware.
 */
export function createBlockRefRewriteMiddleware({
  blockTracker,
}: BlockRefRewriteMiddlewareOptions = {}): JsonRpcMiddleware<
  JsonRpcParams,
  Json
> {
  if (!blockTracker) {
    throw Error(
      'BlockRefRewriteMiddleware - mandatory "blockTracker" option is missing.',
    );
  }

  return createAsyncMiddleware(async (req, _res, next) => {
    const blockRefIndex: number | undefined = blockTagParamIndex(req.method);
    if (blockRefIndex === undefined) {
      return next();
    }

    const blockRef: string | undefined =
      Array.isArray(req.params) && req.params[blockRefIndex]
        ? (req.params[blockRefIndex] as string)
        : // omitted blockRef implies "latest"
          'latest';

    if (blockRef !== 'latest') {
      return next();
    }

    // rewrite blockRef to block-tracker's block number
    const latestBlockNumber = await blockTracker.getLatestBlock();
    if (Array.isArray(req.params)) {
      req.params[blockRefIndex] = latestBlockNumber;
    }
    return next();
  });
}
