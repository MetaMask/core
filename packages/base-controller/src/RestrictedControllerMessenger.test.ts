import * as sinon from 'sinon';

import { ControllerMessenger } from './ControllerMessenger';

describe('RestrictedControllerMessenger', () => {
  it('should allow registering and calling an action handler', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    let count = 0;
    restrictedControllerMessenger.registerActionHandler(
      'CountController:count',
      (increment: number) => {
        count += increment;
      },
    );
    restrictedControllerMessenger.call('CountController:count', 1);

    expect(count).toBe(1);
  });

  it('should allow registering and calling multiple different action handlers', () => {
    type MessageAction =
      | { type: 'MessageController:concat'; handler: (message: string) => void }
      | {
          type: 'MessageController:reset';
          handler: (initialMessage: string) => void;
        };
    const controllerMessenger = new ControllerMessenger<MessageAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    let message = '';
    restrictedControllerMessenger.registerActionHandler(
      'MessageController:reset',
      (initialMessage: string) => {
        message = initialMessage;
      },
    );

    restrictedControllerMessenger.registerActionHandler(
      'MessageController:concat',
      (s: string) => {
        message += s;
      },
    );

    restrictedControllerMessenger.call('MessageController:reset', 'hello');
    restrictedControllerMessenger.call('MessageController:concat', ', world');

    expect(message).toBe('hello, world');
  });

  it('should allow registering and calling an action handler with no parameters', () => {
    type IncrementAction = {
      type: 'CountController:increment';
      handler: () => void;
    };
    const controllerMessenger = new ControllerMessenger<
      IncrementAction,
      never
    >();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    let count = 0;
    restrictedControllerMessenger.registerActionHandler(
      'CountController:increment',
      () => {
        count += 1;
      },
    );
    restrictedControllerMessenger.call('CountController:increment');

    expect(count).toBe(1);
  });

  it('should allow registering and calling an action handler with multiple parameters', () => {
    type MessageAction = {
      type: 'MessageController:message';
      handler: (to: string, message: string) => void;
    };
    const controllerMessenger = new ControllerMessenger<MessageAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const messages: Record<string, string> = {};
    restrictedControllerMessenger.registerActionHandler(
      'MessageController:message',
      (to, message) => {
        messages[to] = message;
      },
    );

    restrictedControllerMessenger.call(
      'MessageController:message',
      '0x123',
      'hello',
    );

    expect(messages['0x123']).toBe('hello');
  });

  it('should allow registering and calling an action handler with a return value', () => {
    type AddAction = {
      type: 'MathController:add';
      handler: (a: number, b: number) => number;
    };
    const controllerMessenger = new ControllerMessenger<AddAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MathController',
      allowedActions: [],
      allowedEvents: [],
    });

    restrictedControllerMessenger.registerActionHandler(
      'MathController:add',
      (a, b) => {
        return a + b;
      },
    );
    const result = restrictedControllerMessenger.call(
      'MathController:add',
      5,
      10,
    );

    expect(result).toBe(15);
  });

  it('should not allow registering multiple action handlers under the same name', () => {
    type CountAction = { type: 'PingController:ping'; handler: () => void };
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'PingController',
      allowedActions: [],
      allowedEvents: [],
    });

    restrictedControllerMessenger.registerActionHandler(
      'PingController:ping',
      () => undefined,
    );

    expect(() => {
      restrictedControllerMessenger.registerActionHandler(
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
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      restrictedControllerMessenger.registerActionHandler(
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
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      restrictedControllerMessenger.subscribe(
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
    const controllerMessenger = new ControllerMessenger<
      never,
      MessageEvent | OtherEvent
    >();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: ['OtherController:other'],
    });

    expect(() => {
      restrictedControllerMessenger.publish(
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
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      restrictedControllerMessenger.unsubscribe(
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
    const controllerMessenger = new ControllerMessenger<
      never,
      MessageEvent | OtherEvent
    >();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: ['OtherController:other'],
    });

    expect(() => {
      restrictedControllerMessenger.clearEventSubscriptions(
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
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'PingController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      // @ts-expect-error suppressing to test runtime error handling
      restrictedControllerMessenger.call('CountController:count');
    }).toThrow('Action missing from allow list: CountController:count');
  });

  it('should throw when registering an external action handler', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted<
      'PingController',
      CountAction['type']
    >({
      name: 'PingController',
      allowedActions: ['CountController:count'],
      allowedEvents: [],
    });

    expect(() => {
      restrictedControllerMessenger.registerActionHandler(
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
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted<
      'PingController',
      CountAction['type']
    >({
      name: 'PingController',
      allowedActions: ['CountController:count'],
      allowedEvents: [],
    });
    expect(() => {
      restrictedControllerMessenger.unregisterActionHandler(
        // @ts-expect-error suppressing to test runtime error handling
        'CountController:count',
      );
    }).toThrow(
      `Only allowed unregistering action handlers prefixed by 'PingController:'`,
    );
  });

  it('should throw when calling unregistered action', () => {
    type PingAction = { type: 'PingController:ping'; handler: () => void };
    const controllerMessenger = new ControllerMessenger<PingAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'PingController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      restrictedControllerMessenger.call('PingController:ping');
    }).toThrow('A handler for PingController:ping has not been registered');
  });

  it('should throw when calling an action that has been unregistered', () => {
    type PingAction = { type: 'PingController:ping'; handler: () => void };
    const controllerMessenger = new ControllerMessenger<PingAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'PingController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() => {
      restrictedControllerMessenger.call('PingController:ping');
    }).toThrow('A handler for PingController:ping has not been registered');

    let pingCount = 0;
    restrictedControllerMessenger.registerActionHandler(
      'PingController:ping',
      () => {
        pingCount += 1;
      },
    );

    restrictedControllerMessenger.unregisterActionHandler(
      'PingController:ping',
    );

    expect(() => {
      restrictedControllerMessenger.call('PingController:ping');
    }).toThrow('A handler for PingController:ping has not been registered');
    expect(pingCount).toBe(0);
  });

  it('should throw when registering an initial event payload outside of the namespace', () => {
    type MessageEvent = {
      type: 'OtherController:complexMessage';
      payload: [Record<string, unknown>];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() =>
      restrictedControllerMessenger.registerInitialEventPayload({
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
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler,
    );
    restrictedControllerMessenger.publish('MessageController:message', 'hello');

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
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const restrictedControllerMessenger = controllerMessenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
      restrictedControllerMessenger.registerInitialEventPayload({
        eventType: 'MessageController:complexMessage',
        getPayload: () => [state],
      });
      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.propA);
      restrictedControllerMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );

      state.propA += 1;
      restrictedControllerMessenger.publish(
        'MessageController:complexMessage',
        state,
      );

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
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const restrictedControllerMessenger = controllerMessenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
      restrictedControllerMessenger.registerInitialEventPayload({
        eventType: 'MessageController:complexMessage',
        getPayload: () => [state],
      });
      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.propA);
      restrictedControllerMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );

      restrictedControllerMessenger.publish(
        'MessageController:complexMessage',
        state,
      );

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
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const restrictedControllerMessenger = controllerMessenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.propA);
      restrictedControllerMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );

      state.propA += 1;
      restrictedControllerMessenger.publish(
        'MessageController:complexMessage',
        state,
      );

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
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const restrictedControllerMessenger = controllerMessenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.propA);
      restrictedControllerMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );

      restrictedControllerMessenger.publish(
        'MessageController:complexMessage',
        state,
      );

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
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const restrictedControllerMessenger = controllerMessenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.propA);
      restrictedControllerMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );

      restrictedControllerMessenger.publish(
        'MessageController:complexMessage',
        state,
      );

      expect(handler.callCount).toBe(0);
    });
  });

  describe('on later state change', () => {
    it('should call selector event handler with previous selector return value', () => {
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [Record<string, unknown>];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const restrictedControllerMessenger = controllerMessenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });

      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
      controllerMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );
      restrictedControllerMessenger.publish(
        'MessageController:complexMessage',
        {
          prop1: 'a',
          prop2: 'b',
        },
      );
      restrictedControllerMessenger.publish(
        'MessageController:complexMessage',
        {
          prop1: 'z',
          prop2: 'b',
        },
      );

      expect(handler.getCall(0).calledWithExactly('a', undefined)).toBe(true);
      expect(handler.getCall(1).calledWithExactly('z', 'a')).toBe(true);
      expect(handler.callCount).toBe(2);
    });

    it('should publish event with selector to subscriber', () => {
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [Record<string, unknown>];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const restrictedControllerMessenger = controllerMessenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });

      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
      restrictedControllerMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );
      restrictedControllerMessenger.publish(
        'MessageController:complexMessage',
        {
          prop1: 'a',
          prop2: 'b',
        },
      );

      expect(handler.calledWithExactly('a', undefined)).toBe(true);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish event with selector if selector return value is unchanged', () => {
      type MessageEvent = {
        type: 'MessageController:complexMessage';
        payload: [Record<string, unknown>];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const restrictedControllerMessenger = controllerMessenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });

      const handler = sinon.stub();
      const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
      restrictedControllerMessenger.subscribe(
        'MessageController:complexMessage',
        handler,
        selector,
      );
      restrictedControllerMessenger.publish(
        'MessageController:complexMessage',
        {
          prop1: 'a',
          prop2: 'b',
        },
      );
      restrictedControllerMessenger.publish(
        'MessageController:complexMessage',
        {
          prop1: 'a',
          prop3: 'c',
        },
      );

      expect(handler.calledWithExactly('a', undefined)).toBe(true);
      expect(handler.callCount).toBe(1);
    });
  });

  it('should allow publishing multiple different events to subscriber', () => {
    type MessageEvent =
      | { type: 'MessageController:message'; payload: [string] }
      | { type: 'MessageController:ping'; payload: [] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const messageHandler = sinon.stub();
    const pingHandler = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      messageHandler,
    );

    restrictedControllerMessenger.subscribe(
      'MessageController:ping',
      pingHandler,
    );

    restrictedControllerMessenger.publish('MessageController:message', 'hello');
    restrictedControllerMessenger.publish('MessageController:ping');

    expect(messageHandler.calledWithExactly('hello')).toBe(true);
    expect(messageHandler.callCount).toBe(1);
    expect(pingHandler.calledWithExactly()).toBe(true);
    expect(pingHandler.callCount).toBe(1);
  });

  it('should publish event with no payload to subscriber', () => {
    type PingEvent = { type: 'PingController:ping'; payload: [] };
    const controllerMessenger = new ControllerMessenger<never, PingEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'PingController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedControllerMessenger.subscribe('PingController:ping', handler);
    restrictedControllerMessenger.publish('PingController:ping');

    expect(handler.calledWithExactly()).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event with multiple payload parameters to subscriber', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string, string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler,
    );

    restrictedControllerMessenger.publish(
      'MessageController:message',
      'hello',
      'there',
    );

    expect(handler.calledWithExactly('hello', 'there')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event once to subscriber even if subscribed multiple times', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler,
    );

    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler,
    );
    restrictedControllerMessenger.publish('MessageController:message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event to many subscribers', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler1,
    );

    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler2,
    );
    restrictedControllerMessenger.publish('MessageController:message', 'hello');

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
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler,
    );

    restrictedControllerMessenger.unsubscribe(
      'MessageController:message',
      handler,
    );
    restrictedControllerMessenger.publish('MessageController:message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  it('should throw when unsubscribing when there are no subscriptions', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    expect(() =>
      restrictedControllerMessenger.unsubscribe(
        'MessageController:message',
        handler,
      ),
    ).toThrow(`Subscription not found for event: MessageController:message`);
  });

  it('should throw when unsubscribing a handler that is not subscribed', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler1,
    );

    expect(() =>
      restrictedControllerMessenger.unsubscribe(
        'MessageController:message',
        handler2,
      ),
    ).toThrow(`Subscription not found for event: MessageController:message`);
  });

  it('should not call subscriber after clearing event subscriptions', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler,
    );

    restrictedControllerMessenger.clearEventSubscriptions(
      'MessageController:message',
    );
    restrictedControllerMessenger.publish('MessageController:message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  it('should not throw when clearing event that has no subscriptions', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    expect(() =>
      restrictedControllerMessenger.clearEventSubscriptions(
        'MessageController:message',
      ),
    ).not.toThrow();
  });

  it('should allow calling an internal action', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    let count = 0;
    restrictedControllerMessenger.registerActionHandler(
      'CountController:count',
      (increment: number) => {
        count += increment;
      },
    );
    restrictedControllerMessenger.call('CountController:count', 1);

    expect(count).toBe(1);
  });

  it('should allow calling an external action', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const externalRestrictedControllerMessenger =
      controllerMessenger.getRestricted({
        name: 'CountController',
        allowedActions: [],
        allowedEvents: [],
      });
    const restrictedControllerMessenger = controllerMessenger.getRestricted<
      'OtherController',
      CountAction['type']
    >({
      name: 'OtherController',
      allowedActions: ['CountController:count'],
      allowedEvents: [],
    });

    let count = 0;
    externalRestrictedControllerMessenger.registerActionHandler(
      'CountController:count',
      (increment: number) => {
        count += increment;
      },
    );
    restrictedControllerMessenger.call('CountController:count', 1);

    expect(count).toBe(1);
  });

  it('should allow subscribing to an internal event', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: [],
    });

    const handler = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler,
    );

    restrictedControllerMessenger.publish('MessageController:message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should allow subscribing to an external event', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const externalRestrictedControllerMessenger =
      controllerMessenger.getRestricted({
        name: 'MessageController',
        allowedActions: [],
        allowedEvents: [],
      });
    const restrictedControllerMessenger = controllerMessenger.getRestricted<
      'OtherController',
      never,
      MessageEvent['type']
    >({
      name: 'OtherController',
      allowedActions: [],
      allowedEvents: ['MessageController:message'],
    });

    const handler = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler,
    );

    externalRestrictedControllerMessenger.publish(
      'MessageController:message',
      'hello',
    );

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
    const controllerMessenger = new ControllerMessenger<
      MessageAction | CountAction,
      never
    >();

    const messageControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: ['CountController:count'],
      allowedEvents: [],
    });
    const countControllerMessenger = controllerMessenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    let count = 0;
    countControllerMessenger.registerActionHandler(
      'CountController:count',
      (increment: number) => {
        count += increment;
      },
    );

    let fullMessage = '';
    messageControllerMessenger.registerActionHandler(
      'MessageController:concat',
      (message: string) => {
        fullMessage += message;
      },
    );

    messageControllerMessenger.registerActionHandler(
      'MessageController:reset',
      (message: string) => {
        fullMessage = message;
      },
    );

    messageControllerMessenger.call('MessageController:reset', 'hello');
    messageControllerMessenger.call('CountController:count', 1);

    expect(fullMessage).toBe('hello');
    expect(count).toBe(1);
  });

  it('should allow interacting with internal and external events', () => {
    type MessageEvent =
      | { type: 'MessageController:message'; payload: [string] }
      | { type: 'MessageController:ping'; payload: [] };
    type CountEvent = { type: 'CountController:update'; payload: [number] };
    const controllerMessenger = new ControllerMessenger<
      never,
      MessageEvent | CountEvent
    >();

    const messageControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: [],
      allowedEvents: ['CountController:update'],
    });
    const countControllerMessenger = controllerMessenger.getRestricted({
      name: 'CountController',
      allowedActions: [],
      allowedEvents: [],
    });

    let pings = 0;
    messageControllerMessenger.subscribe('MessageController:ping', () => {
      pings += 1;
    });
    let currentCount;
    messageControllerMessenger.subscribe(
      'CountController:update',
      (newCount: number) => {
        currentCount = newCount;
      },
    );
    messageControllerMessenger.publish('MessageController:ping');
    countControllerMessenger.publish('CountController:update', 10);

    expect(pings).toBe(1);
    expect(currentCount).toBe(10);
  });
});
