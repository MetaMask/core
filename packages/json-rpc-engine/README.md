# `@metamask/json-rpc-engine`

A tool for processing JSON-RPC requests and responses.

## Installation

`yarn add @metamask/json-rpc-engine`

or

`npm install @metamask/json-rpc-engine`

## Usage

> [!NOTE]
> For the legacy `JsonRpcEngine`, see [its readme](./legacy/README.md).

```ts
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine';

const engine = new JsonRpcEngineV2({
  // Create a stack of middleware and pass it to the engine:
  middleware: [
    ({ request, next }) => {
      if (request.method === 'foo') {
        return 'bar';
      }
      return next();
    },
    () => 42,
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

### Middleware

Middleware functions can be sync or async.
They receive a `MiddlewareParams` object containing:

- `request`
  - The JSON-RPC request or notification (readonly)
- `context`
  - A `Map` for passing data between middleware
- `next`
  - Function to call the next middleware in the stack

Here's a basic example:

```ts
const engine = new JsonRpcEngineV2({
  middleware: [
    ({ next, context }) => {
      context.set('foo', 'bar');
      // Proceed to the next middleware
      return next();
    },
    async ({ request, context }) => {
      await doSomething(request, context.get('foo'));
      // Return a result to end the request
      return 42;
    },
  ],
});
```

### Requests vs. notifications

JSON-RPC requests come in two flavors:

- [Requests](https://www.jsonrpc.org/specification#request_object), i.e. request objects with an `id`
- [Notifications](https://www.jsonrpc.org/specification#notification), i.e. request objects _without_ an `id`

Requests must return a non-`undefined` result, or the engine will error:

```ts
const engine = new JsonRpcEngineV2({
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

Notifications, on the other hand, may only return `undefined`:

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

```ts
import {
  isRequest,
  isNotification,
  JsonRpcEngineV2,
} from '@metamask/json-rpc-engine';

const engine = new JsonRpcEngineV2({
  middleware: [
    async ({ request, next }) => {
      if (isRequest(request)) {
        return 42;
      }
      return next();
    },
    ({ request }) => {
      if (isNotification(request)) {
        console.log(`Received notification: ${request.method}`);
        return undefined;
      }
      return 'Hello, World!';
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
const engine = new JsonRpcEngineV2({
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
const engine = new JsonRpcEngineV2({
  middleware: [
    ({ request, next }) => {
      // Modifying either proeprty will cause an error
      return next({
        ...request,
        jsonrpc: '3.0',
        id: 'foo',
      });
    },
    () => 42,
  ],
});
```

### Result handling

Middleware can observe the result by awaiting `next()`:

```ts
const engine = new JsonRpcEngineV2({
  middleware: [
    async ({ request, next }) => {
      const startTime = Date.now();
      const result = await next();
      const duration = Date.now() - startTime;

      // Log the request duration
      console.log(
        `Request ${request.method} producing ${result} took ${duration}ms`,
      );

      // By returning undefined, the same result will be forwarded to earlier
      // middleware awaiting next()
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
const engine = new JsonRpcEngineV2({
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

### Context sharing

Use the `context` to share data between middleware:

```ts
const engine = new JsonRpcEngineV2({
  middleware: [
    async ({ context, next }) => {
      context.set('user', { id: '123', name: 'Alice' });
      return next();
    },
    async ({ context, next }) => {
      // context.assertGet() throws if the value does not exist
      // Use with caution: it does not otherwise perform any type checks.
      const user = context.assertGet<{ id: string; name: string }>('user');
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

### Error handling

Errors in middleware are propagated up the call stack:

```ts
const engine = new JsonRpcEngineV2({
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
const engine = new JsonRpcEngineV2({
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

### Engine composition

Engines can be nested by converting them to middleware using `asMiddleware()`:

```ts
const subEngine = new JsonRpcEngineV2({
  middleware: [
    ({ request }) => {
      return 'Sub-engine result';
    },
  ],
});

const mainEngine = new JsonRpcEngineV2({
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
const loggingEngine = new JsonRpcEngineV2({
  middleware: [
    ({ request, next }) => {
      console.log('Observed request:', request.method);
    },
  ],
});

const mainEngine = new JsonRpcEngineV2({
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
const result2 = await loggingEngine.handle(request):
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
