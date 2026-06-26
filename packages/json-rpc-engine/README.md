# `@metamask/json-rpc-engine`

A tool for processing JSON-RPC requests and responses.

## Installation

`yarn add @metamask/json-rpc-engine`

or

`npm install @metamask/json-rpc-engine`

## Usage

> [!TIP]
> For the legacy `JsonRpcEngine`, see [its readme](./src/README.md).
>
> For how to migrate from the legacy `JsonRpcEngine` to `JsonRpcEngineV2`, see [Migrating from `JsonRpcEngine`](#migrating-from-jsonrpcengine).

```ts
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import type {
  Json,
  JsonRpcMiddleware,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';

type Middleware = JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ hello: string }>
>;

// Engines are instantiated using the `create()` factory method as opposed to
// the constructor, which is private.
const engine = JsonRpcEngineV2.create<Middleware>({
  middleware: [
    ({ request, next, context }) => {
      if (request.method === 'hello') {
        context.set('hello', 'world');
        return next();
      }
      return null;
    },
    ({ context }) => context.assertGet('hello'),
  ],
});
```

Requests are handled asynchronously, stepping down the middleware stack until complete.

```ts
const request = { id: '1', jsonrpc: '2.0', method: 'hello' };

try {
  const result = await engine.handle(request);
  // Do something with the result
} catch (error) {
  // Handle the error
}
```

Alternatively, pass the engine to a `JsonRpcServer`, which coerces raw request
objects into well-formed requests, and handles error serialization:

```ts
const server = new JsonRpcServer({ engine, onError });
const request = { id: '1', jsonrpc: '2.0', method: 'hello' };

// server.handle() never throws
const response = await server.handle(request);
if ('result' in response) {
  // Handle result
} else {
  // Handle error
}

const notification = { jsonrpc: '2.0', method: 'hello' };

// Always returns undefined for notifications
await server.handle(notification);
```

### Legacy compatibility

Use `asLegacyMiddleware()` to convert a `JsonRpcEngineV2` or one or more V2 middleware into a legacy middleware.

#### Context propagation

In keeping with the conventions of the legacy engine, non-JSON-RPC string properties of the `context` will be
copied over to the request once the V2 engine is done with the request. _Note that **only `string` keys** of
the `context` will be copied over._

#### Converting a V2 engine

```ts
import {
  asLegacyMiddleware,
  JsonRpcEngineV2,
} from '@metamask/json-rpc-engine/v2';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';

const legacyEngine = new JsonRpcEngine();

const v2Engine = JsonRpcEngineV2.create({
  middleware: [
    // ...
  ],
});

legacyEngine.push(asLegacyMiddleware(v2Engine));
```

#### Converting V2 middleware

```ts
import {
  asLegacyMiddleware,
  type JsonRpcMiddleware,
} from '@metamask/json-rpc-engine/v2';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';

// Convert a single V2 middleware
const middleware1: JsonRpcMiddleware<JsonRpcRequest> = ({ request }) => {
  /* ... */
};

const legacyEngine = new JsonRpcEngine();
legacyEngine.push(asLegacyMiddleware(middleware1));

// Convert multiple V2 middlewares at once
const middleware2: JsonRpcMiddleware<JsonRpcRequest> = ({ context, next }) => {
  /* ... */
};

const legacyEngine2 = new JsonRpcEngine();
legacyEngine2.push(asLegacyMiddleware(middleware1, middleware2));
```

### Middleware

Middleware functions can be sync or async.
They receive a `MiddlewareParams` object containing:

- `request`
  - The JSON-RPC request or notification (readonly)
- `context`
  - An append-only `Map` for passing data between middleware
- `next`
  - Function that calls the next middleware in the stack and returns its result (if any)

Here's a basic example:

```ts
const engine = JsonRpcEngineV2.create({
  middleware: [
    ({ next, context }) => {
      context.set('foo', 'bar');
      // Proceed to the next middleware and return its result
      return next();
    },
    async ({ request, context }) => {
      await doSomething(request, context.get('foo'));
      // Return a result wihout calling next() to end the request
      return 42;
    },
  ],
});
```

In practice, middleware functions are often defined apart from the engine in which
they are used. Middleware defined in this manner must use the `JsonRpcMiddleware` type:

```ts
export const permissionMiddleware: JsonRpcMiddleware<
  JsonRpcRequest,
  Json, // The result
  MiddlewareContext<{ user: User; permissions: Permissions }>
> = async ({ request, context, next }) => {
  const user = context.assertGet('user');
  const permissions = await getUserPermissions(user.id);
  context.set('permissions', permissions);
  return next();
};
```

Middleware can specify a return type, however `next()` always returns the widest possible
type based on the type of the `request`. See [Requests vs. notifications](#requests-vs-notifications)
for more details.

Creating a useful `JsonRpcEngineV2` requires composing differently typed middleware together.
See [Engine composition](#engine-composition) for how to
accomplish this in the same or a set of composed engines.

### Requests vs. notifications

JSON-RPC requests come in two flavors:

- [Requests](https://www.jsonrpc.org/specification#request_object), i.e. request objects _with_ an `id`
- [Notifications](https://www.jsonrpc.org/specification#notification), i.e. request objects _without_ an `id`

`next()` returns `Json` for requests, `void` for notifications, and `Json | void` if the type of the request
object is not known.

For requests, one of the engine's middleware must "end" the request by returning a non-`undefined` result, or `.handle()`
will throw an error:

```ts
const engine = JsonRpcEngineV2.create({
  middleware: [
    () => {
      if (Math.random() > 0.5) {
        return 42;
      }
      return undefined;
    },
  ],
});

const request = { jsonrpc: '2.0', id: '1', method: 'hello' };

try {
  const result = await engine.handle(request);
  console.log(result); // 42
} catch (error) {
  console.error(error); // Nothing ended request: { ... }
}
```

For notifications, on the other hand, one of the engine's middleware must return `undefined` to end the request,
and any non-`undefined` return values will cause an error to be thrown:

```ts
const notification = { jsonrpc: '2.0', method: 'hello' };

try {
  const result = await engine.handle(notification);
  console.log(result); // undefined
} catch (error) {
  console.error(error); // Result returned for notification: { ... }
}
```

If your middleware may be passed both requests and notifications,
use the `isRequest` or `isNotification` utilities to determine what to do:

> [!NOTE]
> Middleware that handle both requests and notifications—i.e. the `JsonRpcCall` type—
> must ensure that their return values are valid for incoming requests at runtime.
> There is no compile time type error if such a middleware returns e.g. a string
> for a notification.

```ts
import {
  isRequest,
  isNotification,
  JsonRpcEngineV2,
} from '@metamask/json-rpc-engine/v2';

const engine = JsonRpcEngineV2.create({
  middleware: [
    async ({ request, next }) => {
      if (isRequest(request) && request.method === 'everything') {
        return 42;
      }
      return next();
    },
    ({ request }) => {
      if (isNotification(request)) {
        console.log(`Received notification: ${request.method}`);
        return undefined;
      }
      return null;
    },
  ],
});
```

### Request modification

The `request` object is immutable.
Attempting to directly modify it will throw an error.
Middleware can modify the `method` and `params` properties
by passing a new request object to `next()`:

```ts
const engine = JsonRpcEngineV2.create({
  middleware: [
    ({ request, next }) => {
      // Modify the request for subsequent middleware
      // The new request object will be deeply frozen
      return next({
        ...request,
        method: 'modified_method',
        params: [1, 2, 3],
      });
    },
    ({ request }) => {
      // This middleware receives the modified request
      return request.params[0];
    },
  ],
});
```

Modifying the `jsonrpc` or `id` properties is not allowed, and will cause
an error:

```ts
const engine = JsonRpcEngineV2.create({
  middleware: [
    ({ request, next }) => {
      return next({
        ...request,
        // Modifying either property will cause an error
        jsonrpc: '3.0',
        id: 'foo',
      });
    },
    () => 42,
  ],
});

// Error: Middleware attempted to modify readonly property...
await engine.handle(anyRequest);
```

### Result handling

Middleware can observe the result by awaiting `next()`:

```ts
const engine = JsonRpcEngineV2.create({
  middleware: [
    async ({ request, next }) => {
      const startTime = Date.now();
      const result = await next();
      const duration = Date.now() - startTime;

      // Log the request duration
      console.log(
        `Request ${request.method} producing ${result} took ${duration}ms`,
      );

      // By returning `undefined`, the result will be forwarded unmodified to earlier
      // middleware.
    },
    ({ request }) => {
      return 'Hello, World!';
    },
  ],
});
```

Like the `request`, the `result` is also immutable.
Middleware can update the result by returning a new one.

```ts
const engine = JsonRpcEngineV2.create({
  middleware: [
    async ({ request, next }) => {
      const result = await next();

      // Add metadata to the result
      if (result && typeof result === 'object') {
        // The new result will also be deeply frozen
        return {
          ...result,
          metadata: {
            processedAt: new Date().toISOString(),
            requestId: request.id,
          },
        };
      }

      // Returning the unmodified result is equivalent to returning `undefined`
      return result;
    },
    ({ request }) => {
      // Initial result
      return { message: 'Hello, World!' };
    },
  ],
});

const result = await engine.handle({
  id: '1',
  jsonrpc: '2.0',
  method: 'hello',
});
console.log(result);
// {
//   message: 'Hello, World!',
//   metadata: {
//     processedAt: '2024-01-01T12:00:00.000Z',
//     requestId: 1
//   }
// }
```

### The `MiddlewareContext`

Use the `context` to share data between middleware:

```ts
const engine = JsonRpcEngineV2.create({
  middleware: [
    async ({ context, next }) => {
      context.set('user', { id: '123', name: 'Alice' });
      return next();
    },
    async ({ context, next }) => {
      // context.assertGet() throws if the value does not exist
      const user = context.assertGet('user') as { id: string; name: string };
      context.set('permissions', await getUserPermissions(user.id));
      return next();
    },
    ({ context }) => {
      const user = context.get('user');
      const permissions = context.get('permissions');
      return { user, permissions };
    },
  ],
});
```

The `context` supports `PropertyKey` keys, i.e. strings, numbers, and symbols.
To prevent accidental naming collisions, existing keys must be deleted before they can be
overwritten via `set()`.
Context values are not frozen, and objects can be mutated as normal:

```ts
const engine = JsonRpcEngineV2.create({
  middleware: [
    async ({ context, next }) => {
      context.set('user', { id: '123', name: 'Alice' });
      return next();
    },
    async ({ context, next }) => {
      const user = context.assertGet<{ id: string; name: string }>('user');
      user.name = 'Bob';
      return next();
    },
    // ...
  ],
});
```

#### Passing the context to `handle()`

You can pass a `MiddlewareContext` instance directly to `handle()`:

```ts
const context = new MiddlewareContext();
context.set('foo', 'bar');
const result = await engine.handle(
  { id: '1', jsonrpc: '2.0', method: 'hello' },
  { context },
);
console.log(result); // 'bar'
```

You can also pass a plain object as a shorthand for a `MiddlewareContext` instance:

```ts
const context = { foo: 'bar' };
const result = await engine.handle(
  { id: '1', jsonrpc: '2.0', method: 'hello' },
  { context },
);
console.log(result); // 'bar'
```

This works the same way for `JsonRpcServer.handle()`.

#### Constraining context keys and values

The context exposes a generic parameter `KeyValues`, which determines the keys and values
a context instance supports:

```ts
const context = new MiddlewareContext();
context.set('foo', 'bar');
context.get('foo'); // 'bar'
context.get('fizz'); // undefined
```

By default, `KeyValues` is `Record<PropertyKey, unknown>`. However, any object type can be
specified, effectively turning the context into a strongly typed `Map`:

```ts
const context = new MiddlewareContext<{ foo: string }>([['foo', 'bar']]);
context.get('foo'); // 'bar'
context.get('fizz'); // Type error
```

The context is itself exposed as the third generic parameter of the `JsonRpcMiddleware` type.
See [Instrumenting middleware pipelines](#instrumenting-middleware-pipelines) for how to
compose different context types together.

### Error handling

Errors in middleware are propagated up the call stack:

```ts
const engine = JsonRpcEngineV2.create({
  middleware: [
    ({ next }) => {
      return next();
    },
    ({ request, next }) => {
      if (request.method === 'restricted') {
        throw new Error('Method not allowed');
      }
      return 'Success';
    },
  ],
});

try {
  await engine.handle({ id: '1', jsonrpc: '2.0', method: 'restricted' });
} catch (error) {
  console.error('Request failed:', error.message);
}
```

If your middleware awaits `next()`, it can handle errors using `try`/`catch`:

```ts
const engine = JsonRpcEngineV2.create({
  middleware: [
    ({ request, next }) => {
      try {
        return await next();
      } catch (error) {
        console.error(`Request ${request.method} errored:`, error);
        return 42;
      }
    },
    ({ request }) => {
      if (!isValid(request)) {
        throw new Error('Invalid request');
      }
    },
  ],
});

const result = await engine.handle({
  id: '1',
  jsonrpc: '2.0',
  method: 'hello',
});
console.log('Result:', result);
// Request hello errored: Error: Invalid request
// Result: 42
```

#### Internal errors

The engine throws `JsonRpcEngineError` values when its invariants are violated, e.g. a middleware returns
a result value for a notification.
If you want to reliably detect these cases, use `JsonRpcEngineError.isInstance(error)`, which works across
versions of this package in the same realm.

### Engine composition

#### Instrumenting middleware pipelines

As discussed in the [Middleware](#middleware) section, middleware are often defined apart from the
engine in which they are used. To be used within the same engine, a set of middleware must have
compatible types. Specifically, all middleware must:

- Handle either `JsonRpcRequest`, `JsonRpcNotification`, or both (i.e. `JsonRpcCall`)
  - It is okay to mix `JsonRpcCall` middleware with either `JsonRpcRequest` or `JsonRpcNotification`
    middleware, as long as the latter two are not mixed together.
- Return valid results for the overall request type
- Specify mutually inclusive context types
  - The context types may be the same, partially intersecting, or completely disjoint
    so long as they are not mutually exclusive.

For example, the following middleware are compatible:

```ts
const middleware1: JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ foo: string }>
> = /* ... */;

const middleware2: JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ bar: string }>
> = /* ... */;

const middleware3: JsonRpcMiddleware<
  JsonRpcRequest,
  { foo: string; bar: string },
  MiddlewareContext<{ foo: string; bar: string; baz: number }>
> = /* ... */;

// ✅ OK
const engine = JsonRpcEngineV2.create<Middleware>({
  middleware: [middleware1, middleware2, middleware3],
});
```

The following middleware are incompatible due to mismatched request types:

> [!WARNING]
> Providing `JsonRpcRequest`- and `JsonRpcNotification`-only middleware to the same engine is
> generally unsound and should be avoided. However, doing so will **not** cause a type error,
> and it is the programmer's responsibility to prevent it from happening.

```ts
const middleware1: JsonRpcMiddleware<JsonRpcNotification> = /* ... */;

const middleware2: JsonRpcMiddleware<JsonRpcRequest> = /* ... */;

// ⚠️ Attempting to call engine.handle() will NOT cause a type error, but it
// may cause errors at runtime and should be avoided.
const engine = JsonRpcEngineV2.create<Middleware>({
  middleware: [middleware1, middleware2],
});
```

Finally, these middleware are incompatible due to mismatched context types:

```ts
const middleware1: JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ foo: string }>
> = /* ... */;

const middleware2: JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ foo: number }>
> = /* ... */;

// ❌ The type of the engine is `never`; accessing any property will cause a type error
const engine = JsonRpcEngineV2.create<Middleware>({
  middleware: [middleware1, middleware2],
});
```

#### `asMiddleware()`

Engines can be nested by converting them to middleware using `asMiddleware()`:

```ts
const subEngine = JsonRpcEngineV2.create({
  middleware: [
    ({ request }) => {
      return 'Sub-engine result';
    },
  ],
});

const mainEngine = JsonRpcEngineV2.create({
  middleware: [
    subEngine.asMiddleware(),
    ({ request, next }) => {
      const subResult = await next();
      return `Main engine processed: ${subResult}`;
    },
  ],
});
```

Engines used as middleware may return `undefined` for requests, but only when
used as middleware:

```ts
const loggingEngine = JsonRpcEngineV2.create({
  middleware: [
    ({ request, next }) => {
      console.log('Observed request:', request.method);
    },
  ],
});

const mainEngine = JsonRpcEngineV2.create({
  middleware: [
    loggingEngine.asMiddleware(),
    ({ request }) => {
      return 'success';
    },
  ],
});

const request = { id: '1', jsonrpc: '2.0', method: 'hello' };
const result = await mainEngine.handle(request);
console.log('Result:', result);
// Observed request: hello
// Result: success

// ATTN: This will throw "Nothing ended request"
const result2 = await loggingEngine.handle(request);
```

#### Calling `handle()` in a middleware

You can also compose different engines together by calling `handle(request, context)`
on a different engine in a middleware. Keep in mind that, unlike when using `asMiddleware()`,
these "sub"-engines must return results for requests.

This method of composition can be useful to instrument request- and notification-only
middleware pipelines:

```ts
const requestEngine = JsonRpcEngineV2.create({
  middleware: [
    /* Request-only middleware */
  ],
});

const notificationEngine = JsonRpcEngineV2.create({
  middleware: [
    /* Notification-only middleware */
  ],
});

const orchestratorEngine = JsonRpcEngineV2.create({
  middleware: [
    ({ request, context }) =>
      isRequest(request)
        ? requestEngine.handle(request, { context })
        : notificationEngine.handle(request as JsonRpcNotification, {
            context,
          }),
  ],
});
```

### `JsonRpcServer`

The `JsonRpcServer` wraps a `JsonRpcEngineV2` to provide JSON-RPC 2.0 compliance and error handling. It coerces raw request objects into well-formed requests and handles error serialization.

```ts
import { JsonRpcEngineV2, JsonRpcServer } from '@metamask/json-rpc-engine/v2';

const engine = new JsonRpcEngine({ middleware });

const server = new JsonRpcServer({
  engine,
  // onError receives the raw error, before it is coerced into a JSON-RPC error.
  onError: (error) => console.error('Server error:', error),
});

// server.handle() never throws - all errors are handled by onError
const response = await server.handle({
  id: '1',
  jsonrpc: '2.0',
  method: 'hello',
});
if ('result' in response) {
  // Handle successful response
} else {
  // Handle error response
}

// Notifications always return undefined
const notification = { jsonrpc: '2.0', method: 'hello' };
await server.handle(notification); // Returns undefined
```

The server accepts any object with a `method` property, coercing it into a request or notification
depending on the presence or absence of the `id` property, respectively.
Except for the `id`, all present JSON-RPC 2.0 fields are validated for spec conformance.
The `id` is replaced during request processing with an internal, trusted value, although the
original `id` is attached to the response before it is returned.

Response objects are returned for requests, and contain
the `result` in case of success and `error` in case of failure.
`undefined` is always returned for notifications.

Errors thrown by the underlying engine are always passed to `onError` unmodified.
If the request is not a notification, the error is subsequently serialized and attached
to the response object via the `error` property.

> [!WARNING]
> It is possible to construct a `JsonRpcServer` the only accepts either requests or notifications,
> but not both. If you do so, it is your responsibility to ensure that the server is only used with the
> appropriate request objects. `JsonRpcServer.handle()` will not type error at compile time if you attempt to pass
> it an unsupported request object.

## Migrating from `JsonRpcEngine`

Migrating from the legacy `JsonRpcEngine` to `JsonRpcEngineV2` is generally straightforward.
For an example, see [MetaMask/core#7065](https://github.com/MetaMask/core/pull/7065).
There are a couple of pitfalls to watch out for:

### `MiddlewareContext` vs. non-JSON-RPC string properties

The legacy `JsonRpcEngine` allowed non-JSON-RPC string properties to be attached to the request object.
`JsonRpcEngineV2` does not allow this, and instead you must use the `context` object to pass data between middleware.
While it's easy to migrate a middleware function body to use the `context` object, injected dependencies
of the middleware function may need to be updated.

For example if you have a legacy middleware implementation like this:

```ts
const createFooMiddleware =
  (processFoo: (req: JsonRpcRequest) => string) => (req, res, next, end) => {
    if (req.method === 'foo') {
      const fooResult = processFoo(req); // May expect non-JSON-RPC properties on the request object!
      res.result = fooResult;
      end();
    } else {
      next();
    }
  };
```

`processFoo` may expect non-JSON-RPC properties on the request object. To fully migrate the middleware, you need to
investigate the implementation of `processFoo` and potentially update it to accept a `context` object.

### Frozen requests

In the legacy `JsonRpcEngine`, request and response objects are mutable and shared between all middleware.
In `JsonRpcEngineV2`, response objects are not visible to middleware, and request objects are deeply frozen.
If injected dependencies mutate the request object, it will cause an error.

For example, if you have a legacy middleware implementation like this:

```ts
const createBarMiddleware =
  (processBar: (req: JsonRpcRequest) => string) => (req, _res, next, _end) => {
    if (req.method === 'bar') {
      processBar(req); // May mutate the request object!
    }
    next();
  };
```

`processBar` may mutate the request object. To fully migrate the middleware, you need to
investigate the implementation of `processBar` and update it to not directly mutate the request object.
See [Request modification](#request-modification) for how to modify the request object in `JsonRpcEngineV2`.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
