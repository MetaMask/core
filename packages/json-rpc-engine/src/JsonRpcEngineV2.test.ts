import type { NonEmptyArray } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import { original as getOriginalState } from 'immer';

import type { JsonRpcMiddleware, MiddlewareContext } from './JsonRpcEngineV2';
import { JsonRpcEngineV2, EndNotification } from './JsonRpcEngineV2';
import {
  cloneRequest,
  JsonRpcEngineError,
  stringify,
  type JsonRpcCall,
  type JsonRpcNotification,
  type JsonRpcRequest,
} from './utils';

const jsonrpc = '2.0' as const;

const makeRequest = <Request extends JsonRpcRequest>(
  params: Partial<Request> = {},
): Request =>
  ({
    jsonrpc,
    id: '1',
    method: 'test_request',
    params: [] as Request['params'],
    ...params,
  }) as Request;

/**
 * Wraps a set of mock middleware functions such that they receive the
 * original request object as opposed to the immer draft object, which
 * is revoked by the time we can observe it.
 *
 * @param middleware - The first middleware. This param exists to ensure that
 * at least one middleware is provided.
 * @param rest - The rest of the middleware.
 * @returns An array of the wrapped middleware functions.
 */
const makeMockMiddleware = <
  Request extends JsonRpcCall,
  Result extends Json | void,
>(
  middleware: JsonRpcMiddleware<Request, Result>,
  ...rest: JsonRpcMiddleware<Request, Result>[]
): NonEmptyArray<JsonRpcMiddleware<Request, Result>> =>
  [middleware, ...rest].map(
    (fn) => (request: Request, context: MiddlewareContext) =>
      fn(getOriginalState(request) as Request, context),
  ) as NonEmptyArray<JsonRpcMiddleware<Request, Result>>;

