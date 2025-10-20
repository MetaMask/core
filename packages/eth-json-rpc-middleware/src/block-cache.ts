import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import { projectLogger, createModuleLogger } from './logging-utils';
import type {
  Block,
  BlockCache,
  // eslint-disable-next-line @typescript-eslint/no-shadow
  Cache,
  JsonRpcCacheMiddleware,
  JsonRpcRequestToCache,
} from './types';
import {
  cacheIdentifierForRequest,
  blockTagForRequest,
  cacheTypeForMethod,
  canCache,
  CacheStrategy,
} from './utils/cache';

const log = createModuleLogger(projectLogger, 'block-cache');
// `<nil>` comes from https://github.com/ethereum/go-ethereum/issues/16925
const emptyValues = [undefined, null, '\u003cnil\u003e'];

type BlockCacheMiddlewareOptions = {
  blockTracker?: PollingBlockTracker;
};

//
// Cache Strategies
//

class BlockCacheStrategy {
  private cache: Cache;

  constructor() {
    this.cache = {};
  }

  getBlockCache(blockNumberHex: string): BlockCache {
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

  async get(
    request: JsonRpcRequest,
    requestedBlockNumber: string,
  ): Promise<Block | undefined> {
    // lookup block cache
    const blockCache: BlockCache = this.getBlockCache(requestedBlockNumber);
    // lookup payload in block cache
    const identifier: string | null = cacheIdentifierForRequest(request, true);
    return identifier ? blockCache[identifier] : undefined;
  }

  async set(
    request: JsonRpcRequest,
    requestedBlockNumber: string,
    result: Block,
  ): Promise<void> {
    // check if we can cached this result
    const canCacheResult: boolean = this.canCacheResult(request, result);
    if (!canCacheResult) {
      return;
    }

    // set the value in the cache
    const identifier: string | null = cacheIdentifierForRequest(request, true);
    if (!identifier) {
      return;
    }
    const blockCache: BlockCache = this.getBlockCache(requestedBlockNumber);
    blockCache[identifier] = result;
  }

  canCacheRequest(request: JsonRpcRequest): boolean {
    // check request method
    if (!canCache(request.method)) {
      return false;
    }
    // check blockTag
    const blockTag = blockTagForRequest(request);

    if (blockTag === 'pending') {
      return false;
    }
    // can be cached
    return true;
  }

  canCacheResult(request: JsonRpcRequest, result: Block): boolean {
    // never cache empty values (e.g. undefined)
    if (emptyValues.includes(result as any)) {
      return false;
    }

    // check if transactions have block reference before caching
    if (
      request.method &&
      ['eth_getTransactionByHash', 'eth_getTransactionReceipt'].includes(
        request.method,
      )
    ) {
      if (
        !result?.blockHash ||
        result.blockHash ===
          '0x0000000000000000000000000000000000000000000000000000000000000000'
      ) {
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

export function createBlockCacheMiddleware({
  blockTracker,
}: BlockCacheMiddlewareOptions = {}): JsonRpcCacheMiddleware<
  JsonRpcParams,
  Json
> {
  // validate options
  if (!blockTracker) {
    throw new Error(
      'createBlockCacheMiddleware - No PollingBlockTracker specified',
    );
  }

  // create caching strategies
  const blockCache: BlockCacheStrategy = new BlockCacheStrategy();
  const strategies: Record<CacheStrategy, BlockCacheStrategy | undefined> = {
    [CacheStrategy.Permanent]: blockCache,
    [CacheStrategy.Block]: blockCache,
    [CacheStrategy.Fork]: blockCache,
    [CacheStrategy.Never]: undefined,
  };

  return createAsyncMiddleware(
    async (req: JsonRpcRequestToCache<JsonRpcParams>, res, next) => {
      // allow cach to be skipped if so specified
      if (req.skipCache) {
        return next();
      }
      // check type and matching strategy
      const type = cacheTypeForMethod(req.method);
      const strategy = strategies[type];
      // If there's no strategy in place, pass it down the chain.
      if (!strategy) {
        return next();
      }

      // If the strategy can't cache this request, ignore it.
      if (!strategy.canCacheRequest(req)) {
        return next();
      }

      // get block reference (number or keyword)
      const requestBlockTag = blockTagForRequest(req);
      const blockTag =
        requestBlockTag && typeof requestBlockTag === 'string'
          ? requestBlockTag
          : 'latest';

      log('blockTag = %o, req = %o', blockTag, req);

      // get exact block number
      let requestedBlockNumber: string;
      if (blockTag === 'earliest') {
        // this just exists for symmetry with "latest"
        requestedBlockNumber = '0x00';
      } else if (blockTag === 'latest') {
        // fetch latest block number
        log('Fetching latest block number to determine cache key');
        const latestBlockNumber = await blockTracker.getLatestBlock();
        // clear all cache before latest block
        log(
          'Clearing values stored under block numbers before %o',
          latestBlockNumber,
        );
        blockCache.clearBefore(latestBlockNumber);
        requestedBlockNumber = latestBlockNumber;
      } else {
        // We have a hex number
        requestedBlockNumber = blockTag;
      }
      // end on a hit, continue on a miss
      const cacheResult: Block | undefined = await strategy.get(
        req,
        requestedBlockNumber,
      );
      if (cacheResult === undefined) {
        // cache miss
        // wait for other middleware to handle request
        log(
          'No cache stored under block number %o, carrying request forward',
          requestedBlockNumber,
        );
        await next();

        // add result to cache
        // it's safe to cast res.result as Block, due to runtime type checks
        // performed when strategy.set is called
        log('Populating cache with', res);
        await strategy.set(req, requestedBlockNumber, res.result as Block);
      } else {
        // fill in result from cache
        log(
          'Cache hit, reusing cache result stored under block number %o',
          requestedBlockNumber,
        );
        res.result = cacheResult;
      }
      return undefined;
    },
  );
}
