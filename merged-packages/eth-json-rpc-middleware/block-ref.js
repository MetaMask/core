module.exports = BlockRefRewriteMiddleware

function BlockRefRewriteMiddleware({ blockTracker }) {
  if (!blockTracker) {
    throw Error('BlockRefRewriteMiddleware - mandatory "blockTracker" option is missing.')
  }

  let requestQueue = []
  let currentHandler = null

  if (blockTracker.getCurrentBlock()) {
    // block tracker is already ready
    currentHandler = handleRequest
  } else {
    // buffer all requests for first block
    currentHandler = addToQueue
    // after first block
    blockTracker.once('latest', () => {
      // update handler
      currentHandler = handleRequest
      // process backlog
      requestQueue.forEach((args) => handleRequest.apply(null, args))
      requestQueue = null
    })
  }

  return (req, res, next, end) => {
    currentHandler(req, res, next, end)
  }

  // add requst to queue if blockRef is "latest"
  function addToQueue(req, res, next, end) {
    const blockRefIndex = blockRefParamIndex(req.method)
    const blockRef = req.params[blockRefIndex]
    if (blockRef === 'latest') {
      requestQueue.push([req, res, next, end])
    } else {
      next()
    }
  }

  // if blockRef is "latest", rewrite to latest block number
  function handleRequest(req, res, next, end) {
    const blockRefIndex = blockRefParamIndex(req.method)
    const blockRef = req.params[blockRefIndex]
    if (blockRef === 'latest') {
      let block = blockTracker.getCurrentBlock()
      req.params[blockRefIndex] = block.number
    }
    next()
  }
}


function blockRefParamIndex(rpcMethod) {
  switch (rpcMethod) {
    // blockRef is second param
    case 'eth_getBalance':
    case 'eth_getCode':
    case 'eth_getTransactionCount':
    case 'eth_getStorageAt':
    case 'eth_call':
    case 'eth_estimateGas':
      return 1
    // blockRef is first param
    case 'eth_getBlockByNumber':
      return 0
    // there is no blockRef
    default:
      return undefined
  }
}
