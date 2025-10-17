import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams } from '@metamask/utils';

import { blockTagParamIndex } from './utils/cache';

type BlockRefRewriteMiddlewareOptions = {
  blockTracker?: PollingBlockTracker;
};

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
    // skip if method does not include blockRef
    if (blockRefIndex === undefined) {
      return next();
    }
    // skip if not "latest"
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
