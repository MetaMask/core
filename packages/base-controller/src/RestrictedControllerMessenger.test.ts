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

  it('should throw when calling unregistered action', () => {
    type CountAction = { type: 'PingController:ping'; handler: () => void };
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'PingController',
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

  it('should publish event to subscriber', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
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

  it('should publish event with selector to subscriber', () => {
    type MessageEvent = {
      type: 'MessageController:complexMessage';
      payload: [Record<string, unknown>];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
    });

    const handler = sinon.stub();
    const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
    restrictedControllerMessenger.subscribe(
      'MessageController:complexMessage',
      handler,
      selector,
    );

    restrictedControllerMessenger.publish('MessageController:complexMessage', {
      prop1: 'a',
      prop2: 'b',
    });

    expect(handler.calledWithExactly('a', undefined)).toBe(true);
    expect(handler.callCount).toBe(1);
    expect(selector.calledWithExactly({ prop1: 'a', prop2: 'b' })).toBe(true);
    expect(selector.callCount).toBe(1);
  });

  it('should allow publishing multiple different events to subscriber', () => {
    type MessageEvent =
      | { type: 'MessageController:message'; payload: [string] }
      | { type: 'MessageController:ping'; payload: [] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
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
      });
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'OtherController',
      allowedActions: ['CountController:count'],
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
      });
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'OtherController',
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
    });
    const countControllerMessenger = controllerMessenger.getRestricted({
      name: 'CountController',
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
      allowedEvents: ['CountController:update'],
    });
    const countControllerMessenger = controllerMessenger.getRestricted({
      name: 'CountController',
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
