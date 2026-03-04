/* eslint-disable jest/no-export */
import type { MockAnyNamespace } from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { Json } from '@metamask/utils';
import type { Draft, Patch } from 'immer';

import type {
  ControllerActions,
  ControllerEvents,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StatePropertyMetadata,
} from './BaseController';
import { BaseController, deriveStateFromMetadata } from './BaseController';

export const countControllerName = 'CountController';

type CountControllerState = {
  count: number;
};

export type CountControllerAction = ControllerGetStateAction<
  typeof countControllerName,
  CountControllerState
>;

export type CountControllerEvent = ControllerStateChangeEvent<
  typeof countControllerName,
  CountControllerState
>;

export const countControllerStateMetadata = {
  count: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
};

type CountMessenger = Messenger<
  typeof countControllerName,
  CountControllerAction,
  CountControllerEvent
>;

/**
 * Constructs a messenger for the Count controller.
 *
 * @returns A messenger for the Count controller.
 */
export function getCountMessenger(): CountMessenger {
  return new Messenger<
    typeof countControllerName,
    CountControllerAction,
    CountControllerEvent
  >({ namespace: countControllerName });
}

export class CountController extends BaseController<
  typeof countControllerName,
  CountControllerState,
  CountMessenger
> {
  update(
    callback: (
      state: Draft<CountControllerState>,
    ) => void | CountControllerState,
  ): {
    nextState: CountControllerState;
    patches: Patch[];
    inversePatches: Patch[];
  } {
    return super.update(callback);
  }

  applyPatches(patches: Patch[]): void {
    super.applyPatches(patches);
  }

  destroy(): void {
    super.destroy();
  }
}

const messagesControllerName = 'MessagesController';

type Message = {
  subject: string;
  body: string;
  headers: Record<string, string>;
};

type MessagesControllerState = {
  messages: Message[];
};

type MessagesControllerAction = ControllerGetStateAction<
  typeof messagesControllerName,
  MessagesControllerState
>;

type MessagesControllerEvent = ControllerStateChangeEvent<
  typeof messagesControllerName,
  MessagesControllerState
>;

const messagesControllerStateMetadata = {
  messages: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
};

type MessagesMessenger = Messenger<
  typeof messagesControllerName,
  MessagesControllerAction,
  MessagesControllerEvent
>;

/**
 * Constructs a messenger for the Messages controller.
 *
 * @returns A messenger for the Messages controller.
 */
function getMessagesMessenger(): MessagesMessenger {
  return new Messenger<
    typeof messagesControllerName,
    MessagesControllerAction,
    MessagesControllerEvent
  >({ namespace: messagesControllerName });
}

class MessagesController extends BaseController<
  typeof messagesControllerName,
  MessagesControllerState,
  MessagesMessenger
> {
  update(
    callback: (
      state: Draft<MessagesControllerState>,
    ) => void | MessagesControllerState,
  ): {
    nextState: MessagesControllerState;
    patches: Patch[];
    inversePatches: Patch[];
  } {
    return super.update(callback);
  }

  applyPatches(patches: Patch[]): void {
    super.applyPatches(patches);
  }

  destroy(): void {
    super.destroy();
  }
}

