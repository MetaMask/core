import {
  createAsyncMiddleware,
  JsonRpcMiddleware,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';
import clone from 'clone';
import pify from 'pify';
import {
  Block,
  blockTagParamIndex,
  SafeEventEmitterProvider,
} from './cache-utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const BlockTracker = require('eth-block-tracker');

//
// RetryOnEmptyMiddleware will retry any request with an empty response that has
// a numbered block reference at or lower than the blockTracker's latest block.
// Its useful for dealing with load-balanced ethereum JSON RPC
// nodes that are not always in sync with each other.
//

export = createRetryOnEmptyMiddleware;

// empty values used to determine if a request should be retried
// `<nil>` comes from https://github.com/ethereum/go-ethereum/issues/16925
const emptyValues: (string|null|undefined)[] = [undefined, null, '\u003cnil\u003e'];

interface RetryOnEmptyMiddlewareOptions{
  provider?: SafeEventEmitterProvider;
  blockTracker?: typeof BlockTracker;
}

function createRetryOnEmptyMiddleware(
  { provider, blockTracker }: RetryOnEmptyMiddlewareOptions = {}
): JsonRpcMiddleware<string[], Block> {
  if (!provider) {
    throw Error('RetryOnEmptyMiddleware - mandatory "provider" option is missing.');
  }
  if (!blockTracker) {
    throw Error('RetryOnEmptyMiddleware - mandatory "blockTracker" option is missing.');
  }

  return createAsyncMiddleware(async (req, res, next) => {
    const blockRefIndex: number|undefined = blockTagParamIndex(req);
    // skip if method does not include blockRef
    if (blockRefIndex === undefined) {
      return next();
    }
    // skip if not exact block references
    let blockRef: string|undefined = req.params?.[blockRefIndex];
    // omitted blockRef implies "latest"
    if (blockRef === undefined) {
      blockRef = 'latest';
    }
    // skip if non-number block reference
    if (['latest', 'pending'].includes(blockRef)) {
      return next();
    }
    // skip if block refernce is not a valid number
    const blockRefNumber: number = Number.parseInt(blockRef.slice(2), 16);
    if (Number.isNaN(blockRefNumber)) {
      return next();
    }
    // lookup latest block
    const latestBlockNumberHex: string = await blockTracker.getLatestBlock();
    const latestBlockNumber: number = Number.parseInt(latestBlockNumberHex.slice(2), 16);
    // skip if request block number is higher than current
    if (blockRefNumber > latestBlockNumber) {
      return next();
    }
    // create child request with specific block-ref
    const childRequest = clone(req);
    // attempt child request until non-empty response is received
    const childResponse: PendingJsonRpcResponse<Block> = await retry(10, async () => {
      const attemptResponse: PendingJsonRpcResponse<Block> = await pify((provider as SafeEventEmitterProvider).sendAsync).call(provider, childRequest);
      // verify result
      if (emptyValues.includes(attemptResponse as any)) {
        throw new Error(`RetryOnEmptyMiddleware - empty response "${JSON.stringify(attemptResponse)}" for request "${JSON.stringify(childRequest)}"`);
      }
      return attemptResponse;
    });
    // copy child response onto original response
    res.result = childResponse.result;
    res.error = childResponse.error;
    return next();
  });

}

async function retry(
  maxRetries: number,
  asyncFn: () => Promise<PendingJsonRpcResponse<Block>>
): Promise<PendingJsonRpcResponse<Block>> {
  for (let index = 0; index < maxRetries; index++) {
    try {
      return await asyncFn();
    } catch (err) {
      await timeout(1000);
    }
  }
  throw new Error('RetryOnEmptyMiddleware - retries exhausted');
}

function timeout(duration: number): Promise<NodeJS.Timeout> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}
