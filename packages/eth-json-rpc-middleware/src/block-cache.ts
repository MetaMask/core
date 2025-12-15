import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import type {
  JsonRpcMiddleware,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import { projectLogger, createModuleLogger } from './logging-utils';
import type {
  Block,
  BlockCache,
  // eslint-disable-next-line @typescript-eslint/no-shadow
  Cache,
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
const emptyValues: unknown[] = [undefined, null, '\u003cnil\u003e'];

type BlockCacheMiddlewareOptions = {
  blockTracker?: PollingBlockTracker;
};

//
// Cache Strategies
//

class BlockCacheStrategy {
  #cache: Cache;

  constructor() {
    this.#cache = {};
  }

  getBlockCache(blockNumberHex: string): BlockCache {
    const blockNumber: number = Number.parseInt(blockNumberHex, 16);
    let blockCache: BlockCache = this.#cache[blockNumber];
    // create new cache if necesary
    if (!blockCache) {
      const newCache: BlockCache = {};
      this.#cache[blockNumber] = newCache;
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
    if (emptyValues.includes(result)) {
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
    Object.keys(this.#cache)
      .map(Number)
      .filter((value) => value < oldBlockNumber)
      .forEach((value) => delete this.#cache[value]);
  }
}

/**
 * Creates a middleware that caches block-related requests.
 *
 * @param options - The options for the middleware.
 * @param options.blockTracker - The block tracker to use.
 * @returns The block cache middleware.
 */
export function createBlockCacheMiddleware({
  blockTracker,
}: BlockCacheMiddlewareOptions = {}): JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ skipCache?: boolean }>
> {
  if (!blockTracker) {
    throw new Error(
      'createBlockCacheMiddleware - No PollingBlockTracker specified',
    );
  }

  const blockCache: BlockCacheStrategy = new BlockCacheStrategy();
  const strategies: Record<CacheStrategy, BlockCacheStrategy | undefined> = {
    [CacheStrategy.Permanent]: blockCache,
    [CacheStrategy.Block]: blockCache,
    [CacheStrategy.Fork]: blockCache,
    [CacheStrategy.Never]: undefined,
  };

  return async ({ request, next, context }) => {
    if (context.get('skipCache')) {
      return next();
    }

    const type = cacheTypeForMethod(request.method);
    const strategy = strategies[type];
    if (!strategy) {
      return next();
    }

    if (!strategy.canCacheRequest(request)) {
      return next();
    }

    const requestBlockTag = blockTagForRequest(request);
    const blockTag =
      requestBlockTag && typeof requestBlockTag === 'string'
        ? requestBlockTag
        : 'latest';

    log('blockTag = %o, req = %o', blockTag, request);

    // get exact block number
    let requestedBlockNumber: string;
    if (blockTag === 'earliest') {
      // this just exists for symmetry with "latest"
      requestedBlockNumber = '0x00';
    } else if (blockTag === 'latest') {
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
      // we have a hex number
      requestedBlockNumber = blockTag;
    }

    // end on a hit, continue on a miss
    const cacheResult = await strategy.get(request, requestedBlockNumber);
    if (cacheResult === undefined) {
      // cache miss
      // wait for other middleware to handle request
      log(
        'No cache stored under block number %o, carrying request forward',
        requestedBlockNumber,
      );
      const result = await next();

      // add result to cache
      // it's safe to cast res.result as Block, due to runtime type checks
      // performed when strategy.set is called
      log('Populating cache with', result);
      await strategy.set(request, requestedBlockNumber, result as Block);
      return result;
    }
    log(
      'Cache hit, reusing cache result stored under block number %o',
      requestedBlockNumber,
    );
    return cacheResult;
  };
}
