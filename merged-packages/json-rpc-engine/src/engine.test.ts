import {
  assertIsJsonRpcSuccess,
  assertIsJsonRpcFailure,
  isJsonRpcFailure,
  isJsonRpcSuccess,
} from '@metamask/utils';
import { ethErrors } from 'eth-rpc-errors';
import { JsonRpcEngine } from '.';

const jsonrpc = '2.0' as const;

describe('JsonRpcEngine', () => {
  it('handle: throws on truthy, non-function callback', () => {
    const engine: any = new JsonRpcEngine();
    expect(() => engine.handle({}, true)).toThrow(
      '"callback" must be a function if provided.',
    );
  });

  it('handle: returns error for invalid request parameter', async () => {
    const engine = new JsonRpcEngine();
    let response: any = await engine.handle(null as any);
    expect(response.error.code).toStrictEqual(-32600);
    expect(response.result).toBeUndefined();

    response = await engine.handle(true as any);
    expect(response.error.code).toStrictEqual(-32600);
    expect(response.result).toBeUndefined();
  });

  it('handle: returns error for invalid request method', async () => {
    const engine = new JsonRpcEngine();
    let response: any = await engine.handle({ method: null } as any);
    expect(response.error.code).toStrictEqual(-32600);
    expect(response.result).toBeUndefined();

    response = await engine.handle({ method: true } as any);
    expect(response.error.code).toStrictEqual(-32600);
    expect(response.result).toBeUndefined();
  });

  it('handle: basic middleware test 1', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, _next, end) {
      res.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual(42);
        resolve();
      });
    });
  });

  it('handle: basic middleware test 2', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (req, res, _next, end) {
      req.method = 'banana';
      res.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual(42);
        expect(payload.method).toStrictEqual('hello');
        resolve();
      });
    });
  });

  it('handle (async): basic middleware test', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, _next, end) {
      res.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    const res = await engine.handle(payload);
    assertIsJsonRpcSuccess(res);
    expect(res.result).toStrictEqual(42);
  });

  it('allow null result', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, _next, end) {
      res.result = null;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toBeNull();
        resolve();
      });
    });
  });

  it('interacting middleware test', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (req: any, _res, next, _end) {
      req.resultShouldBe = 42;
      next();
    });

    engine.push(function (req: any, res, _next, end) {
      res.result = req.resultShouldBe;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual(42);
        resolve();
      });
    });
  });

  it('middleware ending request before all middlewares applied', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, _next, end) {
      res.result = 42;
      end();
    });

    engine.push(function (_req, _res, _next, _end) {
      throw new Error('Test should have ended already.');
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeNull();
        assertIsJsonRpcSuccess(res);
        expect(res.result).toStrictEqual(42);
        resolve();
      });
    });
  });

  it('erroring middleware test: end(error)', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, _res, _next, end) {
      end(new Error('no bueno'));
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeDefined();
        expect(res).toBeDefined();
        assertIsJsonRpcFailure(res);
        expect(isJsonRpcSuccess(res)).toBe(false);
        resolve();
      });
    });
  });

  it('erroring middleware test: res.error -> next()', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, next, _end) {
      res.error = ethErrors.rpc.internal({ message: 'foobar' });
      next();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeDefined();
        expect(res).toBeDefined();
        assertIsJsonRpcFailure(res);
        expect(isJsonRpcSuccess(res)).toBe(false);
        resolve();
      });
    });
  });

  it('erroring middleware test: res.error -> end()', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, _next, end) {
      res.error = ethErrors.rpc.internal({ message: 'foobar' });
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeDefined();
        expect(res).toBeDefined();
        expect(isJsonRpcFailure(res)).toBe(true);
        expect(isJsonRpcSuccess(res)).toBe(false);
        resolve();
      });
    });
  });

  it('erroring middleware test: non-function passsed to next()', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, _res, next, _end) {
      next(true as any);
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res) {
        expect(err).toBeDefined();
        expect(res).toBeDefined();
        assertIsJsonRpcFailure(res);
        expect(res.error.code).toStrictEqual(-32603);
        expect(
          res.error.message.startsWith(
            'JsonRpcEngine: "next" return handlers must be functions.',
          ),
        ).toBe(true);
        expect(isJsonRpcSuccess(res)).toBe(false);
        resolve();
      });
    });
  });

  it('empty middleware test', async () => {
    const engine = new JsonRpcEngine();

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, _res) {
        expect(err).toBeDefined();
        resolve();
      });
    });
  });

  it('handle: batch payloads', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (req, res, _next, end) {
      if (req.id === 4) {
        delete res.result;
        res.error = ethErrors.rpc.internal({ message: 'foobar' });
        return end(res.error);
      }
      res.result = req.id;
      return end();
    });

    const payloadA = { id: 1, jsonrpc, method: 'hello' };
    const payloadB = { id: 2, jsonrpc, method: 'hello' };
    const payloadC = { id: 3, jsonrpc, method: 'hello' };
    const payloadD = { id: 4, jsonrpc, method: 'hello' };
    const payloadE = { id: 5, jsonrpc, method: 'hello' };
    const payload = [payloadA, payloadB, payloadC, payloadD, payloadE];

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res: any) {
        expect(err).toBeNull();
        expect(res).toBeInstanceOf(Array);
        expect(res[0].result).toStrictEqual(1);
        expect(res[1].result).toStrictEqual(2);
        expect(res[2].result).toStrictEqual(3);
        expect(isJsonRpcSuccess(res[3])).toBe(false);
        expect(res[3].error.code).toStrictEqual(-32603);
        expect(res[4].result).toStrictEqual(5);
        resolve();
      });
    });
  });

  it('handle: batch payloads (async signature)', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (req, res, _next, end) {
      if (req.id === 4) {
        delete res.result;
        res.error = ethErrors.rpc.internal({ message: 'foobar' });
        return end(res.error);
      }
      res.result = req.id;
      return end();
    });

    const payloadA = { id: 1, jsonrpc, method: 'hello' };
    const payloadB = { id: 2, jsonrpc, method: 'hello' };
    const payloadC = { id: 3, jsonrpc, method: 'hello' };
    const payloadD = { id: 4, jsonrpc, method: 'hello' };
    const payloadE = { id: 5, jsonrpc, method: 'hello' };
    const payload = [payloadA, payloadB, payloadC, payloadD, payloadE];

    const res: any = await engine.handle(payload);
    expect(res).toBeInstanceOf(Array);
    expect(res[0].result).toStrictEqual(1);
    expect(res[1].result).toStrictEqual(2);
    expect(res[2].result).toStrictEqual(3);
    expect(isJsonRpcSuccess(res[3])).toBe(false);
    expect(res[3].error.code).toStrictEqual(-32603);
    expect(res[4].result).toStrictEqual(5);
  });

  it('handle: batch payload with bad request object', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (req, res, _next, end) {
      res.result = req.id;
      return end();
    });

    const payloadA = { id: 1, jsonrpc, method: 'hello' };
    const payloadB = true;
    const payloadC = { id: 3, jsonrpc, method: 'hello' };
    const payload = [payloadA, payloadB, payloadC];

    const res: any = await engine.handle(payload as any);
    expect(res).toBeInstanceOf(Array);
    expect(res[0].result).toStrictEqual(1);
    expect(isJsonRpcSuccess(res[1])).toBe(false);
    expect(res[1].error.code).toStrictEqual(-32600);
    expect(res[2].result).toStrictEqual(3);
  });

  it('basic notifications', async () => {
    const engine = new JsonRpcEngine();

    await new Promise<void>((resolve) => {
      engine.once('notification', (notif) => {
        expect(notif.method).toStrictEqual('test_notif');
        resolve();
      });
      engine.emit('notification', { jsonrpc, method: 'test_notif' });
    });
  });

  it('return handlers test', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res: any, next, _end) {
      next(function (cb) {
        res.sawReturnHandler = true;
        cb();
      });
    });

    engine.push(function (_req, res, _next, end) {
      res.result = true;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, res: any) {
        expect(err).toBeNull();
        expect(res).toBeDefined();
        expect(res.sawReturnHandler).toBe(true);
        resolve();
      });
    });
  });

  it('return order of events', async () => {
    const engine = new JsonRpcEngine();

    const events: string[] = [];

    engine.push(function (_req, _res, next, _end) {
      events.push('1-next');
      next(function (cb) {
        events.push('1-return');
        cb();
      });
    });

    engine.push(function (_req, _res, next, _end) {
      events.push('2-next');
      next(function (cb) {
        events.push('2-return');
        cb();
      });
    });

    engine.push(function (_req, res, _next, end) {
      events.push('3-end');
      res.result = true;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, function (err, _res) {
        expect(err).toBeNull();
        expect(events[0]).toStrictEqual('1-next');
        expect(events[1]).toStrictEqual('2-next');
        expect(events[2]).toStrictEqual('3-end');
        expect(events[3]).toStrictEqual('2-return');
        expect(events[4]).toStrictEqual('1-return');
        resolve();
      });
    });
  });

  it('calls back next handler even if error', async () => {
    const engine = new JsonRpcEngine();

    let sawNextReturnHandlerCalled = false;

    engine.push(function (_req, _res, next, _end) {
      next(function (cb) {
        sawNextReturnHandlerCalled = true;
        cb();
      });
    });

    engine.push(function (_req, _res, _next, end) {
      end(new Error('boom'));
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, (err, _res) => {
        expect(err).toBeDefined();
        expect(sawNextReturnHandlerCalled).toBe(true);
        resolve();
      });
    });
  });

  it('handles error in next handler', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, _res, next, _end) {
      next(function (_cb) {
        throw new Error('foo');
      });
    });

    engine.push(function (_req, res, _next, end) {
      res.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, (err: any, _res) => {
        expect(err).toBeDefined();
        expect(err.message).toStrictEqual('foo');
        resolve();
      });
    });
  });

  it('handles failure to end request', async () => {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, next, _end) {
      res.result = 42;
      next();
    });

    const payload = { id: 1, jsonrpc, method: 'hello' };

    await new Promise<void>((resolve) => {
      engine.handle(payload, (err: any, res) => {
        expect(
          err.message.startsWith('JsonRpcEngine: Nothing ended request:'),
        ).toBe(true);
        expect(isJsonRpcSuccess(res)).toBe(false);
        resolve();
      });
    });
  });

  it('handles batch request processing error', async () => {
    const engine = new JsonRpcEngine();
    jest
      .spyOn(engine as any, '_promiseHandle')
      .mockRejectedValue(new Error('foo'));

    await new Promise<void>((resolve) => {
      engine.handle([{}] as any, (err: any) => {
        expect(err.message).toStrictEqual('foo');
        resolve();
      });
    });
  });

  it('handles batch request processing error (async)', async () => {
    const engine = new JsonRpcEngine();
    jest
      .spyOn(engine as any, '_promiseHandle')
      .mockRejectedValue(new Error('foo'));

    await expect(engine.handle([{}] as any)).rejects.toThrow('foo');
  });
});
