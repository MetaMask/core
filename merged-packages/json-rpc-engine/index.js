const async = require('async')
const inherits = require('util').inherits

module.exports = RpcEngine

inherits(RpcEngine, Array)

function RpcEngine(){}

RpcEngine.prototype.asMiddleware = function(){
  const self = this
  return function(req, res, next, end){
    self.handle(req, end)
  }
}

RpcEngine.prototype.handle = function(req, cb) {
  const self = this
  // batch request support
  if (Array.isArray(req)) {
    async.map(req, self._handle.bind(self), cb)
  } else {
    self._handle(req, cb)
  }
}

RpcEngine.prototype._handle = function(req, cb) {
  const self = this
  // create response obj
  let res = {
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
  async.mapSeries(self, function eachMiddleware(middleware, cb){
    if (isComplete) return cb()
    middleware(req, res, next, end)
    function next(returnHandler){
      // add return handler
      returnHandlers.push(returnHandler)
      cb()
    }
    function end(err, response){
      if (err) return cb(err)
      isComplete = true
      if (response) res = response
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
