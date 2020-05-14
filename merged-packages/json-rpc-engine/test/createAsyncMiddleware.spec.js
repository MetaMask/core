/* eslint-env mocha */
/* eslint require-await: 0 */
'use strict'

const { strict: assert } = require('assert')
const RpcEngine = require('../src')
const createAsyncMiddleware = require('../src/createAsyncMiddleware.js')

describe('createAsyncMiddleware tests', function () {
  it('basic middleware test', function (done) {
    const engine = new RpcEngine()

    engine.push(createAsyncMiddleware(async (_req, res, _next) => {
      res.result = 42
    }))

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error')
      assert(res, 'has res')
      assert.equal(res.result, 42, 'has expected result')
      done()
    })
  })

  it('next middleware test', function (done) {
    const engine = new RpcEngine()

    engine.push(createAsyncMiddleware(async (_req, res, next) => {
      assert.ifError(res.result, 'does not have result')
      await next() // eslint-disable-line callback-return
      assert.equal(res.result, 1234, 'value was set as expected')
      // override value
      res.result = 42 // eslint-disable-line require-atomic-updates
    }))

    engine.push(function (_req, res, _next, end) {
      res.result = 1234
      end()
    })

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error')
      assert(res, 'has res')
      assert.equal(res.result, 42, 'has expected result')
      done()
    })
  })

  it('basic throw test', function (done) {
    const engine = new RpcEngine()

    const error = new Error('bad boy')

    engine.push(createAsyncMiddleware(async (_req, _res, _next) => {
      throw error
    }))

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, _res) {
      assert(err, 'has err')
      assert.equal(err, error, 'has expected result')
      done()
    })
  })

  it('throw after next test', function (done) {
    const engine = new RpcEngine()

    const error = new Error('bad boy')

    engine.push(createAsyncMiddleware(async (_req, _res, next) => {
      await next() // eslint-disable-line callback-return
      throw error
    }))

    engine.push(function (_req, res, _next, end) {
      res.result = 1234
      end()
    })

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, _res) {
      assert(err, 'has err')
      assert.equal(err, error, 'has expected result')
      done()
    })
  })

  it('doesnt await next', function (done) {
    const engine = new RpcEngine()

    engine.push(createAsyncMiddleware(async (_req, _res, next) => {
      next()
    }))

    engine.push(function (_req, res, _next, end) {
      res.result = 1234
      end()
    })

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, _res) {
      assert.ifError(err, 'has err')
      done()
    })
  })
})
