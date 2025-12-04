/* eslint-disable n/callback-return */ // next() is not a Node.js callback.
import type { Json, JsonRpcId } from '@metamask/utils';
import { createDeferredPromise } from '@metamask/utils';

import type { JsonRpcMiddleware, ResultConstraint } from './JsonRpcEngineV2';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import type { EmptyContext } from './MiddlewareContext';
import { MiddlewareContext } from './MiddlewareContext';
import { isRequest, JsonRpcEngineError, stringify } from './utils';
import type { JsonRpcCall, JsonRpcNotification, JsonRpcRequest } from './utils';
import {
  makeNotification,
  makeNotificationMiddleware,
  makeNullMiddleware,
  makeRequest,
  makeRequestMiddleware,
} from '../../tests/utils';

const jsonrpc = '2.0' as const;

describe('JsonRpcEngineV2', () => {
  describe('create', () => {
    it('throws if the middleware array is empty', () => {
      expect(() => JsonRpcEngineV2.create({ middleware: [] })).toThrow(
        new JsonRpcEngineError('Middleware array cannot be empty'),
      );
    });

    it('type errors if passed middleware with incompatible context types', async () => {
      const middleware1: JsonRpcMiddleware<
        JsonRpcCall,
        ResultConstraint<JsonRpcCall>,
        MiddlewareContext<{ foo: string }>
      > = ({ next, context }) => {
        context.set('foo', 'bar');
        return next();
      };

      const middleware2: JsonRpcMiddleware<
        JsonRpcCall,
        ResultConstraint<JsonRpcCall>,
        MiddlewareContext<{ foo: number }>
      > = ({ context }) => context.assertGet('foo');
      const engine = JsonRpcEngineV2.create({
        middleware: [middleware1, middleware2],
      });

      // @ts-expect-error - The engine is `InvalidEngine`.
      expect(await engine.handle(makeRequest())).toBe('bar');
    });

    // Keeping this here for documentation purposes.
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip('type errors if passed middleware with incompatible request types', async () => {
      const middleware1: JsonRpcMiddleware<JsonRpcNotification> = ({ next }) =>
        next();
      const middleware2: JsonRpcMiddleware<JsonRpcRequest> = () => {
        return 'foo';
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [middleware1, middleware2],
      });

      // TODO: We want this to cause a type error, but it's unclear if it can be
      // made to work due to the difficulty (impossibility?) of distinguishing
      // between these two cases:
      // - JsonRpcMiddleware<JsonRpcRequest> | JsonRpcMiddleware<JsonRpcNotification> (invalid)
      // - JsonRpcMiddleware<JsonRpcRequest> | JsonRpcMiddleware<JsonRpcCall> (valid)
      expect(await engine.handle(makeRequest())).toBe('foo');
    });
  });

  describe('handle', () => {
    describe('notifications', () => {
      it('passes the notification through a middleware', async () => {
        const middleware: JsonRpcMiddleware<JsonRpcNotification> = jest.fn();
        const engine = JsonRpcEngineV2.create({
          middleware: [middleware],
        });
        const notification = { jsonrpc, method: 'test_request' };

        await engine.handle(notification);

        expect(middleware).toHaveBeenCalledTimes(1);
        expect(middleware).toHaveBeenCalledWith({
          request: notification,
          context: expect.any(Map),
          next: expect.any(Function),
        });
      });

      it('returns no result', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [jest.fn()],
        });
        const notification = { jsonrpc, method: 'test_request' };

        const result = await engine.handle(notification);

        expect(result).toBeUndefined();
      });

      it('returns no result, with multiple middleware', async () => {
        const middleware1 = jest.fn(({ next }) => next());
        const middleware2 = jest.fn();
        const engine = JsonRpcEngineV2.create({
          middleware: [middleware1, middleware2],
        });
        const notification = { jsonrpc, method: 'test_request' };

        const result = await engine.handle(notification);

        expect(result).toBeUndefined();
        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledTimes(1);
      });

      it('throws if a middleware throws', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            jest.fn(() => {
              throw new Error('test');
            }),
          ],
        });
        const notification = { jsonrpc, method: 'test_request' };

        await expect(engine.handle(notification)).rejects.toThrow(
          new Error('test'),
        );
      });

      it('throws if a middleware throws, with multiple middleware', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            jest.fn(({ next }) => next()),
            jest.fn(() => {
              throw new Error('test');
            }),
          ],
        });
        const notification = { jsonrpc, method: 'test_request' };

        await expect(engine.handle(notification)).rejects.toThrow(
          new Error('test'),
        );
      });

      it('throws if a result is returned, from the first middleware', async () => {
        const engine = JsonRpcEngineV2.create<JsonRpcMiddleware>({
          middleware: [() => 'foo'],
        });
        const notification = { jsonrpc, method: 'test_request' };

        await expect(engine.handle(notification)).rejects.toThrow(
          new JsonRpcEngineError(
            `Result returned for notification: ${stringify(notification)}`,
          ),
        );
      });

      it('throws if a result is returned, from a later middleware', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            async ({ next }) => {
              await next();
              return undefined;
            },
            makeNullMiddleware(),
          ],
        });
        const notification = { jsonrpc, method: 'test_request' };

        await expect(engine.handle(notification)).rejects.toThrow(
          new JsonRpcEngineError(
            `Result returned for notification: ${stringify(notification)}`,
          ),
        );
      });

      it('throws if a middleware calls next() multiple times', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            jest.fn(async ({ next }) => {
              await next();
              await next();
            }),
            jest.fn(),
          ],
        });
        const notification = { jsonrpc, method: 'test_request' };

        await expect(engine.handle(notification)).rejects.toThrow(
          new JsonRpcEngineError(
            `Middleware attempted to call next() multiple times for request: ${stringify(notification)}`,
          ),
        );
      });
    });

    describe('requests', () => {
      it('returns a result from the middleware', async () => {
        const middleware = jest.fn(() => null);
        const engine = JsonRpcEngineV2.create<JsonRpcMiddleware>({
          middleware: [middleware],
        });
        const request = makeRequest();

        const result = await engine.handle(request);

        expect(result).toBeNull();
        expect(middleware).toHaveBeenCalledTimes(1);
        expect(middleware).toHaveBeenCalledWith({
          request,
          context: expect.any(Map),
          next: expect.any(Function),
        });
      });

      it('returns a result from the middleware, with multiple middleware', async () => {
        const middleware1: JsonRpcMiddleware = jest.fn(({ next }) => next());
        const middleware2: JsonRpcMiddleware = jest.fn(() => null);
        const engine = JsonRpcEngineV2.create({
          middleware: [middleware1, middleware2],
        });
        const request = makeRequest();

        const result = await engine.handle(request);

        expect(result).toBeNull();
        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware1).toHaveBeenCalledWith({
          request,
          context: expect.any(Map),
          next: expect.any(Function),
        });
        expect(middleware2).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledWith({
          request,
          context: expect.any(Map),
          next: expect.any(Function),
        });
      });

      it('throws if a middleware throws', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            jest.fn(() => {
              throw new Error('test');
            }),
          ],
        });

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new Error('test'),
        );
      });

      it('throws if a middleware throws, with multiple middleware', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            jest.fn(({ next }) => next()),
            jest.fn(() => {
              throw new Error('test');
            }),
          ],
        });

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new Error('test'),
        );
      });

      it('throws if no middleware returns a result', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [jest.fn(({ next }) => next()), jest.fn()],
        });
        const request = makeRequest();

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new JsonRpcEngineError(
            `Nothing ended request: ${stringify(request)}`,
          ),
        );
      });

      it('throws if a middleware calls next() multiple times', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            jest.fn(async ({ next }) => {
              await next();
              await next();
            }),
            makeNullMiddleware(),
          ],
        });
        const request = makeRequest();

        await expect(engine.handle(request)).rejects.toThrow(
          new JsonRpcEngineError(
            `Middleware attempted to call next() multiple times for request: ${stringify(request)}`,
          ),
        );
      });
    });

    describe('context', () => {
      it('passes the context to the middleware', async () => {
        const engine = JsonRpcEngineV2.create<
          JsonRpcMiddleware<JsonRpcRequest>
        >({
          middleware: [
            ({ context }) => {
              expect(context).toBeInstanceOf(Map);
              return null;
            },
          ],
        });

        await engine.handle(makeRequest());
      });

      it('propagates context changes to subsequent middleware', async () => {
        type Context = MiddlewareContext<{ foo: string }>;
        const middleware1: JsonRpcMiddleware<
          JsonRpcCall,
          Json | void,
          Context
        > = async ({ context, next }) => {
          context.set('foo', 'bar');
          return next();
        };
        const middleware2: JsonRpcMiddleware<
          JsonRpcCall,
          string | undefined,
          Context
        > = ({ context }) => {
          return context.get('foo');
        };
        const engine = JsonRpcEngineV2.create({
          middleware: [middleware1, middleware2],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe('bar');
      });

      it('accepts an initial context', async () => {
        const initialContext = new MiddlewareContext<Record<string, string>>();
        initialContext.set('foo', 'bar');
        const middleware: JsonRpcMiddleware<
          JsonRpcRequest,
          string,
          MiddlewareContext<Record<string, string>>
        > = ({ context }) => context.assertGet('foo');
        const engine = JsonRpcEngineV2.create({
          middleware: [middleware],
        });

        const result = await engine.handle(makeRequest(), {
          context: initialContext,
        });

        expect(result).toBe('bar');
      });

      it('accepts an initial context as a KeyValues object', async () => {
        const initialContext = { foo: 'bar' } as const;
        const middleware: JsonRpcMiddleware<
          JsonRpcRequest,
          string,
          MiddlewareContext<Record<string, string>>
        > = ({ context }) => context.assertGet('foo');
        const engine = JsonRpcEngineV2.create({
          middleware: [middleware],
        });

        const result = await engine.handle(makeRequest(), {
          context: initialContext,
        });

        expect(result).toBe('bar');
      });

      it('accepts middleware with different context types', async () => {
        const middleware1: JsonRpcMiddleware<
          JsonRpcCall,
          ResultConstraint<JsonRpcCall>,
          MiddlewareContext<{ foo: string }>
        > = ({ context, next }) => {
          context.set('foo', 'bar');
          return next();
        };

        const middleware2: JsonRpcMiddleware<
          JsonRpcCall,
          ResultConstraint<JsonRpcCall>
        > = ({ next }) => next();

        const middleware3: JsonRpcMiddleware<
          JsonRpcCall,
          ResultConstraint<JsonRpcCall>,
          EmptyContext
        > = ({ next }) => next();

        const middleware4: JsonRpcMiddleware<
          JsonRpcCall,
          string,
          MiddlewareContext<{ foo: string; bar: number }>
        > = ({ context }) => context.assertGet('foo');

        const engine = JsonRpcEngineV2.create({
          middleware: [middleware1, middleware2, middleware3, middleware4],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe('bar');
      });

      it('throws if a middleware attempts to modify properties of the context', async () => {
        const engine = JsonRpcEngineV2.create<JsonRpcMiddleware>({
          middleware: [
            ({ context }) => {
              // @ts-expect-error - Destructive testing.
              context.set = () => undefined;
            },
          ],
        });

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new TypeError(`Cannot add property set, object is not extensible`),
        );
      });
    });

    describe('asynchrony', () => {
      it('handles asynchronous middleware', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [async () => null],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('handles mixed synchronous and asynchronous middleware', async () => {
        type Middleware = JsonRpcMiddleware<
          JsonRpcRequest<number[]>,
          Json,
          MiddlewareContext<Record<string, number[]>>
        >;

        const engine = JsonRpcEngineV2.create<Middleware>({
          middleware: [
            async ({ context, next }) => {
              context.set('foo', [1]);
              return next();
            },
            ({ context, next }) => {
              const nums = context.assertGet('foo');
              nums.push(2);
              return next();
            },
            async ({ context }) => {
              const nums = context.assertGet('foo');
              return [...nums, 3];
            },
          ],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toStrictEqual([1, 2, 3]);
      });
    });

    describe('request mutation', () => {
      it('propagates new requests to subsequent middleware', async () => {
        const observedParams: number[] = [];
        let observedMethod: string | undefined;
        const middleware1 = jest.fn(({ request, next }) => {
          observedParams.push(request.params[0]);
          return next({
            ...request,
            params: [2],
          });
        });
        const middleware2 = jest.fn(({ request, next }) => {
          observedParams.push(request.params[0]);
          return next({
            ...request,
            method: 'test_request_2',
            params: [3],
          });
        });
        const middleware3 = jest.fn(({ request }) => {
          observedParams.push(request.params[0]);
          observedMethod = request.method;
          return null;
        });
        const engine = JsonRpcEngineV2.create({
          middleware: [middleware1, middleware2, middleware3],
        });
        const request = makeRequest({ params: [1] });

        await engine.handle(request);

        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledTimes(1);
        expect(middleware3).toHaveBeenCalledTimes(1);
        expect(observedMethod).toBe('test_request_2');
        expect(observedParams).toStrictEqual([1, 2, 3]);
      });

      it('throws if directly modifying the request', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            jest.fn(({ request }) => {
              // @ts-expect-error - Destructive testing.
              request.params = [2];
            }) as JsonRpcMiddleware,
          ],
        });

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new TypeError(
            `Cannot assign to read only property 'params' of object '#<Object>'`,
          ),
        );
      });

      it('throws if a middleware attempts to modify the request "id" property', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            jest.fn(async ({ request, next }) => {
              return await next({
                ...request,
                id: '2',
              });
            }),
            makeNullMiddleware(),
          ],
        });
        const request = makeRequest();

        await expect(engine.handle(request)).rejects.toThrow(
          new JsonRpcEngineError(
            `Middleware attempted to modify readonly property "id" for request: ${stringify(request)}`,
          ),
        );
      });

      it('throws if a middleware attempts to modify the request "jsonrpc" property', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            async ({ request, next }) => {
              return await next({
                ...request,
                // @ts-expect-error - Destructive testing.
                jsonrpc: '3.0',
              });
            },
            makeNullMiddleware(),
          ],
        });
        const request = makeRequest();

        await expect(engine.handle(request)).rejects.toThrow(
          new JsonRpcEngineError(
            `Middleware attempted to modify readonly property "jsonrpc" for request: ${stringify(request)}`,
          ),
        );
      });
    });

    describe('result handling', () => {
      it('updates the result after next() is called', async () => {
        const engine = JsonRpcEngineV2.create<
          JsonRpcMiddleware<JsonRpcRequest, number>
        >({
          middleware: [
            async ({ next }) => {
              const result = (await next()) as number;
              return result + 1;
            },
            () => 1,
          ],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe(2);
      });

      it('updates an undefined result with a new value', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            async ({ next }) => {
              await next();
              return null;
            },
            makeNotificationMiddleware(),
          ],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('returning undefined propagates previously defined result', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            jest.fn(async ({ next }) => {
              await next();
            }),
            makeNullMiddleware(),
          ],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('catches errors thrown by later middleware', async () => {
        let observedError: Error | undefined;
        const engine = JsonRpcEngineV2.create({
          middleware: [
            jest.fn(async ({ next }) => {
              try {
                return await next();
              } catch (error) {
                observedError = error as Error;
                return null;
              }
            }),
            jest.fn(() => {
              throw new Error('test');
            }),
          ],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBeNull();
        expect(observedError).toStrictEqual(new Error('test'));
      });

      it('handles returned results in reverse middleware order', async () => {
        const returnHandlerResults: number[] = [];
        const engine = JsonRpcEngineV2.create({
          middleware: [
            async ({ next }) => {
              await next();
              returnHandlerResults.push(1);
            },
            async ({ next }) => {
              await next();
              returnHandlerResults.push(2);
            },
            async ({ next }) => {
              await next();
              returnHandlerResults.push(3);
            },
            makeNullMiddleware(),
          ],
        });

        await engine.handle(makeRequest());

        expect(returnHandlerResults).toStrictEqual([3, 2, 1]);
      });

      it('throws if directly modifying the result', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [
            async ({ next }) => {
              const result = (await next()) as { foo: string };
              result.foo = 'baz';
              return result;
            },
            () => ({ foo: 'bar' }),
          ],
        });

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new TypeError(
            `Cannot assign to read only property 'foo' of object '#<Object>'`,
          ),
        );
      });
    });

    describe('parallel requests', () => {
      /**
       * A "counter" latch that releases when a target count is reached.
       *
       * @param target - The target count to reach.
       * @returns A counter latch.
       */
      const makeCounterLatch = (target: number) => {
        let count = 0;
        const { promise: countdownPromise, resolve: release } =
          createDeferredPromise();

        return {
          increment: () => {
            count += 1;
            if (count === target) {
              release();
            }
          },
          waitAll: () => countdownPromise,
        };
      };

      /**
       * A queue for processing a target number of requests in arbitrary order.
       *
       * @param size - The size of the queue.
       * @returns An "arbitrary" queue.
       */
      const makeArbitraryQueue = (size: number) => {
        let count = 0;
        const queue: { resolve: () => void }[] = new Array(size);
        const { promise: gate, resolve: openGate } = createDeferredPromise();

        const enqueue = async (id: number): Promise<void> => {
          const { promise, resolve } = createDeferredPromise();
          queue[id] = { resolve };
          count += 1;

          if (count === size) {
            openGate();
          }
          return gate.then(() => promise);
        };

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const dequeue = (id: number): void => queue[id]!.resolve();
        return { enqueue, dequeue, filled: () => gate };
      };

      it('processes requests in parallel with isolated contexts', async () => {
        const N = 32;
        const { promise: gate, resolve: openGate } = createDeferredPromise();
        const latch = makeCounterLatch(N);

        let inFlight = 0;
        let maxInFlight = 0;

        type Context = MiddlewareContext<{ id: JsonRpcId }>;
        const inflightMiddleware: JsonRpcMiddleware<
          JsonRpcRequest,
          Json,
          Context
        > = async ({ context, next, request }) => {
          context.set('id', context.get('id') ?? request.id);

          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          latch.increment();

          await gate;

          inFlight -= 1;
          return next();
        };
        const resultMiddleware: JsonRpcMiddleware<
          JsonRpcRequest,
          string,
          Context
        > = ({ context, request }) => {
          return `result:${request.id}:${context.assertGet('id')}`;
        };
        const engine = JsonRpcEngineV2.create({
          middleware: [inflightMiddleware, resultMiddleware],
        });

        const requests: JsonRpcRequest[] = Array.from({ length: N }, (_, i) =>
          makeRequest({
            id: `${i}`,
          }),
        );

        const resultPromises = requests.map((request) =>
          engine.handle(request),
        );

        await latch.waitAll();
        expect(inFlight).toBe(N);
        openGate();

        const results = await Promise.all(resultPromises);
        expect(results).toStrictEqual(
          requests.map((request) => `result:${request.id}:${request.id}`),
        );
        expect(inFlight).toBe(0);
        expect(maxInFlight).toBe(N);
      });

      it('eagerly processes requests in parallel, i.e. without queueing them', async () => {
        const queue = makeArbitraryQueue(3);
        type NumericIdRequest = JsonRpcRequest & { id: number };
        const middleware: JsonRpcMiddleware<NumericIdRequest> = async ({
          request,
        }) => {
          await queue.enqueue(request.id);
          return null;
        };
        const engine = JsonRpcEngineV2.create({
          middleware: [middleware],
        });

        const p0 = engine.handle(makeRequest<NumericIdRequest>({ id: 0 }));
        const p1 = engine.handle(makeRequest<NumericIdRequest>({ id: 1 }));
        const p2 = engine.handle(makeRequest<NumericIdRequest>({ id: 2 }));

        await queue.filled();

        queue.dequeue(2);
        expect(await p2).toBeNull();
        queue.dequeue(0);
        expect(await p0).toBeNull();
        queue.dequeue(1);
        expect(await p1).toBeNull();
      });
    });
  });

  describe('composition', () => {
    describe('asMiddleware', () => {
      it('ends a request if it returns a value', async () => {
        const engine1 = JsonRpcEngineV2.create({
          middleware: [makeNullMiddleware()],
        });
        const engine2 = JsonRpcEngineV2.create({
          middleware: [engine1.asMiddleware(), jest.fn(() => 'foo')],
        });

        const result = await engine2.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('permits returning undefined if a later middleware ends the request', async () => {
        const engine1 = JsonRpcEngineV2.create({
          middleware: [makeNotificationMiddleware()],
        });
        const engine2 = JsonRpcEngineV2.create({
          middleware: [engine1.asMiddleware(), makeNullMiddleware()],
        });

        const result = await engine2.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('composes nested engines', async () => {
        const middleware1 = jest.fn(async ({ next }) => next());
        const middleware2 = jest.fn(async ({ next }) => next());
        const engine1 = JsonRpcEngineV2.create({
          middleware: [middleware1],
        });
        const engine2 = JsonRpcEngineV2.create({
          middleware: [engine1.asMiddleware(), middleware2],
        });
        const engine3 = JsonRpcEngineV2.create({
          middleware: [engine2.asMiddleware(), () => null],
        });

        const result = await engine3.handle(makeRequest());

        expect(result).toBeNull();
        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledTimes(1);
      });

      it('propagates request mutation', async () => {
        const engine1 = JsonRpcEngineV2.create({
          middleware: [
            ({ request, next }) => {
              return next({
                ...request,
                params: [2],
              });
            },
            ({ request, next }) => {
              return next({
                ...request,
                method: 'test_request_2',
                params: [(request.params as [number])[0] * 2],
              });
            },
          ],
        });

        let observedMethod: string | undefined;
        const engine2 = JsonRpcEngineV2.create({
          middleware: [
            engine1.asMiddleware(),
            ({ request }) => {
              observedMethod = request.method;
              return (request.params as [number])[0] * 2;
            },
          ],
        });

        const result = await engine2.handle(makeRequest());

        expect(result).toBe(8);
        expect(observedMethod).toBe('test_request_2');
      });

      it('propagates context changes', async () => {
        const engine1 = JsonRpcEngineV2.create({
          middleware: [
            async ({ context, next }) => {
              const nums = context.assertGet('foo') as [number];
              nums[0] *= 2;
              return next();
            },
          ],
        });

        const engine2 = JsonRpcEngineV2.create({
          middleware: [
            async ({ context, next }) => {
              context.set('foo', [2]);
              return next();
            },
            engine1.asMiddleware(),
            async ({ context }) => {
              const nums = context.assertGet('foo') as [number];
              return nums[0] * 2;
            },
          ],
        });

        const result = await engine2.handle(makeRequest());

        expect(result).toBe(8);
      });

      it('observes results in expected order', async () => {
        const returnHandlerResults: string[] = [];
        const engine1 = JsonRpcEngineV2.create({
          middleware: [
            async ({ next }) => {
              await next();
              returnHandlerResults.push('1:a');
            },
            async ({ next }) => {
              await next();
              returnHandlerResults.push('1:b');
            },
          ],
        });

        const engine2 = JsonRpcEngineV2.create({
          middleware: [
            engine1.asMiddleware(),
            async ({ next }) => {
              await next();
              returnHandlerResults.push('2:a');
            },
            async ({ next }) => {
              await next();
              returnHandlerResults.push('2:b');
            },
            () => null,
          ],
        });

        await engine2.handle(makeRequest());

        // Order of result handling is reversed _within_ engines, but not
        // _between_ engines.
        expect(returnHandlerResults).toStrictEqual([
          '1:b',
          '1:a',
          '2:b',
          '2:a',
        ]);
      });
    });

    describe('middleware with engine.handle()', () => {
      it('composes nested engines', async () => {
        const earlierMiddleware = jest.fn(async ({ next }) => next());

        const engine1Middleware: JsonRpcMiddleware<JsonRpcRequest> = () => null;
        const engine1 = JsonRpcEngineV2.create({
          middleware: [engine1Middleware],
        });

        const engine1ProxyMiddleware: JsonRpcMiddleware<
          JsonRpcRequest
        > = async ({ request }) => {
          return engine1.handle(request);
        };
        const laterMiddleware: JsonRpcMiddleware<JsonRpcRequest> = jest.fn(
          () => 'foo',
        );
        const engine2 = JsonRpcEngineV2.create({
          middleware: [
            earlierMiddleware,
            engine1ProxyMiddleware,
            laterMiddleware,
          ],
        });

        const result = await engine2.handle(makeRequest());

        expect(result).toBeNull();
        expect(earlierMiddleware).toHaveBeenCalledTimes(1);
        expect(laterMiddleware).not.toHaveBeenCalled();
      });

      it('does not propagate request mutation', async () => {
        // Unlike asMiddleware(), although the inner engine mutates request,
        // those mutations do not propagate when using engine.handle().
        const engine1 = JsonRpcEngineV2.create({
          middleware: [
            ({ request, next }) => {
              return next({
                ...request,
                params: [2],
              });
            },
            ({ request, next }) => {
              return next({
                ...request,
                method: 'test_request_2',
                params: [(request.params as [number])[0] * 2],
              });
            },
            makeNullMiddleware(),
          ],
        });

        let observedMethod: string | undefined;
        const observedMethodMiddleware: JsonRpcMiddleware<
          JsonRpcRequest<number[]>,
          number
        > = ({ request }) => {
          observedMethod = request.method;
          return (request.params as [number])[0] * 2;
        };
        const engine2 = JsonRpcEngineV2.create({
          middleware: [
            async ({ request, next, context }) => {
              await engine1.handle(request, { context });
              return next();
            },
            observedMethodMiddleware,
          ],
        });

        const result = await engine2.handle(makeRequest({ params: [1] }));

        // Since inner-engine mutations do not affect the outer request,
        // the outer middleware sees the original method and params.
        expect(result).toBe(2);
        expect(observedMethod).toBe('test_request');
      });

      it('propagates context changes', async () => {
        const engine1 = JsonRpcEngineV2.create({
          middleware: [
            async ({ context }) => {
              const nums = context.assertGet('foo') as [number];
              nums[0] *= 2;
              return null;
            },
          ],
        });

        const engine2 = JsonRpcEngineV2.create({
          middleware: [
            async ({ context, next }) => {
              context.set('foo', [2]);
              return next();
            },
            async ({ request, next, context }) => {
              await engine1.handle(request, { context });
              return next();
            },
            async ({ context }) => {
              const nums = context.assertGet('foo') as [number];
              return nums[0] * 2;
            },
          ],
        });

        const result = await engine2.handle(makeRequest());

        expect(result).toBe(8);
      });

      it('observes results in expected order', async () => {
        const returnHandlerResults: string[] = [];
        const engine1 = JsonRpcEngineV2.create({
          middleware: [
            async ({ next }) => {
              await next();
              returnHandlerResults.push('1:a');
            },
            async ({ next }) => {
              await next();
              returnHandlerResults.push('1:b');
            },
            makeNullMiddleware(),
          ],
        });

        const engine2 = JsonRpcEngineV2.create({
          middleware: [
            async ({ request, next, context }) => {
              await engine1.handle(request as JsonRpcRequest, { context });
              return next();
            },
            async ({ next }) => {
              await next();
              returnHandlerResults.push('2:a');
            },
            async ({ next }) => {
              await next();
              returnHandlerResults.push('2:b');
            },
            makeNullMiddleware(),
          ],
        });

        await engine2.handle(makeRequest());

        // Inner engine return handlers run before outer engine return handlers
        // since engine1.handle() completes before engine2 continues.
        expect(returnHandlerResults).toStrictEqual([
          '1:b',
          '1:a',
          '2:b',
          '2:a',
        ]);
      });

      it('throws if the inner engine throws', async () => {
        const engine1 = JsonRpcEngineV2.create({
          middleware: [
            () => {
              throw new Error('test');
            },
          ],
        });

        const engine2 = JsonRpcEngineV2.create({
          middleware: [
            async ({ request }) => {
              await engine1.handle(request as JsonRpcRequest);
              return null;
            },
          ],
        });

        await expect(engine2.handle(makeRequest())).rejects.toThrow(
          new Error('test'),
        );
      });
    });

    describe('request- and notification-only engines', () => {
      it('constructs a request-only engine', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [makeRequestMiddleware()],
        });

        expect(await engine.handle(makeRequest())).toBeNull();
        // @ts-expect-error - Valid at runtime, but should cause a type error
        expect(await engine.handle(makeRequest() as JsonRpcCall)).toBeNull();
        // @ts-expect-error - Invalid at runtime and should cause a type error
        await expect(engine.handle(makeNotification())).rejects.toThrow(
          new JsonRpcEngineError(
            `Result returned for notification: ${stringify(makeNotification())}`,
          ),
        );
      });

      it('constructs a notification-only engine', async () => {
        const engine = JsonRpcEngineV2.create({
          middleware: [makeNotificationMiddleware()],
        });

        expect(await engine.handle(makeNotification())).toBeUndefined();
        await expect(
          // @ts-expect-error - Invalid at runtime and should cause a type error
          engine.handle({ id: '1', jsonrpc, method: 'test_request' }),
        ).rejects.toThrow(
          new JsonRpcEngineError(
            `Nothing ended request: ${stringify({ id: '1', jsonrpc, method: 'test_request' })}`,
          ),
        );
        await expect(
          // @ts-expect-error - Invalid at runtime and should cause a type error
          engine.handle(makeRequest<JsonRpcRequest>()),
        ).rejects.toThrow(
          new JsonRpcEngineError(
            `Nothing ended request: ${stringify(makeRequest())}`,
          ),
        );
      });

      it('constructs a mixed engine', async () => {
        const mixedMiddleware: JsonRpcMiddleware = ({ request }) => {
          return isRequest(request) ? null : undefined;
        };
        const engine = JsonRpcEngineV2.create({
          middleware: [mixedMiddleware],
        });

        expect(await engine.handle(makeRequest())).toBeNull();
        expect(await engine.handle(makeNotification())).toBeUndefined();
        expect(await engine.handle(makeRequest() as JsonRpcCall)).toBeNull();
      });

      it('composes a pipeline of request- and notification-only engines', async () => {
        const requestEngine = JsonRpcEngineV2.create({
          middleware: [makeRequestMiddleware()],
        });

        const notificationEngine = JsonRpcEngineV2.create({
          middleware: [makeNotificationMiddleware()],
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

        const result1 = await orchestratorEngine.handle(makeRequest());
        const result2 = await orchestratorEngine.handle(makeNotification());

        expect(result1).toBeNull();
        expect(result2).toBeUndefined();
      });
    });
  });

  describe('destroy', () => {
    it('calls the destroy method of any middleware that has one', async () => {
      const middleware = {
        destroy: jest.fn(),
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [middleware as unknown as JsonRpcMiddleware],
      });

      await engine.destroy();

      expect(middleware.destroy).toHaveBeenCalledTimes(1);
    });

    it('is idempotent', async () => {
      const middleware = {
        destroy: jest.fn(),
      };

      const engine = JsonRpcEngineV2.create({
        middleware: [middleware as unknown as JsonRpcMiddleware],
      });

      await engine.destroy();
      await engine.destroy();

      expect(middleware.destroy).toHaveBeenCalledTimes(1);
    });

    it('causes handle() to throw after destroying the engine', async () => {
      const engine = JsonRpcEngineV2.create({
        middleware: [makeNullMiddleware()],
      });

      await engine.destroy();

      await expect(engine.handle(makeRequest())).rejects.toThrow(
        new JsonRpcEngineError('Engine is destroyed'),
      );
    });

    it('causes asMiddleware() to throw after destroying the engine', async () => {
      const engine = JsonRpcEngineV2.create({
        middleware: [makeNullMiddleware()],
      });
      await engine.destroy();

      expect(() => engine.asMiddleware()).toThrow(
        new JsonRpcEngineError('Engine is destroyed'),
      );
    });

    it('rejects if a middleware throws when destroying', async () => {
      const middleware = {
        destroy: jest.fn(() => {
          throw new Error('test');
        }),
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [middleware as unknown as JsonRpcMiddleware],
      });

      await expect(engine.destroy()).rejects.toThrow(new Error('test'));
    });

    it('calls the destroy() method of each middleware even if one throws', async () => {
      const middleware1 = {
        destroy: jest.fn(() => {
          throw new Error('test');
        }),
      };
      const middleware2 = {
        destroy: jest.fn(),
      };
      const engine = JsonRpcEngineV2.create({
        middleware: [
          middleware1,
          middleware2,
        ] as unknown as JsonRpcMiddleware[],
      });

      await expect(engine.destroy()).rejects.toThrow(new Error('test'));

      expect(middleware1.destroy).toHaveBeenCalledTimes(1);
      expect(middleware2.destroy).toHaveBeenCalledTimes(1);
    });
  });
});
