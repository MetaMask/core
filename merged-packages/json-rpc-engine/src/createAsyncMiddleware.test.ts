import { assertIsJsonRpcSuccess } from '@metamask/utils';
import { JsonRpcEngine, createAsyncMiddleware } from '.';

const jsonrpc = '2.0' as const;

describe('createAsyncMiddleware', () => {
  it('basic middleware test', async () => {
    const engine = new JsonRpcEngine();

    engine.push(
      createAsyncMiddleware(async (_req, res, _next) => {
        res.result = 42;
      }),
    );

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual(42);
        resolve();
      });
    });
  });

  it('next middleware test', async () => {
    const engine = new JsonRpcEngine();

    engine.push(
      createAsyncMiddleware(async (_req, res, next) => {
        expect(res.result).not.toBeDefined();
        await next(); // eslint-disable-line node/callback-return
        expect(res.result).toStrictEqual(1234);
        // override value
        res.result = 42; // eslint-disable-line require-atomic-updates
      }),
    );

    engine.push(function (_req, res, _next, end) {
      res.result = 1234;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual(42);
        resolve();
      });
    });
  });

  it('basic throw test', async () => {
    const engine = new JsonRpcEngine();

    const error = new Error('bad boy');

    engine.push(
      createAsyncMiddleware(async (_req, _res, _next) => {
        throw error;
      }),
    );

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, _res) {
        expect(err).toBeDefined();
        expect(err).toStrictEqual(error);
        resolve();
      });
    });
  });

  it('throw after next test', async () => {
    const engine = new JsonRpcEngine();

    const error = new Error('bad boy');

    engine.push(
      createAsyncMiddleware(async (_req, _res, next) => {
        await next(); // eslint-disable-line node/callback-return
        throw error;
      }),
    );

    engine.push(function (_req, res, _next, end) {
      res.result = 1234;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, _res) {
        expect(err).toBeDefined();
        expect(err).toStrictEqual(error);
        resolve();
      });
    });
  });

  it("doesn't await next", async () => {
    const engine = new JsonRpcEngine();

    engine.push(
      createAsyncMiddleware(async (_req, _res, next) => {
        next();
      }),
    );

    engine.push(function (_req, res, _next, end) {
      res.result = 1234;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, _res) {
        expect(err).toBeDefined();
        resolve();
      });
    });
  });
});
