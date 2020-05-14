/* eslint-env mocha */
'use strict'

const { strict: assert } = require('assert')
const RpcEngine = require('../src')
const mergeMiddleware = require('../src/mergeMiddleware.js')

describe('mergeMiddleware', function () {
  it('basic', function (done) {
    const engine = new RpcEngine()
    let originalReq

    engine.push(mergeMiddleware([
      function (req, res, _next, end) {
        originalReq = req
        res.result = 'saw merged middleware'
        end()
      },
    ]))

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error')
      assert.ok(res, 'has res')
      assert.equal(originalReq.id, res.id, 'id matches')
      assert.equal(originalReq.jsonrpc, res.jsonrpc, 'jsonrpc version matches')
      assert.equal(res.result, 'saw merged middleware', 'response was handled by nested middleware')
      done()
    })
  })

  it('handles next handler correctly for multiple merged', function (done) {
    const engine = new RpcEngine()

    engine.push(mergeMiddleware([
      (_req, res, next, _end) => {
        next((cb) => {
          res.copy = res.result
          cb()
        })
      },
      (_req, res, _next, end) => {
        res.result = true
        end()
      },
    ]))

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error')
      assert.ok(res, 'has res')
      assert.equal(res.result, res.copy, 'copied result correctly')
      done()
    })
  })

  it('decorate res', function (done) {
    const engine = new RpcEngine()
    let originalReq

    engine.push(mergeMiddleware([
      function (req, res, _next, end) {
        originalReq = req
        res.xyz = true
        res.result = true
        end()
      },
    ]))

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error')
      assert.ok(res, 'has res')
      assert.equal(originalReq.id, res.id, 'id matches')
      assert.equal(originalReq.jsonrpc, res.jsonrpc, 'jsonrpc version matches')
      assert.ok(res.xyz, 'res non-result prop was transfered')
      done()
    })
  })

  it('decorate req', function (done) {
    const engine = new RpcEngine()
    let originalReq

    engine.push(mergeMiddleware([
      function (req, res, _next, end) {
        originalReq = req
        req.xyz = true
        res.result = true
        end()
      },
    ]))

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error')
      assert.ok(res, 'has res')
      assert.equal(originalReq.id, res.id, 'id matches')
      assert.equal(originalReq.jsonrpc, res.jsonrpc, 'jsonrpc version matches')
      assert.ok(originalReq.xyz, 'req prop was transfered')
      done()
    })
  })

  it('should not error even if end not called', function (done) {
    const engine = new RpcEngine()

    engine.push(mergeMiddleware([
      (_req, _res, next, _end) => next(),
    ]))
    engine.push((_req, res, _next, end) => {
      res.result = true
      end()
    })

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error')
      assert.ok(res, 'has res')
      done()
    })
  })

  it('handles next handler correctly across middleware', function (done) {
    const engine = new RpcEngine()

    engine.push(mergeMiddleware([
      (_req, res, next, _end) => {
        next((cb) => {
          res.copy = res.result
          cb()
        })
      },
    ]))
    engine.push((_req, res, _next, end) => {
      res.result = true
      end()
    })
    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error')
      assert.ok(res, 'has res')
      assert.equal(res.result, res.copy, 'copied result correctly')
      done()
    })
  })
})
