const RpcEngine = require('../index.js')
const asMiddleware = require('../lib/asMiddleware.js')
const test = require('tape')

test('test asMiddleware', function(t){

  let engine = new RpcEngine()
  let subengine = new RpcEngine()
  let originalReq = undefined

  subengine.push(function(req, res, next, end){
    originalReq = req
    res.result = 'saw subengine'
    end()
  })

  engine.push(asMiddleware(subengine))

  let payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

  engine.handle(payload, function(err, res){
    t.ifError(err, 'did not error')
    t.ok(res, 'has res')
    t.equals(originalReq.id, res.id, 'id matches')
    t.equals(originalReq.jsonrpc, res.jsonrpc, 'jsonrpc version matches')
    t.equals(res.result, 'saw subengine', 'response was handled by nested engine')
    t.end()
  })

})

test('asMiddleware - decorate res', function(t){

  let engine = new RpcEngine()
  let subengine = new RpcEngine()
  let originalReq = undefined

  subengine.push(function(req, res, next, end){
    originalReq = req
    res.xyz = true
    end()
  })

  engine.push(asMiddleware(subengine))

  let payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

  engine.handle(payload, function(err, res){
    t.ifError(err, 'did not error')
    t.ok(res, 'has res')
    t.equals(originalReq.id, res.id, 'id matches')
    t.equals(originalReq.jsonrpc, res.jsonrpc, 'jsonrpc version matches')
    t.ok(res.xyz, 'res non-result prop was transfered')
    t.end()
  })

})


test('asMiddleware - decorate req', function(t){

  let engine = new RpcEngine()
  let subengine = new RpcEngine()
  let originalReq = undefined

  subengine.push(function(req, res, next, end){
    originalReq = req
    req.xyz = true
    end()
  })

  engine.push(asMiddleware(subengine))

  let payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

  engine.handle(payload, function(err, res){
    t.ifError(err, 'did not error')
    t.ok(res, 'has res')
    t.equals(originalReq.id, res.id, 'id matches')
    t.equals(originalReq.jsonrpc, res.jsonrpc, 'jsonrpc version matches')
    t.ok(originalReq.xyz, 'req prop was transfered')
    t.end()
  })

})
