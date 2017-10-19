const promiseToCallback = require('promise-to-callback')

module.exports = createAsyncMiddleware


function createAsyncMiddleware(asyncMiddleware) {
  return (req, res, next, end) => {
    let nextHandlerOnDone = null
    const finishedPromise = asyncMiddleware(req, res, getNextPromise)
    promiseToCallback(finishedPromise)((err) => {
      // async middleware ended
      if (nextHandlerOnDone) {
        // next handler was called - complete nextHandler
        nextHandlerOnDone(err)
      } else {
        // next handler was not called - complete middleware
        end(err)
      }
    })

    function getNextPromise() {
      return new Promise((resolve) => {
        next((cb) => {
          nextHandlerOnDone = cb
          resolve()
        })
      })
    }
  }
}