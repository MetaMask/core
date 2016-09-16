const RpcEngine = require('./index.js')
const test = require('tape')

test('basic middleware test', function(t){

  let engine = new RpcEngine()

  engine.push(function(req, res, next, end){
    res.result = true
    end()
  })

  let payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

  engine.handle(payload, function(err, res){
    t.ifError(err, 'did not error')
    t.ok(res, 'has res')
    t.equals(res.result, true, 'has expected result')
    t.end()
  })

})

test('interacting middleware test', function(t){

  let engine = new RpcEngine()

  engine.push(function(req, res, next, end){
    req.resultShouldBe = true
    next()
  })

  engine.push(function(req, res, next, end){
    res.result = req.resultShouldBe
    end()
  })

  let payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

  engine.handle(payload, function(err, res){
    t.ifError(err, 'did not error')
    t.ok(res, 'has res')
    t.equals(res.result, true, 'has expected result')
    t.end()
  })

})

test('empty middleware test', function(t){

  let engine = new RpcEngine()

  let payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

  engine.handle(payload, function(err, res){
    t.ok(err, 'did error')
    t.end()
  })

})


test('handle batch payloads', function(t){

  let engine = new RpcEngine()

  engine.push(function(req, res, next, end){
    res.result = req.id
    end()
  })

  let payloadA = { id: 1, jsonrpc: '2.0', method: 'hello' }
  let payloadB = { id: 2, jsonrpc: '2.0', method: 'hello' }
  let payload = [payloadA, payloadB]

  engine.handle(payload, function(err, res){
    t.ifError(err, 'did not error')
    t.ok(res, 'has res')
    t.ok(Array.isArray(res), 'res is array')
    t.equals(res[0].result, 1, 'has expected result')
    t.equals(res[1].result, 2, 'has expected result')
    t.end()
  })

})