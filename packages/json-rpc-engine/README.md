# `@metamask/json-rpc-engine`

A tool for processing JSON-RPC requests and responses.

## Installation

`yarn add @metamask/json-rpc-engine`

or

`npm install @metamask/json-rpc-engine`

## Usage

```js
const { JsonRpcEngine } = require('@metamask/json-rpc-engine');

const engine = new JsonRpcEngine();
```

Build a stack of JSON-RPC processors by pushing middleware to the engine.

```js
engine.push(function (req, res, next, end) {
  res.result = 42;
  end();
});
```

Requests are handled asynchronously, stepping down the stack until complete.

```js
const request = { id: 1, jsonrpc: '2.0', method: 'hello' };

engine.handle(request, function (err, response) {
  // Do something with response.result, or handle response.error
});

// There is also a Promise signature
const response = await engine.handle(request);
```

Middleware have direct access to the request and response objects.
They can let processing continue down the stack with `next()`, or complete the request with `end()`.

```js
engine.push(function (req, res, next, end) {
  if (req.skipCache) return next();
  res.result = getResultFromCache(req);
  end();
});
```

By passing a _return handler_ to the `next` function, you can get a peek at the result before it returns.

```js
engine.push(function (req, res, next, end) {
  next(function (cb) {
    insertIntoCache(res, cb);
  });
});
```

If you specify a `notificationHandler` when constructing the engine, JSON-RPC notifications passed to `handle()` will be handed off directly to this function without touching the middleware stack:

```js
const engine = new JsonRpcEngine({ notificationHandler });

// A notification is defined as a JSON-RPC request without an `id` property.
const notification = { jsonrpc: '2.0', method: 'hello' };

const response = await engine.handle(notification);
console.log(typeof response); // 'undefined'
```

Engines can be nested by converting them to middleware using `JsonRpcEngine.asMiddleware()`:

```js
const engine = new JsonRpcEngine();
const subengine = new JsonRpcEngine();
engine.push(subengine.asMiddleware());
```

### `async` Middleware

If you require your middleware function to be `async`, use `createAsyncMiddleware`:

```js
const { createAsyncMiddleware } = require('@metamask/json-rpc-engine');

let engine = new RpcEngine();
engine.push(
  createAsyncMiddleware(async (req, res, next) => {
    res.result = 42;
    next();
  }),
);
```

`async` middleware do not take an `end` callback.
Instead, the request ends if the middleware returns without calling `next()`:

```js
engine.push(
  createAsyncMiddleware(async (req, res, next) => {
    res.result = 42;
    /* The request will end when this returns */
  }),
);
```

The `next` callback of `async` middleware also don't take return handlers.
Instead, you can `await next()`.
When the execution of the middleware resumes, you can work with the response again.

```js
engine.push(
  createAsyncMiddleware(async (req, res, next) => {
    res.result = 42;
    await next();
    /* Your return handler logic goes here */
    addToMetrics(res);
  }),
);
```

You can freely mix callback-based and `async` middleware:

```js
engine.push(function (req, res, next, end) {
  if (!isCached(req)) {
    return next((cb) => {
      insertIntoCache(res, cb);
    });
  }
  res.result = getResultFromCache(req);
  end();
});

engine.push(
  createAsyncMiddleware(async (req, res, next) => {
    res.result = 42;
    await next();
    addToMetrics(res);
  }),
);
```

### Teardown

If your middleware has teardown to perform, you can assign a method `destroy()` to your middleware function(s),
and calling `JsonRpcEngine.destroy()` will call this method on each middleware that has it.
A destroyed engine can no longer be used.

```js
const middleware = (req, res, next, end) => {
  /* do something */
};
middleware.destroy = () => {
  /* perform teardown */
};

const engine = new JsonRpcEngine();
engine.push(middleware);

/* perform work */

// This will call middleware.destroy() and destroy the engine itself.
engine.destroy();

// Calling any public method on the middleware other than `destroy()` itself
// will throw an error.
engine.handle(req);
```

### Gotchas

Handle errors via `end(err)`, _NOT_ `next(err)`.

```js
/* INCORRECT */
engine.push(function (req, res, next, end) {
  next(new Error());
});

/* CORRECT */
engine.push(function (req, res, next, end) {
  end(new Error());
});
```

However, `next()` will detect errors on the response object, and cause
`end(res.error)` to be called.

```js
engine.push(function (req, res, next, end) {
  res.error = new Error();
  next(); /* This will cause end(res.error) to be called. */
});
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
