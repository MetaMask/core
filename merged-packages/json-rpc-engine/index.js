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
      jsonrpc: req.jsonrpc,
    }
    // pointer for the stack
    let middlewareIndex = 0
    // for climbing back up the stack
    let returnHandlers = []
    // flag for stack return
    let isComplete = false

    // down stack of middleware, call and collect optional returnHandlers
    async.mapSeries(this._middleware, function eachMiddleware(middleware, cb){
      if (isComplete) return cb()
      middleware(req, res, next, end)
      function next(returnHandler){
        // add return handler
        returnHandlers.push(returnHandler)
        cb()
      }
      function end(err){
        if (err) return cb(err)
        isComplete = true
        cb()
      }
    }, runReturnHandlers)

    // climbs the stack calling return handlers
    function runReturnHandlers(err){
      if (err) return cb(err)
      if (!isComplete) return cb(new Error('RpcEngine - nothing ended request'))
      let backStack = returnHandlers.filter(Boolean).reverse()
      async.eachSeries(backStack, function(handler, next){
        handler(next)
      }, completeRequest)
    }

    // returns the result
    function completeRequest(){
      cb(null, res)
    }

  }

}

module.exports = RpcEngine