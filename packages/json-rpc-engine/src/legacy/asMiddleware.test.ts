import type { JsonRpcRequest } from '@metamask/utils';
import { assertIsJsonRpcSuccess, isJsonRpcSuccess } from '@metamask/utils';

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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (request as any).xyz = true;
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((error as any).message).toBe('foo');
        expect(isJsonRpcSuccess(response)).toBe(false);
        resolve();
      });
    });
  });
});
