import {
  assertIsJsonRpcSuccess,
  hasProperty,
  JsonRpcRequest,
} from '@metamask/utils';
import { JsonRpcEngine, mergeMiddleware } from '.';

const jsonrpc = '2.0' as const;

describe('mergeMiddleware', () => {
  it('basic', async () => {
    const engine = new JsonRpcEngine();
    let originalReq: JsonRpcRequest<unknown>;

    engine.push(
      mergeMiddleware([
        function (req, res, _next, end) {
          originalReq = req;
          res.result = 'saw merged middleware';
          end();
        },
      ]),
    );

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        expect(originalReq.id).toStrictEqual(res.id);
        expect(originalReq.jsonrpc).toStrictEqual(res.jsonrpc);
        expect(hasProperty(res, 'result')).toBe(true);
        resolve();
      });
    });
  });

  it('handles next handler correctly for multiple merged', async () => {
    const engine = new JsonRpcEngine();

    engine.push(
      mergeMiddleware([
        (_req, res, next, _end) => {
          next((cb) => {
            (res as any).copy = res.result;
            cb();
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
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual((res as any).copy);
        resolve();
      });
    });
  });

  it('decorate res', async () => {
    const engine = new JsonRpcEngine();
    let originalReq: JsonRpcRequest<unknown>;

    engine.push(
      mergeMiddleware([
        function (req, res, _next, end) {
          originalReq = req;
          (res as any).xyz = true;
          res.result = true;
          end();
        },
      ]),
    );

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        expect(originalReq.id).toStrictEqual(res.id);
        expect(originalReq.jsonrpc).toStrictEqual(res.jsonrpc);
        expect((res as any).xyz).toBe(true);
        resolve();
      });
    });
  });

  it('decorate req', async () => {
    const engine = new JsonRpcEngine();
    let originalReq: JsonRpcRequest<unknown>;

    engine.push(
      mergeMiddleware([
        function (req, res, _next, end) {
          originalReq = req;
          (req as any).xyz = true;
          res.result = true;
          end();
        },
      ]),
    );

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        expect(originalReq.id).toStrictEqual(res.id);
        expect(originalReq.jsonrpc).toStrictEqual(res.jsonrpc);
        expect((originalReq as any).xyz).toBe(true);
        resolve();
      });
    });
  });

  it('should not error even if end not called', async () => {
    const engine = new JsonRpcEngine();

    engine.push(mergeMiddleware([(_req, _res, next, _end) => next()]));
    engine.push((_req, res, _next, end) => {
      res.result = true;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        resolve();
      });
    });
  });

  it('handles next handler correctly across middleware', async () => {
    const engine = new JsonRpcEngine();

    engine.push(
      mergeMiddleware([
        (_req, res, next, _end) => {
          next((cb) => {
            (res as any).copy = res.result;
            cb();
          });
        },
      ]),
    );

    engine.push((_req, res, _next, end) => {
      res.result = true;
      end();
    });
    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual((res as any).copy);
        resolve();
      });
    });
  });
});
