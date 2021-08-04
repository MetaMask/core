import sinon from 'sinon';

import { ControllerMessenger } from './ControllerMessenger';

describe('ControllerMessenger', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should allow registering and calling an action handler', () => {
    type CountAction = { type: 'count'; handler: (increment: number) => void };
    const controllerMessenger = new ControllerMessenger<CountAction, never>();

    let count = 0;
    controllerMessenger.registerActionHandler('count', (increment: number) => {
      count += increment;
    });
    controllerMessenger.call('count', 1);

    expect(count).toStrictEqual(1);
  });

  it('should allow registering and calling multiple different action handlers', () => {
    type MessageAction =
      | { type: 'concat'; handler: (message: string) => void }
      | { type: 'reset'; handler: (initialMessage: string) => void };
    const controllerMessenger = new ControllerMessenger<MessageAction, never>();

    let message = '';
    controllerMessenger.registerActionHandler(
      'reset',
      (initialMessage: string) => {
        message = initialMessage;
      },
    );
    controllerMessenger.registerActionHandler('concat', (s: string) => {
      message += s;
    });

    controllerMessenger.call('reset', 'hello');
    controllerMessenger.call('concat', ', world');

    expect(message).toStrictEqual('hello, world');
  });

  it('should allow registering and calling an action handler with no parameters', () => {
    type IncrementAction = { type: 'increment'; handler: () => void };
    const controllerMessenger = new ControllerMessenger<
      IncrementAction,
      never
    >();

    let count = 0;
    controllerMessenger.registerActionHandler('increment', () => {
      count += 1;
    });
    controllerMessenger.call('increment');

    expect(count).toStrictEqual(1);
  });

  it('should allow registering and calling an action handler with multiple parameters', () => {
    type MessageAction = {
      type: 'message';
      handler: (to: string, message: string) => void;
    };
    const controllerMessenger = new ControllerMessenger<MessageAction, never>();

    const messages: Record<string, string> = {};
    controllerMessenger.registerActionHandler('message', (to, message) => {
      messages[to] = message;
    });
    controllerMessenger.call('message', '0x123', 'hello');

    expect(messages['0x123']).toStrictEqual('hello');
  });

  it('should allow registering and calling an action handler with a return value', () => {
    type AddAction = { type: 'add'; handler: (a: number, b: number) => number };
    const controllerMessenger = new ControllerMessenger<AddAction, never>();

    controllerMessenger.registerActionHandler('add', (a, b) => {
      return a + b;
    });
    const result = controllerMessenger.call('add', 5, 10);

    expect(result).toStrictEqual(15);
  });

  it('should not allow registering multiple action handlers under the same name', () => {
    type PingAction = { type: 'ping'; handler: () => void };
    const controllerMessenger = new ControllerMessenger<PingAction, never>();

    controllerMessenger.registerActionHandler('ping', () => undefined);

    expect(() => {
      controllerMessenger.registerActionHandler('ping', () => undefined);
    }).toThrow('A handler for ping has already been registered');
  });

  it('should throw when calling unregistered action', () => {
    type PingAction = { type: 'ping'; handler: () => void };
    const controllerMessenger = new ControllerMessenger<PingAction, never>();

    expect(() => {
      controllerMessenger.call('ping');
    }).toThrow('A handler for ping has not been registered');
  });

  it('should throw when calling an action that has been unregistered', () => {
    type PingAction = { type: 'ping'; handler: () => void };
    const controllerMessenger = new ControllerMessenger<PingAction, never>();

    expect(() => {
      controllerMessenger.call('ping');
    }).toThrow('A handler for ping has not been registered');

    let pingCount = 0;
    controllerMessenger.registerActionHandler('ping', () => {
      pingCount += 1;
    });

    controllerMessenger.unregisterActionHandler('ping');

    expect(() => {
      controllerMessenger.call('ping');
    }).toThrow('A handler for ping has not been registered');
    expect(pingCount).toStrictEqual(0);
  });

  it('should throw when calling an action after actions have been reset', () => {
    type PingAction = { type: 'ping'; handler: () => void };
    const controllerMessenger = new ControllerMessenger<PingAction, never>();

    expect(() => {
      controllerMessenger.call('ping');
    }).toThrow('A handler for ping has not been registered');

    let pingCount = 0;
    controllerMessenger.registerActionHandler('ping', () => {
      pingCount += 1;
    });

    controllerMessenger.clearActions();

    expect(() => {
      controllerMessenger.call('ping');
    }).toThrow('A handler for ping has not been registered');
    expect(pingCount).toStrictEqual(0);
  });

  it('should publish event to subscriber', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.publish('message', 'hello');

    expect(handler.calledWithExactly('hello')).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
  });

  it('should allow publishing multiple different events to subscriber', () => {
    type MessageEvent =
      | { type: 'message'; payload: [string] }
      | { type: 'ping'; payload: [] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const messageHandler = sinon.stub();
    const pingHandler = sinon.stub();
    controllerMessenger.subscribe('message', messageHandler);
    controllerMessenger.subscribe('ping', pingHandler);

    controllerMessenger.publish('message', 'hello');
    controllerMessenger.publish('ping');

    expect(messageHandler.calledWithExactly('hello')).toStrictEqual(true);
    expect(messageHandler.callCount).toStrictEqual(1);
    expect(pingHandler.calledWithExactly()).toStrictEqual(true);
    expect(pingHandler.callCount).toStrictEqual(1);
  });

  it('should publish event with no payload to subscriber', () => {
    type PingEvent = { type: 'ping'; payload: [] };
    const controllerMessenger = new ControllerMessenger<never, PingEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('ping', handler);
    controllerMessenger.publish('ping');

    expect(handler.calledWithExactly()).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
  });

  it('should publish event with multiple payload parameters to subscriber', () => {
    type MessageEvent = { type: 'message'; payload: [string, string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.publish('message', 'hello', 'there');

    expect(handler.calledWithExactly('hello', 'there')).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
  });

  it('should publish event once to subscriber even if subscribed multiple times', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.publish('message', 'hello');

    expect(handler.calledWithExactly('hello')).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
  });

  it('should publish event to many subscribers', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    controllerMessenger.subscribe('message', handler1);
    controllerMessenger.subscribe('message', handler2);
    controllerMessenger.publish('message', 'hello');

    expect(handler1.calledWithExactly('hello')).toStrictEqual(true);
    expect(handler1.callCount).toStrictEqual(1);
    expect(handler2.calledWithExactly('hello')).toStrictEqual(true);
    expect(handler2.callCount).toStrictEqual(1);
  });

  it('should publish event with selector to subscriber', () => {
    type MessageEvent = {
      type: 'complexMessage';
      payload: [Record<string, unknown>];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
    controllerMessenger.subscribe('complexMessage', handler, selector);
    controllerMessenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });

    expect(handler.calledWithExactly('a', undefined)).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
    expect(
      selector.calledWithExactly({ prop1: 'a', prop2: 'b' }),
    ).toStrictEqual(true);
    expect(selector.callCount).toStrictEqual(1);
  });

  it('should call selector event handler with previous selector return value', () => {
    type MessageEvent = {
      type: 'complexMessage';
      payload: [Record<string, unknown>];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
    controllerMessenger.subscribe('complexMessage', handler, selector);
    controllerMessenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });
    controllerMessenger.publish('complexMessage', { prop1: 'z', prop2: 'b' });

    expect(handler.getCall(0).calledWithExactly('a', undefined)).toStrictEqual(
      true,
    );
    expect(handler.getCall(1).calledWithExactly('z', 'a')).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(2);
    expect(
      selector.getCall(0).calledWithExactly({ prop1: 'a', prop2: 'b' }),
    ).toStrictEqual(true);
    expect(
      selector.getCall(1).calledWithExactly({ prop1: 'z', prop2: 'b' }),
    ).toStrictEqual(true);
    expect(selector.callCount).toStrictEqual(2);
  });

  it('should not publish event with selector if selector return value is unchanged', () => {
    type MessageEvent = {
      type: 'complexMessage';
      payload: [Record<string, unknown>];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
    controllerMessenger.subscribe('complexMessage', handler, selector);
    controllerMessenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });
    controllerMessenger.publish('complexMessage', { prop1: 'a', prop3: 'c' });

    expect(handler.calledWithExactly('a', undefined)).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
    expect(
      selector.getCall(0).calledWithExactly({ prop1: 'a', prop2: 'b' }),
    ).toStrictEqual(true);
    expect(
      selector.getCall(1).calledWithExactly({ prop1: 'a', prop3: 'c' }),
    ).toStrictEqual(true);
    expect(selector.callCount).toStrictEqual(2);
  });

  it('should publish event to many subscribers with the same selector', () => {
    type MessageEvent = {
      type: 'complexMessage';
      payload: [Record<string, unknown>];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
    controllerMessenger.subscribe('complexMessage', handler1, selector);
    controllerMessenger.subscribe('complexMessage', handler2, selector);
    controllerMessenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });
    controllerMessenger.publish('complexMessage', { prop1: 'a', prop3: 'c' });

    expect(handler1.calledWithExactly('a', undefined)).toStrictEqual(true);
    expect(handler1.callCount).toStrictEqual(1);
    expect(handler2.calledWithExactly('a', undefined)).toStrictEqual(true);
    expect(handler2.callCount).toStrictEqual(1);
    expect(
      selector.getCall(0).calledWithExactly({ prop1: 'a', prop2: 'b' }),
    ).toStrictEqual(true);
    expect(
      selector.getCall(1).calledWithExactly({ prop1: 'a', prop2: 'b' }),
    ).toStrictEqual(true);
    expect(
      selector.getCall(2).calledWithExactly({ prop1: 'a', prop3: 'c' }),
    ).toStrictEqual(true);
    expect(
      selector.getCall(3).calledWithExactly({ prop1: 'a', prop3: 'c' }),
    ).toStrictEqual(true);
    expect(selector.callCount).toStrictEqual(4);
  });

  it('should not call subscriber after unsubscribing', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.unsubscribe('message', handler);
    controllerMessenger.publish('message', 'hello');

    expect(handler.callCount).toStrictEqual(0);
  });

  it('should not call subscriber with selector after unsubscribing', () => {
    type MessageEvent = {
      type: 'complexMessage';
      payload: [Record<string, unknown>];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
    controllerMessenger.subscribe('complexMessage', handler, selector);
    controllerMessenger.unsubscribe('complexMessage', handler);
    controllerMessenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });

    expect(handler.callCount).toStrictEqual(0);
    expect(selector.callCount).toStrictEqual(0);
  });

  it('should throw when unsubscribing when there are no subscriptions', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    expect(() => controllerMessenger.unsubscribe('message', handler)).toThrow(
      'Subscription not found for event: message',
    );
  });

  it('should throw when unsubscribing a handler that is not subscribed', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    controllerMessenger.subscribe('message', handler1);

    expect(() => controllerMessenger.unsubscribe('message', handler2)).toThrow(
      'Subscription not found for event: message',
    );
  });

  it('should not call subscriber after clearing event subscriptions', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.clearEventSubscriptions('message');
    controllerMessenger.publish('message', 'hello');

    expect(handler.callCount).toStrictEqual(0);
  });

  it('should not throw when clearing event that has no subscriptions', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    expect(() =>
      controllerMessenger.clearEventSubscriptions('message'),
    ).not.toThrow();
  });

  it('should not call subscriber after resetting subscriptions', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.clearSubscriptions();
    controllerMessenger.publish('message', 'hello');

    expect(handler.callCount).toStrictEqual(0);
  });
});

