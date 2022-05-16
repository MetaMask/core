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
    let originalReq: JsonRpcRequest<unknown>;

    subengine.push(function (req, res, _next, end) {
      originalReq = req;
      res.result = 'saw subengine';
      end();
    });

    engine.push(subengine.asMiddleware());

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        expect(originalReq.id).toStrictEqual(res.id);
        expect(originalReq.jsonrpc).toStrictEqual(res.jsonrpc);
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual('saw subengine');
        resolve();
      });
    });
  });

  it('decorate res', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();
    let originalReq: JsonRpcRequest<unknown>;

    subengine.push(function (req, res, _next, end) {
      originalReq = req;
      (res as any).xyz = true;
      res.result = true;
      end();
    });

    engine.push(subengine.asMiddleware());

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
    const subengine = new JsonRpcEngine();
    let originalReq: JsonRpcRequest<unknown>;

    subengine.push(function (req, res, _next, end) {
      originalReq = req;
      (req as any).xyz = true;
      (res as any).xyz = true;
      res.result = true;
      end();
    });

    engine.push(subengine.asMiddleware());

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
    const subengine = new JsonRpcEngine();

    subengine.push((_req, _res, next, _end) => next());

    engine.push(subengine.asMiddleware());
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

  it('handles next handler correctly when nested', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push((_req, res, next, _end) => {
      next((cb) => {
        (res as any).copy = res.result;
        cb();
      });
    });

    engine.push(subengine.asMiddleware());
    engine.push((_req, res, _next, end) => {
      res.result = true;
      end();
    });
    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual((res as any).copy);
        resolve();
      });
    });
  });

  it('handles next handler correctly when flat', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push((_req, res, next, _end) => {
      next((cb) => {
        (res as any).copy = res.result;
        cb();
      });
    });

    subengine.push((_req, res, _next, end) => {
      res.result = true;
      end();
    });

    engine.push(subengine.asMiddleware());
    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual((res as any).copy);
        resolve();
      });
    });
  });

  it('handles error thrown in middleware', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push(function (_req, _res, _next, _end) {
      throw new Error('foo');
    });

    engine.push(subengine.asMiddleware());

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeDefined();
        expect((err as any).message).toStrictEqual('foo');
        expect(isJsonRpcSuccess(res)).toBe(false);
        resolve();
      });
    });
  });

  it('handles next handler error correctly when nested', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push((_req, _res, next, _end) => {
      next((_cb) => {
        throw new Error('foo');
      });
    });

    engine.push(subengine.asMiddleware());
    engine.push((_req, res, _next, end) => {
      res.result = true;
      end();
    });
    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeDefined();
        expect((err as any).message).toStrictEqual('foo');
        expect(isJsonRpcSuccess(res)).toBe(false);
        resolve();
      });
    });
  });

  it('handles next handler error correctly when flat', async () => {
    const engine = new JsonRpcEngine();
    const subengine = new JsonRpcEngine();

    subengine.push((_req, _res, next, _end) => {
      next((_cb) => {
        throw new Error('foo');
      });
    });

    subengine.push((_req, res, _next, end) => {
      res.result = true;
      end();
    });

    engine.push(subengine.asMiddleware());
    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeDefined();
        expect((err as any).message).toStrictEqual('foo');
        expect(isJsonRpcSuccess(res)).toBe(false);
        resolve();
      });
    });
  });
});
