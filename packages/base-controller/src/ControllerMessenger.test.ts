import type { Patch } from 'immer';
import * as sinon from 'sinon';

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

    expect(count).toBe(1);
  });

  it('should allow registering and calling multiple different action handlers', () => {
    // These 'Other' types are included to demonstrate that controller messenger
    // generics can indeed be unions of actions and events from different
    // controllers.
    type GetOtherState = {
      type: `OtherController:getState`;
      handler: () => { stuff: string };
    };

    type OtherStateChange = {
      type: `OtherController:stateChange`;
      payload: [{ stuff: string }, Patch[]];
    };

    type MessageAction =
      | { type: 'concat'; handler: (message: string) => void }
      | { type: 'reset'; handler: (initialMessage: string) => void };
    const controllerMessenger = new ControllerMessenger<
      MessageAction | GetOtherState,
      OtherStateChange
    >();

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

    expect(message).toBe('hello, world');
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

    expect(count).toBe(1);
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

    expect(messages['0x123']).toBe('hello');
  });

  it('should allow registering and calling an action handler with a return value', () => {
    type AddAction = { type: 'add'; handler: (a: number, b: number) => number };
    const controllerMessenger = new ControllerMessenger<AddAction, never>();

    controllerMessenger.registerActionHandler('add', (a, b) => {
      return a + b;
    });
    const result = controllerMessenger.call('add', 5, 10);

    expect(result).toBe(15);
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
    expect(pingCount).toBe(0);
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
    expect(pingCount).toBe(0);
  });

  it('should publish event to subscriber', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.publish('message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
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

    expect(messageHandler.calledWithExactly('hello')).toBe(true);
    expect(messageHandler.callCount).toBe(1);
    expect(pingHandler.calledWithExactly()).toBe(true);
    expect(pingHandler.callCount).toBe(1);
  });

  it('should publish event with no payload to subscriber', () => {
    type PingEvent = { type: 'ping'; payload: [] };
    const controllerMessenger = new ControllerMessenger<never, PingEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('ping', handler);
    controllerMessenger.publish('ping');

    expect(handler.calledWithExactly()).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event with multiple payload parameters to subscriber', () => {
    type MessageEvent = { type: 'message'; payload: [string, string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.publish('message', 'hello', 'there');

    expect(handler.calledWithExactly('hello', 'there')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event once to subscriber even if subscribed multiple times', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.publish('message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event to many subscribers', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    controllerMessenger.subscribe('message', handler1);
    controllerMessenger.subscribe('message', handler2);
    controllerMessenger.publish('message', 'hello');

    expect(handler1.calledWithExactly('hello')).toBe(true);
    expect(handler1.callCount).toBe(1);
    expect(handler2.calledWithExactly('hello')).toBe(true);
    expect(handler2.callCount).toBe(1);
  });

  describe('on first state change with an initial payload function registered', () => {
    it('should publish event if selected payload differs', () => {
      const state = {
        propA: 1,
        propB: 1,
      };
      type MessageEvent = {
        type: 'complexMessage';
        payload: [typeof state];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      controllerMessenger.registerInitialEventPayload({
        eventType: 'complexMessage',
        getPayload: () => [state],
      });
      const handler = sinon.stub();
      controllerMessenger.subscribe(
        'complexMessage',
        handler,
        (obj) => obj.propA,
      );

      state.propA += 1;
      controllerMessenger.publish('complexMessage', state);

      expect(handler.getCall(0)?.args).toStrictEqual([2, 1]);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish event if selected payload is the same', () => {
      const state = {
        propA: 1,
        propB: 1,
      };
      type MessageEvent = {
        type: 'complexMessage';
        payload: [typeof state];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      controllerMessenger.registerInitialEventPayload({
        eventType: 'complexMessage',
        getPayload: () => [state],
      });
      const handler = sinon.stub();
      controllerMessenger.subscribe(
        'complexMessage',
        handler,
        (obj) => obj.propA,
      );

      controllerMessenger.publish('complexMessage', state);

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
        type: 'complexMessage';
        payload: [typeof state];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const handler = sinon.stub();
      controllerMessenger.subscribe(
        'complexMessage',
        handler,
        (obj) => obj.propA,
      );

      state.propA += 1;
      controllerMessenger.publish('complexMessage', state);

      expect(handler.getCall(0)?.args).toStrictEqual([2, undefined]);
      expect(handler.callCount).toBe(1);
    });

    it('should publish event even when selected payload does not change', () => {
      const state = {
        propA: 1,
        propB: 1,
      };
      type MessageEvent = {
        type: 'complexMessage';
        payload: [typeof state];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const handler = sinon.stub();
      controllerMessenger.subscribe(
        'complexMessage',
        handler,
        (obj) => obj.propA,
      );

      controllerMessenger.publish('complexMessage', state);

      expect(handler.getCall(0)?.args).toStrictEqual([1, undefined]);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish if selector returns undefined', () => {
      const state = {
        propA: undefined,
        propB: 1,
      };
      type MessageEvent = {
        type: 'complexMessage';
        payload: [typeof state];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();
      const handler = sinon.stub();
      controllerMessenger.subscribe(
        'complexMessage',
        handler,
        (obj) => obj.propA,
      );

      controllerMessenger.publish('complexMessage', state);

      expect(handler.callCount).toBe(0);
    });
  });

  describe('on later state change', () => {
    it('should call selector event handler with previous selector return value', () => {
      type MessageEvent = {
        type: 'complexMessage';
        payload: [Record<string, unknown>];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();

      const handler = sinon.stub();
      controllerMessenger.subscribe(
        'complexMessage',
        handler,
        (obj) => obj.prop1,
      );
      controllerMessenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });
      controllerMessenger.publish('complexMessage', { prop1: 'z', prop2: 'b' });

      expect(handler.getCall(0).calledWithExactly('a', undefined)).toBe(true);
      expect(handler.getCall(1).calledWithExactly('z', 'a')).toBe(true);
      expect(handler.callCount).toBe(2);
    });

    it('should publish event with selector to subscriber', () => {
      type MessageEvent = {
        type: 'complexMessage';
        payload: [Record<string, unknown>];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();

      const handler = sinon.stub();
      controllerMessenger.subscribe(
        'complexMessage',
        handler,
        (obj) => obj.prop1,
      );
      controllerMessenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });

      expect(handler.calledWithExactly('a', undefined)).toBe(true);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish event with selector if selector return value is unchanged', () => {
      type MessageEvent = {
        type: 'complexMessage';
        payload: [Record<string, unknown>];
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        MessageEvent
      >();

      const handler = sinon.stub();
      controllerMessenger.subscribe(
        'complexMessage',
        handler,
        (obj) => obj.prop1,
      );
      controllerMessenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });
      controllerMessenger.publish('complexMessage', { prop1: 'a', prop3: 'c' });

      expect(handler.calledWithExactly('a', undefined)).toBe(true);
      expect(handler.callCount).toBe(1);
    });
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

    expect(handler1.calledWithExactly('a', undefined)).toBe(true);
    expect(handler1.callCount).toBe(1);
    expect(handler2.calledWithExactly('a', undefined)).toBe(true);
    expect(handler2.callCount).toBe(1);
    expect(
      selector.getCall(0).calledWithExactly({ prop1: 'a', prop2: 'b' }),
    ).toBe(true);

    expect(
      selector.getCall(1).calledWithExactly({ prop1: 'a', prop2: 'b' }),
    ).toBe(true);

    expect(
      selector.getCall(2).calledWithExactly({ prop1: 'a', prop3: 'c' }),
    ).toBe(true);

    expect(
      selector.getCall(3).calledWithExactly({ prop1: 'a', prop3: 'c' }),
    ).toBe(true);
    expect(selector.callCount).toBe(4);
  });

  it('should throw subscriber errors in a timeout', () => {
    const setTimeoutStub = sinon.stub(globalThis, 'setTimeout');
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub().throws(() => new Error('Example error'));
    controllerMessenger.subscribe('message', handler);

    expect(() => controllerMessenger.publish('message', 'hello')).not.toThrow();
    expect(setTimeoutStub.callCount).toBe(1);
    const onTimeout = setTimeoutStub.firstCall.args[0];
    expect(() => onTimeout()).toThrow('Example error');
  });

  it('should continue calling subscribers when one throws', () => {
    const setTimeoutStub = sinon.stub(globalThis, 'setTimeout');
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler1 = sinon.stub().throws(() => new Error('Example error'));
    const handler2 = sinon.stub();
    controllerMessenger.subscribe('message', handler1);
    controllerMessenger.subscribe('message', handler2);

    expect(() => controllerMessenger.publish('message', 'hello')).not.toThrow();

    expect(handler1.calledWithExactly('hello')).toBe(true);
    expect(handler1.callCount).toBe(1);
    expect(handler2.calledWithExactly('hello')).toBe(true);
    expect(handler2.callCount).toBe(1);
    expect(setTimeoutStub.callCount).toBe(1);
    const onTimeout = setTimeoutStub.firstCall.args[0];
    expect(() => onTimeout()).toThrow('Example error');
  });

  it('should not call subscriber after unsubscribing', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const controllerMessenger = new ControllerMessenger<never, MessageEvent>();

    const handler = sinon.stub();
    controllerMessenger.subscribe('message', handler);
    controllerMessenger.unsubscribe('message', handler);
    controllerMessenger.publish('message', 'hello');

    expect(handler.callCount).toBe(0);
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

    expect(handler.callCount).toBe(0);
    expect(selector.callCount).toBe(0);
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

    expect(handler.callCount).toBe(0);
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

    expect(handler.callCount).toBe(0);
  });
});
