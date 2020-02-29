const asMiddleware = require('./asMiddleware')
const JsonRpcEngine = require('.')

module.exports = mergeMiddleware

function mergeMiddleware (middlewareStack) {
  const engine = new JsonRpcEngine()
  middlewareStack.forEach((middleware) => engine.push(middleware))
  return asMiddleware(engine)
}
