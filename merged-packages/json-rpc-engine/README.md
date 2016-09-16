# RpcEngine

a tool for processing JSON RPC

### usage

```js
const RpcEngine = require('rpc-engine')

let engine = new RpcEngine()
```

Build a stack of json rpc processors by pushing in RpcEngine middleware.
RpcEngine is a subclass of Array so you can perform normal array manipulation functions.

```js
engine.push(function(req, res, next, end){
  res.result = 42
  end()
})
```

JSON RPC are handled asynchronously, stepping down the stack until complete.

```js
let payload = { id: 1, jsonrpc: '2.0', method: 'hello' }

engine.handle(payload, function(err, res){
  // do something with res.result
})
```

RpcEngine middleware has direct access to the request and response objects.
It can let processing continue down the stack with `next()` or complete the request with `end()`.

```js
engine.push(function(req, res, next, end){
  if (req.skipCache) return next()
  res.result = getResultFromCache(req)
  end()
})
```

By passing a 'return handler' to the `next` function, you can get a peek at the result before it returns.

```js
engine.push(function(req, res, next, end){
  next(function(cb){
    insertIntoCache(res, cb)
  })
})
```

You can overwrite the response object by calling `end(null, newRes)`.

```js
engine.push(function(req, res, next, end){
  var newResponse = {
    id: req.id,
    jsonrpc: req.jsonrpc,
    result: 42,
  }
  end(null, newResponse)
})
```

RpcEngines can be nested by converting them to middleware `engine.asMiddleware()`

```js
let engine = new RpcEngine()
let subengine = new RpcEngine()
engine.push(subengine.asMiddleware())
```

### gotchas

Handle errors via `end(err)`, *NOT* `next(err)`.

```js
/* INCORRECT */
engine.push(function(req, res, next, end){
  next(new Error())
})

/* CORRECT */
engine.push(function(req, res, next, end){
  end(new Error())
})
```