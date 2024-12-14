import type { Patch } from 'immer';
import * as sinon from 'sinon';

import { Messenger } from './Messenger';

describe('Messenger', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should allow registering and calling an action handler', () => {
    type CountAction = {
      type: 'Count:count';
      handler: (increment: number) => void;
    };
    const messenger = new Messenger<CountAction, never, 'Count'>('Count');

    let count = 0;
    messenger.registerActionHandler('Count:count', (increment: number) => {
      count += increment;
    });
    messenger.call('Count:count', 1);

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
      | { type: 'ThisController:concat'; handler: (message: string) => void }
      | {
          type: 'ThisController:reset';
          handler: (initialMessage: string) => void;
        };
    const messenger = new Messenger<
      MessageAction | GetOtherState,
      OtherStateChange,
      'ThisController'
    >('ThisController');

    let message = '';
    messenger.registerActionHandler(
      'ThisController:reset',
      (initialMessage: string) => {
        message = initialMessage;
      },
    );

    messenger.registerActionHandler('ThisController:concat', (s: string) => {
      message += s;
    });

    messenger.call('ThisController:reset', 'hello');
    messenger.call('ThisController:concat', ', world');

    expect(message).toBe('hello, world');
  });

  it('should allow registering and calling an action handler with no parameters', () => {
    type IncrementAction = { type: 'Fixture:increment'; handler: () => void };
    const messenger = new Messenger<IncrementAction, never, 'Fixture'>(
      'Fixture',
    );

    let count = 0;
    messenger.registerActionHandler('Fixture:increment', () => {
      count += 1;
    });
    messenger.call('Fixture:increment');

    expect(count).toBe(1);
  });

  it('should allow registering and calling an action handler with multiple parameters', () => {
    type MessageAction = {
      type: 'Fixture:message';
      handler: (to: string, message: string) => void;
    };
    const messenger = new Messenger<MessageAction, never, 'Fixture'>('Fixture');

    const messages: Record<string, string> = {};
    messenger.registerActionHandler('Fixture:message', (to, message) => {
      messages[to] = message;
    });
    messenger.call('Fixture:message', '0x123', 'hello');

    expect(messages['0x123']).toBe('hello');
  });

  it('should allow registering and calling an action handler with a return value', () => {
    type AddAction = {
      type: 'Fixture:add';
      handler: (a: number, b: number) => number;
    };
    const messenger = new Messenger<AddAction, never, 'Fixture'>('Fixture');

    messenger.registerActionHandler('Fixture:add', (a, b) => {
      return a + b;
    });
    const result = messenger.call('Fixture:add', 5, 10);

    expect(result).toBe(15);
  });

  it('should not allow registering multiple action handlers under the same name', () => {
    type PingAction = { type: 'Fixture:ping'; handler: () => void };
    const messenger = new Messenger<PingAction, never, 'Fixture'>('Fixture');

    messenger.registerActionHandler('Fixture:ping', () => undefined);

    expect(() => {
      messenger.registerActionHandler('Fixture:ping', () => undefined);
    }).toThrow('A handler for Fixture:ping has already been registered');
  });

  it('should throw when calling unregistered action', () => {
    type PingAction = { type: 'Fixture:ping'; handler: () => void };
    const messenger = new Messenger<PingAction, never, 'Fixture'>('Fixture');

    expect(() => {
      messenger.call('Fixture:ping');
    }).toThrow('A handler for Fixture:ping has not been registered');
  });

  it('should throw when calling an action that has been unregistered', () => {
    type PingAction = { type: 'Fixture:ping'; handler: () => void };
    const messenger = new Messenger<PingAction, never, 'Fixture'>('Fixture');

    expect(() => {
      messenger.call('Fixture:ping');
    }).toThrow('A handler for Fixture:ping has not been registered');

    let pingCount = 0;
    messenger.registerActionHandler('Fixture:ping', () => {
      pingCount += 1;
    });

    messenger.unregisterActionHandler('Fixture:ping');

    expect(() => {
      messenger.call('Fixture:ping');
    }).toThrow('A handler for Fixture:ping has not been registered');
    expect(pingCount).toBe(0);
  });

  it('should throw when calling an action after actions have been reset', () => {
    type PingAction = { type: 'Fixture:ping'; handler: () => void };
    const messenger = new Messenger<PingAction, never, 'Fixture'>('Fixture');

    expect(() => {
      messenger.call('Fixture:ping');
    }).toThrow('A handler for Fixture:ping has not been registered');

    let pingCount = 0;
    messenger.registerActionHandler('Fixture:ping', () => {
      pingCount += 1;
    });

    messenger.clearActions();

    expect(() => {
      messenger.call('Fixture:ping');
    }).toThrow('A handler for Fixture:ping has not been registered');
    expect(pingCount).toBe(0);
  });

  it('should publish event to subscriber', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler = sinon.stub();
    messenger.subscribe('Fixture:message', handler);
    messenger.publish('Fixture:message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should allow publishing multiple different events to subscriber', () => {
    type MessageEvent =
      | { type: 'Fixture:message'; payload: [string] }
      | { type: 'Fixture:ping'; payload: [] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const messageHandler = sinon.stub();
    const pingHandler = sinon.stub();
    messenger.subscribe('Fixture:message', messageHandler);
    messenger.subscribe('Fixture:ping', pingHandler);

    messenger.publish('Fixture:message', 'hello');
    messenger.publish('Fixture:ping');

    expect(messageHandler.calledWithExactly('hello')).toBe(true);
    expect(messageHandler.callCount).toBe(1);
    expect(pingHandler.calledWithExactly()).toBe(true);
    expect(pingHandler.callCount).toBe(1);
  });

  it('should publish event with no payload to subscriber', () => {
    type PingEvent = { type: 'Fixture:ping'; payload: [] };
    const messenger = new Messenger<never, PingEvent, 'Fixture'>('Fixture');

    const handler = sinon.stub();
    messenger.subscribe('Fixture:ping', handler);
    messenger.publish('Fixture:ping');

    expect(handler.calledWithExactly()).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event with multiple payload parameters to subscriber', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string, string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler = sinon.stub();
    messenger.subscribe('Fixture:message', handler);
    messenger.publish('Fixture:message', 'hello', 'there');

    expect(handler.calledWithExactly('hello', 'there')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event once to subscriber even if subscribed multiple times', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler = sinon.stub();
    messenger.subscribe('Fixture:message', handler);
    messenger.subscribe('Fixture:message', handler);
    messenger.publish('Fixture:message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event to many subscribers', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    messenger.subscribe('Fixture:message', handler1);
    messenger.subscribe('Fixture:message', handler2);
    messenger.publish('Fixture:message', 'hello');

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
        type: 'Fixture:complexMessage';
        payload: [typeof state];
      };
      const messenger = new Messenger<never, MessageEvent, 'Fixture'>(
        'Fixture',
      );
      messenger.registerInitialEventPayload({
        eventType: 'Fixture:complexMessage',
        getPayload: () => [state],
      });
      const handler = sinon.stub();
      messenger.subscribe(
        'Fixture:complexMessage',
        handler,
        (obj) => obj.propA,
      );

      state.propA += 1;
      messenger.publish('Fixture:complexMessage', state);

      expect(handler.getCall(0)?.args).toStrictEqual([2, 1]);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish event if selected payload is the same', () => {
      const state = {
        propA: 1,
        propB: 1,
      };
      type MessageEvent = {
        type: 'Fixture:complexMessage';
        payload: [typeof state];
      };
      const messenger = new Messenger<never, MessageEvent, 'Fixture'>(
        'Fixture',
      );
      messenger.registerInitialEventPayload({
        eventType: 'Fixture:complexMessage',
        getPayload: () => [state],
      });
      const handler = sinon.stub();
      messenger.subscribe(
        'Fixture:complexMessage',
        handler,
        (obj) => obj.propA,
      );

      messenger.publish('Fixture:complexMessage', state);

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
        type: 'Fixture:complexMessage';
        payload: [typeof state];
      };
      const messenger = new Messenger<never, MessageEvent, 'Fixture'>(
        'Fixture',
      );
      const handler = sinon.stub();
      messenger.subscribe(
        'Fixture:complexMessage',
        handler,
        (obj) => obj.propA,
      );

      state.propA += 1;
      messenger.publish('Fixture:complexMessage', state);

      expect(handler.getCall(0)?.args).toStrictEqual([2, undefined]);
      expect(handler.callCount).toBe(1);
    });

    it('should publish event even when selected payload does not change', () => {
      const state = {
        propA: 1,
        propB: 1,
      };
      type MessageEvent = {
        type: 'Fixture:complexMessage';
        payload: [typeof state];
      };
      const messenger = new Messenger<never, MessageEvent, 'Fixture'>(
        'Fixture',
      );
      const handler = sinon.stub();
      messenger.subscribe(
        'Fixture:complexMessage',
        handler,
        (obj) => obj.propA,
      );

      messenger.publish('Fixture:complexMessage', state);

      expect(handler.getCall(0)?.args).toStrictEqual([1, undefined]);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish if selector returns undefined', () => {
      const state = {
        propA: undefined,
        propB: 1,
      };
      type MessageEvent = {
        type: 'Fixture:complexMessage';
        payload: [typeof state];
      };
      const messenger = new Messenger<never, MessageEvent, 'Fixture'>(
        'Fixture',
      );
      const handler = sinon.stub();
      messenger.subscribe(
        'Fixture:complexMessage',
        handler,
        (obj) => obj.propA,
      );

      messenger.publish('Fixture:complexMessage', state);

      expect(handler.callCount).toBe(0);
    });
  });

  describe('on later state change', () => {
    it('should call selector event handler with previous selector return value', () => {
      type MessageEvent = {
        type: 'Fixture:complexMessage';
        payload: [Record<string, unknown>];
      };
      const messenger = new Messenger<never, MessageEvent, 'Fixture'>(
        'Fixture',
      );

      const handler = sinon.stub();
      messenger.subscribe(
        'Fixture:complexMessage',
        handler,
        (obj) => obj.prop1,
      );
      messenger.publish('Fixture:complexMessage', { prop1: 'a', prop2: 'b' });
      messenger.publish('Fixture:complexMessage', { prop1: 'z', prop2: 'b' });

      expect(handler.getCall(0).calledWithExactly('a', undefined)).toBe(true);
      expect(handler.getCall(1).calledWithExactly('z', 'a')).toBe(true);
      expect(handler.callCount).toBe(2);
    });

    it('should publish event with selector to subscriber', () => {
      type MessageEvent = {
        type: 'Fixture:complexMessage';
        payload: [Record<string, unknown>];
      };
      const messenger = new Messenger<never, MessageEvent, 'Fixture'>(
        'Fixture',
      );

      const handler = sinon.stub();
      messenger.subscribe(
        'Fixture:complexMessage',
        handler,
        (obj) => obj.prop1,
      );
      messenger.publish('Fixture:complexMessage', { prop1: 'a', prop2: 'b' });

      expect(handler.calledWithExactly('a', undefined)).toBe(true);
      expect(handler.callCount).toBe(1);
    });

    it('should not publish event with selector if selector return value is unchanged', () => {
      type MessageEvent = {
        type: 'Fixture:complexMessage';
        payload: [Record<string, unknown>];
      };
      const messenger = new Messenger<never, MessageEvent, 'Fixture'>(
        'Fixture',
      );

      const handler = sinon.stub();
      messenger.subscribe(
        'Fixture:complexMessage',
        handler,
        (obj) => obj.prop1,
      );
      messenger.publish('Fixture:complexMessage', { prop1: 'a', prop2: 'b' });
      messenger.publish('Fixture:complexMessage', { prop1: 'a', prop3: 'c' });

      expect(handler.calledWithExactly('a', undefined)).toBe(true);
      expect(handler.callCount).toBe(1);
    });
  });

  it('should publish event to many subscribers with the same selector', () => {
    type MessageEvent = {
      type: 'Fixture:complexMessage';
      payload: [Record<string, unknown>];
    };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
    messenger.subscribe('Fixture:complexMessage', handler1, selector);
    messenger.subscribe('Fixture:complexMessage', handler2, selector);
    messenger.publish('Fixture:complexMessage', { prop1: 'a', prop2: 'b' });
    messenger.publish('Fixture:complexMessage', { prop1: 'a', prop3: 'c' });

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
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler = sinon.stub().throws(() => new Error('Example error'));
    messenger.subscribe('Fixture:message', handler);

    expect(() => messenger.publish('Fixture:message', 'hello')).not.toThrow();
    expect(setTimeoutStub.callCount).toBe(1);
    const onTimeout = setTimeoutStub.firstCall.args[0];
    expect(() => onTimeout()).toThrow('Example error');
  });

  it('should continue calling subscribers when one throws', () => {
    const setTimeoutStub = sinon.stub(globalThis, 'setTimeout');
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler1 = sinon.stub().throws(() => new Error('Example error'));
    const handler2 = sinon.stub();
    messenger.subscribe('Fixture:message', handler1);
    messenger.subscribe('Fixture:message', handler2);

    expect(() => messenger.publish('Fixture:message', 'hello')).not.toThrow();

    expect(handler1.calledWithExactly('hello')).toBe(true);
    expect(handler1.callCount).toBe(1);
    expect(handler2.calledWithExactly('hello')).toBe(true);
    expect(handler2.callCount).toBe(1);
    expect(setTimeoutStub.callCount).toBe(1);
    const onTimeout = setTimeoutStub.firstCall.args[0];
    expect(() => onTimeout()).toThrow('Example error');
  });

  it('should not call subscriber after unsubscribing', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler = sinon.stub();
    messenger.subscribe('Fixture:message', handler);
    messenger.unsubscribe('Fixture:message', handler);
    messenger.publish('Fixture:message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  it('should not call subscriber with selector after unsubscribing', () => {
    type MessageEvent = {
      type: 'Fixture:complexMessage';
      payload: [Record<string, unknown>];
    };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler = sinon.stub();
    const selector = sinon.fake((obj: Record<string, unknown>) => obj.prop1);
    messenger.subscribe('Fixture:complexMessage', handler, selector);
    messenger.unsubscribe('Fixture:complexMessage', handler);
    messenger.publish('Fixture:complexMessage', { prop1: 'a', prop2: 'b' });

    expect(handler.callCount).toBe(0);
    expect(selector.callCount).toBe(0);
  });

  it('should throw when unsubscribing when there are no subscriptions', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler = sinon.stub();
    expect(() => messenger.unsubscribe('Fixture:message', handler)).toThrow(
      'Subscription not found for event: Fixture:message',
    );
  });

  it('should throw when unsubscribing a handler that is not subscribed', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    messenger.subscribe('Fixture:message', handler1);

    expect(() => messenger.unsubscribe('Fixture:message', handler2)).toThrow(
      'Subscription not found for event: Fixture:message',
    );
  });

  it('should not call subscriber after clearing event subscriptions', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler = sinon.stub();
    messenger.subscribe('Fixture:message', handler);
    messenger.clearEventSubscriptions('Fixture:message');
    messenger.publish('Fixture:message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  it('should not throw when clearing event that has no subscriptions', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    expect(() =>
      messenger.clearEventSubscriptions('Fixture:message'),
    ).not.toThrow();
  });

  it('should not call subscriber after resetting subscriptions', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<never, MessageEvent, 'Fixture'>('Fixture');

    const handler = sinon.stub();
    messenger.subscribe('Fixture:message', handler);
    messenger.clearSubscriptions();
    messenger.publish('Fixture:message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  describe('delegate', () => {
    it('allows subscribing to delegated event', () => {
      type ExampleEvent = {
        type: 'Source:Example';
        payload: ['test'];
      };
      const sourceMessenger = new Messenger<never, ExampleEvent, 'Source'>(
        'Source',
      );
      const delegatedMessenger = new Messenger<
        never,
        ExampleEvent,
        'Destination'
      >('Destination');
      const subscriber = jest.fn();

      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        events: ['Source:Example'],
      });
      delegatedMessenger.subscribe('Source:Example', subscriber);
      sourceMessenger.publish('Source:Example', 'test');

      expect(subscriber).toHaveBeenCalledWith('test');
    });

    it('allows calling delegated action', () => {
      type ExampleAction = {
        type: 'Source:Length';
        handler: (input: string) => string;
      };
      const sourceMessenger = new Messenger<ExampleAction, never, 'Source'>(
        'Source',
      );
      const delegatedMessenger = new Messenger<
        ExampleAction,
        never,
        'Destination'
      >('Destination');
      const handler = jest.fn((input) => input.length);

      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        actions: ['Source:Length'],
      });
      sourceMessenger.registerActionHandler('Source:Length', handler);
      const result = delegatedMessenger.call('Source:Length', 'test');

      expect(result).toBe(4);
      expect(handler).toHaveBeenCalledWith('test');
    });
  });
});
