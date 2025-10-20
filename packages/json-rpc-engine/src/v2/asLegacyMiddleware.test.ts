import type {
  JsonRpcFailure,
  JsonRpcRequest,
  JsonRpcSuccess,
} from '@metamask/utils';

import { asLegacyMiddleware } from './asLegacyMiddleware';
import type { JsonRpcMiddleware, ResultConstraint } from './JsonRpcEngineV2';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import type { MiddlewareContext } from './MiddlewareContext';
import { getExtraneousKeys, makeRequest } from '../../tests/utils';
import { JsonRpcEngine } from '../JsonRpcEngine';

const makeNullMiddleware = (): JsonRpcMiddleware<JsonRpcRequest> => {
  return () => null;
};

describe('asLegacyMiddleware', () => {
  it('converts a v2 engine to a legacy middleware', () => {
    const engine = JsonRpcEngineV2.create({
      middleware: [makeNullMiddleware()],
    });
    const middleware = asLegacyMiddleware(engine);
    expect(typeof middleware).toBe('function');
  });

  it('forwards a result to the legacy engine', async () => {
    const v2Engine = JsonRpcEngineV2.create({
      middleware: [makeNullMiddleware()],
    });

    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push(asLegacyMiddleware(v2Engine));

    const response = (await legacyEngine.handle(
      makeRequest(),
    )) as JsonRpcSuccess;

    expect(response.result).toBeNull();
  });

  it('forwarded results are not frozen', async () => {
    const v2Middleware: JsonRpcMiddleware<JsonRpcRequest> = () => [];
    const v2Engine = JsonRpcEngineV2.create({
      middleware: [v2Middleware],
    });

    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push(asLegacyMiddleware(v2Engine));

    const response = (await legacyEngine.handle(
      makeRequest(),
    )) as JsonRpcSuccess;

    expect(response.result).toStrictEqual([]);
    expect(Object.isFrozen(response.result)).toBe(false);
  });

  it('forwards an error to the legacy engine', async () => {
    const v2Middleware: JsonRpcMiddleware<JsonRpcRequest> = () => {
      throw new Error('test');
    };
    const v2Engine = JsonRpcEngineV2.create({
      middleware: [v2Middleware],
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
    const v2Middleware: JsonRpcMiddleware<JsonRpcRequest> = jest.fn(
      ({ next }) => next(),
    );
    const v2Engine = JsonRpcEngineV2.create({
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
    const v2Middleware: JsonRpcMiddleware<JsonRpcRequest> = jest.fn(
      ({ request, next }) => next(request),
    );
    const v2Engine = JsonRpcEngineV2.create({
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
    const v2Engine = JsonRpcEngineV2.create({
      middleware: [
        ({ request, next }) => next({ ...request, method: 'test_request_2' }),
      ],
    });

    const legacyEngine = new JsonRpcEngine();
    legacyEngine.push((req, _res, next, _end) => {
      expect(req.method).toBe('test_request');
      next();
    });
    legacyEngine.push(asLegacyMiddleware(v2Engine));
    legacyEngine.push((req, res, _next, end) => {
      expect(req.method).toBe('test_request_2');
      res.result = null;
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
      observedContextValues.push(context.assertGet('value'));

      expect(Array.from(context.keys())).toStrictEqual(['value']);

      context.set('newValue', 2);
      return next();
    }) satisfies JsonRpcMiddleware<
      JsonRpcRequest,
      ResultConstraint<JsonRpcRequest>,
      MiddlewareContext<Record<string, number>>
    >);

    const v2Engine = JsonRpcEngineV2.create({
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
        (req as Record<string, unknown>).newValue as number,
      );

      expect(getExtraneousKeys(req)).toStrictEqual(['value', 'newValue']);

      res.result = null;
      end();
    });

    await legacyEngine.handle(makeRequest());
    expect(observedContextValues).toStrictEqual([1, 2]);
  });
});
