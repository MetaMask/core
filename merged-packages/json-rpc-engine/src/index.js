const async = require('async')

class RpcEngine {
  constructor () {
    this._middleware = []
  }

  //
  // Public
  //

  push (middleware) {
    this._middleware.push(middleware)
  }

  handle (req, cb) {
    // batch request support
    if (Array.isArray(req)) {
      async.map(req, this._handle.bind(this), cb)
    } else {
      this._handle(req, cb)
    }
  }

  //
  // Private
  //

  _handle (req, cb) {
    // create response obj
    const res = {
      id: req.id,
      jsonrpc: req.jsonrpc
    }
    // process all middleware
    this._runMiddleware(req, res, (err, isComplete) => {
      if (err) return cb(err)
      // fail if not completed
      if (!isComplete) {
        return cb(new Error('RpcEngine - nothing ended request'))
      }
      // return response
      cb(null, res)
    })
  }

  _runMiddleware (req, res, cb) {
    const self = this
    // pointer for the stack
    let middlewareIndex = 0
    // for climbing back up the stack
    let returnHandlers = []
    // flag for stack return
    let isComplete = false

    // flow
    async.series([
      runAllMiddleware,
      runReturnHandlers
    ], completeRequest)

    // down stack of middleware, call and collect optional returnHandlers
    function runAllMiddleware (cb) {
      async.mapSeries(self._middleware, eachMiddleware, cb)
    }

    // climbs the stack calling return handlers
    function runReturnHandlers (cb) {
      let backStack = returnHandlers.filter(Boolean).reverse()
      async.eachSeries(backStack, (handler, next) => handler(next), completeRequest)
    }

    // runs an individual middleware
    function eachMiddleware (middleware, cb) {
      // skip middleware if completed
      if (isComplete) return cb()
      // run individual middleware
      middleware(req, res, next, end)

      function next (returnHandler) {
        // add return handler
        returnHandlers.push(returnHandler)
        cb()
      }
      function end (err) {
        if (err) return cb(err)
        // mark as completed
        isComplete = true
        cb()
      }
    }

    // returns, indicating whether or not it ended
    function completeRequest () {
      cb(null, isComplete)
    }
  }
}

module.exports = RpcEngine
