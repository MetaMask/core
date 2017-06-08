const test = require('tape')
const RpcBlockTracker = require('../dist/index')
const JsonRpcEngine = require('json-rpc-engine')
const TestBlockMiddleware = require('./util/testBlockMiddleware')

test('basic tests - constructor', (t) => {
  t.plan(1)

  const provider = {}
  const blockTracker = new RpcBlockTracker({ provider })
  t.pass('constructor did not error')
  t.end()
})

test('basic tests - walking', (t) => {
  t.plan(4)

  const engine = new JsonRpcEngine()
  const testBlockSource = new TestBlockMiddleware()
  testBlockSource.nextBlock()
  testBlockSource.nextBlock()
  engine.push(testBlockSource.createMiddleware())

  const provider = {
    sendAsync: engine.handle.bind(engine),
  }
  const blockTracker = new RpcBlockTracker({ provider })

  blockTracker.once('block', () => {
    t.pass('saw 1st block')
    blockTracker.once('block', () => {
      t.pass('saw 2nd block')
      blockTracker.once('block', () => {
        t.pass('saw 3rd block')
      })
    })
  })

  blockTracker.once('latest', () => {
    t.pass('saw latest block')
    blockTracker.stop()
    t.end()
  })

  blockTracker.start({ fromBlock: '0x01' })

})

test('param validity', (t) => {

  const engine = new JsonRpcEngine()
  const testBlockSource = new TestBlockMiddleware()
  testBlockSource.nextBlock()
  testBlockSource.nextBlock()
  engine.push(testBlockSource.createMiddleware())

  const provider = {
    sendAsync: engine.handle.bind(engine),
  }
  const blockTracker = new RpcBlockTracker({ provider })

  const methodCache = blockTracker._query.getBlockByNumber

  const fakeMethod = (blockNumber, fullTxs, cb) => {
    t.ok(blockNumber.substr(2).indexOf('0') !== 0, 'no leading zeroes')
    methodCache.call(blockTracker._query, blockNumber, fullTxs, cb)
  }
  blockTracker._query.getBlockByNumber = fakeMethod

  blockTracker.once('block', () => {
    t.pass('saw 1st block')
    blockTracker._query.getBlockByNumber = methodCache
    blockTracker.stop()
    t.end()
  })

  blockTracker.start({ fromBlock: '0x01' })
})

