import type { JsonRpcRequest } from '@metamask/utils';
import { assertIsJsonRpcSuccess, hasProperty } from '@metamask/utils';

import { JsonRpcEngine, mergeMiddleware } from '.';

const jsonrpc = '2.0' as const;

describe('mergeMiddleware', () => {
  it('basic', async () => {
    const engine = new JsonRpcEngine();
    let originalRequest: JsonRpcRequest;

    engine.push(
      mergeMiddleware([
        function (req, res, _next, end) {
          originalRequest = req;
          res.result = 'saw merged middleware';
          end();
        },
      ]),
    );

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();
        expect(response).toBeDefined();
        expect(originalRequest.id).toStrictEqual(response.id);
        expect(originalRequest.jsonrpc).toStrictEqual(response.jsonrpc);
        expect(hasProperty(response, 'result')).toBe(true);
        resolve();
      });
    });
  });

  it('handles next handler correctly for multiple merged', async () => {
    const engine = new JsonRpcEngine();

    engine.push(
      mergeMiddleware([
        (_request, response, next, _end) => {
          next((callback) => {
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (response as any).copy = response.result;
            callback();
          });
        },
        (_req, res, _next, end) => {
          res.result = true;
          end();
        },
      ]),
    );

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, res) {
        expect(error).toBeNull();

        // @ts-expect-error - `copy` is not a valid property of `JsonRpcSuccess`.
        const { copy, ...rest } = res;
        assertIsJsonRpcSuccess(rest);

        expect(rest.result).toStrictEqual(copy);
        resolve();
      });
    });
  });

  it('decorate res', async () => {
    const engine = new JsonRpcEngine();
    let originalRequest: JsonRpcRequest;

    engine.push(
      mergeMiddleware([
        function (request, response, _next, end) {
          originalRequest = request;
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (response as any).xyz = true;
          response.result = true;
          end();
        },
      ]),
    );

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, res) {
        expect(error).toBeNull();
        expect(res).toBeDefined();
        expect(originalRequest.id).toStrictEqual(res.id);
        expect(originalRequest.jsonrpc).toStrictEqual(res.jsonrpc);
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((res as any).xyz).toBe(true);
        resolve();
      });
    });
  });

  it('decorate req', async () => {
    const engine = new JsonRpcEngine();
    let originalRequest: JsonRpcRequest;

    engine.push(
      mergeMiddleware([
        function (request, response, _next, end) {
          originalRequest = request;
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (request as any).xyz = true;
          response.result = true;
          end();
        },
      ]),
    );

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

    engine.push(mergeMiddleware([(_request, _response, next, _end) => next()]));
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

  it('handles next handler correctly across middleware', async () => {
    const engine = new JsonRpcEngine();

    engine.push(
      mergeMiddleware([
        (_request, response, next, _end) => {
          next((callback) => {
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (response as any).copy = response.result;
            callback();
          });
        },
      ]),
    );

    engine.push((_request, response, _next, end) => {
      response.result = true;
      end();
    });
    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (error, response) {
        expect(error).toBeNull();

        // @ts-expect-error - `copy` is not a valid property of `JsonRpcSuccess`.
        const { copy, ...rest } = response;
        assertIsJsonRpcSuccess(rest);

        expect(rest.result).toStrictEqual(copy);
        resolve();
      });
    });
  });
});
