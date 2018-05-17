const promiseToCallback = require('promise-to-callback')

module.exports = createAsyncMiddleware


function createAsyncMiddleware(asyncMiddleware) {
  return (req, res, next, end) => {
    let nextDonePromise = null
    const finishedPromise = asyncMiddleware(req, res, getNextPromise)
    promiseToCallback(finishedPromise)((err) => {
      // async middleware ended
      if (nextDonePromise) {
        // next handler was called - complete nextHandler
        promiseToCallback(nextDonePromise)((nextErr, nextHandlerSignalDone) => {
          if (nextErr) return done(nextErr)
          nextHandlerSignalDone(err)
        })
      } else {
        // next handler was not called - complete middleware
        end(err)
      }
    })

    async function getNextPromise() {
      nextDonePromise = getNextDoneCallback()
      await nextDonePromise
      return undefined
    }

    function getNextDoneCallback() {
      return new Promise((resolve) => {
        next((cb) => resolve(cb))
      })
    }
  }
}