describe('BaseController', () => {
  it('should set initial state', () => {
    const controller = new CountController({
      messenger: getCountMessenger(),
      name: countControllerName,
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    expect(controller.state).toStrictEqual({ count: 0 });
  });

  it('should allow getting state via the getState action', () => {
    const messenger = getCountMessenger();

    // eslint-disable-next-line no-new
    new CountController({
      messenger,
      name: countControllerName,
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    expect(messenger.call('CountController:getState')).toStrictEqual({
      count: 0,
    });
  });

  it('should set initial schema', () => {
    const controller = new CountController({
      messenger: getCountMessenger(),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    expect(controller.metadata).toStrictEqual(countControllerStateMetadata);
  });

  it('should not allow reassigning the `state` property', () => {
    const controller = new CountController({
      messenger: getCountMessenger(),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    expect(() => {
      controller.state = { count: 1 };
    }).toThrow(
      "Controller state cannot be directly mutated; use 'update' method instead.",
    );
  });

  it('should not allow reassigning an object property that exists in state', () => {
    const controller = new MessagesController({
      messenger: getMessagesMessenger(),
      name: messagesControllerName,
      state: {
        messages: [
          {
            subject: 'Hi',
            body: 'Hello, I hope you have a good day',
            headers: {
              'X-Foo': 'Bar',
            },
          },
        ],
      },
      metadata: messagesControllerStateMetadata,
    });

    expect(() => {
      controller.state.messages[0].headers['X-Baz'] = 'Qux';
    }).toThrow('Cannot add property X-Baz, object is not extensible');
  });

  it('should not allow pushing a value onto an array property that exists in state', () => {
    const controller = new MessagesController({
      messenger: getMessagesMessenger(),
      name: messagesControllerName,
      state: {
        messages: [
          {
            subject: 'Hi',
            body: 'Hello, I hope you have a good day',
            headers: {
              'X-Foo': 'Bar',
            },
          },
        ],
      },
      metadata: messagesControllerStateMetadata,
    });

    expect(() => {
      controller.state.messages.push({
        subject: 'Hello again',
        body: 'Please join my network on LinkedIn',
        headers: {},
      });
    }).toThrow('Cannot add property 1, object is not extensible');
  });

  it('should allow updating state by modifying draft', () => {
    const controller = new CountController({
      messenger: getCountMessenger(),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    controller.update((draft) => {
      draft.count += 1;
    });

    expect(controller.state).toStrictEqual({ count: 1 });
  });

  it('should allow updating state by return a value', () => {
    const controller = new CountController({
      messenger: getCountMessenger(),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    controller.update(() => {
      return { count: 1 };
    });

    expect(controller.state).toStrictEqual({ count: 1 });
  });

  it('should not call publish if the state has not been modified', () => {
    const messenger = getCountMessenger();
    const publishSpy = jest.spyOn(messenger, 'publish');

    const controller = new CountController({
      messenger,
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    controller.update((_draft) => {
      // no-op
    });

    expect(controller.state).toStrictEqual({ count: 0 });
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('should return next state, patches and inverse patches after an update', () => {
    const controller = new CountController({
      messenger: getCountMessenger(),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    const returnObj = controller.update((draft) => {
      draft.count += 1;
    });

    expect(returnObj).toBeDefined();
    expect(returnObj.nextState).toStrictEqual({ count: 1 });
    expect(returnObj.patches).toStrictEqual([
      { op: 'replace', path: ['count'], value: 1 },
    ]);

    expect(returnObj.inversePatches).toStrictEqual([
      { op: 'replace', path: ['count'], value: 0 },
    ]);
  });

  it('should throw an error if update callback modifies draft and returns value', () => {
    const controller = new CountController({
      messenger: getCountMessenger(),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    expect(() => {
      controller.update((draft) => {
        draft.count += 1;
        return { count: 10 };
      });
    }).toThrow(
      '[Immer] An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft.',
    );
  });

  it('should allow for applying immer patches to state', () => {
    const controller = new CountController({
      messenger: getCountMessenger(),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    const returnObj = controller.update((draft) => {
      draft.count += 1;
    });

    controller.applyPatches(returnObj.inversePatches);

    expect(controller.state).toStrictEqual({ count: 0 });
  });

  it('should inform subscribers of state changes as a result of applying patches', () => {
    const messenger = getCountMessenger();
    const controller = new CountController({
      messenger,
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = jest.fn();

    messenger.subscribe('CountController:stateChange', listener1);
    const { inversePatches } = controller.update(() => {
      return { count: 1 };
    });

    controller.applyPatches(inversePatches);

    expect(listener1).toHaveBeenCalledTimes(2);
    expect(listener1.mock.calls[0]).toStrictEqual([
      { count: 1 },
      [{ op: 'replace', path: [], value: { count: 1 } }],
    ]);

    expect(listener1.mock.calls[1]).toStrictEqual([
      { count: 0 },
      [{ op: 'replace', path: [], value: { count: 0 } }],
    ]);
  });

  it('should inform subscribers of state changes', () => {
    const messenger = getCountMessenger();
    const controller = new CountController({
      messenger,
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = jest.fn();
    const listener2 = jest.fn();

    messenger.subscribe('CountController:stateChange', listener1);
    messenger.subscribe('CountController:stateChange', listener2);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener1.mock.calls[0]).toStrictEqual([
      { count: 1 },
      [{ op: 'replace', path: [], value: { count: 1 } }],
    ]);
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener2.mock.calls[0]).toStrictEqual([
      { count: 1 },
      [{ op: 'replace', path: [], value: { count: 1 } }],
    ]);
  });

  it('should notify a subscriber with a selector of state changes', () => {
    const messenger = getCountMessenger();
    const controller = new CountController({
      messenger,
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener = jest.fn();
    messenger.subscribe(
      'CountController:stateChange',
      listener,
      ({ count }) => {
        // Selector rounds down to nearest multiple of 10
        return Math.floor(count / 10);
      },
    );

    controller.update(() => {
      return { count: 10 };
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]).toStrictEqual([1, 0]);
  });

  it('should not inform a subscriber of state changes if the selected value is unchanged', () => {
    const messenger = getCountMessenger();
    const controller = new CountController({
      messenger,
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener = jest.fn();
    messenger.subscribe(
      'CountController:stateChange',
      listener,
      ({ count }) => {
        // Selector rounds down to nearest multiple of 10
        return Math.floor(count / 10);
      },
    );

    controller.update(() => {
      // Note that this rounds down to zero, so the selected value is still zero
      return { count: 1 };
    });

    expect(listener).toHaveBeenCalledTimes(0);
  });

  it('should inform a subscriber of each state change once even after multiple subscriptions', () => {
    const messenger = getCountMessenger();
    const controller = new CountController({
      messenger,
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = jest.fn();

    messenger.subscribe('CountController:stateChange', listener1);
    messenger.subscribe('CountController:stateChange', listener1);

    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener1.mock.calls[0]).toStrictEqual([
      { count: 1 },
      [{ op: 'replace', path: [], value: { count: 1 } }],
    ]);
  });

  it('should no longer inform a subscriber about state changes after unsubscribing', () => {
    const messenger = getCountMessenger();
    const controller = new CountController({
      messenger,
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = jest.fn();

    messenger.subscribe('CountController:stateChange', listener1);
    messenger.unsubscribe('CountController:stateChange', listener1);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1).toHaveBeenCalledTimes(0);
  });

  it('should no longer inform a subscriber about state changes after unsubscribing once, even if they subscribed many times', () => {
    const messenger = getCountMessenger();
    const controller = new CountController({
      messenger,
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = jest.fn();

    messenger.subscribe('CountController:stateChange', listener1);
    messenger.subscribe('CountController:stateChange', listener1);
    messenger.unsubscribe('CountController:stateChange', listener1);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1).toHaveBeenCalledTimes(0);
  });

  it('should throw when unsubscribing listener who was never subscribed', () => {
    const messenger = getCountMessenger();

    // eslint-disable-next-line no-new
    new CountController({
      messenger,
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = jest.fn();

    expect(() => {
      messenger.unsubscribe('CountController:stateChange', listener1);
    }).toThrow('Subscription not found for event: CountController:stateChange');
  });

  it('should no longer update subscribers after being destroyed', () => {
    const messenger = getCountMessenger();
    const controller = new CountController({
      messenger,
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = jest.fn();
    const listener2 = jest.fn();

    messenger.subscribe('CountController:stateChange', listener1);
    messenger.subscribe('CountController:stateChange', listener2);
    controller.destroy();
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1).toHaveBeenCalledTimes(0);
    expect(listener2).toHaveBeenCalledTimes(0);
  });

  describe('inter-controller communication', () => {
    // These two contrived mock controllers are setup to test with.
    // The 'VisitorController' records strings that represent visitors.
    // The 'VisitorOverflowController' monitors the 'VisitorController' to ensure the number of
    // visitors doesn't exceed the maximum capacity. If it does, it will clear out all visitors.

    const visitorName = 'VisitorController';

    type VisitorControllerState = {
      visitors: string[];
    };
    type VisitorControllerClearAction = {
      type: `${typeof visitorName}:clear`;
      handler: () => void;
    };
    type VisitorExternalActions = VisitorOverflowUpdateMaxAction;
    type VisitorControllerActions =
      | VisitorControllerClearAction
      | ControllerActions<typeof visitorName, VisitorControllerState>;
    type VisitorControllerStateChangeEvent = ControllerEvents<
      typeof visitorName,
      VisitorControllerState
    >;
    type VisitorExternalEvents = VisitorOverflowStateChangeEvent;
    type VisitorControllerEvents = VisitorControllerStateChangeEvent;

    const visitorControllerStateMetadata = {
      visitors: {
        includeInDebugSnapshot: true,
        includeInStateLogs: true,
        persist: true,
        usedInUi: true,
      },
    };

    type VisitorMessenger = Messenger<
      typeof visitorName,
      VisitorControllerActions | VisitorExternalActions,
      VisitorControllerEvents | VisitorExternalEvents
    >;
    class VisitorController extends BaseController<
      typeof visitorName,
      VisitorControllerState,
      VisitorMessenger
    > {
      constructor(messenger: VisitorMessenger) {
        super({
          messenger,
          metadata: visitorControllerStateMetadata,
          name: visitorName,
          state: { visitors: [] },
        });

        messenger.registerActionHandler('VisitorController:clear', this.clear);
      }

      clear: () => void = () => {
        this.update(() => {
          return { visitors: [] };
        });
      };

      addVisitor(visitor: string): void {
        this.update(({ visitors }) => {
          return { visitors: [...visitors, visitor] };
        });
      }

      destroy(): void {
        super.destroy();
      }
    }

    const visitorOverflowName = 'VisitorOverflowController';

    type VisitorOverflowControllerState = {
      maxVisitors: number;
    };
    type VisitorOverflowUpdateMaxAction = {
      type: `${typeof visitorOverflowName}:updateMax`;
      handler: (max: number) => void;
    };
    type VisitorOverflowExternalActions = VisitorControllerClearAction;
    type VisitorOverflowControllerActions =
      | VisitorOverflowUpdateMaxAction
      | ControllerActions<
          typeof visitorOverflowName,
          VisitorOverflowControllerState
        >;
    type VisitorOverflowStateChangeEvent = ControllerEvents<
      typeof visitorOverflowName,
      VisitorOverflowControllerState
    >;
    type VisitorOverflowExternalEvents = VisitorControllerStateChangeEvent;
    type VisitorOverflowControllerEvents = VisitorOverflowStateChangeEvent;

    const visitorOverflowControllerMetadata = {
      maxVisitors: {
        includeInDebugSnapshot: true,
        includeInStateLogs: true,
        persist: false,
        usedInUi: true,
      },
    };

    type VisitorOverflowMessenger = Messenger<
      typeof visitorOverflowName,
      VisitorOverflowControllerActions | VisitorOverflowExternalActions,
      VisitorOverflowControllerEvents | VisitorOverflowExternalEvents
    >;

    class VisitorOverflowController extends BaseController<
      typeof visitorOverflowName,
      VisitorOverflowControllerState,
      VisitorOverflowMessenger
    > {
      constructor(messenger: VisitorOverflowMessenger) {
        super({
          messenger,
          metadata: visitorOverflowControllerMetadata,
          name: visitorOverflowName,
          state: { maxVisitors: 5 },
        });

        messenger.registerActionHandler(
          'VisitorOverflowController:updateMax',
          this.updateMax,
        );

        messenger.subscribe('VisitorController:stateChange', this.onVisit);
      }

      onVisit: ({ visitors }: VisitorControllerState) => void = ({
        visitors,
      }: VisitorControllerState) => {
        if (visitors.length > this.state.maxVisitors) {
          this.messenger.call('VisitorController:clear');
        }
      };

      updateMax: (max: number) => void = (max: number) => {
        this.update(() => {
          return { maxVisitors: max };
        });
      };

      destroy(): void {
        super.destroy();
      }
    }

    it('should allow messaging between controllers', () => {
      // Construct root messenger
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        VisitorControllerActions | VisitorOverflowControllerActions,
        VisitorControllerEvents | VisitorOverflowControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });
      // Construct controller messengers, delegating to parent
      const visitorControllerMessenger = new Messenger<
        typeof visitorName,
        VisitorControllerActions | VisitorOverflowUpdateMaxAction,
        VisitorControllerEvents | VisitorOverflowStateChangeEvent,
        typeof rootMessenger
      >({ namespace: visitorName, parent: rootMessenger });
      const visitorOverflowControllerMessenger = new Messenger<
        typeof visitorOverflowName,
        VisitorOverflowControllerActions | VisitorControllerClearAction,
        VisitorOverflowControllerEvents | VisitorControllerStateChangeEvent,
        typeof rootMessenger
      >({ namespace: visitorOverflowName, parent: rootMessenger });
      // Delegate external actions/events to controller messengers
      rootMessenger.delegate({
        actions: ['VisitorController:clear'],
        events: ['VisitorController:stateChange'],
        messenger: visitorOverflowControllerMessenger,
      });
      rootMessenger.delegate({
        actions: ['VisitorOverflowController:updateMax'],
        events: ['VisitorOverflowController:stateChange'],
        messenger: visitorControllerMessenger,
      });
      // Construct controllers
      const visitorController = new VisitorController(
        visitorControllerMessenger,
      );
      const visitorOverflowController = new VisitorOverflowController(
        visitorOverflowControllerMessenger,
      );

      rootMessenger.call('VisitorOverflowController:updateMax', 2);
      visitorController.addVisitor('A');
      visitorController.addVisitor('B');
      visitorController.addVisitor('C'); // this should trigger an overflow

      expect(visitorOverflowController.state.maxVisitors).toBe(2);
      expect(visitorController.state.visitors).toHaveLength(0);
    });
  });
});

describe('deriveStateFromMetadata', () => {
  it('returns an empty object when deriving state for an unset property', () => {
    const derivedState = deriveStateFromMetadata(
      { count: 1 },
      {
        count: {
          includeInDebugSnapshot: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
      },
      // @ts-expect-error Intentionally passing in fake unset property
      'unset',
    );

    expect(derivedState).toStrictEqual({});
  });

  describe.each([
    'includeInDebugSnapshot',
    'includeInStateLogs',
    'persist',
    'usedInUi',
  ] as const)('%s', (property: keyof StatePropertyMetadata<Json>) => {
    it('should return empty state', () => {
      expect(deriveStateFromMetadata({}, {}, property)).toStrictEqual({});
    });

    it('should return empty state when no properties are enabled', () => {
      const derivedState = deriveStateFromMetadata(
        { count: 1 },
        {
          count: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: false,
          },
        },
        property,
      );

      expect(derivedState).toStrictEqual({});
    });

    it('should return derived state', () => {
      const derivedState = deriveStateFromMetadata(
        {
          password: 'secret password',
          privateKey: '123',
          network: 'mainnet',
          tokens: ['DAI', 'USDC'],
        },
        {
          password: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          privateKey: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          network: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: false,
          },
          tokens: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: false,
          },
        },
        property,
      );

      expect(derivedState).toStrictEqual({
        password: 'secret password',
        privateKey: '123',
      });
    });

    if (property !== 'usedInUi') {
      it('should use function to derive state', () => {
        const normalizeTransactionHash = (hash: string): string => {
          return hash.toLowerCase();
        };

        const derivedState = deriveStateFromMetadata(
          {
            transactionHash: '0X1234',
          },
          {
            transactionHash: {
              includeInDebugSnapshot: false,
              includeInStateLogs: false,
              persist: false,
              usedInUi: false,
              [property]: normalizeTransactionHash,
            },
          },
          property,
        );

        expect(derivedState).toStrictEqual({ transactionHash: '0x1234' });
      });

      it('should allow returning a partial object from a deriver', () => {
        const getDerivedTxMeta = (txMeta: {
          hash: string;
          value: number;
        }): {
          value: number;
        } => {
          return { value: txMeta.value };
        };

        const derivedState = deriveStateFromMetadata(
          {
            txMeta: {
              hash: '0x123',
              value: 10,
            },
          },
          {
            txMeta: {
              includeInDebugSnapshot: false,
              includeInStateLogs: false,
              persist: false,
              usedInUi: false,
              [property]: getDerivedTxMeta,
            },
          },
          property,
        );

        expect(derivedState).toStrictEqual({ txMeta: { value: 10 } });
      });

      it('should allow returning a nested partial object from a deriver', () => {
        const getDerivedTxMeta = (txMeta: {
          hash: string;
          value: number;
          history: { hash: string; value: number }[];
        }): { history: { value: number }[]; value: number } => {
          return {
            history: txMeta.history.map((entry) => {
              return { value: entry.value };
            }),
            value: txMeta.value,
          };
        };

        const derivedState = deriveStateFromMetadata(
          {
            txMeta: {
              hash: '0x123',
              history: [
                {
                  hash: '0x123',
                  value: 9,
                },
              ],
              value: 10,
            },
          },
          {
            txMeta: {
              includeInDebugSnapshot: false,
              includeInStateLogs: false,
              persist: false,
              usedInUi: false,
              [property]: getDerivedTxMeta,
            },
          },
          property,
        );

        expect(derivedState).toStrictEqual({
          txMeta: { history: [{ value: 9 }], value: 10 },
        });
      });

      it('should allow transforming types in a deriver', () => {
        const derivedState = deriveStateFromMetadata(
          {
            count: '1',
          },
          {
            count: {
              includeInDebugSnapshot: false,
              includeInStateLogs: false,
              persist: false,
              usedInUi: false,
              [property]: (count: string) => Number(count),
            },
          },
          property,
        );

        expect(derivedState).toStrictEqual({ count: 1 });
      });
    }

    it('reports thrown error when deriving state', () => {
      const captureException = jest.fn();
      const derivedState = deriveStateFromMetadata(
        {
          extraState: 'extraState',
          privateKey: '123',
          network: 'mainnet',
        },
        // @ts-expect-error Intentionally testing invalid state
        {
          privateKey: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          network: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: false,
          },
        },
        property,
        captureException,
      );

      expect(derivedState).toStrictEqual({
        privateKey: '123',
      });

      expect(captureException).toHaveBeenCalledTimes(1);
      expect(captureException).toHaveBeenCalledWith(
        new Error(`No metadata found for 'extraState'`),
      );
    });

    it('reports thrown non-error when deriving state, wrapping it in an error', () => {
      const captureException = jest.fn();
      const testException = 'Non-Error exception';
      const derivedState = deriveStateFromMetadata(
        {
          extraState: 'extraState',
          privateKey: '123',
          network: 'mainnet',
        },
        {
          extraState: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: () => {
              // Intentionally throwing non-error to test handling
              // eslint-disable-next-line @typescript-eslint/only-throw-error
              throw testException;
            },
          },
          privateKey: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          network: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: false,
          },
        },
        property,
        captureException,
      );

      expect(derivedState).toStrictEqual({
        privateKey: '123',
      });

      expect(captureException).toHaveBeenCalledTimes(1);
      expect(captureException).toHaveBeenCalledWith(new Error(testException));
    });

    it('logs thrown error and captureException error to console if captureException throws', () => {
      const consoleError = jest.fn();
      const testError = new Error('Test error');
      const captureException = jest.fn().mockImplementation(() => {
        throw testError;
      });
      jest.spyOn(console, 'error').mockImplementation(consoleError);
      const derivedState = deriveStateFromMetadata(
        {
          extraState: 'extraState',
          privateKey: '123',
          network: 'mainnet',
        },
        // @ts-expect-error Intentionally testing invalid state
        {
          privateKey: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          network: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: false,
          },
        },
        property,
        captureException,
      );

      expect(derivedState).toStrictEqual({
        privateKey: '123',
      });

      expect(consoleError).toHaveBeenCalledTimes(2);
      expect(consoleError).toHaveBeenNthCalledWith(
        1,
        new Error(`Error thrown when calling 'captureException'`),
        testError,
      );
      expect(consoleError).toHaveBeenNthCalledWith(
        2,
        new Error(`No metadata found for 'extraState'`),
      );
    });

    it('logs thrown error to console when deriving state if no captureException function is given', () => {
      const consoleError = jest.fn();
      jest.spyOn(console, 'error').mockImplementation(consoleError);
      const derivedState = deriveStateFromMetadata(
        {
          extraState: 'extraState',
          privateKey: '123',
          network: 'mainnet',
        },
        // @ts-expect-error Intentionally testing invalid state
        {
          privateKey: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          network: {
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: false,
          },
        },
        property,
      );

      expect(derivedState).toStrictEqual({
        privateKey: '123',
      });

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        new Error(`No metadata found for 'extraState'`),
      );
    });
  });
});
