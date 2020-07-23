'use strict'

module.exports = function asMiddleware (engine) {
  return function engineAsMiddleware (req, res, next, end) {

    let err = null

    engine._runMiddlewares(req, res)
      .then(async ({ isComplete, returnHandlers }) => {
        if (isComplete) {
          return await runReturnHandlers()
        }

        return next(async (cb) => {
          await runReturnHandlers()
          cb()
        })

        async function runReturnHandlers () {
          for (const handler of returnHandlers) {
            await new Promise((resolve) => handler(resolve))
          }
        }
      })
      .catch((error) => {
        err = error
      })
      .finally(() => {
        end(err)
      })
  }
}
