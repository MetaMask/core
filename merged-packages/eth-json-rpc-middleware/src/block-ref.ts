import {
  createAsyncMiddleware,
  JsonRpcMiddleware,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';
import clone from 'clone';
import pify from 'pify';
import {
  Block,
  SafeEventEmitterProvider,
  blockTagParamIndex,
} from './cache-utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-require-imports
const BlockTracker = require('eth-block-tracker');

interface BlockRefMiddlewareOptions{
  blockTracker?: typeof BlockTracker;
  provider?: SafeEventEmitterProvider;
}

export = createBlockRefMiddleware;

function createBlockRefMiddleware(
  { provider, blockTracker }: BlockRefMiddlewareOptions = {},
): JsonRpcMiddleware<string[], Block> {

  if (!provider) {
    throw Error('BlockRefMiddleware - mandatory "provider" option is missing.');
  }
  if (!blockTracker) {
    throw Error('BlockRefMiddleware - mandatory "blockTracker" option is missing.');
  }

  return createAsyncMiddleware(async (req, res, next) => {
    const blockRefIndex: number|undefined = blockTagParamIndex(req);
    // skip if method does not include blockRef
    if (blockRefIndex === undefined) {
      return next();
    }
    // skip if not "latest"
    let blockRef: string|undefined = req.params?.[blockRefIndex];
    // omitted blockRef implies "latest"
    if (blockRef === undefined) {
      blockRef = 'latest';
    }
    if (blockRef !== 'latest') {
      return next();
    }
    // lookup latest block
    const latestBlockNumber = await blockTracker.getLatestBlock();
    // create child request with specific block-ref
    const childRequest = clone(req);
    if (childRequest.params) {
      childRequest.params[blockRefIndex] = latestBlockNumber;
    }
    // perform child request
    const childRes: PendingJsonRpcResponse<Block> = await pify((provider as SafeEventEmitterProvider).sendAsync).call(provider, childRequest);
    // copy child response onto original response
    res.result = childRes.result;
    res.error = childRes.error;
    return next();
  });

}
