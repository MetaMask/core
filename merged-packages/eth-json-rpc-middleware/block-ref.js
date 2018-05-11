const createAsyncMiddleware = require('json-rpc-engine/src/createAsyncMiddleware')
const blockTagParamIndex = require('./cache-utils').blockTagParamIndex

module.exports = createBlockRefRewriteMiddleware

function createBlockRefRewriteMiddleware (opts = {}) {
  const { blockTracker } = opts
  if (!blockTracker) {
    throw Error('BlockRefRewriteMiddleware - mandatory "blockTracker" option is missing.')
  }

  return createAsyncMiddleware(async (req, res, next) => {
    const blockRefIndex = blockTagParamIndex(req)
    // skip if method does not include blockRef
    if (blockRefIndex === undefined) return next()
    // skip if not "latest"
    const blockRef = req.params[blockRefIndex]
    if (blockRef !== 'latest') return next()
    // rewrite blockRef to block-tracker's block number
    const latestBlockNumber = await blockTracker.getLatestBlock()
    req.params[blockRefIndex] = latestBlockNumber
    next()
  })

}
