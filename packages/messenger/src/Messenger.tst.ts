import { describe, expect, test } from 'tstyche';

import {
  type ActionConstraint,
  type EventConstraint,
  Messenger,
} from './Messenger';

describe('Messenger', () => {
  describe('Event', () => {
    type EventWithPayload<Payload extends EventConstraint['payload']> = {
      type: 'Example:exampleEvent';
      payload: Payload;
    };

    test('payload is covariant', () => {
      // Events have a covariant payload type. Subtype payloads can be narrower but not wider.
      expect<EventWithPayload<[string]>>().type.toBeAssignableTo<
        EventWithPayload<[string | number]>
      >();
      expect<EventWithPayload<[string | number]>>().type.not.toBeAssignableTo<
        EventWithPayload<[string]>
      >();
    });
  });

  describe('Action', () => {
    type ActionWithHandler<Handler extends ActionConstraint['handler']> = {
      type: 'Example:exampleAction';
      handler: Handler;
    };

    test('handler parameters are contravariant', () => {
      // Actions have contravariant handler parameters types. Subtype handler parameters can be wider but
      // not narrower.
      expect<
        ActionWithHandler<(arg: string | number) => void>
      >().type.toBeAssignableTo<ActionWithHandler<(arg: string) => void>>();
      expect<
        ActionWithHandler<(arg: string) => void>
      >().type.not.toBeAssignableTo<
        ActionWithHandler<(arg: string | number) => void>
      >();
    });

    test('handler returns are covariant', () => {
      // Actions have a covariant handler return types. Subtype handler return types can be narrower but
      // not wider.
      expect<ActionWithHandler<() => string>>().type.toBeAssignableTo<
        ActionWithHandler<() => string | number>
      >();
      expect<
        ActionWithHandler<() => string | number>
      >().type.not.toBeAssignableTo<ActionWithHandler<() => string>>();
    });
  });

  describe('Messenger', () => {
    type MessengerWithEvent<Event extends EventConstraint> = Messenger<
      'ExampleMessenger',
      never,
      Event
    >;

    type ExampleEventA = {
      type: 'A:exampleEventA';
      payload: [string];
    };
    type ExampleEventB = {
      type: 'B:exampleEventB';
      payload: [number];
    };

    test('events are covariant', () => {
      // Messengers have a covariant event type. Subtype events can be narrower but not wider.
      expect<MessengerWithEvent<ExampleEventA>>().type.toBeAssignableTo<
        MessengerWithEvent<ExampleEventA | ExampleEventB>
      >();
      expect<
        MessengerWithEvent<ExampleEventA | ExampleEventB>
      >().type.not.toBeAssignableTo<MessengerWithEvent<ExampleEventA>>();
    });

    type MessengerWithAction<Action extends ActionConstraint> = Messenger<
      'ExampleMessenger',
      Action,
      never
    >;

    type ExampleActionA = {
      type: 'A:exampleActionA';
      handler: (arg: string) => string;
    };
    type ExampleActionB = {
      type: 'B:exampleActionB';
      handler: (arg: number) => number;
    };

    test('actions are covariant', () => {
      // Messengers have a covariant action type. Subtype actions can be narrower but not wider.
      expect<MessengerWithAction<ExampleActionA>>().type.toBeAssignableTo<
        MessengerWithAction<ExampleActionA | ExampleActionB>
      >();
      expect<
        MessengerWithAction<ExampleActionA | ExampleActionB>
      >().type.not.toBeAssignableTo<MessengerWithAction<ExampleActionA>>();
    });

    describe('registerActionHandler', () => {
      test('allows registering action under messenger namespace', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(messengerA.registerActionHandler).type.toBeCallableWith(
          'A:exampleActionA' as const,
          (arg: string) => arg,
        );
      });

      test('does not allow registering action outside messenger namespace', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(messengerA.registerActionHandler).type.not.toBeCallableWith(
          'B:exampleActionB' as const,
          (arg: number) => arg,
        );
      });
    });

    describe('registerMethodActionHandlers', () => {
      test('allows registering action under messenger namespace', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(messengerA.registerMethodActionHandlers).type.toBeCallableWith(
          { name: 'A', exampleActionA: (arg: string) => arg },
          ['exampleActionA'],
        );
      });

      test('does not allow registering action outside messenger namespace', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(
          messengerA.registerMethodActionHandlers,
        ).type.not.toBeCallableWith(
          { name: 'A', exampleActionA: (arg: string) => arg },
          ['exampleActionB'],
        );
      });

      test('does not allow registering methods that do not exist', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(
          messengerA.registerMethodActionHandlers,
        ).type.not.toBeCallableWith({ name: 'A' }, ['exampleActionB']);
      });
    });

    describe('unregisterActionHandler', () => {
      test('allows unregistering action under messenger namespace', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(messengerA.unregisterActionHandler).type.toBeCallableWith(
          'A:exampleActionA' as const,
        );
      });

      test('does not allow unregistering action outside messenger namespace', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(messengerA.unregisterActionHandler).type.not.toBeCallableWith(
          'B:exampleActionB' as const,
        );
      });
    });

    describe('registerInitialEventPayload', () => {
      test('allows registering payload under messenger namespace', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(messengerA.registerInitialEventPayload).type.toBeCallableWith({
          eventType: 'A:exampleEventA',
          getPayload: () => ['foo'],
        });
      });

      test('does not allow registering payload outside messenger namespace', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(
          messengerA.registerInitialEventPayload,
        ).type.not.toBeCallableWith({
          eventType: 'B:exampleEventB',
          getPayload: () => [0],
        });
      });
    });

    describe('publish', () => {
      test('allows publishing event under messenger namespace', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(messengerA.publish).type.toBeCallableWith(
          'A:exampleEventA',
          'foo',
        );
      });

      test('does not allow publishing event outside messenger namespace', () => {
        const messengerA = new Messenger<
          'A',
          ExampleActionA | ExampleActionB | NonDelegatedActionA,
          ExampleEventA | ExampleEventB | NonDelegatedEventA
        >({
          namespace: 'A',
        });

        expect(messengerA.publish).type.not.toBeCallableWith(
          'B:exampleEventB',
          0,
        );
      });
    });

    type NonDelegatedEventA = {
      type: 'A:nonDelegatedEventA';
      payload: ['A', string];
    };
    type NonDelegatedEventB = {
      type: 'B:nonDelegatedEventB';
      payload: ['B', number];
    };
    type NonDelegatedActionA = {
      type: 'A:nonDelegatedActionA';
      handler: (arg1: 'A', arg2: string) => string;
    };
    type NonDelegatedActionB = {
      type: 'B:nonDelegatedActionB';
      handler: (arg1: 'B', arg2: number) => number;
    };

    test('allows delegating to messengers with non-overlapping actions and events', () => {
      const messengerA = new Messenger<
        'A',
        ExampleActionA | ExampleActionB | NonDelegatedActionA,
        ExampleEventA | ExampleEventB | NonDelegatedEventA
      >({
        namespace: 'A',
      });
      const messengerB = new Messenger<
        'B',
        ExampleActionA | ExampleActionB | NonDelegatedActionB,
        ExampleEventA | ExampleEventB | NonDelegatedEventB
      >({
        namespace: 'B',
      });

      expect(messengerA.delegate).type.toBeCallableWith({
        actions: ['A:exampleActionA'],
        events: ['A:exampleEventA'],
        messenger: messengerB,
      });
      expect(messengerB.delegate).type.toBeCallableWith({
        actions: ['B:exampleActionB'],
        events: ['B:exampleEventB'],
        messenger: messengerA,
      });
    });

    test("does not allow delegating an action to a messenger that doesn't support that action", () => {
      const messengerA = new Messenger<
        'A',
        ExampleActionA | NonDelegatedActionA,
        ExampleEventA | NonDelegatedEventA
      >({
        namespace: 'A',
      });
      const messengerB = new Messenger<
        'B',
        ExampleActionB | NonDelegatedActionB,
        ExampleEventB | NonDelegatedEventB
      >({
        namespace: 'B',
      });

      expect(messengerA.delegate).type.not.toBeCallableWith({
        actions: ['A:exampleActionA'],
        messenger: messengerB,
      });
    });

    test("does not allow delegating an event to a messenger that doesn't support that event", () => {
      const messengerA = new Messenger<
        'A',
        ExampleActionA | NonDelegatedActionA,
        ExampleEventA | NonDelegatedEventA
      >({
        namespace: 'A',
      });
      const messengerB = new Messenger<
        'B',
        ExampleActionB | NonDelegatedActionB,
        ExampleEventB | NonDelegatedEventB
      >({
        namespace: 'B',
      });

      expect(messengerA.delegate).type.not.toBeCallableWith({
        events: ['A:exampleEventA'],
        messenger: messengerB,
      });
    });
  });
});
