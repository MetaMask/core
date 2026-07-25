import { describe, expect, test } from 'tstyche';

import { Messenger } from './Messenger.js';

describe('Messenger.delegateAll', () => {
  type ActionA = { type: 'A:getValue'; handler: () => number };
  type ActionB = { type: 'B:getName'; handler: () => string };
  type ChildOwnAction = { type: 'Child:doStuff'; handler: () => void };
  type SourceEvent = {
    type: 'Source:stateChange';
    payload: [{ value: number }];
  };

  test('accepts a complete list of external actions and events', () => {
    const source = new Messenger<
      'Source',
      ActionA | ActionB | ChildOwnAction,
      SourceEvent
    >({ namespace: 'Source' });
    const child = new Messenger<
      'Child',
      ActionA | ActionB | ChildOwnAction,
      SourceEvent
    >({ namespace: 'Child' });

    expect(
      source.delegateAll({
        messenger: child,
        actions: ['A:getValue', 'B:getName'],
        events: ['Source:stateChange'],
      }),
    ).type.not.toRaiseError();
  });

  test('excludes the delegatee own-namespace actions from the exhaustiveness check', () => {
    const source = new Messenger<'Source', ActionA | ChildOwnAction, never>({
      namespace: 'Source',
    });
    const child = new Messenger<'Child', ActionA | ChildOwnAction, never>({
      namespace: 'Child',
    });

    expect(
      source.delegateAll({
        messenger: child,
        actions: ['A:getValue'],
        events: [],
      }),
    ).type.not.toRaiseError();
  });

  test('raises a type error when an external action is missing', () => {
    const source = new Messenger<'Source', ActionA | ActionB, never>({
      namespace: 'Source',
    });
    const child = new Messenger<'Child', ActionA | ActionB, never>({
      namespace: 'Child',
    });

    expect(
      source.delegateAll({
        messenger: child,
        actions: ['A:getValue'],
        events: [],
      }),
    ).type.toRaiseError();
  });
});
