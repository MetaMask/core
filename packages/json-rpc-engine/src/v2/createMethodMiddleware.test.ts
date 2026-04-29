import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';

import { makeRequest } from '../../tests/utils';
import {
  createMethodMiddleware,
  MethodHandler,
} from './createMethodMiddleware';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import { JsonRpcRequest } from './utils';

type TestAction = {
  type: 'Example:TestAction';
  handler: () => Promise<string>;
};

function setup(): { engine: JsonRpcEngineV2<JsonRpcRequest> } {
  const getValueA = {
    hookNames: { testHook: true },
    implementation: ({ hooks }): Promise<string> => hooks.testHook(),
  } satisfies MethodHandler<{ testHook: () => Promise<string> }>;

  const getValueB = {
    actionNames: ['Example:TestAction'],
    implementation: ({ messenger }): Promise<string> =>
      messenger.call('Example:TestAction'),
  } satisfies MethodHandler<never, TestAction>;

  const messenger = new Messenger<string, TestAction>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  messenger.registerActionHandler('Example:TestAction', async () => 'B');

  const middleware = createMethodMiddleware({
    handlers: { getValueA, getValueB },
    hooks: { testHook: async () => 'A' },
    messenger,
  });

  const engine = JsonRpcEngineV2.create({ middleware: [middleware] });

  return { engine };
}

function setupWithoutMessenger(): { engine: JsonRpcEngineV2<JsonRpcRequest> } {
  const getValueA = {
    hookNames: { testHook: true },
    implementation: ({ hooks }): Promise<string> => hooks.testHook(),
  } satisfies MethodHandler<{ testHook: () => Promise<string> }>;

  const middleware = createMethodMiddleware({
    handlers: { getValueA },
    hooks: { testHook: async () => 'A' },
  });

  const engine = JsonRpcEngineV2.create({ middleware: [middleware] });

  return { engine };
}

describe('createMethodMiddleware', () => {
  it('passes in the requested hooks without a messenger', async () => {
    const { engine } = setupWithoutMessenger();

    const result = await engine.handle(makeRequest({ method: 'getValueA' }));
    expect(result).toBe('A');
  });

  it('passes in a delegated messenger', async () => {
    const { engine } = setup();

    const result = await engine.handle(makeRequest({ method: 'getValueB' }));
    expect(result).toBe('B');
  });

  it('skips unrecognized methods', async () => {
    const { engine } = setup();

    await expect(
      engine.handle(makeRequest({ method: 'getValueC' })),
    ).rejects.toThrow('Nothing ended request');
  });

  it('handles a handler with no hooks or actions', async () => {
    const noDeps = {
      implementation: (): Promise<string> => Promise.resolve('ok'),
    } satisfies MethodHandler;

    const middleware = createMethodMiddleware({
      handlers: { noDeps },
      hooks: {},
    });
    const engine = JsonRpcEngineV2.create({ middleware: [middleware] });

    const result = await engine.handle(makeRequest({ method: 'noDeps' }));
    expect(result).toBe('ok');
  });

  it('propagates errors thrown by the implementation', async () => {
    const failing = {
      implementation: (): Promise<string> => {
        throw new Error('test error');
      },
    } satisfies MethodHandler;

    const middleware = createMethodMiddleware({
      handlers: { failing },
      hooks: {},
    });
    const engine = JsonRpcEngineV2.create({ middleware: [middleware] });

    await expect(
      engine.handle(makeRequest({ method: 'failing' })),
    ).rejects.toThrow('test error');
  });

  it('throws if handler actionNames are configured without a messenger', () => {
    const getValueB = {
      actionNames: ['Example:TestAction'],
      implementation: (): Promise<string> => Promise.resolve('B'),
    } satisfies MethodHandler<never, TestAction>;

    expect(() =>
      createMethodMiddleware({
        handlers: { getValueB },
        hooks: {},
      }),
    ).toThrow('A messenger is required when a handler declares actionNames.');
  });

  it('throws if a required hook is missing', () => {
    const getValueA = {
      hookNames: { testHook: true },
      implementation: ({ hooks }): Promise<string> => hooks.testHook(),
    } satisfies MethodHandler<{ testHook: () => Promise<string> }>;

    expect(() =>
      createMethodMiddleware({
        handlers: { getValueA },
        // @ts-expect-error Intentionally missing a required hook.
        hooks: {},
      }),
    ).toThrow('Missing expected hooks');
  });

  it('throws if an extraneous hook is provided', () => {
    const getValueA = {
      hookNames: { testHook: true },
      implementation: ({ hooks }): Promise<string> => hooks.testHook(),
    } satisfies MethodHandler<{ testHook: () => Promise<string> }>;

    const hooks = {
      testHook: async (): Promise<string> => 'A',
      extraneousHook: (): number => 100,
    };

    expect(() =>
      createMethodMiddleware({
        handlers: { getValueA },
        hooks,
      }),
    ).toThrow('Received unexpected hooks');
  });
});
