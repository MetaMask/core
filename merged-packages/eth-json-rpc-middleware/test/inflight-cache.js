const test = require('tape')
const JsonRpcEngine = require('json-rpc-engine')
const BlockTracker = require('eth-block-tracker')
const GanacheCore = require('ganache-core')
const providerFromEngine = require('../providerFromEngine')
const createInflightCacheMiddleware = require('../inflight-cache')

test('inflight-cache - basic', (t) => {
  const { engine } = createTestSetup()

  let hitCount = 0
  let res1, res2

  // add inflight cache
  engine.push(createInflightCacheMiddleware())

  // add stalling result handler for `test_blockCache`
  engine.push((_req, res, _next, end) => {
    hitCount++
    res.result = true
    if (hitCount === 1) {
      setTimeout(end, 100)
    }
  })

  // fire first request (handled but stalled)
  engine.handle({ id: 1, method: 'test_blockCache', params: [] }, firstReqResponse)
  // fire second request (inflight cached)
  engine.handle({ id: 2, method: 'test_blockCache', params: [] }, secondReqResponse)

  function firstReqResponse (err, res) {
    t.equal(hitCount, 1, 'test prep - result handler was only hit once')

    res1 = res
    t.notOk(err, 'No error in response')
    t.ok(res, 'Has response')
    t.equal(res.result, true, 'Response result is correct.')
  }

  function secondReqResponse (err, res) {
    res2 = res
    t.notOk(err, 'No error in response')
    t.ok(res, 'Has response')
    t.equal(res.result, true, 'Response result is correct.')
    t.equal(hitCount, 1, 'result handler was only hit once')
    t.notEqual(res1, res2, 'response objects were unique')
    t.end()
  }
})

// util

function createTestSetup () {
  // raw data source
  const dataProvider = GanacheCore.provider()
  // create block tracker
  const blockTracker = new BlockTracker({
    provider: dataProvider,
    pollingInterval: 100,
  })
  // create higher level
  const engine = new JsonRpcEngine()
  const provider = providerFromEngine(engine)
  return { engine, provider, dataProvider, blockTracker }
}
