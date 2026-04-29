import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import {
  assertIsJsonRpcFailure,
  assertIsJsonRpcSuccess,
  Json,
  JsonRpcParams,
  JsonRpcRequest,
} from '@metamask/utils';

import {
  MethodHandler,
  MethodHandlerImplementation,
  createMethodMiddleware,
} from './createMethodMiddleware';
import { JsonRpcEngine, JsonRpcMiddleware } from './JsonRpcEngine';

type AllHooks = {
  hook1: () => number;
  hook2: () => number;
};

const getDefaultHooks = (): AllHooks => ({
  hook1: () => 42,
  hook2: () => 99,
});

const makeHandler = <Hooks extends Record<string, unknown>>(
  implementation: MethodHandlerImplementation<Hooks>,
  hookNames: { [Name in keyof Hooks]: true },
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) => ({ implementation, hookNames });

const method1 = 'method1';

const baseRequest = {
  jsonrpc: '2.0' as const,
  id: 1,
  method: method1,
};

describe('createMethodMiddleware', () => {
  it('calls the handler for the matching method (uses hook1)', async () => {
    const handler = makeHandler<AllHooks>(
      (_req, res, _next, end, hooks) => {
        res.result = hooks.hook1();
        return end();
      },
      { hook1: true, hook2: true },
    );

    const middleware = createMethodMiddleware({
      handlers: { method1: handler, method2: handler },
      hooks: getDefaultHooks(),
    });
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle(baseRequest);
    assertIsJsonRpcSuccess(response);

    expect(response.result).toBe(42);
  });

  it('calls the handler for the matching method (uses hook2)', async () => {
    const handler = makeHandler<AllHooks>(
      (_req, res, _next, end, hooks) => {
        res.result = hooks.hook2();
        return end();
      },
      { hook1: true, hook2: true },
    );

    const middleware = createMethodMiddleware({
      handlers: { method1: handler, method2: handler },
      hooks: getDefaultHooks(),
    });
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle(baseRequest);
    assertIsJsonRpcSuccess(response);

    expect(response.result).toBe(99);
  });

  it('does not call the handler for a non-matching method', async () => {
    const handler = makeHandler<AllHooks>(
      (_req, res, _next, end) => {
        res.result = 'unreachable';
        return end();
      },
      { hook1: true, hook2: true },
    );

    const middleware = createMethodMiddleware({
      handlers: { method1: handler, method2: handler },
      hooks: getDefaultHooks(),
    });
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      ...baseRequest,
      method: 'nonMatchingMethod',
    });
    assertIsJsonRpcFailure(response);

    expect(response.error).toMatchObject({
      message: expect.stringMatching(
        /Response has no error or result for request/u,
      ),
    });
  });

  it('handles errors returned by the implementation', async () => {
    const handler = makeHandler<AllHooks>(
      (_req, _res, _next, end) => end(new Error('test error')),
      { hook1: true, hook2: true },
    );

    const middleware = createMethodMiddleware({
      handlers: { method1: handler, method2: handler },
      hooks: getDefaultHooks(),
    });
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle(baseRequest);
    assertIsJsonRpcFailure(response);

    expect(response.error.message).toBe('test error');
    expect(
      (response.error.data as { cause: { message: string } }).cause.message,
    ).toBe('test error');
  });

  it('handles errors thrown by the implementation', async () => {
    const handler = makeHandler<AllHooks>(
      () => {
        throw new Error('test error');
      },
      { hook1: true, hook2: true },
    );

    const middleware = createMethodMiddleware({
      handlers: { method1: handler, method2: handler },
      hooks: getDefaultHooks(),
    });
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle(baseRequest);
    assertIsJsonRpcFailure(response);

    expect(response.error.message).toBe('test error');
    expect(
      (response.error.data as { cause: { message: string } }).cause.message,
    ).toBe('test error');
  });

  it('handles non-errors thrown by the implementation', async () => {
    const handler = makeHandler<AllHooks>(
      () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'foo';
      },
      { hook1: true, hook2: true },
    );

    const middleware = createMethodMiddleware({
      handlers: { method1: handler, method2: handler },
      hooks: getDefaultHooks(),
    });
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle(baseRequest);
    assertIsJsonRpcFailure(response);

    expect(response.error).toMatchObject({
      message: 'Internal JSON-RPC error.',
      data: 'foo',
    });
  });

  it('invokes onError when a handler throws', async () => {
    const onError = jest.fn();
    const handler = makeHandler<AllHooks>(
      () => {
        throw new Error('test error');
      },
      { hook1: true, hook2: true },
    );

    const middleware = createMethodMiddleware({
      handlers: { method1: handler, method2: handler },
      hooks: getDefaultHooks(),
      onError,
    });
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    await engine.handle(baseRequest);

    expect(onError).toHaveBeenCalledTimes(1);
    const [error, receivedRequest] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('test error');
    expect(receivedRequest).toMatchObject(baseRequest);
  });

  it('works when no hooks are configured', async () => {
    const noDepsHandler = {
      implementation: ((_req, res, _next, end) => {
        res.result = 'no-deps';
        return end();
      }) as JsonRpcMiddleware<JsonRpcRequest, Json>,
    };

    const middleware = createMethodMiddleware({
      handlers: { noDeps: noDepsHandler },
      hooks: {},
    });
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({ ...baseRequest, method: 'noDeps' });
    assertIsJsonRpcSuccess(response);

    expect(response.result).toBe('no-deps');
  });

  it('allows typing non-standard request fields via RequestExtras', async () => {
    const originHandler = {
      implementation: (req, res, _next, end): void => {
        res.result = req.origin ?? 'missing';
        return end();
      },
    } satisfies MethodHandler<
      never,
      never,
      JsonRpcParams,
      Json,
      { origin: string }
    >;

    const middleware = createMethodMiddleware({
      handlers: { reportOrigin: originHandler },
      hooks: {},
    });
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      ...baseRequest,
      method: 'reportOrigin',
      origin: 'https://example.com',
    } as JsonRpcRequest<JsonRpcParams> & { origin: string });
    assertIsJsonRpcSuccess(response);

    expect(response.result).toBe('https://example.com');
  });

  it('throws if handler actionNames are configured without a messenger', () => {
    const actionHandler = {
      implementation: (() => undefined) as JsonRpcMiddleware<
        JsonRpcRequest,
        Json
      >,
      actionNames: ['Example:TestAction'] as const,
    };

    expect(() =>
      createMethodMiddleware({
        handlers: { callAction: actionHandler },
        hooks: {},
      }),
    ).toThrow('A messenger is required when a handler declares actionNames.');
  });

  it('passes a delegated messenger to the handler', async () => {
    type TestAction = {
      type: 'Example:TestAction';
      handler: () => Promise<string>;
    };

    const messengerHandler = {
      implementation: async (
        _req,
        res,
        _next,
        end,
        _hooks,
        messenger,
      ): Promise<void> => {
        res.result = await messenger.call('Example:TestAction');
        return end();
      },
      actionNames: ['Example:TestAction'] as const,
    } satisfies MethodHandler<never, TestAction>;

    const rootMessenger = new Messenger<string, TestAction>({
      namespace: MOCK_ANY_NAMESPACE,
    });
    rootMessenger.registerActionHandler(
      'Example:TestAction',
      async () => 'action-result',
    );

    const middleware = createMethodMiddleware({
      handlers: { callAction: messengerHandler },
      messenger: rootMessenger,
      hooks: {},
    });
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      ...baseRequest,
      method: 'callAction',
    });
    assertIsJsonRpcSuccess(response);

    expect(response.result).toBe('action-result');
  });

  it('throws an error if a required hook is missing', () => {
    const handler = makeHandler<AllHooks>((_req, _res, _next, end) => end(), {
      hook1: true,
      hook2: true,
    });
    const hooks = { hook1: (): number => 42 };

    expect(() =>
      createMethodMiddleware({
        handlers: { method1: handler, method2: handler },
        // @ts-expect-error Intentionally missing a required hook.
        hooks,
      }),
    ).toThrow('Missing expected hooks');
  });

  it('throws an error if an extraneous hook is provided', () => {
    const handler = makeHandler<AllHooks>((_req, _res, _next, end) => end(), {
      hook1: true,
      hook2: true,
    });
    const hooks = {
      ...getDefaultHooks(),
      extraneousHook: (): number => 100,
    };

    expect(() =>
      createMethodMiddleware({
        handlers: { method1: handler, method2: handler },
        hooks,
      }),
    ).toThrow('Received unexpected hooks');
  });
});
