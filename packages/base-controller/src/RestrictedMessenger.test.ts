import * as sinon from 'sinon';

import { Messenger } from './Messenger';
import { RestrictedMessenger } from './RestrictedMessenger';

describe('RestrictedMessenger', () => {
  describe('constructor', () => {
    it('should throw if no messenger is provided', () => {
      expect(
        () =>
          new RestrictedMessenger({
            name: 'Test',
            allowedActions: [],
            allowedEvents: [],
          }),
      ).toThrow('Messenger not provided');
    });

    it('should throw if both controllerMessenger and messenger are provided', () => {
      const messenger = new Messenger<never, never>();

      expect(
        () =>
          new RestrictedMessenger({
            controllerMessenger: messenger,
            messenger,
            name: 'Test',
            allowedActions: [],
            allowedEvents: [],
          }),
      ).toThrow(
        `Both messenger properties provided. Provide message using only 'messenger' option, 'controllerMessenger' is deprecated`,
      );
    });

    it('should accept messenger parameter', () => {
      type CountAction = {
        type: 'CountController:count';
        handler: (increment: number) => void;
      };
      const messenger = new Messenger<CountAction, never>();
      const restrictedMessenger = new RestrictedMessenger<
        'CountController',
        CountAction,
        never,
        never,
        never
      >({
        messenger,
        name: 'CountController',
        allowedActions: [],
        allowedEvents: [],
      });

      let count = 0;
      restrictedMessenger.registerActionHandler(
        'CountController:count',
        (increment: number) => {
          count += increment;
        },
      );
      restrictedMessenger.call('CountController:count', 1);

      expect(count).toBe(1);
    });

    it('should accept controllerMessenger parameter', () => {
      type CountAction = {
        type: 'CountController:count';
        handler: (increment: number) => void;
      };
      const messenger = new Messenger<CountAction, never>();
      const restrictedMessenger = new RestrictedMessenger<
        'CountController',
        CountAction,
        never,
        never,
        never
      >({
        controllerMessenger: messenger,
        name: 'CountController',
        allowedActions: [],
        allowedEvents: [],
      });

      let count = 0;
      restrictedMessenger.registerActionHandler(
        'CountController:count',
        (increment: number) => {
          count += increment;
        },
      );
      restrictedMessenger.call('CountController:count', 1);

      expect(count).toBe(1);
    });
  });

  it('should allow registering and calling an action handler', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const messenger = new Messenger<CountAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    let count = 0;
    restrictedMessenger.registerActionHandler(
      'CountController:count',
      (increment: number) => {
        count += increment;
      },
    );
    restrictedMessenger.call('CountController:count', 1);

    expect(count).toBe(1);
  });

  it('should allow registering and calling multiple different action handlers', () => {
    type MessageAction =
      | { type: 'MessageController:concat'; handler: (message: string) => void }
      | {
          type: 'MessageController:reset';
          handler: (initialMessage: string) => void;
        };
    const messenger = new Messenger<MessageAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    let message = '';
    restrictedMessenger.registerActionHandler(
      'MessageController:reset',
      (initialMessage: string) => {
        message = initialMessage;
      },
    );

    restrictedMessenger.registerActionHandler(
      'MessageController:concat',
      (s: string) => {
        message += s;
      },
    );

    restrictedMessenger.call('MessageController:reset', 'hello');
    restrictedMessenger.call('MessageController:concat', ', world');

    expect(message).toBe('hello, world');
  });

  it('should allow registering and calling an action handler with no parameters', () => {
    type IncrementAction = {
      type: 'CountController:increment';
      handler: () => void;
    };
    const messenger = new Messenger<IncrementAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    let count = 0;
    restrictedMessenger.registerActionHandler(
      'CountController:increment',
      () => {
        count += 1;
      },
    );
    restrictedMessenger.call('CountController:increment');

    expect(count).toBe(1);
  });

  it('should allow registering and calling an action handler with multiple parameters', () => {
    type MessageAction = {
      type: 'MessageController:message';
      handler: (to: string, message: string) => void;
    };
    const messenger = new Messenger<MessageAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const messages: Record<string, string> = {};
    restrictedMessenger.registerActionHandler(
      'MessageController:message',
      (to, message) => {
        messages[to] = message;
      },
    );

    restrictedMessenger.call('MessageController:message', '0x123', 'hello');

    expect(messages['0x123']).toBe('hello');
  });

  it('should allow registering and calling an action handler with a return value', () => {
    type AddAction = {
      type: 'MathController:add';
      handler: (a: number, b: number) => number;
    };
    const messenger = new Messenger<AddAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MathController',
      allowedActions: [],
      allowedEvents: [],
    });

    restrictedMessenger.registerActionHandler('MathController:add', (a, b) => {
      return a + b;
    });
    const result = restrictedMessenger.call('MathController:add', 5, 10);

    expect(result).toBe(15);
  });

  it('should not allow registering multiple action handlers under the same name', () => {
    type CountAction = { type: 'PingController:ping'; handler: () => void };
    const messenger = new Messenger<CountAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'PingController',
      allowedActions: [],
      allowedEvents: [],
    });

    restrictedMessenger.registerActionHandler(
      'PingController:ping',
      () => undefined,
    );

    expect(() => {
      restrictedMessenger.registerActionHandler(
        'PingController:ping',
        () => undefined,
      );
    }).toThrow('A handler for PingController:ping has already been registered');
  });

  it('should throw when registering an external action as an action handler', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const messenger = new Messenger<CountAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      restrictedMessenger.registerActionHandler(
        // @ts-expect-error: suppressing to test runtime error handling
        'OtherController:other',
        () => undefined,
      );
    }).toThrow(
      `Only allowed registering action handlers prefixed by 'CountController:'`,
    );
  });

  it('should throw when publishing an event that is not in the current namespace', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      restrictedMessenger.subscribe(
        // @ts-expect-error: suppressing to test runtime error handling
        'OtherController:other',
        () => undefined,
      );
    }).toThrow(`Event missing from allow list: OtherController:other`);
  });

  it('should throw when publishing an external event', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    type OtherEvent = {
      type: 'OtherController:other';
      payload: [unknown];
    };
    const messenger = new Messenger<never, MessageEvent | OtherEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: ['OtherController:other'],
    });

    expect(() => {
      restrictedMessenger.publish(
        // @ts-expect-error: suppressing to test runtime error handling
        'OtherController:other',
        () => undefined,
      );
    }).toThrow(
      `Only allowed publishing events prefixed by 'MessageController:'`,
    );
  });

  it('should throw when unsubscribing to an event that is not an allowed event', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      restrictedMessenger.unsubscribe(
        // @ts-expect-error: suppressing to test runtime error handling
        'OtherController:other',
        () => undefined,
      );
    }).toThrow(`Event missing from allow list: OtherController:other`);
  });

  it('should throw when clearing the subscription for an external event', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    type OtherEvent = {
      type: 'OtherController:other';
      payload: [unknown];
    };
    const messenger = new Messenger<never, MessageEvent | OtherEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: ['OtherController:other'],
    });

    expect(() => {
      restrictedMessenger.clearEventSubscriptions(
        // @ts-expect-error: suppressing to test runtime error handling
        'OtherController:other',
      );
    }).toThrow(`Only allowed clearing events prefixed by 'MessageController:'`);
  });

  it('should throw when calling an external action that is not an allowed action', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const messenger = new Messenger<CountAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'PingController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      // @ts-expect-error suppressing to test runtime error handling
      restrictedMessenger.call('CountController:count');
    }).toThrow('Action missing from allow list: CountController:count');
  });

  it('should throw when registering an external action handler', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const messenger = new Messenger<CountAction, never>();
    const restrictedMessenger = messenger.getRestricted<
      'PingController',
      CountAction['type']
    >({
      name: 'PingController',
      allowedActions: ['CountController:count'],
      allowedEvents: [],
    });

    expect(() => {
      restrictedMessenger.registerActionHandler(
        // @ts-expect-error suppressing to test runtime error handling
        'CountController:count',
        () => undefined,
      );
    }).toThrow(
      `Only allowed registering action handlers prefixed by 'PingController:'`,
    );
  });

  it('should throw when unregistering an external action handler', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const messenger = new Messenger<CountAction, never>();
    const restrictedMessenger = messenger.getRestricted<
      'PingController',
      CountAction['type']
    >({
      name: 'PingController',
      allowedActions: ['CountController:count'],
      allowedEvents: [],
    });
    expect(() => {
      restrictedMessenger.unregisterActionHandler(
        // @ts-expect-error suppressing to test runtime error handling
        'CountController:count',
      );
    }).toThrow(
      `Only allowed unregistering action handlers prefixed by 'PingController:'`,
    );
  });

  it('should throw when calling unregistered action', () => {
    type PingAction = { type: 'PingController:ping'; handler: () => void };
    const messenger = new Messenger<PingAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'PingController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      restrictedMessenger.call('PingController:ping');
    }).toThrow('A handler for PingController:ping has not been registered');
  });

  it('should throw when calling an action that has been unregistered', () => {
    type PingAction = { type: 'PingController:ping'; handler: () => void };
    const messenger = new Messenger<PingAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'PingController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      restrictedMessenger.call('PingController:ping');
    }).toThrow('A handler for PingController:ping has not been registered');

    let pingCount = 0;
    restrictedMessenger.registerActionHandler('PingController:ping', () => {
      pingCount += 1;
    });

    restrictedMessenger.unregisterActionHandler('PingController:ping');

    expect(() => {
      restrictedMessenger.call('PingController:ping');
    }).toThrow('A handler for PingController:ping has not been registered');
    expect(pingCount).toBe(0);
  });

  it('should throw when registering an initial event payload outside of the namespace', () => {
    type MessageEvent = {
      type: 'OtherController:complexMessage';
      payload: [Record<string, unknown>];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() =>
      restrictedMessenger.registerInitialEventPayload({
        // @ts-expect-error suppressing to test runtime error handling
        eventType: 'OtherController:complexMessage',
        // @ts-expect-error suppressing to test runtime error handling
        getPayload: () => [{}],
      }),
    ).toThrow(
      `Only allowed publishing events prefixed by 'MessageController:'`,
    );
  });

  it('should publish event to subscriber', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedMessenger.subscribe('MessageController:message', handler);
    restrictedMessenger.publish('MessageController:message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  describe('on first state change with an initial payload function registered', () => {
    it('should publish event if selected payload differs', () => {
      const state = {
        propA: 1,
        propB: 1,
      };
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [typeof state];
      };
      const messenger = new Messenger<never, MessageEvent>();
      const restrictedMessenger = messenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
      restrictedMessenger.registerInitialEventPayload({
        eventType: 'MessageController:complexMessage',
        getPayload: () => [state],
      });
      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.propA);
      restrictedMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );

      state.propA += 1;
      restrictedMessenger.publish('MessageController:complexMessage', state);

      expect(handler.getCall(0)?.args).toStrictEqual([2, 1]);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish event if selected payload is the same', () => {
      const state = {
        propA: 1,
        propB: 1,
      };
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [typeof state];
      };
      const messenger = new Messenger<never, MessageEvent>();
      const restrictedMessenger = messenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
      restrictedMessenger.registerInitialEventPayload({
        eventType: 'MessageController:complexMessage',
        getPayload: () => [state],
      });
      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.propA);
      restrictedMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );

      restrictedMessenger.publish('MessageController:complexMessage', state);

      expect(handler.callCount).toBe(0);
    });
  });

  describe('on first state change without an initial payload function registered', () => {
    it('should publish event if selected payload differs', () => {
      const state = {
        propA: 1,
        propB: 1,
      };
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [typeof state];
      };
      const messenger = new Messenger<never, MessageEvent>();
      const restrictedMessenger = messenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.propA);
      restrictedMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );

      state.propA += 1;
      restrictedMessenger.publish('MessageController:complexMessage', state);

      expect(handler.getCall(0)?.args).toStrictEqual([2, undefined]);
      expect(handler.callCount).toBe(1);
    });

    it('should publish event even when selected payload does not change', () => {
      const state = {
        propA: 1,
        propB: 1,
      };
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [typeof state];
      };
      const messenger = new Messenger<never, MessageEvent>();
      const restrictedMessenger = messenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.propA);
      restrictedMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );

      restrictedMessenger.publish('MessageController:complexMessage', state);

      expect(handler.getCall(0)?.args).toStrictEqual([1, undefined]);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish if selector returns undefined', () => {
      const state = {
        propA: undefined,
        propB: 1,
      };
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [typeof state];
      };
      const messenger = new Messenger<never, MessageEvent>();
      const restrictedMessenger = messenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.propA);
      restrictedMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );

      restrictedMessenger.publish('MessageController:complexMessage', state);

      expect(handler.callCount).toBe(0);
    });
  });

  describe('on later state change', () => {
    it('should call selector event handler with previous selector return value', () => {
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [Record<string, unknown>];
      };
      const messenger = new Messenger<never, MessageEvent>();
      const restrictedMessenger = messenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });

      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
      messenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );
      restrictedMessenger.publish('MessageController:complexMessage', {
        prop1: 'a',
        prop2: 'b',
      });
      restrictedMessenger.publish('MessageController:complexMessage', {
        prop1: 'z',
        prop2: 'b',
      });

      expect(handler.getCall(0).calledWithExactly('a', undefined)).toBe(true);
      expect(handler.getCall(1).calledWithExactly('z', 'a')).toBe(true);
      expect(handler.callCount).toBe(2);
    });

    it('should publish event with selector to subscriber', () => {
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [Record<string, unknown>];
      };
      const messenger = new Messenger<never, MessageEvent>();
      const restrictedMessenger = messenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });

      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
      restrictedMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );
      restrictedMessenger.publish('MessageController:complexMessage', {
        prop1: 'a',
        prop2: 'b',
      });

      expect(handler.calledWithExactly('a', undefined)).toBe(true);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish event with selector if selector return value is unchanged', () => {
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [Record<string, unknown>];
      };
      const messenger = new Messenger<never, MessageEvent>();
      const restrictedMessenger = messenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });

      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
      restrictedMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );
      restrictedMessenger.publish('MessageController:complexMessage', {
        prop1: 'a',
        prop2: 'b',
      });
      restrictedMessenger.publish('MessageController:complexMessage', {
        prop1: 'a',
        prop3: 'c',
      });

      expect(handler.calledWithExactly('a', undefined)).toBe(true);
      expect(handler.callCount).toBe(1);
    });
  });

  it('should allow publishing multiple different events to subscriber', () => {
    type MessageEvent =
      | { type: 'MessageController:message'; payload: [string] }
      | { type: 'MessageController:ping'; payload: [] };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const messageHandler = sinon.stub();
    const pingHandler = sinon.stub();
    restrictedMessenger.subscribe('MessageController:message', messageHandler);

    restrictedMessenger.subscribe('MessageController:ping', pingHandler);

    restrictedMessenger.publish('MessageController:message', 'hello');
    restrictedMessenger.publish('MessageController:ping');

    expect(messageHandler.calledWithExactly('hello')).toBe(true);
    expect(messageHandler.callCount).toBe(1);
    expect(pingHandler.calledWithExactly()).toBe(true);
    expect(pingHandler.callCount).toBe(1);
  });

  it('should publish event with no payload to subscriber', () => {
    type PingEvent = { type: 'PingController:ping'; payload: [] };
    const messenger = new Messenger<never, PingEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'PingController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedMessenger.subscribe('PingController:ping', handler);
    restrictedMessenger.publish('PingController:ping');

    expect(handler.calledWithExactly()).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event with multiple payload parameters to subscriber', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string, string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedMessenger.subscribe('MessageController:message', handler);

    restrictedMessenger.publish('MessageController:message', 'hello', 'there');

    expect(handler.calledWithExactly('hello', 'there')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event once to subscriber even if subscribed multiple times', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedMessenger.subscribe('MessageController:message', handler);

    restrictedMessenger.subscribe('MessageController:message', handler);
    restrictedMessenger.publish('MessageController:message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event to many subscribers', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    restrictedMessenger.subscribe('MessageController:message', handler1);

    restrictedMessenger.subscribe('MessageController:message', handler2);
    restrictedMessenger.publish('MessageController:message', 'hello');

    expect(handler1.calledWithExactly('hello')).toBe(true);
    expect(handler1.callCount).toBe(1);
    expect(handler2.calledWithExactly('hello')).toBe(true);
    expect(handler2.callCount).toBe(1);
  });

  it('should not call subscriber after unsubscribing', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedMessenger.subscribe('MessageController:message', handler);

    restrictedMessenger.unsubscribe('MessageController:message', handler);
    restrictedMessenger.publish('MessageController:message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  it('should throw when unsubscribing when there are no subscriptions', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    expect(() =>
      restrictedMessenger.unsubscribe('MessageController:message', handler),
    ).toThrow(`Subscription not found for event: MessageController:message`);
  });

  it('should throw when unsubscribing a handler that is not subscribed', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    restrictedMessenger.subscribe('MessageController:message', handler1);

    expect(() =>
      restrictedMessenger.unsubscribe('MessageController:message', handler2),
    ).toThrow(`Subscription not found for event: MessageController:message`);
  });

  it('should not call subscriber after clearing event subscriptions', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedMessenger.subscribe('MessageController:message', handler);

    restrictedMessenger.clearEventSubscriptions('MessageController:message');
    restrictedMessenger.publish('MessageController:message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  it('should not throw when clearing event that has no subscriptions', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() =>
      restrictedMessenger.clearEventSubscriptions('MessageController:message'),
    ).not.toThrow();
  });

  it('should allow calling an internal action', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const messenger = new Messenger<CountAction, never>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    let count = 0;
    restrictedMessenger.registerActionHandler(
      'CountController:count',
      (increment: number) => {
        count += increment;
      },
    );
    restrictedMessenger.call('CountController:count', 1);

    expect(count).toBe(1);
  });

  it('should allow calling an external action', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const messenger = new Messenger<CountAction, never>();
    const externalRestrictedMessenger = messenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });
    const restrictedMessenger = messenger.getRestricted<
      'OtherController',
      CountAction['type']
    >({
      name: 'OtherController',
      allowedActions: ['CountController:count'],
      allowedEvents: [],
    });

    let count = 0;
    externalRestrictedMessenger.registerActionHandler(
      'CountController:count',
      (increment: number) => {
        count += increment;
      },
    );
    restrictedMessenger.call('CountController:count', 1);

    expect(count).toBe(1);
  });

  it('should allow subscribing to an internal event', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const restrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedMessenger.subscribe('MessageController:message', handler);

    restrictedMessenger.publish('MessageController:message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should allow subscribing to an external event', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const messenger = new Messenger<never, MessageEvent>();
    const externalRestrictedMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });
    const restrictedMessenger = messenger.getRestricted<
      'OtherController',
      never,
      MessageEvent['type']
    >({
      name: 'OtherController',
      allowedActions: [],
      allowedEvents: ['MessageController:message'],
    });

    const handler = sinon.stub();
    restrictedMessenger.subscribe('MessageController:message', handler);

    externalRestrictedMessenger.publish('MessageController:message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should allow interacting with internal and external actions', () => {
    type MessageAction =
      | { type: 'MessageController:concat'; handler: (message: string) => void }
      | {
          type: 'MessageController:reset';
          handler: (initialMessage: string) => void;
        };
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const messenger = new Messenger<MessageAction | CountAction, never>();

    const messageMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: ['CountController:count'],
      allowedEvents: [],
    });
    const countMessenger = messenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    let count = 0;
    countMessenger.registerActionHandler(
      'CountController:count',
      (increment: number) => {
        count += increment;
      },
    );

    let fullMessage = '';
    messageMessenger.registerActionHandler(
      'MessageController:concat',
      (message: string) => {
        fullMessage += message;
      },
    );

    messageMessenger.registerActionHandler(
      'MessageController:reset',
      (message: string) => {
        fullMessage = message;
      },
    );

    messageMessenger.call('MessageController:reset', 'hello');
    messageMessenger.call('CountController:count', 1);

    expect(fullMessage).toBe('hello');
    expect(count).toBe(1);
  });

  it('should allow interacting with internal and external events', () => {
    type MessageEvent =
      | { type: 'MessageController:message'; payload: [string] }
      | { type: 'MessageController:ping'; payload: [] };
    type CountEvent = { type: 'CountController:update'; payload: [number] };
    const messenger = new Messenger<never, MessageEvent | CountEvent>();

    const messageMessenger = messenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: ['CountController:update'],
    });
    const countMessenger = messenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    let pings = 0;
    messageMessenger.subscribe('MessageController:ping', () => {
      pings += 1;
    });
    let currentCount;
    messageMessenger.subscribe('CountController:update', (newCount: number) => {
      currentCount = newCount;
    });
    messageMessenger.publish('MessageController:ping');
    countMessenger.publish('CountController:update', 10);

    expect(pings).toBe(1);
    expect(currentCount).toBe(10);
  });
});
