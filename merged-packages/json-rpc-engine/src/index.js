'use strict'

const SafeEventEmitter = require('safe-event-emitter')
const {
  serializeError,
  EthereumRpcError,
  ERROR_CODES,
} = require('eth-rpc-errors')

module.exports = class RpcEngine extends SafeEventEmitter {
  constructor () {
    super()
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
      this._handleBatch(req, cb)
    } else {
      this._handle(req, cb)
    }
  }

  //
  // Private
  //

  async _handleBatch (reqs, cb) {

    // The order here is important
    try {
      const batchRes = await Promise.all( // 2. Wait for all requests to finish
        // 1. Begin executing each request in the order received
        reqs.map(this._promiseHandle.bind(this)),
      )
      return cb(null, batchRes) // 3a. Return batch response
    } catch (err) {
      return cb(err) // 3b. Some kind of fatal error; all requests are lost
    }
  }

  _promiseHandle (req) {
    return new Promise((resolve) => {
      this._handle(req, (_err, res) => {
        // there will always be a response, and it will always have any error
        // that is caught and propagated
        resolve(res)
      })
    })
  }

  _handle (_req, cb) {

    const req = Object.assign({}, _req)
    const res = {
      id: req.id,
      jsonrpc: req.jsonrpc,
    }

    let processingError

    this._processRequest(req, res)
      .catch((error) => {
        // either from return handlers or something unexpected
        processingError = error
      })
      .finally(() => {

        // preserve unserialized error, if any, for use in callback
        const responseError = res._originalError
        delete res._originalError

        const error = responseError || processingError || null

        if (error) {
          // ensure no result is present on an errored response
          delete res.result
          if (!res.error) {
            res.error = serializeError(error)
          }
        }

        cb(error, res)
      })
  }

  async _processRequest (req, res) {
    const { isComplete, returnHandlers } = await this._runMiddlewares(req, res)
    this._checkForCompletion(req, res, isComplete)
    await this._runReturnHandlers(returnHandlers)
  }

  async _runReturnHandlers (handlers) {
    for (const handler of handlers) {
      await new Promise((resolve, reject) => {
        handler((err) => (err ? reject(err) : resolve()))
      })
    }
  }

  _checkForCompletion (req, res, isComplete) {
    if (!('result' in res) && !('error' in res)) {
      const requestBody = JSON.stringify(req, null, 2)
      const message = `JsonRpcEngine: Response has no error or result for request:\n${requestBody}`
      throw new EthereumRpcError(ERROR_CODES.rpc.internal, message, req)
    }
    if (!isComplete) {
      const requestBody = JSON.stringify(req, null, 2)
      const message = `JsonRpcEngine: Nothing ended request:\n${requestBody}`
      throw new EthereumRpcError(ERROR_CODES.rpc.internal, message, req)
    }
  }

  // walks down stack of middleware
  async _runMiddlewares (req, res) {

    const returnHandlers = []
    // flag for early return
    let isComplete = false

    // go down stack of middleware, call and collect optional returnHandlers
    for (const middleware of this._middleware) {
      if (isComplete) {
        break
      }
      await runMiddleware(middleware)
    }

    return { isComplete, returnHandlers: returnHandlers.reverse() }

    // runs an individual middleware
    function runMiddleware (middleware) {
      return new Promise((resolve) => {

        try {
          middleware(req, res, next, end)
        } catch (err) {
          end(err)
        }

        function next (returnHandler) {
          if (res.error) {
            end(res.error)
          } else {
            if (returnHandler) {
              returnHandlers.push(returnHandler)
            }
            resolve()
          }
        }

        function end (err) {
          isComplete = true

          const error = err || (res && res.error)
          if (error) {
            res.error = serializeError(error)
            res._originalError = error
            delete res.result
          }
          resolve()
        }
      })
    }
  }
}
