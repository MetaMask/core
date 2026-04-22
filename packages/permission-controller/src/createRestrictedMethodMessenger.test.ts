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
        actionNames: [],
      }),
    ).toBeUndefined();
  });

  it('returns a child messenger that can call the delegated action', () => {
    const rootMessenger = getRootMessenger();

    const messenger = createRestrictedMethodMessenger({
      rootMessenger,
      namespace: 'wallet_example',
      actionNames: ['Foo:ping'] as const,
    });

    expect(messenger).toBeDefined();
    expect(messenger?.call('Foo:ping')).toBe('pong');
  });

  it('does not delegate actions that were not requested', () => {
    const rootMessenger = getRootMessenger();

    const messenger = createRestrictedMethodMessenger({
      rootMessenger,
      namespace: 'wallet_example',
      actionNames: ['Foo:ping'] as const,
    });

    expect(() =>
      // @ts-expect-error Intentionally calling an undelegated action.
      messenger?.call('Bar:double', 2),
    ).toThrow('A handler for Bar:double has not been registered');
  });

  it('delegates multiple actions when requested', () => {
    const rootMessenger = getRootMessenger();

    const messenger = createRestrictedMethodMessenger({
      rootMessenger,
      namespace: 'wallet_example',
      actionNames: ['Foo:ping', 'Bar:double'] as const,
    });

    expect(messenger?.call('Foo:ping')).toBe('pong');
    expect(messenger?.call('Bar:double', 3)).toBe(6);
  });
});
