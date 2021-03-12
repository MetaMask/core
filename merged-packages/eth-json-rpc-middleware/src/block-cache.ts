import {
  createAsyncMiddleware,
  JsonRpcMiddleware,
} from 'json-rpc-engine';
import {
  cacheIdentifierForPayload,
  blockTagForPayload,
  cacheTypeForPayload,
  canCache,
  Payload,
  Block,
  BlockCache,
  Cache,
  JsonRpcRequestToCache,
} from './cache-utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-require-imports
const BlockTracker = require('eth-block-tracker');

// `<nil>` comes from https://github.com/ethereum/go-ethereum/issues/16925
const emptyValues = [undefined, null, '\u003cnil\u003e'];

interface BlockCacheMiddlewareOptions{
  blockTracker?: typeof BlockTracker;
}

export = createBlockCacheMiddleware;

//
// Cache Strategies
//

class BlockCacheStrategy {

  private cache: Cache;

  constructor() {
    this.cache = {};
  }

  getBlockCacheForPayload(_payload: Payload, blockNumberHex: string): BlockCache {
    const blockNumber: number = Number.parseInt(blockNumberHex, 16);
    let blockCache: BlockCache = this.cache[blockNumber];
    // create new cache if necesary
    if (!blockCache) {
      const newCache: BlockCache = {};
      this.cache[blockNumber] = newCache;
      blockCache = newCache;
    }
    return blockCache;
  }

  async get(payload: Payload, requestedBlockNumber: string): Promise<Block|undefined> {
    // lookup block cache
    const blockCache: BlockCache = this.getBlockCacheForPayload(payload, requestedBlockNumber);
    // lookup payload in block cache
    const identifier: string|null = cacheIdentifierForPayload(payload, true);
    return identifier ? blockCache[identifier] : undefined;
  }

  async set(payload: Payload, requestedBlockNumber: string, result: Block): Promise<void> {
    // check if we can cached this result
    const canCacheResult: boolean = this.canCacheResult(payload, result);
    if (!canCacheResult) {
      return;
    }

    // set the value in the cache
    const blockCache: BlockCache = this.getBlockCacheForPayload(payload, requestedBlockNumber);
    const identifier: string|null = cacheIdentifierForPayload(payload, true);
    blockCache[identifier as any] = result;
  }

  canCacheRequest(payload: Payload): boolean {
    // check request method
    if (!canCache(payload)) {
      return false;
    }
    // check blockTag
    const blockTag: string|undefined = blockTagForPayload(payload);

    if (blockTag === 'pending') {
      return false;
    }
    // can be cached
    return true;
  }

  canCacheResult(payload: Payload, result: Block): boolean {
    // never cache empty values (e.g. undefined)
    if (emptyValues.includes(result as any)) {
      return false;
    }
    // check if transactions have block reference before caching
    if (payload.method && ['eth_getTransactionByHash', 'eth_getTransactionReceipt'].includes(payload.method)) {
      if (!result || !result.blockHash || result.blockHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return false;
      }
    }
    // otherwise true
    return true;
  }

  // removes all block caches with block number lower than `oldBlockHex`
  clearBefore(oldBlockHex: string): void {
    const oldBlockNumber: number = Number.parseInt(oldBlockHex, 16);
    // clear old caches
    Object.keys(this.cache)
      .map(Number)
      .filter((num) => num < oldBlockNumber)
      .forEach((num) => delete this.cache[num]);
  }
}

function createBlockCacheMiddleware(
  { blockTracker }: BlockCacheMiddlewareOptions = {},
): JsonRpcMiddleware<string[], Block> {
  // validate options
  if (!blockTracker) {
    throw new Error('createBlockCacheMiddleware - No BlockTracker specified');
  }

  // create caching strategies
  const blockCache: BlockCacheStrategy = new BlockCacheStrategy();
  const strategies: Record<string, BlockCacheStrategy> = {
    perma: blockCache,
    block: blockCache,
    fork: blockCache,
  };

  return createAsyncMiddleware(async (req, res, next) => {
    // allow cach to be skipped if so specified
    if ((req as JsonRpcRequestToCache).skipCache) {
      return next();
    }
    // check type and matching strategy
    const type: string = cacheTypeForPayload(req);
    const strategy: BlockCacheStrategy = strategies[type];
    // If there's no strategy in place, pass it down the chain.
    if (!strategy) {
      return next();
    }
    // If the strategy can't cache this request, ignore it.
    if (!strategy.canCacheRequest(req)) {
      return next();
    }

    // get block reference (number or keyword)
    let blockTag: string|undefined = blockTagForPayload(req);
    if (!blockTag) {
      blockTag = 'latest';
    }

    // get exact block number
    let requestedBlockNumber: string;
    if (blockTag === 'earliest') {
      // this just exists for symmetry with "latest"
      requestedBlockNumber = '0x00';
    } else if (blockTag === 'latest') {
      // fetch latest block number
      const latestBlockNumber = await blockTracker.getLatestBlock();
      // clear all cache before latest block
      blockCache.clearBefore(latestBlockNumber);
      requestedBlockNumber = latestBlockNumber;
    } else {
      // We have a hex number
      requestedBlockNumber = blockTag;
    }
    // end on a hit, continue on a miss
    const cacheResult: Block|undefined = await strategy.get(req, requestedBlockNumber);
    if (cacheResult === undefined) {
      // cache miss
      // wait for other middleware to handle request
      // eslint-disable-next-line node/callback-return
      await next();

      // add result to cache
      // it's safe to cast res.result as Block, due to runtime type checks
      // performed when strategy.set is called
      await strategy.set(req, requestedBlockNumber, res.result as Block);
    } else {
      // fill in result from cache
      res.result = cacheResult;
    }
    return undefined;
  });
}
