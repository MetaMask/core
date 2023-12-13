import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcParams, Json } from '@metamask/utils';
import {
  assertIsJsonRpcSuccess,
  assertIsJsonRpcFailure,
  isJsonRpcFailure,
  isJsonRpcSuccess,
} from '@metamask/utils';

import type { JsonRpcMiddleware } from '.';
import { JsonRpcEngine } from '.';

const jsonrpc = '2.0' as const;

describe('JsonRpcEngine', () => {
  it('handle: throws on truthy, non-function callback', () => {
    const engine = new JsonRpcEngine();
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => engine.handle({} as any, 'foo' as any)).toThrow(
      '"callback" must be a function if provided.',
    );
  });

  it('handle: returns error for invalid request value', async () => {
    const engine = new JsonRpcEngine();
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any = await engine.handle(null as any);
    expect(response.error.code).toBe(-32600);
    expect(response.result).toBeUndefined();

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response = await engine.handle(true as any);
    expect(response.error.code).toBe(-32600);
    expect(response.result).toBeUndefined();
  });

  it('handle: returns error for invalid request method', async () => {
    const engine = new JsonRpcEngine();
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await engine.handle({ id: 1, method: null } as any);

    expect(response.error.code).toBe(-32600);
    expect(response.result).toBeUndefined();
  });

  it('handle: returns error for invalid request method with nullish id', async () => {
    const engine = new JsonRpcEngine();
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await engine.handle({
      id: undefined,
      method: null,
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(response.error.code).toBe(-32600);
    expect(response.result).toBeUndefined();
  });

  it('handle: returns undefined for malformed notifications', async () => {
    const middleware = jest.fn();
    const notificationHandler = jest.fn();
    const engine = new JsonRpcEngine({ notificationHandler });
    engine.push(middleware);

    expect(
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await engine.handle({ jsonrpc, method: true } as any),
    ).toBeUndefined();
    expect(notificationHandler).not.toHaveBeenCalled();
    expect(middleware).not.toHaveBeenCalled();
  });

  it('handle: treats notifications as requests when no notification handler is specified', async () => {
    const middleware = jest
      .fn()
      .mockImplementation((_request, response, _next, end) => {
        response.result = 'bar';
        end();
      });

    const engine = new JsonRpcEngine();
    engine.push(middleware);

    expect(await engine.handle({ jsonrpc, method: 'foo' })).toStrictEqual({
      jsonrpc,
      result: 'bar',
      id: undefined,
    });
    expect(middleware).toHaveBeenCalledTimes(1);
  });

  it('handle: forwards notifications to handlers', async () => {
    const middleware = jest.fn();
    const notificationHandler = jest.fn();
    const engine = new JsonRpcEngine({ notificationHandler });
    engine.push(middleware);

    expect(await engine.handle({ jsonrpc, method: 'foo' })).toBeUndefined();
    expect(notificationHandler).toHaveBeenCalledTimes(1);
    expect(notificationHandler).toHaveBeenCalledWith({
      jsonrpc,
      method: 'foo',
    });
    expect(middleware).not.toHaveBeenCalled();
  });

  it('handle: re-throws errors from notification handlers (async)', async () => {
    const notificationHandler = jest.fn().mockImplementation(() => {
      throw new Error('baz');
    });
    const engine = new JsonRpcEngine({ notificationHandler });

    await expect(engine.handle({ jsonrpc, method: 'foo' })).rejects.toThrow(
      new Error('baz'),
    );
    expect(notificationHandler).toHaveBeenCalledTimes(1);
    expect(notificationHandler).toHaveBeenCalledWith({
      jsonrpc,
      method: 'foo',
    });
  });

  it('handle: re-throws errors from notification handlers (callback)', async () => {
    const notificationHandler = jest.fn().mockImplementation(() => {
      throw new Error('baz');
    });
    const engine = new JsonRpcEngine({ notificationHandler });

    await new Promise<void>((resolve) => {
      engine.handle({ jsonrpc, method: 'foo' }, (error, response) => {
        expect(error).toStrictEqual(new Error('baz'));
        expect(response).toBeUndefined();

        expect(notificationHandler).toHaveBeenCalledTimes(1);
        expect(notificationHandler).toHaveBeenCalledWith({
          jsonrpc,
          method: 'foo',
        });
        resolve();
      });
    });
  });

  it('handle: basic middleware test 1', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_request, response, _next, end) {
      response.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        assertIsJsonRpcSuccess(response);
        expect(response.result).toBe(42);
        resolve();
      });
    });
  });

  it('handle: basic middleware test 2', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (request, response, _next, end) {
      request.method = 'banana';
      response.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        assertIsJsonRpcSuccess(response);
        expect(response.result).toBe(42);
        expect(payload.method).toBe('hello');
        resolve();
      });
    });
  });

  it('handle (async): basic middleware test', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_request, response, _next, end) {
      response.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    const response = await engine.handle(payload);
    assertIsJsonRpcSuccess(response);
    expect(response.result).toBe(42);
  });

  it('allow null result', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_request, response, _next, end) {
      response.result = null;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        assertIsJsonRpcSuccess(response);
        expect(response.result).toBeNull();
        resolve();
      });
    });
  });

  it('interacting middleware test', async () => {
    const engine = new JsonRpcEngine();

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engine.push(function (request: any, _response, next, _end) {
      request.resultShouldBe = 42;
      next();
    });

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engine.push(function (request: any, response, _next, end) {
      response.result = request.resultShouldBe;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        assertIsJsonRpcSuccess(response);
        expect(response.result).toBe(42);
        resolve();
      });
    });
  });

  it('middleware ending request before all middlewares applied', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_request, response, _next, end) {
      response.result = 42;
      end();
    });

    engine.push(function (_request, _response, _next, _end) {
      throw new Error('Test should have ended already.');
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        assertIsJsonRpcSuccess(response);
        expect(response.result).toBe(42);
        resolve();
      });
    });
  });

  it('erroring middleware test: end(error)', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_request, _response, _next, end) {
      end(new Error('no bueno'));
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeDefined();
        expect(response).toBeDefined();
        assertIsJsonRpcFailure(response);
        expect(isJsonRpcSuccess(response)).toBe(false);
        resolve();
      });
    });
  });

  it('erroring middleware test: response.error -> next()', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_request, response, next, _end) {
      response.error = rpcErrors.internal({ message: 'foobar' });
      next();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeDefined();
        expect(response).toBeDefined();
        assertIsJsonRpcFailure(response);
        expect(isJsonRpcSuccess(response)).toBe(false);
        resolve();
      });
    });
  });

  it('erroring middleware test: response.error -> end()', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_request, response, _next, end) {
      response.error = rpcErrors.internal({ message: 'foobar' });
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeDefined();
        expect(response).toBeDefined();
        expect(isJsonRpcFailure(response)).toBe(true);
        expect(isJsonRpcSuccess(response)).toBe(false);
        resolve();
      });
    });
  });

  it('erroring middleware test: non-function passsed to next()', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_request, _response, next, _end) {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next(true as any);
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeDefined();
        expect(response).toBeDefined();
        assertIsJsonRpcFailure(response);
        expect(response.error.code).toBe(-32603);
        expect(
          response.error.message.startsWith(
            'JsonRpcEngine: "next" return handlers must be functions.',
          ),
        ).toBe(true);
        expect(isJsonRpcSuccess(response)).toBe(false);
        resolve();
      });
    });
  });

  it('empty middleware test', async () => {
    const engine = new JsonRpcEngine();

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, _response) {
        expect(error).toBeDefined();
        resolve();
      });
    });
  });

  it('handle: empty batch', async () => {
    const engine = new JsonRpcEngine();
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emptyBatch = [] as any;

    await new Promise<void>((resolve) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      engine.handle(emptyBatch, function (error, response: any) {
        expect(error).toBeNull();
        expect(response).toBeInstanceOf(Array);
        expect(response).toHaveLength(1);
        expect(
          response[0].error.message.startsWith(
            'Request batch must contain plain objects. Received an empty array',
          ),
        ).toBe(true);
        expect(isJsonRpcSuccess(response[0])).toBe(false);
        resolve();
      });
    });
  });

  it('handle: empty batch (async signature)', async () => {
    const engine = new JsonRpcEngine();
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emptyBatch = [] as any;

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await engine.handle(emptyBatch);
    expect(response).toBeInstanceOf(Array);
    expect(response).toHaveLength(1);
    expect(
      response[0].error.message.startsWith(
        'Request batch must contain plain objects. Received an empty array',
      ),
    ).toBe(true);
    expect(isJsonRpcSuccess(response[0])).toBe(false);
  });

  it('handle: batch payloads', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (request, response, _next, end) {
      if (request.id === 4) {
        delete response.result;
        response.error = rpcErrors.internal({ message: 'foobar' });
        return end(response.error);
      }
      response.result = request.id;
      return end();
    });

    const payloadA = { id: 1, jsonrpc, method: 'hello' };
    const payloadB = { id: 2, jsonrpc, method: 'hello' };
    const payloadC = { id: 3, jsonrpc, method: 'hello' };
    const payloadD = { id: 4, jsonrpc, method: 'hello' };
    const payloadE = { id: 5, jsonrpc, method: 'hello' };
    const payload = [payloadA, payloadB, payloadC, payloadD, payloadE];

    await new Promise<void>((resolve) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      engine.handle(payload, function (error, response: any) {
        expect(error).toBeNull();
        expect(response).toBeInstanceOf(Array);
        expect(response[0].result).toBe(1);
        expect(response[1].result).toBe(2);
        expect(response[2].result).toBe(3);
        expect(isJsonRpcSuccess(response[3])).toBe(false);
        expect(response[3].error.code).toBe(-32603);
        expect(response[4].result).toBe(5);
        resolve();
      });
    });
  });

  it('handle: batch payloads (async signature)', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (request, response, _next, end) {
      if (request.id === 4) {
        delete response.result;
        response.error = rpcErrors.internal({ message: 'foobar' });
        return end(response.error);
      }
      response.result = request.id;
      return end();
    });

    const payloadA = { id: 1, jsonrpc, method: 'hello' };
    const payloadB = { id: 2, jsonrpc, method: 'hello' };
    const payloadC = { id: 3, jsonrpc, method: 'hello' };
    const payloadD = { id: 4, jsonrpc, method: 'hello' };
    const payloadE = { id: 5, jsonrpc, method: 'hello' };
    const payload = [payloadA, payloadB, payloadC, payloadD, payloadE];

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await engine.handle(payload);
    expect(response).toBeInstanceOf(Array);
    expect(response[0].result).toBe(1);
    expect(response[1].result).toBe(2);
    expect(response[2].result).toBe(3);
    expect(isJsonRpcSuccess(response[3])).toBe(false);
    expect(response[3].error.code).toBe(-32603);
    expect(response[4].result).toBe(5);
  });

  it('handle: batch payload with bad request object', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (request, response, _next, end) {
      response.result = request.id;
      return end();
    });

    const payloadA = { id: 1, jsonrpc, method: 'hello' };
    const payloadB = true;
    const payloadC = { id: 3, jsonrpc, method: 'hello' };
    const payload = [payloadA, payloadB, payloadC];

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await engine.handle(payload as any);
    expect(response).toBeInstanceOf(Array);
    expect(response[0].result).toBe(1);
    expect(isJsonRpcSuccess(response[1])).toBe(false);
    expect(response[1].error.code).toBe(-32600);
    expect(response[2].result).toBe(3);
  });

  it('basic notifications', async () => {
    const engine = new JsonRpcEngine();

    await new Promise<void>((resolve) => {
      engine.once('notification', (notification) => {
        expect(notification.method).toBe('test_notif');
        resolve();
      });
      engine.emit('notification', { jsonrpc, method: 'test_notif' });
    });
  });

  it('return handlers test', async () => {
    const engine = new JsonRpcEngine();

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engine.push(function (_request, response: any, next, _end) {
      next(function (callback) {
        response.sawReturnHandler = true;
        callback();
      });
    });

    engine.push(function (_request, response, _next, end) {
      response.result = true;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      engine.handle(payload, function (error, response: any) {
        expect(error).toBeNull();
        expect(response).toBeDefined();
        expect(response.sawReturnHandler).toBe(true);
        resolve();
      });
    });
  });

  it('return order of events', async () => {
    const engine = new JsonRpcEngine();

    const events: string[] = [];

    engine.push(function (_request, _response, next, _end) {
      events.push('1-next');
      next(function (callback) {
        events.push('1-return');
        callback();
      });
    });

    engine.push(function (_request, _response, next, _end) {
      events.push('2-next');
      next(function (callback) {
        events.push('2-return');
        callback();
      });
    });

    engine.push(function (_request, response, _next, end) {
      events.push('3-end');
      response.result = true;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, _response) {
        expect(error).toBeNull();
        expect(events[0]).toBe('1-next');
        expect(events[1]).toBe('2-next');
        expect(events[2]).toBe('3-end');
        expect(events[3]).toBe('2-return');
        expect(events[4]).toBe('1-return');
        resolve();
      });
    });
  });

  it('calls back next handler even if error', async () => {
    const engine = new JsonRpcEngine();

    let sawNextReturnHandlerCalled = false;

    engine.push(function (_request, _response, next, _end) {
      next(function (callback) {
        sawNextReturnHandlerCalled = true;
        callback();
      });
    });

    engine.push(function (_request, _response, _next, end) {
      end(new Error('boom'));
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, (error, _response) => {
        expect(error).toBeDefined();
        expect(sawNextReturnHandlerCalled).toBe(true);
        resolve();
      });
    });
  });

  it('handles error in next handler', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_request, _response, next, _end) {
      next(function (_cb) {
        throw new Error('foo');
      });
    });

    engine.push(function (_request, response, _next, end) {
      response.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      engine.handle(payload, (error: any, _response) => {
        expect(error).toBeDefined();
        expect(error.message).toBe('foo');
        resolve();
      });
    });
  });

  it('handles failure to end request', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_request, response, next, _end) {
      response.result = 42;
      next();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      engine.handle(payload, (error: any, response) => {
        expect(
          error.message.startsWith('JsonRpcEngine: Nothing ended request:'),
        ).toBe(true);
        expect(isJsonRpcSuccess(response)).toBe(false);
        resolve();
      });
    });
  });

  it('handles batch request processing error', async () => {
    const engine = new JsonRpcEngine();
    jest
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(engine as any, '_promiseHandle')
      .mockRejectedValue(new Error('foo'));

    await new Promise<void>((resolve) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      engine.handle([{}] as any, (error: any) => {
        expect(error.message).toBe('foo');
        resolve();
      });
    });
  });

  it('handles batch request processing error (async)', async () => {
    const engine = new JsonRpcEngine();
    jest
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(engine as any, '_promiseHandle')
      .mockRejectedValue(new Error('foo'));

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(engine.handle([{}] as any)).rejects.toThrow('foo');
  });

  describe('destroy', () => {
    const destroyedError = new Error(
      'This engine is destroyed and can no longer be used.',
    );

    it('prevents the engine from being used', async () => {
      const engine = new JsonRpcEngine();
      engine.destroy();

      await expect(async () => engine.handle([])).rejects.toThrow(
        destroyedError,
      );

      expect(() => engine.asMiddleware()).toThrow(destroyedError);
      expect(() => engine.push(() => undefined)).toThrow(destroyedError);
    });

    it('destroying is idempotent', () => {
      const engine = new JsonRpcEngine();
      engine.destroy();
      expect(async () => engine.destroy()).not.toThrow();
      expect(() => engine.asMiddleware()).toThrow(destroyedError);
    });

    it('calls the destroy method of middleware functions', async () => {
      const engine = new JsonRpcEngine();

      engine.push((_request, response, next, _end) => {
        response.result = 42;
        next();
      });

      const destroyMock = jest.fn();
      const destroyableMiddleware: JsonRpcMiddleware<JsonRpcParams, Json> = (
        _request,
        _response,
        _next,
        end,
      ) => {
        end();
      };
      destroyableMiddleware.destroy = destroyMock;
      engine.push(destroyableMiddleware);

      engine.destroy();
      expect(destroyMock).toHaveBeenCalledTimes(1);
    });
  });
});
