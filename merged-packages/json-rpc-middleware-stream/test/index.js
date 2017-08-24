const test = require('tape')
const RpcEngine = require('json-rpc-engine')
const createStreamMiddleware = require('../index')
const createEngineStream = require('../engineStream')

test('middleware - raw test', (t) => {

  const middleware = createStreamMiddleware()
  const req = { id: 1, jsonrpc: '2.0', method: 'test' }
  const initRes = { id: 1, jsonrpc: '2.0' }
  const res = { id: 1, jsonrpc: '2.0', result: 'test' }

  // listen for incomming requests
  middleware.stream.on('data', (_req) => {
    t.equal(req, _req, 'got the expected request')
    middleware.stream.write(res)
  })

  // run middleware, expect end fn to be called
  middleware(req, initRes, () => {
    t.fail('should not call next')
  }, (err) => {
    t.notOk(err, 'should not error')
    t.deepEqual(initRes, res, 'got the expected response')
    t.end()
  })

})

test('engine to stream - raw test', (t) => {

  const engine = new RpcEngine()
  engine.push((req, res, next, end) => {
    res.result = 'test'
    end()
  })

  const stream = createEngineStream({ engine })
  const req = { id: 1, jsonrpc: '2.0', method: 'test' }
  const res = { id: 1, jsonrpc: '2.0', result: 'test' }

  // listen for incomming requests
  stream.on('data', (_res) => {
    t.deepEqual(res, _res, 'got the expected response')
    t.end()
  })

  stream.on('error', (err) => {
    t.fail(error.message)
  })

  stream.write(req)

})


test('middleware and engine to stream', (t) => {

  // create guest
  const engineA = new RpcEngine()
  const middleware = createStreamMiddleware()
  engineA.push(middleware)

  // create host
  const engineB = new RpcEngine()
  engineB.push((req, res, next, end) => {
    res.result = 'test'
    end()
  })

  // connect both
  const clientSideStream = middleware.stream
  const hostSideStream = createEngineStream({ engine: engineB })
  clientSideStream
  .pipe(hostSideStream)
  .pipe(clientSideStream)

  // request and expected result
  const req = { id: 1, jsonrpc: '2.0', method: 'test' }
  const res = { id: 1, jsonrpc: '2.0', result: 'test' }

  engineA.handle(req, (err, _res) => {
    t.notOk(err, 'does not error')
    t.deepEqual(res, _res, 'got the expected response')
    t.end()
  })

})