import { describe, test } from 'vitest';

import { Messenger } from './Messenger.js';

describe('Messenger', () => {
  describe('delegateAll', () => {
    type ActionA = { type: 'A:getValue'; handler: () => number };
    type ActionB = { type: 'B:getName'; handler: () => string };
    type ChildOwnAction = { type: 'Child:doStuff'; handler: () => void };
    type EventA = {
      type: 'A:stateChange';
      payload: [{ value: number }];
    };
    type EventB = {
      type: 'B:nameChange';
      payload: [{ name: string }];
    };

    test('accepts a complete list of external actions and events', () => {
      const source = new Messenger<
        'Source',
        ActionA | ActionB | ChildOwnAction,
        EventA | EventB
      >({ namespace: 'Source' });
      const child = new Messenger<
        'Child',
        ActionA | ActionB | ChildOwnAction,
        EventA | EventB
      >({ namespace: 'Child' });

      // We purposely make no assertions here;
      // this test file will fail if there are type errors.
      source.delegateAll({
        messenger: child,
        actions: ['A:getValue', 'B:getName'],
        events: ['A:stateChange', 'B:nameChange'],
      });
    });

    test('excludes the delegatee own-namespace actions from the exhaustiveness check', () => {
      const source = new Messenger<'Source', ActionA | ChildOwnAction, never>({
        namespace: 'Source',
      });
      const child = new Messenger<'Child', ActionA | ChildOwnAction, never>({
        namespace: 'Child',
      });

      // We purposely make no assertions here;
      // this test file will fail if there are type errors.
      source.delegateAll({
        messenger: child,
        actions: ['A:getValue'],
        events: [],
      });
    });

    test('raises a type error when an external action is missing', () => {
      const source = new Messenger<'Source', ActionA | ActionB, never>({
        namespace: 'Source',
      });
      const child = new Messenger<'Child', ActionA | ActionB, never>({
        namespace: 'Child',
      });

      source.delegateAll({
        messenger: child,
        // @ts-expect-error The external action `B:getName` is missing.
        actions: ['A:getValue'],
        events: [],
      });
    });

    test('raises a type error when an external event is missing', () => {
      const source = new Messenger<'Source', never, EventA | EventB>({
        namespace: 'Source',
      });
      const child = new Messenger<'Child', never, EventA | EventB>({
        namespace: 'Child',
      });

      source.delegateAll({
        messenger: child,
        actions: [],
        // @ts-expect-error The external event `B:nameChange` is missing.
        events: ['A:stateChange'],
      });
    });

    test('raises a type error when the source cannot provide a required external action', () => {
      const source = new Messenger<'Source', ActionA, never>({
        namespace: 'Source',
      });
      const child = new Messenger<'Child', ActionA | ActionB, never>({
        namespace: 'Child',
      });

      source.delegateAll({
        messenger: child,
        // @ts-expect-error The source cannot provide `B:getName`.
        actions: ['A:getValue'],
        events: [],
      });
    });
  });
});
