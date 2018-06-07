const cacheUtils = require('./cache-utils.js')
const createAsyncMiddleware = require('json-rpc-engine/src/createAsyncMiddleware')
// `<nil>` comes from https://github.com/ethereum/go-ethereum/issues/16925
const emptyValues = [undefined, null, '\u003cnil\u003e']

module.exports = createBlockCacheMiddleware


function createBlockCacheMiddleware(opts = {}) {
  // validate options
  const { blockTracker } = opts
  if (!blockTracker) throw new Error('createBlockCacheMiddleware - No BlockTracker specified')

  // create caching strategies
  const blockCache = new BlockCacheStrategy()
  const strategies = {
    block: blockCache,
    fork: blockCache,
  }

  return createAsyncMiddleware(async (req, res, next) => {
    // check type and matching strategy
    const type = cacheUtils.cacheTypeForPayload(req)
    const strategy = strategies[type]
    // If there's no strategy in place, pass it down the chain.
    if (!strategy) return next()
    // If the strategy can't cache this request, ignore it.
    if (!strategy.canCache(req)) return next()

    // get block reference (number or keyword)
    let blockTag = cacheUtils.blockTagForPayload(req)
    if (!blockTag) blockTag = 'latest'

    // get exact block number
    let requestedBlockNumber
    if (blockTag === 'earliest') {
      // this just exists for symmetry with "latest"
      requestedBlockNumber = '0x00'
    } else if (blockTag === 'latest') {
      // fetch latest block number
      const latestBlockNumber = await blockTracker.getLatestBlock()
      // clear all cache before latest block
      blockCache.clearBefore(latestBlockNumber)
      requestedBlockNumber = latestBlockNumber
    } else {
      // We have a hex number
      requestedBlockNumber = blockTag
    }

    // end on a hit, continue on a miss
    const cacheResult = await strategy.get(req, requestedBlockNumber)
    if (cacheResult === undefined) {
      // cache miss
      // wait for other middleware to handle request
      await next()
      // abort if other middleware did not fill in a result
      if (emptyValues.includes(res.result)) return
      // add result to cache
      await strategy.set(req, requestedBlockNumber, res.result)
    } else {
      // fill in result from cache
      res.result = cacheResult
    }
  })
}


//
// Cache Strategies
//

//
// BlockCacheStrategy
//

function BlockCacheStrategy() {
  this.cache = {}
}

BlockCacheStrategy.prototype.getBlockCacheForPayload = function(payload, blockNumberHex) {
  const blockNumber = Number.parseInt(blockNumberHex, 16)
  let blockCache = this.cache[blockNumber]
  // create new cache if necesary
  if (!blockCache) {
    const newCache = {}
    this.cache[blockNumber] = newCache
    blockCache = newCache
  }
  return blockCache
}

BlockCacheStrategy.prototype.get = async function(payload, requestedBlockNumber) {
  // lookup block cache
  const blockCache = this.getBlockCacheForPayload(payload, requestedBlockNumber)
  if (!blockCache) return undefined

  // lookup payload in block cache
  const identifier = cacheUtils.cacheIdentifierForPayload(payload)
  const cached = blockCache[identifier]

  // may be undefined
  return cached
}

BlockCacheStrategy.prototype.set = async function(payload, requestedBlockNumber, result) {
  if (result !== undefined) {
    const blockCache = this.getBlockCacheForPayload(payload, requestedBlockNumber)
    const identifier = cacheUtils.cacheIdentifierForPayload(payload)
    blockCache[identifier] = result
  }
}

BlockCacheStrategy.prototype.canCache = function(payload) {
  if (!cacheUtils.canCache(payload)) {
    return false
  }

  const blockTag = cacheUtils.blockTagForPayload(payload)
  const canCache = (blockTag !== 'pending')

  return canCache
}

// removes all block caches with block number lower than `oldBlockHex`
BlockCacheStrategy.prototype.clearBefore = function(oldBlockHex){
  const self = this
  const oldBlockNumber = Number.parseInt(oldBlockHex, 16)
  // clear old caches
  Object.keys(self.cache)
    .map(Number)
    .filter(num => num < oldBlockNumber)
    .forEach(num => delete self.cache[num])
}