describe('RestrictedControllerMessenger', () => {
  it('should allow registering and calling an action handler', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'CountController',
      allowedActions: ['CountController:count'],
    });

    let count = 0;
    restrictedControllerMessenger.registerActionHandler(
      'CountController:count',
      (increment: number) => {
        count += increment;
      },
    );
    restrictedControllerMessenger.call('CountController:count', 1);

    expect(count).toStrictEqual(1);
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
      allowedActions: ['MessageController:reset', 'MessageController:concat'],
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

    expect(message).toStrictEqual('hello, world');
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
      allowedActions: ['CountController:increment'],
    });

    let count = 0;
    restrictedControllerMessenger.registerActionHandler(
      'CountController:increment',
      () => {
        count += 1;
      },
    );
    restrictedControllerMessenger.call('CountController:increment');

    expect(count).toStrictEqual(1);
  });

  it('should allow registering and calling an action handler with multiple parameters', () => {
    type MessageAction = {
      type: 'MessageController:message';
      handler: (to: string, message: string) => void;
    };
    const controllerMessenger = new ControllerMessenger<MessageAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedActions: ['MessageController:message'],
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

    expect(messages['0x123']).toStrictEqual('hello');
  });

  it('should allow registering and calling an action handler with a return value', () => {
    type AddAction = {
      type: 'MathController:add';
      handler: (a: number, b: number) => number;
    };
    const controllerMessenger = new ControllerMessenger<AddAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MathController',
      allowedActions: ['MathController:add'],
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

    expect(result).toStrictEqual(15);
  });

  it('should not allow registering multiple action handlers under the same name', () => {
    type CountAction = { type: 'PingController:ping'; handler: () => void };
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'PingController',
      allowedActions: ['PingController:ping'],
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
      allowedActions: ['PingController:ping'],
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
      allowedActions: ['PingController:ping'],
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
    expect(pingCount).toStrictEqual(0);
  });

  it('should publish event to subscriber', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedEvents: ['MessageController:message'],
    });

    const handler = sinon.stub();
    restrictedControllerMessenger.subscribe(
      'MessageController:message',
      handler,
    );
    restrictedControllerMessenger.publish('MessageController:message', 'hello');

    expect(handler.calledWithExactly('hello')).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
  });

  it('should allow publishing multiple different events to subscriber', () => {
    type MessageEvent =
      | { type: 'MessageController:message'; payload: [string] }
      | { type: 'MessageController:ping'; payload: [] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedEvents: ['MessageController:message', 'MessageController:ping'],
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

    expect(messageHandler.calledWithExactly('hello')).toStrictEqual(true);
    expect(messageHandler.callCount).toStrictEqual(1);
    expect(pingHandler.calledWithExactly()).toStrictEqual(true);
    expect(pingHandler.callCount).toStrictEqual(1);
  });

  it('should publish event with no payload to subscriber', () => {
    type PingEvent = { type: 'PingController:ping'; payload: [] };
    const controllerMessenger = new ControllerMessenger<never, PingEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'PingController',
      allowedEvents: ['PingController:ping'],
    });

    const handler = sinon.stub();
    restrictedControllerMessenger.subscribe('PingController:ping', handler);
    restrictedControllerMessenger.publish('PingController:ping');

    expect(handler.calledWithExactly()).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
  });

  it('should publish event with multiple payload parameters to subscriber', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string, string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedEvents: ['MessageController:message'],
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

    expect(handler.calledWithExactly('hello', 'there')).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
  });

  it('should publish event once to subscriber even if subscribed multiple times', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedEvents: ['MessageController:message'],
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

    expect(handler.calledWithExactly('hello')).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
  });

  it('should publish event to many subscribers', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedEvents: ['MessageController:message'],
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

    expect(handler1.calledWithExactly('hello')).toStrictEqual(true);
    expect(handler1.callCount).toStrictEqual(1);
    expect(handler2.calledWithExactly('hello')).toStrictEqual(true);
    expect(handler2.callCount).toStrictEqual(1);
  });

  it('should not call subscriber after unsubscribing', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedEvents: ['MessageController:message'],
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

    expect(handler.callCount).toStrictEqual(0);
  });

  it('should throw when unsubscribing when there are no subscriptions', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedEvents: ['MessageController:message'],
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
      allowedEvents: ['MessageController:message'],
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
      allowedEvents: ['MessageController:message'],
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

    expect(handler.callCount).toStrictEqual(0);
  });

  it('should not throw when clearing event that has no subscriptions', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const restrictedControllerMessenger = controllerMessenger.getRestricted({
      name: 'MessageController',
      allowedEvents: ['MessageController:message'],
    });

    expect(() =>
      restrictedControllerMessenger.clearEventSubscriptions(
        'MessageController:message',
      ),
    ).not.toThrow();
  });

  it('should allow calling an external action', () => {
    type CountAction = {
      type: 'CountController:count';
      handler: (increment: number) => void;
    };
    const controllerMessenger = new ControllerMessenger<CountAction, never>();
    const externalRestrictedControllerMessenger = controllerMessenger.getRestricted(
      {
        name: 'CountController',
      },
    );
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

    expect(count).toStrictEqual(1);
  });

  it('should allow subscribing to an external event', () => {
    type MessageEvent = {
      type: 'MessageController:message';
      payload: [string];
    };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();
    const externalRestrictedControllerMessenger = controllerMessenger.getRestricted(
      {
        name: 'MessageController',
      },
    );
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

    expect(handler.calledWithExactly('hello')).toStrictEqual(true);
    expect(handler.callCount).toStrictEqual(1);
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
      allowedActions: ['MessageController:reset', 'CountController:count'],
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

    expect(fullMessage).toStrictEqual('hello');
    expect(count).toStrictEqual(1);
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
      allowedEvents: ['MessageController:ping', 'CountController:update'],
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

    expect(pings).toStrictEqual(1);
    expect(currentCount).toStrictEqual(10);
  });
});
