import { PollingBlockTracker } from 'eth-block-tracker';
import { createAsyncMiddleware, JsonRpcMiddleware } from 'json-rpc-engine';
import { blockTagParamIndex, Block } from './utils/cache';

interface BlockRefRewriteMiddlewareOptions {
  blockTracker?: PollingBlockTracker;
}

export function createBlockRefRewriteMiddleware({
  blockTracker,
}: BlockRefRewriteMiddlewareOptions = {}): JsonRpcMiddleware<string[], Block> {
  if (!blockTracker) {
    throw Error(
      'BlockRefRewriteMiddleware - mandatory "blockTracker" option is missing.',
    );
  }

  return createAsyncMiddleware(async (req, _res, next) => {
    const blockRefIndex: number | undefined = blockTagParamIndex(req);
    // skip if method does not include blockRef
    if (blockRefIndex === undefined) {
      return next();
    }
    // skip if not "latest"
    let blockRef: string | undefined = req.params?.[blockRefIndex];
    // omitted blockRef implies "latest"
    if (blockRef === undefined) {
      blockRef = 'latest';
    }
    if (blockRef !== 'latest') {
      return next();
    }
    // rewrite blockRef to block-tracker's block number
    const latestBlockNumber = await blockTracker.getLatestBlock();
    if (req.params) {
      // eslint-disable-next-line require-atomic-updates
      req.params[blockRefIndex] = latestBlockNumber;
    }
    return next();
  });
}
