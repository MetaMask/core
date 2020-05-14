'use strict'

module.exports = function asMiddleware (engine) {
  return function engineAsMiddleware (req, res, next, end) {
    engine._runMiddlewareDown(req, res, function (err, { isComplete, returnHandlers }) {
      if (err) {
        return end(err)
      }
      if (isComplete) {
        engine._runReturnHandlersUp(returnHandlers, end)
      } else {
        return next((cb) => {
          engine._runReturnHandlersUp(returnHandlers, cb)
        })
      }
      return undefined
    })
  }
}
