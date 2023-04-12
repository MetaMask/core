import {
  assertIsJsonRpcSuccess,
  isJsonRpcSuccess,
  JsonRpcRequest,
} from '@metamask/utils';

import { JsonRpcEngine } from '.';

const jsonrpc = '2.0' as const;

describe('asMiddleware', () => {
  it('basic', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();
    let originalRequest: JsonRpcRequest;

    subengine.push(function (request, response, _next, end) {
      originalRequest = request;
      response.result = 'saw subengine';
      end();
    });

    engine.push(subengine.asMiddleware());

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        expect(response).toBeDefined();
        expect(originalRequest.id).toStrictEqual(response.id);
        expect(originalRequest.jsonrpc).toStrictEqual(response.jsonrpc);
        assertIsJsonRpcSuccess(response);
        expect(response.result).toBe('saw subengine');
        resolve();
      });
    });
  });

  it('decorate response', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();
    let originalRequest: JsonRpcRequest;

    subengine.push(function (request, response, _next, end) {
      originalRequest = request;
      (response as any).xyz = true;
      response.result = true;
      end();
    });

    engine.push(subengine.asMiddleware());

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        expect(response).toBeDefined();
        expect(originalRequest.id).toStrictEqual(response.id);
        expect(originalRequest.jsonrpc).toStrictEqual(response.jsonrpc);
        expect((response as any).xyz).toBe(true);
        resolve();
      });
    });
  });

  it('decorate request', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();
    let originalRequest: JsonRpcRequest;

    subengine.push(function (request, response, _next, end) {
      originalRequest = request;
      (request as any).xyz = true;
      (response as any).xyz = true;
      response.result = true;
      end();
    });

    engine.push(subengine.asMiddleware());

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        expect(response).toBeDefined();
        expect(originalRequest.id).toStrictEqual(response.id);
        expect(originalRequest.jsonrpc).toStrictEqual(response.jsonrpc);
        expect((originalRequest as any).xyz).toBe(true);
        resolve();
      });
    });
  });

  it('should not error even if end not called', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push((_request, _response, next, _end) => next());

    engine.push(subengine.asMiddleware());
    engine.push((_request, response, _next, end) => {
      response.result = true;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        expect(response).toBeDefined();
        resolve();
      });
    });
  });

  it('handles next handler correctly when nested', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push((_request, response, next, _end) => {
      next((callback) => {
        (response as any).copy = response.result;
        callback();
      });
    });

    engine.push(subengine.asMiddleware());
    engine.push((_request, response, _next, end) => {
      response.result = true;
      end();
    });
    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        expect(response).toBeDefined();

        // @ts-expect-error - `copy` is not a valid property of `JsonRpcSuccess`.
        const { copy, ...rest } = response;
        assertIsJsonRpcSuccess(rest);

        expect(rest.result).toStrictEqual(copy);
        resolve();
      });
    });
  });

  it('handles next handler correctly when flat', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push((_request, response, next, _end) => {
      next((callback) => {
        (response as any).copy = response.result;
        callback();
      });
    });

    subengine.push((_request, response, _next, end) => {
      response.result = true;
      end();
    });

    engine.push(subengine.asMiddleware());
    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        expect(response).toBeDefined();

        // @ts-expect-error - `copy` is not a valid property of `JsonRpcSuccess`.
        const { copy, ...rest } = response;
        assertIsJsonRpcSuccess(rest);

        expect(rest.result).toStrictEqual(copy);
        resolve();
      });
    });
  });

  it('handles error thrown in middleware', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push(function (_request, _response, _next, _end) {
      throw new Error('foo');
    });

    engine.push(subengine.asMiddleware());

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeDefined();
        expect((error as any).message).toBe('foo');
        expect(isJsonRpcSuccess(response)).toBe(false);
        resolve();
      });
    });
  });

  it('handles next handler error correctly when nested', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push((_request, _response, next, _end) => {
      next((_callback) => {
        throw new Error('foo');
      });
    });

    engine.push(subengine.asMiddleware());
    engine.push((_request, response, _next, end) => {
      response.result = true;
      end();
    });
    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeDefined();
        expect((error as any).message).toBe('foo');
        expect(isJsonRpcSuccess(response)).toBe(false);
        resolve();
      });
    });
  });

  it('handles next handler error correctly when flat', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push((_request, _response, next, _end) => {
      next((_callback) => {
        throw new Error('foo');
      });
    });

    subengine.push((_request, response, _next, end) => {
      response.result = true;
      end();
    });

    engine.push(subengine.asMiddleware());
    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeDefined();
        expect((error as any).message).toBe('foo');
        expect(isJsonRpcSuccess(response)).toBe(false);
        resolve();
      });
    });
  });
});
