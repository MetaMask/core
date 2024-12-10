import type { Patch } from 'immer';
import * as sinon from 'sinon';

import { Messenger } from './Messenger';

describe('Messenger', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should allow registering and calling an action handler', () => {
    type CountAction = { type: 'count'; handler: (increment: number) => void };
    const messenger = new Messenger<CountAction, never>();

    let count = 0;
    messenger.registerActionHandler('count', (increment: number) => {
      count += increment;
    });
    messenger.call('count', 1);

    expect(count).toBe(1);
  });

  it('should allow registering and calling multiple different action handlers', () => {
    // These 'Other' types are included to demonstrate that messenger generics can indeed be unions
    // of actions and events from different modules.
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
    const messenger = new Messenger<
      MessageAction | GetOtherState,
      OtherStateChange
    >();

    let message = '';
    messenger.registerActionHandler('reset', (initialMessage: string) => {
      message = initialMessage;
    });

    messenger.registerActionHandler('concat', (s: string) => {
      message += s;
    });

    messenger.call('reset', 'hello');
    messenger.call('concat', ', world');

    expect(message).toBe('hello, world');
  });

  it('should allow registering and calling an action handler with no parameters', () => {
    type IncrementAction = { type: 'increment'; handler: () => void };
    const messenger = new Messenger<IncrementAction, never>();

    let count = 0;
    messenger.registerActionHandler('increment', () => {
      count += 1;
    });
    messenger.call('increment');

    expect(count).toBe(1);
  });

  it('should allow registering and calling an action handler with multiple parameters', () => {
    type MessageAction = {
      type: 'message';
      handler: (to: string, message: string) => void;
    };
    const messenger = new Messenger<MessageAction, never>();

    const messages: Record<string, string> = {};
    messenger.registerActionHandler('message', (to, message) => {
      messages[to] = message;
    });
    messenger.call('message', '0x123', 'hello');

    expect(messages['0x123']).toBe('hello');
  });

  it('should allow registering and calling an action handler with a return value', () => {
    type AddAction = { type: 'add'; handler: (a: number, b: number) => number };
    const messenger = new Messenger<AddAction, never>();

    messenger.registerActionHandler('add', (a, b) => {
      return a + b;
    });
    const result = messenger.call('add', 5, 10);

    expect(result).toBe(15);
  });

  it('should not allow registering multiple action handlers under the same name', () => {
    type PingAction = { type: 'ping'; handler: () => void };
    const messenger = new Messenger<PingAction, never>();

    messenger.registerActionHandler('ping', () => undefined);

    expect(() => {
      messenger.registerActionHandler('ping', () => undefined);
    }).toThrow('A handler for ping has already been registered');
  });

  it('should throw when calling unregistered action', () => {
    type PingAction = { type: 'ping'; handler: () => void };
    const messenger = new Messenger<PingAction, never>();

    expect(() => {
      messenger.call('ping');
    }).toThrow('A handler for ping has not been registered');
  });

  it('should throw when calling an action that has been unregistered', () => {
    type PingAction = { type: 'ping'; handler: () => void };
    const messenger = new Messenger<PingAction, never>();

    expect(() => {
      messenger.call('ping');
    }).toThrow('A handler for ping has not been registered');

    let pingCount = 0;
    messenger.registerActionHandler('ping', () => {
      pingCount += 1;
    });

    messenger.unregisterActionHandler('ping');

    expect(() => {
      messenger.call('ping');
    }).toThrow('A handler for ping has not been registered');
    expect(pingCount).toBe(0);
  });

  it('should throw when calling an action after actions have been reset', () => {
    type PingAction = { type: 'ping'; handler: () => void };
    const messenger = new Messenger<PingAction, never>();

    expect(() => {
      messenger.call('ping');
    }).toThrow('A handler for ping has not been registered');

    let pingCount = 0;
    messenger.registerActionHandler('ping', () => {
      pingCount += 1;
    });

    messenger.clearActions();

    expect(() => {
      messenger.call('ping');
    }).toThrow('A handler for ping has not been registered');
    expect(pingCount).toBe(0);
  });

  it('should publish event to subscriber', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent>();

    const handler = sinon.stub();
    messenger.subscribe('message', handler);
    messenger.publish('message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should allow publishing multiple different events to subscriber', () => {
    type MessageEvent =
      | { type: 'message'; payload: [string] }
      | { type: 'ping'; payload: [] };
    const messenger = new Messenger<never, MessageEvent>();

    const messageHandler = sinon.stub();
    const pingHandler = sinon.stub();
    messenger.subscribe('message', messageHandler);
    messenger.subscribe('ping', pingHandler);

    messenger.publish('message', 'hello');
    messenger.publish('ping');

    expect(messageHandler.calledWithExactly('hello')).toBe(true);
    expect(messageHandler.callCount).toBe(1);
    expect(pingHandler.calledWithExactly()).toBe(true);
    expect(pingHandler.callCount).toBe(1);
  });

  it('should publish event with no payload to subscriber', () => {
    type PingEvent = { type: 'ping'; payload: [] };
    const messenger = new Messenger<never, PingEvent>();

    const handler = sinon.stub();
    messenger.subscribe('ping', handler);
    messenger.publish('ping');

    expect(handler.calledWithExactly()).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event with multiple payload parameters to subscriber', () => {
    type MessageEvent = { type: 'message'; payload: [string, string] };
    const messenger = new Messenger<never, MessageEvent>();

    const handler = sinon.stub();
    messenger.subscribe('message', handler);
    messenger.publish('message', 'hello', 'there');

    expect(handler.calledWithExactly('hello', 'there')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event once to subscriber even if subscribed multiple times', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent>();

    const handler = sinon.stub();
    messenger.subscribe('message', handler);
    messenger.subscribe('message', handler);
    messenger.publish('message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event to many subscribers', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent>();

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    messenger.subscribe('message', handler1);
    messenger.subscribe('message', handler2);
    messenger.publish('message', 'hello');

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
      const messenger = new Messenger<never, MessageEvent>();
      messenger.registerInitialEventPayload({
        eventType: 'complexMessage',
        getPayload: () => [state],
      });
      const handler = sinon.stub();
      messenger.subscribe('complexMessage', handler, (obj) => obj.propA);

      state.propA += 1;
      messenger.publish('complexMessage', state);

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
      const messenger = new Messenger<never, MessageEvent>();
      messenger.registerInitialEventPayload({
        eventType: 'complexMessage',
        getPayload: () => [state],
      });
      const handler = sinon.stub();
      messenger.subscribe('complexMessage', handler, (obj) => obj.propA);

      messenger.publish('complexMessage', state);

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
      const messenger = new Messenger<never, MessageEvent>();
      const handler = sinon.stub();
      messenger.subscribe('complexMessage', handler, (obj) => obj.propA);

      state.propA += 1;
      messenger.publish('complexMessage', state);

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
      const messenger = new Messenger<never, MessageEvent>();
      const handler = sinon.stub();
      messenger.subscribe('complexMessage', handler, (obj) => obj.propA);

      messenger.publish('complexMessage', state);

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
      const messenger = new Messenger<never, MessageEvent>();
      const handler = sinon.stub();
      messenger.subscribe('complexMessage', handler, (obj) => obj.propA);

      messenger.publish('complexMessage', state);

      expect(handler.callCount).toBe(0);
    });
  });

  describe('on later state change', () => {
    it('should call selector event handler with previous selector return value', () => {
      type MessageEvent = {
        type: 'complexMessage';
        payload: [Record<string, unknown>];
      };
      const messenger = new Messenger<never, MessageEvent>();

      const handler = sinon.stub();
      messenger.subscribe('complexMessage', handler, (obj) => obj.prop1);
      messenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });
      messenger.publish('complexMessage', { prop1: 'z', prop2: 'b' });

      expect(handler.getCall(0).calledWithExactly('a', undefined)).toBe(true);
      expect(handler.getCall(1).calledWithExactly('z', 'a')).toBe(true);
      expect(handler.callCount).toBe(2);
    });

    it('should publish event with selector to subscriber', () => {
      type MessageEvent = {
        type: 'complexMessage';
        payload: [Record<string, unknown>];
      };
      const messenger = new Messenger<never, MessageEvent>();

      const handler = sinon.stub();
      messenger.subscribe('complexMessage', handler, (obj) => obj.prop1);
      messenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });

      expect(handler.calledWithExactly('a', undefined)).toBe(true);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish event with selector if selector return value is unchanged', () => {
      type MessageEvent = {
        type: 'complexMessage';
        payload: [Record<string, unknown>];
      };
      const messenger = new Messenger<never, MessageEvent>();

      const handler = sinon.stub();
      messenger.subscribe('complexMessage', handler, (obj) => obj.prop1);
      messenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });
      messenger.publish('complexMessage', { prop1: 'a', prop3: 'c' });

      expect(handler.calledWithExactly('a', undefined)).toBe(true);
      expect(handler.callCount).toBe(1);
    });
  });

  it('should publish event to many subscribers with the same selector', () => {
    type MessageEvent = {
      type: 'complexMessage';
      payload: [Record<string, unknown>];
    };
    const messenger = new Messenger<never, MessageEvent>();

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
    messenger.subscribe('complexMessage', handler1, selector);
    messenger.subscribe('complexMessage', handler2, selector);
    messenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });
    messenger.publish('complexMessage', { prop1: 'a', prop3: 'c' });

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
    const messenger = new Messenger<never, MessageEvent>();

    const handler = sinon.stub().throws(() => new Error('Example error'));
    messenger.subscribe('message', handler);

    expect(() => messenger.publish('message', 'hello')).not.toThrow();
    expect(setTimeoutStub.callCount).toBe(1);
    const onTimeout = setTimeoutStub.firstCall.args[0];
    expect(() => onTimeout()).toThrow('Example error');
  });

  it('should continue calling subscribers when one throws', () => {
    const setTimeoutStub = sinon.stub(globalThis, 'setTimeout');
    type MessageEvent = { type: 'message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent>();

    const handler1 = sinon.stub().throws(() => new Error('Example error'));
    const handler2 = sinon.stub();
    messenger.subscribe('message', handler1);
    messenger.subscribe('message', handler2);

    expect(() => messenger.publish('message', 'hello')).not.toThrow();

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
    const messenger = new Messenger<never, MessageEvent>();

    const handler = sinon.stub();
    messenger.subscribe('message', handler);
    messenger.unsubscribe('message', handler);
    messenger.publish('message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  it('should not call subscriber with selector after unsubscribing', () => {
    type MessageEvent = {
      type: 'complexMessage';
      payload: [Record<string, unknown>];
    };
    const messenger = new Messenger<never, MessageEvent>();

    const handler = sinon.stub();
    const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
    messenger.subscribe('complexMessage', handler, selector);
    messenger.unsubscribe('complexMessage', handler);
    messenger.publish('complexMessage', { prop1: 'a', prop2: 'b' });

    expect(handler.callCount).toBe(0);
    expect(selector.callCount).toBe(0);
  });

  it('should throw when unsubscribing when there are no subscriptions', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent>();

    const handler = sinon.stub();
    expect(() => messenger.unsubscribe('message', handler)).toThrow(
      'Subscription not found for event: message',
    );
  });

  it('should throw when unsubscribing a handler that is not subscribed', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent>();

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    messenger.subscribe('message', handler1);

    expect(() => messenger.unsubscribe('message', handler2)).toThrow(
      'Subscription not found for event: message',
    );
  });

  it('should not call subscriber after clearing event subscriptions', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent>();

    const handler = sinon.stub();
    messenger.subscribe('message', handler);
    messenger.clearEventSubscriptions('message');
    messenger.publish('message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  it('should not throw when clearing event that has no subscriptions', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent>();

    expect(() => messenger.clearEventSubscriptions('message')).not.toThrow();
  });

  it('should not call subscriber after resetting subscriptions', () => {
    type MessageEvent = { type: 'message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent>();

    const handler = sinon.stub();
    messenger.subscribe('message', handler);
    messenger.clearSubscriptions();
    messenger.publish('message', 'hello');

    expect(handler.callCount).toBe(0);
  });
});
