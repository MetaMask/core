import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import { JsonRpcParams } from '@metamask/utils';

import { makeRequest } from '../../tests/utils';
import {
  createMethodMiddleware,
  MethodHandler,
} from './createMethodMiddleware';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';

type TestAction = {
  type: 'Example:TestAction';
  handler: () => Promise<string>;
};

const getValueA = {
  hookNames: { testHook: true },
  implementation: ({ hooks }) => hooks.testHook(),
} satisfies MethodHandler<{ testHook: () => Promise<string> }>;

const getValueB = {
  actionNames: ['Example:TestAction'],
  implementation: ({ messenger }) => messenger.call('Example:TestAction'),
} satisfies MethodHandler<never, JsonRpcParams, TestAction>;

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

describe('createMethodMiddleware', () => {
  it('passes in the requested hooks', async () => {
    const result = await engine.handle(makeRequest({ method: 'getValueA' }));
    expect(result).toBe('A');
  });

  it('passes in a delegated messenger', async () => {
    const result = await engine.handle(makeRequest({ method: 'getValueB' }));
    expect(result).toBe('B');
  });

  it('skips unrecognized methods', async () => {
    await expect(
      engine.handle(makeRequest({ method: 'getValueC' })),
    ).rejects.toThrow('Nothing ended request');
  });
});
