import { rpcErrors } from '@metamask/rpc-errors';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import { JsonRpcEngine } from '.';
import { asV2Middleware } from './asV2Middleware';
import { JsonRpcEngineV2 } from './v2/JsonRpcEngineV2';
import { getExtraneousKeys, makeRequest } from '../tests/utils';

describe('asV2Middleware', () => {
  it('converts a legacy engine to a v2 middleware', () => {
    const engine = new JsonRpcEngine();
    const middleware = asV2Middleware(engine);
    expect(typeof middleware).toBe('function');
  });

  it('forwards a result to the v2 engine', async () => {
    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push((_req, res, _next, end) => {
      res.result = null;
      end();
    });

    const v2Engine = new JsonRpcEngineV2({
      middleware: [asV2Middleware(legacyEngine)],
    });

    const result = await v2Engine.handle(makeRequest());
    expect(result).toBeNull();
  });

  it('forwards an error to the v2 engine', async () => {
    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push((_req, res, _next, end) => {
      res.error = rpcErrors.internal('test');
      end();
    });

    const v2Engine = new JsonRpcEngineV2({
      middleware: [asV2Middleware(legacyEngine)],
    });

    await expect(v2Engine.handle(makeRequest())).rejects.toThrow(
      rpcErrors.internal('test'),
    );
  });

  it('forwards a serialized error to the v2 engine', async () => {
    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push((_req, res, _next, end) => {
      res.error = { message: 'test', code: 1000 };
      end();
    });

    const v2Engine = new JsonRpcEngineV2({
      middleware: [asV2Middleware(legacyEngine)],
    });

    await expect(v2Engine.handle(makeRequest())).rejects.toThrow(
      new Error('test'),
    );
  });

  it('allows the v2 engine to continue when not ending the request', async () => {
    const legacyEngine = new JsonRpcEngine();
    const legacyMiddleware = jest.fn((_req, _res, next) => {
      next();
    });
    legacyEngine.push(legacyMiddleware);

    const v2Engine = new JsonRpcEngineV2({
      middleware: [asV2Middleware(legacyEngine), () => null],
    });

    const result = await v2Engine.handle(makeRequest());
    expect(result).toBeNull();
    expect(legacyMiddleware).toHaveBeenCalledTimes(1);
  });

  it('propagates the context to the legacy request and back', async () => {
    const observedContextValues: number[] = [];

    const legacyEngine = new JsonRpcEngine();
    const legacyMiddleware = jest.fn((req, _res, next) => {
      observedContextValues.push(req.value);

      expect(getExtraneousKeys(req)).toStrictEqual(['value']);

      req.newValue = 2;
      next();
    });
    legacyEngine.push(legacyMiddleware);

    const v2Engine = new JsonRpcEngineV2<JsonRpcRequest, Json>({
      middleware: [
        ({ context, next }) => {
          context.set('value', 1);
          return next();
        },
        asV2Middleware(legacyEngine),
        ({ context }) => {
          observedContextValues.push(context.assertGet<number>('newValue'));

          expect(Array.from(context.keys())).toStrictEqual([
            'value',
            'newValue',
          ]);

          return null;
        },
      ],
    });

    await v2Engine.handle(makeRequest());
    expect(observedContextValues).toStrictEqual([1, 2]);
  });
});
