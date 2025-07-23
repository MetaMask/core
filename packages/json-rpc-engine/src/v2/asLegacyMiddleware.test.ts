import type {
  Json,
  JsonRpcFailure,
  JsonRpcRequest,
  JsonRpcSuccess,
} from '@metamask/utils';

import { asLegacyMiddleware } from './asLegacyMiddleware';
import type { JsonRpcMiddleware } from './JsonRpcEngineV2';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import { getExtraneousKeys, makeRequest } from '../../tests/utils';
import { JsonRpcEngine } from '../JsonRpcEngine';

describe('asLegacyMiddleware', () => {
  it('converts a v2 engine to a legacy middleware', () => {
    const engine = new JsonRpcEngineV2<JsonRpcRequest, Json>({
      middleware: [() => null],
    });
    const middleware = asLegacyMiddleware(engine);
    expect(typeof middleware).toBe('function');
  });

  it('forwards a result to the legacy engine', async () => {
    const v2Engine = new JsonRpcEngineV2<JsonRpcRequest, Json>({
      middleware: [() => null],
    });

    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push(asLegacyMiddleware(v2Engine));

    const response = (await legacyEngine.handle(
      makeRequest(),
    )) as JsonRpcSuccess;

    expect(response.result).toBeNull();
  });

  it('forwards an error to the legacy engine', async () => {
    const v2Engine = new JsonRpcEngineV2<JsonRpcRequest, Json>({
      middleware: [
        () => {
          throw new Error('test');
        },
      ],
    });

    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push(asLegacyMiddleware(v2Engine));

    const response = (await legacyEngine.handle(
      makeRequest(),
    )) as JsonRpcFailure;

    expect(response.error).toStrictEqual({
      message: 'test',
      code: -32603,
      data: {
        cause: {
          message: 'test',
          stack: expect.any(String),
        },
      },
    });
  });

  it('allows the legacy engine to continue when not ending the request', async () => {
    const v2Middleware = jest.fn(({ next }) => next());
    const v2Engine = new JsonRpcEngineV2<JsonRpcRequest, Json>({
      middleware: [v2Middleware],
    });

    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push(asLegacyMiddleware(v2Engine));
    legacyEngine.push((_req, res, _next, end) => {
      res.result = null;
      end();
    });

    const response = (await legacyEngine.handle(
      makeRequest(),
    )) as JsonRpcSuccess;
    expect(response.result).toBeNull();
    expect(v2Middleware).toHaveBeenCalledTimes(1);
  });

  it('allows the legacy engine to continue when not ending the request (passing through the original request)', async () => {
    const v2Middleware = jest.fn(({ request, next }) => next(request));
    const v2Engine = new JsonRpcEngineV2<JsonRpcRequest, Json>({
      middleware: [v2Middleware],
    });

    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push(asLegacyMiddleware(v2Engine));
    legacyEngine.push((_req, res, _next, end) => {
      res.result = null;
      end();
    });

    const response = (await legacyEngine.handle(
      makeRequest(),
    )) as JsonRpcSuccess;
    expect(response.result).toBeNull();
    expect(v2Middleware).toHaveBeenCalledTimes(1);
  });

  it('propagates request modifications to the legacy engine', async () => {
    const v2Engine = new JsonRpcEngineV2<JsonRpcRequest, Json>({
      middleware: [
        ({ request, next }) => next({ ...request, method: 'test_request_2' }),
      ],
    });

    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push(asLegacyMiddleware(v2Engine));
    legacyEngine.push((req, res, _next, end) => {
      res.result = null;

      expect(req.method).toBe('test_request_2');

      end();
    });

    const response = (await legacyEngine.handle(
      makeRequest(),
    )) as JsonRpcSuccess;
    expect(response.result).toBeNull();
  });

  it('propagates additional request properties to the v2 context and back', async () => {
    const observedContextValues: number[] = [];

    const v2Middleware = jest.fn((({ context, next }) => {
      observedContextValues.push(context.assertGet<number>('value'));

      expect(Array.from(context.keys())).toStrictEqual(['value']);

      context.set('value', 2);
      return next();
    }) as JsonRpcMiddleware<JsonRpcRequest, Json>);

    const v2Engine = new JsonRpcEngineV2<JsonRpcRequest, Json>({
      middleware: [v2Middleware],
    });

    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push((req, _res, next, _end) => {
      (req as Record<string, unknown>).value = 1;
      return next();
    });
    legacyEngine.push(asLegacyMiddleware(v2Engine));
    legacyEngine.push((req, res, _next, end) => {
      observedContextValues.push(
        (req as Record<string, unknown>).value as number,
      );

      expect(getExtraneousKeys(req)).toStrictEqual(['value']);

      res.result = null;
      end();
    });

    await legacyEngine.handle(makeRequest());
    expect(observedContextValues).toStrictEqual([1, 2]);
  });
});
