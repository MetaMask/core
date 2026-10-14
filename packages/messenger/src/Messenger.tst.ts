import { describe, expect, test } from 'tstyche';

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

      expect(
        source.delegateAll({
          messenger: child,
          actions: ['A:getValue', 'B:getName'],
          events: ['A:stateChange', 'B:nameChange'],
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

    test('raises a type error when an external event is missing', () => {
      const source = new Messenger<'Source', never, EventA | EventB>({
        namespace: 'Source',
      });
      const child = new Messenger<'Child', never, EventA | EventB>({
        namespace: 'Child',
      });

      expect(
        source.delegateAll({
          messenger: child,
          actions: [],
          events: ['A:stateChange'],
        }),
      ).type.toRaiseError();
    });

    test('raises a type error when the source cannot provide a required external action', () => {
      const source = new Messenger<'Source', ActionA, never>({
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
});