describe('JsonRpcEngineV2', () => {
  describe('handle', () => {
    describe('notifications', () => {
      it('passes the notification through middleware', async () => {
        const middleware: JsonRpcMiddleware<JsonRpcNotification, void> =
          jest.fn(() => EndNotification);
        const engine = new JsonRpcEngineV2({
          middleware: makeMockMiddleware(middleware),
        });
        const notification = { jsonrpc, method: 'test_request' };

        await engine.handle(notification);

        expect(middleware).toHaveBeenCalledTimes(1);
        expect(middleware).toHaveBeenCalledWith(notification, expect.any(Map));
      });

      it('returns no result', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [jest.fn(() => EndNotification)],
        });
        const notification = { jsonrpc, method: 'test_request' };

        const result = await engine.handle(notification);

        expect(result).toBeUndefined();
      });

      it('returns no result, with multiple middleware', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: makeMockMiddleware(
            jest.fn(),
            jest.fn(() => EndNotification),
          ),
        });
        const notification = { jsonrpc, method: 'test_request' };

        const result = await engine.handle(notification);

        expect(result).toBeUndefined();
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
          middleware: makeMockMiddleware(
            jest.fn(),
            jest.fn(() => {
              throw new Error('test');
            }),
          ),
        });
        const notification = { jsonrpc, method: 'test_request' };

        await expect(engine.handle(notification)).rejects.toThrow(
          new Error('test'),
        );
      });

      it('throws if no middleware returns EndNotification', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [jest.fn(), jest.fn()],
        });
        const notification = { jsonrpc, method: 'test_request' };

        await expect(engine.handle(notification)).rejects.toThrow(
          new JsonRpcEngineError(
            `Nothing ended request: ${stringify(notification)}`,
          ),
        );
      });

      it('throws if a middleware returns a return handler', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [jest.fn(() => () => null)],
        });
        const notification = { jsonrpc, method: 'test_request' };

        await expect(engine.handle(notification)).rejects.toThrow(
          new JsonRpcEngineError(
            `Middleware returned a return handler for notification: ${stringify(notification)}`,
          ),
        );
      });

      it('throws if a middleware returns neither EndNotification nor undefined', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [jest.fn(() => null), jest.fn(() => EndNotification)],
        });
        const notification = { jsonrpc, method: 'test_request' };

        await expect(engine.handle(notification)).rejects.toThrow(
          new JsonRpcEngineError(
            `Notification handled as request: ${stringify(notification)}`,
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
          middleware: makeMockMiddleware(middleware),
        });
        const request = makeRequest();

        const result = await engine.handle(request);

        expect(result).toBeNull();
        expect(middleware).toHaveBeenCalledTimes(1);
        expect(middleware).toHaveBeenCalledWith(request, expect.any(Map));
      });

      it('returns a result from the middleware, with multiple middleware', async () => {
        const middleware1 = jest.fn();
        const middleware2 = jest.fn(() => null);
        const engine = new JsonRpcEngineV2({
          middleware: makeMockMiddleware(middleware1, middleware2),
        });
        const request = makeRequest();

        const result = await engine.handle(request);

        expect(result).toBeNull();
        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware1).toHaveBeenCalledWith(request, expect.any(Map));
        expect(middleware2).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledWith(request, expect.any(Map));
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
          middleware: makeMockMiddleware(
            jest.fn(),
            jest.fn(() => {
              throw new Error('test');
            }),
          ),
        });

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new Error('test'),
        );
      });

      it('throws if no middleware returns a result', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [jest.fn(), jest.fn()],
        });
        const request = makeRequest();

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new JsonRpcEngineError(
            `Nothing ended request: ${stringify(request)}`,
          ),
        );
      });

      it('throws if a middleware returns EndNotification', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [jest.fn(() => EndNotification)],
        });
        const request = makeRequest();

        await expect(engine.handle(request)).rejects.toThrow(
          new JsonRpcEngineError(
            `Request handled as notification: ${stringify(request)}`,
          ),
        );
      });
    });

    describe('request mutation', () => {
      it('lets middleware mutate request parameters in place', async () => {
        const observedParams: string[] = [];
        const middleware1 = jest.fn((req) => {
          observedParams.push(req.params[0]);
          req.params[0] = '2';
        });
        const middleware2 = jest.fn((req) => {
          observedParams.push(req.params[0]);
          req.params[0] = '3';
        });
        const middleware3 = jest.fn((req) => {
          observedParams.push(req.params[0]);
          return null;
        });
        const engine = new JsonRpcEngineV2({
          middleware: makeMockMiddleware(middleware1, middleware2, middleware3),
        });
        const request = makeRequest({ params: ['1'] });

        await engine.handle(request);

        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledTimes(1);
        expect(middleware3).toHaveBeenCalledTimes(1);
        expect(observedParams).toStrictEqual(['1', '2', '3']);
      });

      it('lets middleware replace request parameters', async () => {
        const observedParams: string[] = [];
        const middleware1 = jest.fn((req) => {
          observedParams.push(cloneRequest(req).params);
          req.params = ['2'];
        });
        const middleware2 = jest.fn((req) => {
          observedParams.push(cloneRequest(req).params);
          req.params = ['3'];
        });
        const middleware3 = jest.fn((req) => {
          observedParams.push(cloneRequest(req).params);
          return null;
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2, middleware3],
        });
        const request = makeRequest({ params: ['1'] });

        await engine.handle(request);

        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledTimes(1);
        expect(middleware3).toHaveBeenCalledTimes(1);
        expect(observedParams).toStrictEqual([['1'], ['2'], ['3']]);
      });

      it('lets middleware replace the request method', async () => {
        let observedMethod: string | undefined;
        const middleware1 = jest.fn((req) => {
          req.method = 'test_request_2';
        });
        const middleware2 = jest.fn((req) => {
          observedMethod = req.method;
          return null;
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2],
        });

        await engine.handle(makeRequest());

        expect(middleware1).toHaveBeenCalledTimes(1);
        expect(middleware2).toHaveBeenCalledTimes(1);
        expect(observedMethod).toBe('test_request_2');
      });

      it('throws if a middleware attempts to modify the request "id" property', async () => {
        const engine = new JsonRpcEngineV2({
          middleware: [
            jest.fn((req) => {
              req.id = '2';
            }),
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
            jest.fn((req) => {
              req.jsonrpc = '3.0';
            }),
          ],
        });
        const request = makeRequest();

        await expect(engine.handle(request)).rejects.toThrow(
          new JsonRpcEngineError(
            `Middleware attempted to modify readonly property "jsonrpc" for request: ${stringify(request)}`,
          ),
        );
      });

      it('throws if modifying the request outside of the middleware', async () => {
        let retained: JsonRpcCall | undefined;
        const middleware = jest.fn((req) => {
          retained = req;
          return null;
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware],
        });
        const request = makeRequest();

        await engine.handle(request);

        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          retained!.params = ['2'];
        }).toThrow(
          new TypeError(
            `Cannot perform 'set' on a proxy that has been revoked`,
          ),
        );
      });
    });

    describe('return handlers', () => {
      it('runs return handlers in reverse order of registration', async () => {
        const returnHandlerResults: string[] = [];
        const middleware1 = jest.fn(() => () => {
          returnHandlerResults.push('1');
        });
        const middleware2 = jest.fn(() => () => {
          returnHandlerResults.push('2');
        });
        const middleware3 = jest.fn(() => () => {
          returnHandlerResults.push('3');
        });
        const middleware4 = jest.fn(() => null);
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2, middleware3, middleware4],
        });

        await engine.handle(makeRequest());

        expect(returnHandlerResults).toStrictEqual(['3', '2', '1']);
      });

      it('returns the expected result after no-op return handler', async () => {
        const middleware1 = jest.fn(() => () => undefined);
        const middleware2 = jest.fn(() => null);
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('lets return handler update the result', async () => {
        const middleware1 = jest.fn(() => () => {
          return '1';
        });
        const middleware2 = jest.fn(() => null);
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe('1');
      });

      it('uses the result of the first return handler registered', async () => {
        const middleware1 = jest.fn(() => () => {
          return '1' as string;
        });
        const middleware2 = jest.fn(() => () => {
          return '2' as string;
        });
        const middleware3 = jest.fn(() => null);
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2, middleware3],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe('1');
      });

      it('throws if a return handler modifies the request', async () => {
        const middleware1 = jest.fn((req) => () => {
          req.params = ['2'];
          return '1' as string;
        });
        const middleware2 = jest.fn(() => null);
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2],
        });

        await expect(engine.handle(makeRequest())).rejects.toThrow(
          new TypeError(
            `Cannot perform 'set' on a proxy that has been revoked`,
          ),
        );
      });
    });

    describe('asynchrony', () => {
      it('handles asynchronous middleware', async () => {
        const middleware = jest.fn(async () => {
          return null;
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('handles mixed synchronous and asynchronous middleware', async () => {
        const middleware1 = jest.fn((_req, context) => {
          context.set('foo', [1]);
        });
        const middleware2 = jest.fn(async (_req, context) => {
          const nums = context.get('foo') as number[];
          context.set('foo', [...nums, 2]);
        });
        const middleware3 = jest.fn(async (_req, context) => {
          const nums = context.get('foo') as number[];
          return [...nums, 3];
        });
        const engine = new JsonRpcEngineV2<JsonRpcCall, number[] | void>({
          middleware: [middleware1, middleware2, middleware3],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toStrictEqual([1, 2, 3]);
      });

      it('handles asynchronous return handlers', async () => {
        const middleware = jest.fn(() => async () => {
          return null;
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBeNull();
      });

      it('handles mixed synchronous and asynchronous return handlers', async () => {
        const middleware1 = jest.fn(() => (result: number | void) => {
          // eslint-disable-next-line jest/no-conditional-in-test
          return (result ?? 0) * 2;
        });
        const middleware2 = jest.fn(() => async () => {
          return 2;
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe(4);
      });
    });

    describe('context', () => {
      it('passes the context to the middleware', async () => {
        const middleware = jest.fn((_req, context) => {
          expect(context).toBeInstanceOf(Map);
          return null;
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware],
        });

        await engine.handle(makeRequest());
      });

      it('propagates context changes to subsequent middleware', async () => {
        const middleware1 = jest.fn((_req, context) => {
          context.set('foo', 'bar');
        });
        const middleware2 = jest.fn((_req, context) => {
          return context.get('foo') as string;
        });
        const engine = new JsonRpcEngineV2<JsonRpcCall, string | void>({
          middleware: [middleware1, middleware2],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe('bar');
      });

      it('propagates context changes from middleware to return handlers', async () => {
        const middleware1 = jest.fn((_req, context) => () => {
          return context.get('foo') as string;
        });
        const middleware2 = jest.fn((_req, context) => {
          context.set('foo', 'bar');
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe('bar');
      });

      it('propagates context changes from return handlers to return handlers', async () => {
        const middleware1 = jest.fn((_req, context) => () => {
          return context.get('foo') as string;
        });
        const middleware2 = jest.fn((_req, context) => () => {
          context.set('foo', 'bar');
        });
        const engine = new JsonRpcEngineV2({
          middleware: [middleware1, middleware2],
        });

        const result = await engine.handle(makeRequest());

        expect(result).toBe('bar');
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
    it('returns a middleware function', async () => {
      const engine1 = new JsonRpcEngineV2({
        middleware: [() => null],
      });
      const engine2 = new JsonRpcEngineV2({
        middleware: [engine1.asMiddleware()],
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
      const middleware1 = jest.fn(() => undefined);
      const middleware2 = jest.fn(() => undefined);
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
      const engine1 = new JsonRpcEngineV2<JsonRpcRequest, number | void>({
        middleware: [
          (req) => {
            req.params = [2];
          },
          (req) => {
            req.method = 'test_request_2';
            // @ts-expect-error Will obviously work.
            req.params[0] *= 2;
          },
        ],
      });

      let observedMethod: string | undefined;
      const engine2 = new JsonRpcEngineV2({
        middleware: [
          engine1.asMiddleware(),
          (req) => {
            observedMethod = req.method;
            // @ts-expect-error Will obviously work.
            return req.params[0] * 2;
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
          (_req, context) => {
            const num = context.get('foo') as number;
            context.set('foo', num * 2);
          },
        ],
      });
      const engine2 = new JsonRpcEngineV2({
        middleware: [
          (_req, context) => {
            context.set('foo', 2);
          },
          engine1.asMiddleware(),
          (_req, context) => {
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
          () => () => {
            returnHandlerResults.push('1:a');
          },
          () => () => {
            returnHandlerResults.push('1:b');
          },
        ],
      });

      const engine2 = new JsonRpcEngineV2({
        middleware: [
          engine1.asMiddleware(),
          () => () => {
            returnHandlerResults.push('2:a');
          },
          () => () => {
            returnHandlerResults.push('2:b');
          },
          () => null,
        ],
      });

      await engine2.handle(makeRequest());

      // Order of return handlers is reversed _within_ engines, but not
      // _between_ engines.
      expect(returnHandlerResults).toStrictEqual(['1:b', '1:a', '2:b', '2:a']);
    });
  });
});
