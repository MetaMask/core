const test = require('tape')
const JsonRpcEngine = require('json-rpc-engine')
const RpcBlockTracker = require('eth-block-tracker')
const EthQuery = require('eth-query')
const GanacheCore = require('ganache-core')
const BlockRefMiddleware = require('../block-ref')
const ScaffoldMiddleware = require('../scaffold')
const providerFromEngine = require('../providerFromEngine')
const providerAsMiddleware = require('../providerAsMiddleware')

test('contructor - no opts', (t) => {
  t.plan(1)

  t.throws(() => {
    BlockRefMiddleware()
  }, Error, 'Constructor without options fails')
  t.end()
})

test('contructor - empty opts', (t) => {
  t.plan(1)

  t.throws(() => {
    BlockRefMiddleware({})
  }, Error, 'Constructor without empty options')
  t.end()
})

test('provider not ready - shouldnt hang non-"latest" requests', (t) => {
  t.plan(3)

  const { engine, testBlockSource } = createTestSetup()

  // fire request for `test_method`
  engine.handle({ id: 1, method: 'net_listening', params: [] }, (err, res) => {
    t.notOk(err, 'No error in response')
    t.ok(res, 'Has response')
    t.equal(res.result, true, 'Response result is correct.')
    t.end()
  })
})

// util

function createTestSetup () {
  // raw data source
  const dataProvider = GanacheCore.provider()
  // create block tracker
  const blockTracker = new RpcBlockTracker({ provider: dataProvider })
  // create higher level
  const engine = new JsonRpcEngine()
  const provider = providerFromEngine(engine)
  // add block ref middleware
  engine.push(BlockRefMiddleware({ blockTracker }))
  // add data source
  engine.push(providerAsMiddleware(dataProvider))
  const query = new EthQuery(provider)
  return { engine, provider, dataProvider, query, blockTracker }
}
