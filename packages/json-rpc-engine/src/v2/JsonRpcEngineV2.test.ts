/* eslint-disable n/callback-return */ // next() is not a Node.js callback.
import type { NonEmptyArray } from '@metamask/utils';

import type { JsonRpcMiddleware } from './JsonRpcEngineV2';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import {
  JsonRpcEngineError,
  stringify,
  type JsonRpcCall,
  type JsonRpcNotification,
  type JsonRpcRequest,
} from './utils';
import { makeRequest } from '../../tests/utils';

const jsonrpc = '2.0' as const;

describe('JsonRpcEngineV2', () => {
  describe('handle', () => {
    describe('notifications', () => {
      it('passes the notification through a middleware', async () => {
        const middleware: JsonRpcMiddleware<JsonRpcNotification> = jest.fn();
        const engine = new JsonRpcEngineV2({
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
        const engine = new JsonRpcEngineV2({
          middleware: [jest.fn()],
        });
        const notification = { jsonrpc, method: 'test_request' };

        const result = await engine.handle(notification);

        expect(result).toBeUndefined();
      });

      it('returns no result, with multiple middleware', async () => {
        const middleware1 = jest.fn(({ next }) => next());
        const middleware2 = jest.fn();
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2],
        });
        const notification = { jsonrpc, method: 'test_request' };

        const result = await engine.handle(notification);

        expect(result).toBeUndefined();
        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledTimes(1);
      });

      it('throws if a middleware throws', async () => {
        const engine = new JsonRpcEngineV2({
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
        const engine = new JsonRpcEngineV2({
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
        const engine = new JsonRpcEngineV2({
          middleware: [jest.fn(() => 'foo')],
        });
        const notification = { jsonrpc, method: 'test_request' };

        await expect(engine.handle(notification)).rejects.toThrow(
          new JsonRpcEngineError(
            `Result returned for notification: ${stringify(notification)}`,
          ),
        );
      });

      it('throws if a result is returned, from a later middleware', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [
            jest.fn(async ({ next }) => {
              await next();
              return undefined;
            }),
            jest.fn(() => null),
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
        const engine = new JsonRpcEngineV2({
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
        const middleware: JsonRpcMiddleware<JsonRpcRequest> = jest.fn(
          () => null,
        );
        const engine = new JsonRpcEngineV2({
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
        const middleware1 = jest.fn(({ next }) => next());
        const middleware2 = jest.fn(() => null);
        const engine = new JsonRpcEngineV2({
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
        const engine = new JsonRpcEngineV2({
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
        const engine = new JsonRpcEngineV2({
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
        const engine = new JsonRpcEngineV2({
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
        const engine = new JsonRpcEngineV2({
          middleware: [
            jest.fn(async ({ next }) => {
              await next();
              await next();
            }),
            jest.fn(),
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
        const middleware = jest.fn(({ context }) => {
          expect(context).toBeInstanceOf(Map);
          return null;
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware],
        });

        await engine.handle(makeRequest());
      });

      it('propagates context changes to subsequent middleware', async () => {
        const middleware1 = jest.fn(async ({ context, next }) => {
          context.set('foo', 'bar');
          return next();
        });
        const middleware2 = jest.fn(({ context }) => {
          return context.get('foo') as string | undefined;
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe('bar');
      });

      it('throws if a middleware attempts to modify properties of the context', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [
            jest.fn(({ context }) => {
              context.set = () => undefined;
            }),
          ],
        });

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new TypeError(`Cannot add property set, object is not extensible`),
        );
      });
    });

    describe('asynchrony', () => {
      it('handles asynchronous middleware', async () => {
        const middleware = jest.fn(async () => null);
        const engine = new JsonRpcEngineV2({
          middleware: [middleware],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('handles mixed synchronous and asynchronous middleware', async () => {
        const middleware1: JsonRpcMiddleware<JsonRpcCall<number[]>> = jest.fn(
          async ({ context, next }) => {
            context.set('foo', [1]);
            return next();
          },
        );
        const middleware2: JsonRpcMiddleware<JsonRpcCall<number[]>> = jest.fn(
          ({ context, next }) => {
            const nums = context.get('foo') as number[];
            context.set('foo', [...nums, 2]);
            return next();
          },
        );
        const middleware3: JsonRpcMiddleware<JsonRpcCall<number[]>> = jest.fn(
          async ({ context }) => {
            const nums = context.get('foo') as number[];
            return [...nums, 3];
          },
        );
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2, middleware3],
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
        const engine = new JsonRpcEngineV2({
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
        const engine = new JsonRpcEngineV2({
          middleware: [
            jest.fn(({ request }) => {
              // @ts-expect-error Destructive testing.
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
        const engine = new JsonRpcEngineV2({
          middleware: [
            jest.fn(async ({ request, next }) => {
              return await next({
                ...request,
                id: '2',
              });
            }),
            jest.fn(() => null),
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
        const engine = new JsonRpcEngineV2({
          middleware: [
            jest.fn(async ({ request, next }) => {
              return await next({
                ...request,
                jsonrpc: '3.0',
              });
            }),
            jest.fn(() => null),
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
        const engine = new JsonRpcEngineV2({
          middleware: [
            jest.fn(async ({ next }) => {
              const result = await next();
              return result + 1;
            }),
            jest.fn(() => 1),
          ],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe(2);
      });

      it('updates an undefined result with a new value', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [
            jest.fn(async ({ next }) => {
              await next();
              return null;
            }),
            jest.fn(() => undefined),
          ],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('returning undefined propagates previously defined result', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [
            jest.fn(async ({ next }) => {
              await next();
            }),
            jest.fn(() => null),
          ],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('catches errors thrown by later middleware', async () => {
        let observedError: Error | undefined;
        const engine = new JsonRpcEngineV2({
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
        const middleware1 = jest.fn(async ({ next }) => {
          await next();
          returnHandlerResults.push(1);
        });
        const middleware2 = jest.fn(async ({ next }) => {
          await next();
          returnHandlerResults.push(2);
        });
        const middleware3 = jest.fn(async ({ next }) => {
          await next();
          returnHandlerResults.push(3);
        });
        const middleware4 = jest.fn(() => null);
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2, middleware3, middleware4],
        });

        await engine.handle(makeRequest());

        expect(returnHandlerResults).toStrictEqual([3, 2, 1]);
      });

      it('throws if directly modifying the result', async () => {
        const middleware1 = jest.fn(async ({ next }) => {
          const result = await next();
          result.foo = 'baz';
          return result;
        });
        const middleware2 = jest.fn(() => ({ foo: 'bar' }));
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2],
        });

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new TypeError(
            `Cannot assign to read only property 'foo' of object '#<Object>'`,
          ),
        );
      });
    });
  });

  describe('handleAny', () => {
    it(`proxies to 'handle()'`, async () => {
      const engine = new JsonRpcEngineV2({
        middleware: [jest.fn(() => null)],
      });
      const handleSpy = jest.spyOn(engine, 'handle');
      const request = makeRequest();

      const result = await engine.handleAny(request);

      expect(result).toBeNull();
      expect(handleSpy).toHaveBeenCalledTimes(1);
      expect(handleSpy).toHaveBeenCalledWith(request);
    });
  });

  describe('asMiddleware', () => {
    it('ends a request if it returns a value', async () => {
      // TODO: We may have to do a lot of these casts?
      const engine1 = new JsonRpcEngineV2<JsonRpcCall, string | null>({
        middleware: [() => null],
      });
      const engine2 = new JsonRpcEngineV2({
        middleware: [engine1.asMiddleware(), jest.fn(() => 'foo')],
      });

      const result = await engine2.handle(makeRequest());

      expect(result).toBeNull();
    });

    it('permits returning undefined if a later middleware ends the request', async () => {
      const engine1 = new JsonRpcEngineV2({
        middleware: [() => undefined],
      });
      const engine2 = new JsonRpcEngineV2({
        middleware: [engine1.asMiddleware(), () => null],
      });

      const result = await engine2.handle(makeRequest());

      expect(result).toBeNull();
    });

    it('composes nested engines', async () => {
      const middleware1 = jest.fn(async ({ next }) => next());
      const middleware2 = jest.fn(async ({ next }) => next());
      const engine1 = new JsonRpcEngineV2({
        middleware: [middleware1],
      });
      const engine2 = new JsonRpcEngineV2({
        middleware: [engine1.asMiddleware(), middleware2],
      });
      const engine3 = new JsonRpcEngineV2({
        middleware: [engine2.asMiddleware(), () => null],
      });

      const result = await engine3.handle(makeRequest());

      expect(result).toBeNull();
      expect(middleware1).toHaveBeenCalledTimes(1);
      expect(middleware2).toHaveBeenCalledTimes(1);
    });

    it('propagates request mutation', async () => {
      const engine1 = new JsonRpcEngineV2({
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
              // @ts-expect-error Will obviously work.
              params: [request.params[0] * 2],
            });
          },
        ],
      });

      let observedMethod: string | undefined;
      const engine2 = new JsonRpcEngineV2({
        middleware: [
          engine1.asMiddleware(),
          ({ request }) => {
            observedMethod = request.method;
            // @ts-expect-error Will obviously work.
            return request.params[0] * 2;
          },
        ],
      });

      const result = await engine2.handle(makeRequest());

      expect(result).toBe(8);
      expect(observedMethod).toBe('test_request_2');
    });

    it('propagates context changes', async () => {
      const engine1 = new JsonRpcEngineV2({
        middleware: [
          async ({ context, next }) => {
            const num = context.get('foo') as number;
            context.set('foo', num * 2);
            return next();
          },
        ],
      });

      const engine2 = new JsonRpcEngineV2({
        middleware: [
          async ({ context, next }) => {
            context.set('foo', 2);
            return next();
          },
          engine1.asMiddleware(),
          async ({ context }) => {
            return (context.get('foo') as number) * 2;
          },
        ],
      });

      const result = await engine2.handle(makeRequest());

      expect(result).toBe(8);
    });

    it('runs return handlers in expected order', async () => {
      const returnHandlerResults: string[] = [];
      const engine1 = new JsonRpcEngineV2({
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

      const engine2 = new JsonRpcEngineV2({
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
      expect(returnHandlerResults).toStrictEqual(['1:b', '1:a', '2:b', '2:a']);
    });
  });

  describe('destroy', () => {
    it('calls the destroy method of any middleware that has one', async () => {
      const middleware = {
        destroy: jest.fn(),
      };
      const engine = new JsonRpcEngineV2({
        middleware: [middleware as unknown as JsonRpcMiddleware],
      });

      engine.destroy();

      expect(middleware.destroy).toHaveBeenCalledTimes(1);
    });

    it('is idempotent', () => {
      const middleware = {
        destroy: jest.fn(),
      };

      const engine = new JsonRpcEngineV2({
        middleware: [middleware as unknown as JsonRpcMiddleware],
      });

      engine.destroy();
      engine.destroy();

      expect(middleware.destroy).toHaveBeenCalledTimes(1);
    });

    it('causes handle() to throw after destroying the engine', async () => {
      const engine = new JsonRpcEngineV2({
        middleware: [() => null],
      });

      engine.destroy();

      await expect(engine.handle(makeRequest())).rejects.toThrow(
        new JsonRpcEngineError('Engine is destroyed'),
      );
    });

    it('causes asMiddleware() to throw after destroying the engine', async () => {
      const engine = new JsonRpcEngineV2({
        middleware: [() => null],
      });
      engine.destroy();

      expect(() => engine.asMiddleware()).toThrow(
        new JsonRpcEngineError('Engine is destroyed'),
      );
    });

    it('logs an error if a middleware throws when destroying', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const middleware = {
        destroy: jest.fn(() => {
          throw new Error('test');
        }),
      };
      const engine = new JsonRpcEngineV2({
        middleware: [middleware as unknown as JsonRpcMiddleware],
      });

      engine.destroy();
      await new Promise((resolve) => setImmediate(resolve));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error destroying middleware:',
        new Error('test'),
      );
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
      const engine = new JsonRpcEngineV2({
        middleware: [
          middleware1,
          middleware2,
        ] as unknown as NonEmptyArray<JsonRpcMiddleware>,
      });

      engine.destroy();

      expect(middleware1.destroy).toHaveBeenCalledTimes(1);
      expect(middleware2.destroy).toHaveBeenCalledTimes(1);
    });
  });
});
