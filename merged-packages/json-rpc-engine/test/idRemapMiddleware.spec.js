/* eslint-env mocha */
'use strict'

const assert = require('assert')
const RpcEngine = require('../src')
const createIdRemapMiddleware = require('../src/idRemapMiddleware.js')

describe('idRemapMiddleware tests', function () {
  it('basic middleware test', function (done) {
    const engine = new RpcEngine()

    const observedIds = {
      before: {},
      after: {},
    }

    engine.push(function (req, res, next, _end) {
      observedIds.before.req = req.id
      observedIds.before.res = res.id
      next()
    })
    engine.push(createIdRemapMiddleware())
    engine.push(function (req, res, _next, end) {
      observedIds.after.req = req.id
      observedIds.after.res = res.id
      // set result so it doesnt error
      res.result = true
      end()
    })

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }
    const payloadCopy = { ...payload }

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error')
      assert(res, 'has res')
      // collected data
      assert(observedIds.before.req, 'captured ids')
      assert(observedIds.before.res, 'captured ids')
      assert(observedIds.after.req, 'captured ids')
      assert(observedIds.after.res, 'captured ids')
      // data matches expectations
      assert.equal(observedIds.before.req, observedIds.before.res, 'ids match')
      assert.equal(observedIds.after.req, observedIds.after.res, 'ids match')
      // correct behavior
      assert.notEqual(observedIds.before.req, observedIds.after.req, 'ids are different')
      assert.equal(observedIds.before.req, res.id, 'result id matches original')
      assert.equal(payload.id, res.id, 'result id matches original')
      assert.equal(payloadCopy.id, res.id, 'result id matches original')
      done()
    })
  })
})
