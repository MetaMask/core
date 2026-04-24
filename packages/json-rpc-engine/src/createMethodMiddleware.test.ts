import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import {
  assertIsJsonRpcFailure,
  assertIsJsonRpcSuccess,
} from '@metamask/utils';

import { JsonRpcEngine, createMethodMiddlewareFactory } from '.';
import type { MethodHandler } from './createMethodMiddleware';

type Hooks = {
  hook1: () => number;
  hook2: () => number;
};

const getHandler = (): MethodHandler<Hooks> => ({
  implementation: (req, res, _next, end, hooks): void => {
    if (Array.isArray(req.params)) {
      switch (req.params[0]) {
        case 1:
          res.result = hooks.hook1();
          break;
        case 2:
          res.result = hooks.hook2();
          break;
        case 3:
          return end(new Error('test error'));
        case 4:
          throw new Error('test error');
        case 5:
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'foo';
        default:
          throw new Error(
            `unexpected param "${JSON.stringify(req.params[0])}"`,
          );
      }
    }
    return end();
  },
  hookNames: { hook1: true, hook2: true },
  methodNames: ['method1', 'method2'],
});

const getDefaultHooks = (): Hooks => ({
  hook1: () => 42,
  hook2: () => 99,
});

const getRootMessenger = (): Messenger<string, never> =>
  new Messenger<string, never>({ namespace: MOCK_ANY_NAMESPACE });

const method1 = 'method1';

describe('createMethodMiddlewareFactory', () => {
  it('throws an error if a required hook is missing', () => {
    const createMiddleware = createMethodMiddlewareFactory([getHandler()], {
      messenger: getRootMessenger(),
    });
    const hooks = { hook1: () => 42 } as unknown as Hooks;

    expect(() => createMiddleware(hooks)).toThrow('Missing expected hooks');
  });

  it('throws an error if an extraneous hook is provided', () => {
    const createMiddleware = createMethodMiddlewareFactory([getHandler()], {
      messenger: getRootMessenger(),
    });
    const hooks = {
      ...getDefaultHooks(),
      extraneousHook: () => 100,
    } as unknown as Hooks;

    expect(() => createMiddleware(hooks)).toThrow('Received unexpected hooks');
  });

  it('calls the handler for the matching method (uses hook1)', async () => {
    const middleware = createMethodMiddlewareFactory([getHandler()], {
      messenger: getRootMessenger(),
    })(getDefaultHooks());
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: method1,
      params: [1],
    });
    assertIsJsonRpcSuccess(response);

    expect(response.result).toBe(42);
  });

  it('calls the handler for the matching method (uses hook2)', async () => {
    const middleware = createMethodMiddlewareFactory([getHandler()], {
      messenger: getRootMessenger(),
    })(getDefaultHooks());
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: method1,
      params: [2],
    });
    assertIsJsonRpcSuccess(response);

    expect(response.result).toBe(99);
  });

  it('does not call the handler for a non-matching method', async () => {
    const middleware = createMethodMiddlewareFactory([getHandler()], {
      messenger: getRootMessenger(),
    })(getDefaultHooks());
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
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
    const middleware = createMethodMiddlewareFactory([getHandler()], {
      messenger: getRootMessenger(),
    })(getDefaultHooks());
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: method1,
      params: [3],
    });
    assertIsJsonRpcFailure(response);

    expect(response.error.message).toBe('test error');
    expect(
      (response.error.data as { cause: { message: string } }).cause.message,
    ).toBe('test error');
  });

  it('handles errors thrown by the implementation', async () => {
    const middleware = createMethodMiddlewareFactory([getHandler()], {
      messenger: getRootMessenger(),
    })(getDefaultHooks());
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: method1,
      params: [4],
    });
    assertIsJsonRpcFailure(response);

    expect(response.error.message).toBe('test error');
    expect(
      (response.error.data as { cause: { message: string } }).cause.message,
    ).toBe('test error');
  });

  it('handles non-errors thrown by the implementation', async () => {
    const middleware = createMethodMiddlewareFactory([getHandler()], {
      messenger: getRootMessenger(),
    })(getDefaultHooks());
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: method1,
      params: [5],
    });
    assertIsJsonRpcFailure(response);

    expect(response.error).toMatchObject({
      message: 'Internal JSON-RPC error.',
      data: 'foo',
    });
  });

  it('invokes onError when a handler throws', async () => {
    const onError = jest.fn();
    const middleware = createMethodMiddlewareFactory([getHandler()], {
      messenger: getRootMessenger(),
      onError,
    })(getDefaultHooks());
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: method1,
      params: [4],
    };
    await engine.handle(request);

    expect(onError).toHaveBeenCalledTimes(1);
    const [error, receivedRequest] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('test error');
    expect(receivedRequest).toMatchObject(request);
  });

  it('works when no hooks and no messenger are configured', async () => {
    const handler: MethodHandler = {
      implementation: (_req, res, _next, end) => {
        res.result = 'no-deps';
        return end();
      },
      methodNames: ['noDeps'],
    };

    const middleware = createMethodMiddlewareFactory([handler])();
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'noDeps',
    });
    assertIsJsonRpcSuccess(response);

    expect(response.result).toBe('no-deps');
  });

  it('passes a delegated messenger to the handler', async () => {
    type TestAction = {
      type: 'Example:TestAction';
      handler: () => Promise<string>;
    };

    const handler: MethodHandler<never, TestAction> = {
      implementation: async (_req, res, _next, end, _hooks, messenger) => {
        res.result = await messenger.call('Example:TestAction');
        return end();
      },
      methodNames: ['callAction'],
      actionNames: ['Example:TestAction'],
    };

    const rootMessenger = new Messenger<string, TestAction>({
      namespace: MOCK_ANY_NAMESPACE,
    });
    rootMessenger.registerActionHandler(
      'Example:TestAction',
      async () => 'action-result',
    );

    const middleware = createMethodMiddlewareFactory([handler], {
      messenger: rootMessenger,
    })();
    const engine = new JsonRpcEngine();
    engine.push(middleware);

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'callAction',
    });
    assertIsJsonRpcSuccess(response);

    expect(response.result).toBe('action-result');
  });
});
