import { Messenger } from '@metamask/messenger';

import { createRestrictedMethodMessenger } from './createRestrictedMethodMessenger';

type FooAction = {
  type: 'Foo:ping';
  handler: () => string;
};

type BarAction = {
  type: 'Bar:double';
  handler: (n: number) => number;
};

type RootActions = FooAction | BarAction;

const getRootMessenger = (): Messenger<'Root', RootActions> => {
  const messenger = new Messenger<'Root', RootActions>({ namespace: 'Root' });
  const fooMessenger = new Messenger<'Foo', FooAction, never, typeof messenger>(
    {
      namespace: 'Foo',
      parent: messenger,
    },
  );
  const barMessenger = new Messenger<'Bar', BarAction, never, typeof messenger>(
    {
      namespace: 'Bar',
      parent: messenger,
    },
  );
  fooMessenger.registerActionHandler('Foo:ping', () => 'pong');
  barMessenger.registerActionHandler('Bar:double', (value) => value * 2);
  return messenger;
};

describe('createRestrictedMethodMessenger', () => {
  it('returns undefined when actionNames is omitted', () => {
    const rootMessenger = getRootMessenger();

    expect(
      createRestrictedMethodMessenger({
        rootMessenger,
        namespace: 'wallet_example',
      }),
    ).toBeUndefined();
  });

  it('returns undefined when actionNames is empty', () => {
    const rootMessenger = getRootMessenger();

    expect(
      createRestrictedMethodMessenger({
        rootMessenger,
        namespace: 'wallet_example',
        // @ts-expect-error An empty array is rejected by the type system, but
        // the runtime handles it as a no-op.
        actionNames: [],
      }),
    ).toBeUndefined();
  });

  it('exposes the requested action on the returned messenger', () => {
    const rootMessenger = getRootMessenger();

    const messenger = createRestrictedMethodMessenger({
      rootMessenger,
      namespace: 'wallet_example',
      actionNames: ['Foo:ping'] as const,
    });

    expect(messenger.call('Foo:ping')).toBe('pong');
  });

  it('uses the provided namespace for the returned messenger', () => {
    const rootMessenger = getRootMessenger();

    const messenger = createRestrictedMethodMessenger({
      rootMessenger,
      namespace: 'wallet_example',
      actionNames: ['Foo:ping'] as const,
    });

    // Registering an action under a different namespace must fail with an
    // error that names the messenger's configured namespace.
    expect(() =>
      // @ts-expect-error Deliberately registering outside the child's action
      // surface to probe its namespace.
      messenger.registerActionHandler('Other:noop', () => undefined),
    ).toThrow(/wallet_example/u);
  });

  it('rejects calls to actions that were not requested', () => {
    const rootMessenger = getRootMessenger();

    const messenger = createRestrictedMethodMessenger({
      rootMessenger,
      namespace: 'wallet_example',
      actionNames: ['Foo:ping'] as const,
    });

    expect(() =>
      // @ts-expect-error Intentionally calling an undelegated action.
      messenger.call('Bar:double', 2),
    ).toThrow(/Bar:double/u);
  });

  it('exposes every requested action when multiple are delegated', () => {
    const rootMessenger = getRootMessenger();

    const messenger = createRestrictedMethodMessenger({
      rootMessenger,
      namespace: 'wallet_example',
      actionNames: ['Foo:ping', 'Bar:double'] as const,
    });

    expect(messenger.call('Foo:ping')).toBe('pong');
    expect(messenger.call('Bar:double', 3)).toBe(6);
  });
});
