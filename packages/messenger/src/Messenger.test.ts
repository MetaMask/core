import type { Patch } from 'immer';
import sinon from 'sinon';

import { Messenger } from './Messenger';

describe('Messenger', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should allow registering and calling an action handler', () => {
    type CountAction = {
      type: 'Fixture:count';
      handler: (increment: number) => void;
    };
    const messenger = new Messenger<'Fixture', CountAction, never>({
      namespace: 'Fixture',
    });

    let count = 0;
    messenger.registerActionHandler('Fixture:count', (increment: number) => {
      count += increment;
    });
    messenger.call('Fixture:count', 1);

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
      | { type: 'Fixture:concat'; handler: (message: string) => void }
      | { type: 'Fixture:reset'; handler: (initialMessage: string) => void };
    const messenger = new Messenger<
      'Fixture',
      MessageAction | GetOtherState,
      OtherStateChange
    >({ namespace: 'Fixture' });

    let message = '';
    messenger.registerActionHandler(
      'Fixture:reset',
      (initialMessage: string) => {
        message = initialMessage;
      },
    );

    messenger.registerActionHandler('Fixture:concat', (s: string) => {
      message += s;
    });

    messenger.call('Fixture:reset', 'hello');
    messenger.call('Fixture:concat', ', world');

    expect(message).toBe('hello, world');
  });

  it('should allow registering and calling an action handler with no parameters', () => {
    type IncrementAction = { type: 'Fixture:increment'; handler: () => void };
    const messenger = new Messenger<'Fixture', IncrementAction, never>({
      namespace: 'Fixture',
    });

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
    const messenger = new Messenger<'Fixture', MessageAction, never>({
      namespace: 'Fixture',
    });

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
    const messenger = new Messenger<'Fixture', AddAction, never>({
      namespace: 'Fixture',
    });

    messenger.registerActionHandler('Fixture:add', (a, b) => {
      return a + b;
    });
    const result = messenger.call('Fixture:add', 5, 10);

    expect(result).toBe(15);
  });

  it('should not allow registering multiple action handlers under the same name', () => {
    type PingAction = { type: 'Fixture:ping'; handler: () => void };
    const messenger = new Messenger<'Fixture', PingAction, never>({
      namespace: 'Fixture',
    });

    messenger.registerActionHandler('Fixture:ping', () => undefined);

    expect(() => {
      messenger.registerActionHandler('Fixture:ping', () => undefined);
    }).toThrow('A handler for Fixture:ping has already been registered');
  });

  it('should throw when calling unregistered action', () => {
    type PingAction = { type: 'Fixture:ping'; handler: () => void };
    const messenger = new Messenger<'Fixture', PingAction, never>({
      namespace: 'Fixture',
    });

    expect(() => {
      messenger.call('Fixture:ping');
    }).toThrow('A handler for Fixture:ping has not been registered');
  });

  it('should throw when calling an action that has been unregistered', () => {
    type PingAction = { type: 'Fixture:ping'; handler: () => void };
    const messenger = new Messenger<'Fixture', PingAction, never>({
      namespace: 'Fixture',
    });

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
    const messenger = new Messenger<'Fixture', PingAction, never>({
      namespace: 'Fixture',
    });

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

  it('should throw when calling a delegated action after actions have been reset', () => {
    type PingAction = { type: 'Fixture:ping'; handler: () => void };
    const messenger = new Messenger<'Fixture', PingAction, never>({
      namespace: 'Fixture',
    });
    let pingCount = 0;
    messenger.registerActionHandler('Fixture:ping', () => {
      pingCount += 1;
    });
    const delegatedMessenger = new Messenger<'Destination', PingAction, never>({
      namespace: 'Destination',
    });
    messenger.delegate({
      messenger: delegatedMessenger,
      actions: ['Fixture:ping'],
    });

    messenger.clearActions();

    expect(() => {
      delegatedMessenger.call('Fixture:ping');
    }).toThrow('A handler for Fixture:ping has not been registered');
    expect(pingCount).toBe(0);
  });

  it('should publish event to subscriber', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

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
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

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
    const messenger = new Messenger<'Fixture', never, PingEvent>({
      namespace: 'Fixture',
    });

    const handler = sinon.stub();
    messenger.subscribe('Fixture:ping', handler);
    messenger.publish('Fixture:ping');

    expect(handler.calledWithExactly()).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event with multiple payload parameters to subscriber', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string, string] };
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

    const handler = sinon.stub();
    messenger.subscribe('Fixture:message', handler);
    messenger.publish('Fixture:message', 'hello', 'there');

    expect(handler.calledWithExactly('hello', 'there')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event once to subscriber even if subscribed multiple times', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

    const handler = sinon.stub();
    messenger.subscribe('Fixture:message', handler);
    messenger.subscribe('Fixture:message', handler);
    messenger.publish('Fixture:message', 'hello');

    expect(handler.calledWithExactly('hello')).toBe(true);
    expect(handler.callCount).toBe(1);
  });

  it('should publish event to many subscribers', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

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
      const messenger = new Messenger<'Fixture', never, MessageEvent>({
        namespace: 'Fixture',
      });
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
      const messenger = new Messenger<'Fixture', never, MessageEvent>({
        namespace: 'Fixture',
      });
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
      const messenger = new Messenger<'Fixture', never, MessageEvent>({
        namespace: 'Fixture',
      });
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
      const messenger = new Messenger<'Fixture', never, MessageEvent>({
        namespace: 'Fixture',
      });
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
      const messenger = new Messenger<'Fixture', never, MessageEvent>({
        namespace: 'Fixture',
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

  describe('on later state change', () => {
    it('should call selector event handler with previous selector return value', () => {
      type MessageEvent = {
        type: 'Fixture:complexMessage';
        payload: [Record<string, unknown>];
      };
      const messenger = new Messenger<'Fixture', never, MessageEvent>({
        namespace: 'Fixture',
      });

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
      const messenger = new Messenger<'Fixture', never, MessageEvent>({
        namespace: 'Fixture',
      });

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
      const messenger = new Messenger<'Fixture', never, MessageEvent>({
        namespace: 'Fixture',
      });

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
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

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
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

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
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

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
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

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
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

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
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

    const handler = sinon.stub();
    expect(() => messenger.unsubscribe('Fixture:message', handler)).toThrow(
      'Subscription not found for event: Fixture:message',
    );
  });

  it('should throw when unsubscribing a handler that is not subscribed', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

    const handler1 = sinon.stub();
    const handler2 = sinon.stub();
    messenger.subscribe('Fixture:message', handler1);

    expect(() => messenger.unsubscribe('Fixture:message', handler2)).toThrow(
      'Subscription not found for event: Fixture:message',
    );
  });

  it('should not call subscriber after clearing event subscriptions', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

    const handler = sinon.stub();
    messenger.subscribe('Fixture:message', handler);
    messenger.clearEventSubscriptions('Fixture:message');
    messenger.publish('Fixture:message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  it('should not throw when clearing event that has no subscriptions', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

    expect(() =>
      messenger.clearEventSubscriptions('Fixture:message'),
    ).not.toThrow();
  });

  it('should not call subscriber after resetting subscriptions', () => {
    type MessageEvent = { type: 'Fixture:message'; payload: [string] };
    const messenger = new Messenger<'Fixture', never, MessageEvent>({
      namespace: 'Fixture',
    });

    const handler = sinon.stub();
    messenger.subscribe('Fixture:message', handler);
    messenger.clearSubscriptions();
    messenger.publish('Fixture:message', 'hello');

    expect(handler.callCount).toBe(0);
  });

  describe('registerMethodActionHandlers', () => {
    it('should register action handlers for specified methods on the given messenger client', () => {
      type TestActions =
        | { type: 'TestService:getType'; handler: () => string }
        | {
            type: 'TestService:getCount';
            handler: () => number;
          };

      const messenger = new Messenger<'TestService', TestActions, never>({
        namespace: 'TestService',
      });

      class TestService {
        name = 'TestService' as const;

        getType() {
          return 'api';
        }

        getCount() {
          return 42;
        }
      }

      const service = new TestService();
      const methodNames = ['getType', 'getCount'] as const;

      messenger.registerMethodActionHandlers(service, methodNames);

      const state = messenger.call('TestService:getType');
      expect(state).toBe('api');

      const count = messenger.call('TestService:getCount');
      expect(count).toBe(42);
    });

    it('should bind action handlers to the given messenger client', () => {
      type TestAction = {
        type: 'TestService:getPrivateValue';
        handler: () => string;
      };
      const messenger = new Messenger<'TestService', TestAction, never>({
        namespace: 'TestService',
      });

      class TestService {
        name = 'TestService' as const;

        privateValue = 'secret';

        getPrivateValue() {
          return this.privateValue;
        }
      }

      const service = new TestService();
      messenger.registerMethodActionHandlers(service, ['getPrivateValue']);

      const result = messenger.call('TestService:getPrivateValue');
      expect(result).toBe('secret');
    });

    it('should handle async methods', async () => {
      type TestAction = {
        type: 'TestService:fetchData';
        handler: (id: string) => Promise<string>;
      };
      const messenger = new Messenger<'TestService', TestAction, never>({
        namespace: 'TestService',
      });

      class TestService {
        name = 'TestService' as const;

        async fetchData(id: string) {
          return `data-${id}`;
        }
      }

      const service = new TestService();
      messenger.registerMethodActionHandlers(service, ['fetchData']);

      const result = await messenger.call('TestService:fetchData', '123');
      expect(result).toBe('data-123');
    });

    it('should not throw when given an empty methodNames array', () => {
      type TestAction = { type: 'TestController:test'; handler: () => void };
      const messenger = new Messenger<'TestController', TestAction, never>({
        namespace: 'TestController',
      });

      class TestController {
        name = 'TestController' as const;
      }

      const controller = new TestController();
      const methodNames: readonly string[] = [];

      expect(() => {
        messenger.registerMethodActionHandlers(
          controller,
          methodNames as never[],
        );
      }).not.toThrow();
    });

    it('should skip non-function properties', () => {
      type TestAction = {
        type: 'TestController:getValue';
        handler: () => string;
      };
      const messenger = new Messenger<'TestController', TestAction, never>({
        namespace: 'TestController',
      });

      class TestController {
        name = 'TestController' as const;

        readonly nonFunction = 'not a function';

        getValue() {
          return 'test';
        }
      }

      const controller = new TestController();
      messenger.registerMethodActionHandlers(controller, ['getValue']);

      // getValue should be registered
      expect(messenger.call('TestController:getValue')).toBe('test');

      // nonFunction should not be registered
      expect(() => {
        // @ts-expect-error - This is a test
        messenger.call('TestController:nonFunction');
      }).toThrow(
        'A handler for TestController:nonFunction has not been registered',
      );
    });

    it('should work with class inheritance', () => {
      type TestActions =
        | { type: 'ChildController:baseMethod'; handler: () => string }
        | { type: 'ChildController:childMethod'; handler: () => string };

      const messenger = new Messenger<'ChildController', TestActions, never>({
        namespace: 'ChildController',
      });

      class BaseController<Namespace extends string> {
        name: Namespace;

        constructor({ namespace }: { namespace: Namespace }) {
          this.name = namespace;
        }

        baseMethod() {
          return 'base method';
        }
      }

      class ChildController extends BaseController<'ChildController'> {
        name = 'ChildController' as const;

        constructor() {
          super({ namespace: 'ChildController' });
        }

        childMethod() {
          return 'child method';
        }
      }

      const controller = new ChildController();
      messenger.registerMethodActionHandlers(controller, [
        'baseMethod',
        'childMethod',
      ]);

      expect(messenger.call('ChildController:baseMethod')).toBe('base method');
      expect(messenger.call('ChildController:childMethod')).toBe(
        'child method',
      );
    });
  });

  describe('delegate', () => {
    it('allows subscribing to delegated event', () => {
      type ExampleEvent = {
        type: 'Source:event';
        payload: ['test'];
      };
      const sourceMessenger = new Messenger<'Source', never, ExampleEvent>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        never,
        ExampleEvent
      >({ namespace: 'Destination' });
      const subscriber = jest.fn();

      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        events: ['Source:event'],
      });

      delegatedMessenger.subscribe('Source:event', subscriber);
      sourceMessenger.publish('Source:event', 'test');
      expect(subscriber).toHaveBeenCalledWith('test');
    });

    it('correctly registers initial event payload when delegated after payload is set', () => {
      type ExampleEvent = {
        type: 'Source:event';
        payload: [string];
      };
      const sourceMessenger = new Messenger<'Source', never, ExampleEvent>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        never,
        ExampleEvent
      >({ namespace: 'Destination' });
      const subscriber = jest.fn();

      sourceMessenger.registerInitialEventPayload({
        eventType: 'Source:event',
        getPayload: () => ['test'],
      });
      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        events: ['Source:event'],
      });

      delegatedMessenger.subscribe(
        'Source:event',
        subscriber,
        (payloadEntry) => payloadEntry.length,
      );
      sourceMessenger.publish('Source:event', 'four'); // same length as initial payload
      expect(subscriber).not.toHaveBeenCalled();
      sourceMessenger.publish('Source:event', '12345'); // different length
      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith(5, 4);
    });

    it('correctly registers initial event payload when delegated before payload is set', () => {
      type ExampleEvent = {
        type: 'Source:event';
        payload: [string];
      };
      const sourceMessenger = new Messenger<'Source', never, ExampleEvent>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        never,
        ExampleEvent
      >({ namespace: 'Destination' });
      const subscriber = jest.fn();

      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        events: ['Source:event'],
      });
      sourceMessenger.registerInitialEventPayload({
        eventType: 'Source:event',
        getPayload: () => ['test'],
      });

      delegatedMessenger.subscribe(
        'Source:event',
        subscriber,
        (payloadEntry) => payloadEntry.length,
      );
      sourceMessenger.publish('Source:event', 'four'); // same length as initial payload
      expect(subscriber).not.toHaveBeenCalled();
      sourceMessenger.publish('Source:event', '12345'); // different length
      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith(5, 4);
    });

    it('allows calling delegated action', () => {
      type ExampleAction = {
        type: 'Source:getLength';
        handler: (input: string) => number;
      };
      const sourceMessenger = new Messenger<'Source', ExampleAction, never>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        ExampleAction,
        never
      >({ namespace: 'Destination' });
      const handler = jest.fn((input) => input.length);
      sourceMessenger.registerActionHandler('Source:getLength', handler);

      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        actions: ['Source:getLength'],
      });

      const result = delegatedMessenger.call('Source:getLength', 'test');
      expect(result).toBe(4);
      expect(handler).toHaveBeenCalledWith('test');
    });

    it('allows calling delegated action that is not registered yet at time of delegation', () => {
      type ExampleAction = {
        type: 'Source:getLength';
        handler: (input: string) => number;
      };
      const sourceMessenger = new Messenger<'Source', ExampleAction, never>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        ExampleAction,
        never
      >({ namespace: 'Destination' });
      const handler = jest.fn((input) => input.length);

      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        actions: ['Source:getLength'],
      });
      // registration happens after delegation
      sourceMessenger.registerActionHandler('Source:getLength', handler);

      const result = delegatedMessenger.call('Source:getLength', 'test');
      expect(result).toBe(4);
      expect(handler).toHaveBeenCalledWith('test');
    });

    it('throws an error when delegated action is called before it is registered', () => {
      type ExampleAction = {
        type: 'Source:getLength';
        handler: (input: string) => number;
      };
      const sourceMessenger = new Messenger<'Source', ExampleAction, never>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        ExampleAction,
        never
      >({ namespace: 'Destination' });

      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        actions: ['Source:getLength'],
      });

      expect(() => delegatedMessenger.call('Source:getLength', 'test')).toThrow(
        `Cannot call 'Source:getLength', action not registered.`,
      );
    });

    it('unregisters delegated action handlers when action is unregistered', () => {
      type ExampleAction = {
        type: 'Source:getLength';
        handler: (input: string) => number;
      };
      const sourceMessenger = new Messenger<'Source', ExampleAction, never>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        ExampleAction,
        never
      >({ namespace: 'Destination' });
      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        actions: ['Source:getLength'],
      });

      sourceMessenger.unregisterActionHandler('Source:getLength');

      expect(() => delegatedMessenger.call('Source:getLength', 'test')).toThrow(
        `A handler for Source:getLength has not been registered`,
      );
    });
  });

  describe('revoke', () => {
    it('allows revoking a delegated event', () => {
      type ExampleEvent = {
        type: 'Source:event';
        payload: ['test'];
      };
      const sourceMessenger = new Messenger<'Source', never, ExampleEvent>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        never,
        ExampleEvent
      >({ namespace: 'Destination' });
      const subscriber = jest.fn();
      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        events: ['Source:event'],
      });
      delegatedMessenger.subscribe('Source:event', subscriber);
      sourceMessenger.publish('Source:event', 'test');
      expect(subscriber).toHaveBeenCalledWith('test');
      expect(subscriber).toHaveBeenCalledTimes(1);

      sourceMessenger.revoke({
        messenger: delegatedMessenger,
        events: ['Source:event'],
      });
      sourceMessenger.publish('Source:event', 'test');

      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('allows revoking both a delegated and undelegated event', () => {
      type ExampleFirstEvent = {
        type: 'Source:firstEvent';
        payload: ['first'];
      };
      type ExampleSecondEvent = {
        type: 'Source:secondEvent';
        payload: ['second'];
      };
      const sourceMessenger = new Messenger<
        'Source',
        never,
        ExampleFirstEvent | ExampleSecondEvent
      >({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        never,
        ExampleFirstEvent | ExampleSecondEvent
      >({ namespace: 'Destination' });
      const subscriber = jest.fn();
      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        events: ['Source:firstEvent'],
      });
      delegatedMessenger.subscribe('Source:firstEvent', subscriber);
      sourceMessenger.publish('Source:firstEvent', 'first');
      expect(subscriber).toHaveBeenCalledWith('first');
      expect(subscriber).toHaveBeenCalledTimes(1);

      expect(() =>
        sourceMessenger.revoke({
          messenger: delegatedMessenger,
          // Second event here is not delegated, but first is
          events: ['Source:firstEvent', 'Source:secondEvent'],
        }),
      ).not.toThrow();
      sourceMessenger.publish('Source:firstEvent', 'first');
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('allows revoking an event that is delegated elsewhere', () => {
      type ExampleEvent = {
        type: 'Source:event';
        payload: ['first test' | 'second test'];
      };
      const sourceMessenger = new Messenger<'Source', never, ExampleEvent>({
        namespace: 'Source',
      });
      const firstDelegatedMessenger = new Messenger<
        'FirstDestination',
        never,
        ExampleEvent
      >({ namespace: 'FirstDestination' });
      const secondDelegatedMessenger = new Messenger<
        'SecondDestination',
        never,
        ExampleEvent
      >({ namespace: 'SecondDestination' });
      const firstSubscriber = jest.fn();
      const secondSubscriber = jest.fn();
      sourceMessenger.delegate({
        messenger: firstDelegatedMessenger,
        events: ['Source:event'],
      });
      sourceMessenger.delegate({
        messenger: secondDelegatedMessenger,
        events: ['Source:event'],
      });
      firstDelegatedMessenger.subscribe('Source:event', firstSubscriber);
      secondDelegatedMessenger.subscribe('Source:event', secondSubscriber);
      sourceMessenger.publish('Source:event', 'first test');
      expect(firstSubscriber).toHaveBeenCalledWith('first test');
      expect(firstSubscriber).toHaveBeenCalledTimes(1);
      expect(secondSubscriber).toHaveBeenCalledWith('first test');
      expect(secondSubscriber).toHaveBeenCalledTimes(1);

      sourceMessenger.revoke({
        messenger: firstDelegatedMessenger,
        events: ['Source:event'],
      });
      sourceMessenger.publish('Source:event', 'second test');

      expect(firstSubscriber).toHaveBeenCalledTimes(1);
      expect(secondSubscriber).toHaveBeenCalledWith('second test');
      expect(secondSubscriber).toHaveBeenCalledTimes(2);
    });

    it('ignores revokation of event that is not delegated to the given messenger, but is delegated elsewhere', () => {
      type ExampleEvent = {
        type: 'Source:event';
        payload: ['first test' | 'second test'];
      };
      const sourceMessenger = new Messenger<'Source', never, ExampleEvent>({
        namespace: 'Source',
      });
      const firstDelegatedMessenger = new Messenger<
        'FirstDestination',
        never,
        ExampleEvent
      >({ namespace: 'FirstDestination' });
      const secondDelegatedMessenger = new Messenger<
        'SecondDestination',
        never,
        ExampleEvent
      >({ namespace: 'SecondDestination' });
      const firstSubscriber = jest.fn();
      sourceMessenger.delegate({
        messenger: firstDelegatedMessenger,
        events: ['Source:event'],
      });
      firstDelegatedMessenger.subscribe('Source:event', firstSubscriber);
      sourceMessenger.publish('Source:event', 'first test');
      expect(firstSubscriber).toHaveBeenCalledWith('first test');
      expect(firstSubscriber).toHaveBeenCalledTimes(1);

      expect(() =>
        sourceMessenger.revoke({
          messenger: secondDelegatedMessenger,
          events: ['Source:event'],
        }),
      ).not.toThrow();
      sourceMessenger.publish('Source:event', 'second test');
      expect(firstSubscriber).toHaveBeenCalledWith('second test');
      expect(firstSubscriber).toHaveBeenCalledTimes(2);
    });

    it('ignores revokation of event that is not delegated', () => {
      type ExampleEvent = {
        type: 'Source:event';
        payload: ['test'];
      };
      const sourceMessenger = new Messenger<'Source', never, ExampleEvent>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        never,
        ExampleEvent
      >({ namespace: 'Destination' });

      expect(() =>
        sourceMessenger.revoke({
          messenger: delegatedMessenger,
          events: ['Source:event'],
        }),
      ).not.toThrow();
    });

    it('allows revoking a delegated action', () => {
      type ExampleAction = {
        type: 'Source:getLength';
        handler: (input: string) => number;
      };
      const sourceMessenger = new Messenger<'Source', ExampleAction, never>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        ExampleAction,
        never
      >({ namespace: 'Destination' });
      const handler = jest.fn((input) => input.length);

      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        actions: ['Source:getLength'],
      });
      sourceMessenger.registerActionHandler('Source:getLength', handler);
      const result = delegatedMessenger.call('Source:getLength', 'test');
      expect(result).toBe(4);
      expect(handler).toHaveBeenCalledWith('test');
      expect(handler).toHaveBeenCalledTimes(1);

      sourceMessenger.revoke({
        messenger: delegatedMessenger,
        actions: ['Source:getLength'],
      });

      expect(() => delegatedMessenger.call('Source:getLength', 'test')).toThrow(
        'A handler for Source:getLength has not been registered',
      );
    });

    it('allows revoking both a delegated and undelegated action', () => {
      type ExampleFirstAction = {
        type: 'Source:getLength';
        handler: (input: string) => number;
      };
      type ExampleSecondAction = {
        type: 'Source:getRandomString';
        handler: (seed: string) => string;
      };
      const sourceMessenger = new Messenger<
        'Source',
        ExampleFirstAction | ExampleSecondAction,
        never
      >({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        ExampleFirstAction | ExampleSecondAction,
        never
      >({ namespace: 'Destination' });
      const handler = jest.fn((input) => input.length);

      sourceMessenger.delegate({
        messenger: delegatedMessenger,
        actions: ['Source:getLength'],
      });
      sourceMessenger.registerActionHandler('Source:getLength', handler);
      const result = delegatedMessenger.call('Source:getLength', 'test');
      expect(result).toBe(4);
      expect(handler).toHaveBeenCalledWith('test');
      expect(handler).toHaveBeenCalledTimes(1);

      expect(() =>
        sourceMessenger.revoke({
          messenger: delegatedMessenger,
          // Second action is not delegated, but first is
          actions: ['Source:getLength', 'Source:getRandomString'],
        }),
      ).not.toThrow();
      expect(() => delegatedMessenger.call('Source:getLength', 'test')).toThrow(
        'A handler for Source:getLength has not been registered',
      );
      expect(() =>
        delegatedMessenger.call('Source:getRandomString', 'test'),
      ).toThrow('A handler for Source:getRandomString has not been registered');
    });

    it('allows revoking a delegated action that is delegated elsewhere', () => {
      type ExampleAction = {
        type: 'Source:getLength';
        handler: (input: string) => number;
      };
      const sourceMessenger = new Messenger<'Source', ExampleAction, never>({
        namespace: 'Source',
      });
      const firstDelegatedMessenger = new Messenger<
        'FirstDestination',
        ExampleAction,
        never
      >({ namespace: 'FirstDestination' });
      const secondDelegatedMessenger = new Messenger<
        'SecondDestination',
        ExampleAction,
        never
      >({ namespace: 'SecondDestination' });
      const handler = jest.fn((input) => input.length);

      sourceMessenger.delegate({
        messenger: firstDelegatedMessenger,
        actions: ['Source:getLength'],
      });
      sourceMessenger.delegate({
        messenger: secondDelegatedMessenger,
        actions: ['Source:getLength'],
      });
      sourceMessenger.registerActionHandler('Source:getLength', handler);
      const firstResult = firstDelegatedMessenger.call(
        'Source:getLength',
        'first test', // length 10
      );
      const secondResult = secondDelegatedMessenger.call(
        'Source:getLength',
        'second test', // length 11
      );
      expect(firstResult).toBe(10);
      expect(secondResult).toBe(11);
      expect(handler).toHaveBeenCalledWith('first test');
      expect(handler).toHaveBeenCalledWith('second test');
      expect(handler).toHaveBeenCalledTimes(2);

      sourceMessenger.revoke({
        messenger: firstDelegatedMessenger,
        actions: ['Source:getLength'],
      });

      expect(() =>
        firstDelegatedMessenger.call('Source:getLength', 'test'),
      ).toThrow('A handler for Source:getLength has not been registered');
      const thirdResult = secondDelegatedMessenger.call(
        'Source:getLength',
        'third test', // length 10
      );
      expect(thirdResult).toBe(10);
      expect(handler).toHaveBeenCalledWith('third test');
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('ignores revokation of action that is not delegated to the given messenger, but is delegated elsewhere', () => {
      type ExampleAction = {
        type: 'Source:getLength';
        handler: (input: string) => number;
      };
      const sourceMessenger = new Messenger<'Source', ExampleAction, never>({
        namespace: 'Source',
      });
      const firstDelegatedMessenger = new Messenger<
        'FirstDestination',
        ExampleAction,
        never
      >({ namespace: 'FirstDestination' });
      const secondDelegatedMessenger = new Messenger<
        'SecondDestination',
        ExampleAction,
        never
      >({ namespace: 'SecondDestination' });
      const handler = jest.fn((input) => input.length);
      sourceMessenger.delegate({
        messenger: firstDelegatedMessenger,
        actions: ['Source:getLength'],
      });
      sourceMessenger.registerActionHandler('Source:getLength', handler);

      expect(() =>
        sourceMessenger.revoke({
          // This messenger was never delegated this action
          messenger: secondDelegatedMessenger,
          actions: ['Source:getLength'],
        }),
      ).not.toThrow();
      const result = firstDelegatedMessenger.call(
        'Source:getLength',
        'test', // length 4
      );
      expect(result).toBe(4);
      expect(handler).toHaveBeenCalledWith('test');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('ignores revokation of action that is not delegated', () => {
      type ExampleAction = {
        type: 'Source:getLength';
        handler: (input: string) => number;
      };
      const sourceMessenger = new Messenger<'Source', ExampleAction, never>({
        namespace: 'Source',
      });
      const delegatedMessenger = new Messenger<
        'Destination',
        ExampleAction,
        never
      >({ namespace: 'Destination' });

      expect(() =>
        sourceMessenger.revoke({
          messenger: delegatedMessenger,
          actions: ['Source:getLength'],
        }),
      ).not.toThrow();
    });
  });
});
