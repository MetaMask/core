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

test('return handlers test', function(t){

  let engine = new RpcEngine()

  engine.push(function(req, res, next, end){
    next(function(cb){
      res.sawReturnHandler = true
      cb()
    })
  })

  engine.push(function(req, res, next, end){
    end()
  })

  let payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

  engine.handle(payload, function(err, res){
    t.ifError(err, 'did not error')
    t.ok(res, 'has res')
    t.ok(res.sawReturnHandler,'saw return handler')
    t.end()
  })

})

test('return order of events', function(t){

  let engine = new RpcEngine()

  let events = []

  engine.push(function(req, res, next, end){
    events.push('1-next')
    next(function(cb){
      events.push('1-return')
      cb()
    })
  })

  engine.push(function(req, res, next, end){
    events.push('2-next')
    next(function(cb){
      events.push('2-return')
      cb()
    })
  })

  engine.push(function(req, res, next, end){
    events.push('3-end')
    end()
  })

  let payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

  engine.handle(payload, function(err, res){
    t.ifError(err, 'did not error')
    t.equals(events[0], '1-next', '(event 0) was "1-next"')
    t.equals(events[1], '2-next', '(event 1) was "2-next"')
    t.equals(events[2], '3-end', '(event 2) was "3-end"')
    t.equals(events[3], '2-return', '(event 3) was "2-return"')
    t.equals(events[4], '1-return', '(event 4) was "1-return"')
    t.end()
  })

})