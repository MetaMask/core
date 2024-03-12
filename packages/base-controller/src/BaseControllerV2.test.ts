import type { Draft, Patch } from 'immer';
import * as sinon from 'sinon';

import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from './BaseControllerV2';
import {
  BaseController,
  getAnonymizedState,
  getPersistentState,
} from './BaseControllerV2';
import { ControllerMessenger } from './ControllerMessenger';
import type { RestrictedControllerMessenger } from './RestrictedControllerMessenger';

const countControllerName = 'CountController';

type CountControllerState = {
  count: number;
};

type CountControllerAction = ControllerGetStateAction<
  typeof countControllerName,
  CountControllerState
>;

type CountControllerEvent = ControllerStateChangeEvent<
  typeof countControllerName,
  CountControllerState
>;

const countControllerStateMetadata = {
  count: {
    persist: true,
    anonymous: true,
  },
};

type CountMessenger = RestrictedControllerMessenger<
  typeof countControllerName,
  CountControllerAction,
  CountControllerEvent,
  never,
  never
>;

/**
 * Constructs a restricted controller messenger for the Count controller.
 *
 * @param controllerMessenger - The controller messenger.
 * @returns A restricted controller messenger for the Count controller.
 */
function getCountMessenger(
  controllerMessenger?: ControllerMessenger<
    CountControllerAction,
    CountControllerEvent
  >,
): CountMessenger {
  if (!controllerMessenger) {
    controllerMessenger = new ControllerMessenger<
      CountControllerAction,
      CountControllerEvent
    >();
  }
  return controllerMessenger.getRestricted({
    name: countControllerName,
    allowedActions: [],
    allowedEvents: [],
  });
}

class CountController extends BaseController<
  typeof countControllerName,
  CountControllerState,
  CountMessenger
> {
  update(
    callback: (
      state: Draft<CountControllerState>,
    ) => void | CountControllerState,
  ) {
    const res = super.update(callback);
    return res;
  }

  applyPatches(patches: Patch[]) {
    super.applyPatches(patches);
  }

  destroy() {
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
    persist: true,
    anonymous: true,
  },
};

type MessagesMessenger = RestrictedControllerMessenger<
  typeof messagesControllerName,
  MessagesControllerAction,
  MessagesControllerEvent,
  never,
  never
>;

/**
 * Constructs a restricted controller messenger for the Messages controller.
 *
 * @param controllerMessenger - The controller messenger.
 * @returns A restricted controller messenger for the Messages controller.
 */
function getMessagesMessenger(
  controllerMessenger?: ControllerMessenger<
    MessagesControllerAction,
    MessagesControllerEvent
  >,
): MessagesMessenger {
  if (!controllerMessenger) {
    controllerMessenger = new ControllerMessenger<
      MessagesControllerAction,
      MessagesControllerEvent
    >();
  }
  return controllerMessenger.getRestricted({
    name: messagesControllerName,
    allowedActions: [],
    allowedEvents: [],
  });
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
  ) {
    const res = super.update(callback);
    return res;
  }

  applyPatches(patches: Patch[]) {
    super.applyPatches(patches);
  }

  destroy() {
    super.destroy();
  }
}

describe('BaseController', () => {
  afterEach(() => {
    sinon.restore();
  });

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
    const controllerMessenger = new ControllerMessenger<
      CountControllerAction,
      CountControllerEvent
    >();
    new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: countControllerName,
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });

    expect(controllerMessenger.call('CountController:getState')).toStrictEqual({
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
    const controllerMessenger = new ControllerMessenger<
      never,
      CountControllerEvent
    >();
    const controller = new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();

    controllerMessenger.subscribe('CountController:stateChange', listener1);
    const { inversePatches } = controller.update(() => {
      return { count: 1 };
    });

    controller.applyPatches(inversePatches);

    expect(listener1.callCount).toBe(2);
    expect(listener1.firstCall.args).toStrictEqual([
      { count: 1 },
      [{ op: 'replace', path: [], value: { count: 1 } }],
    ]);

    expect(listener1.secondCall.args).toStrictEqual([
      { count: 0 },
      [{ op: 'replace', path: [], value: { count: 0 } }],
    ]);
  });

  it('should inform subscribers of state changes', () => {
    const controllerMessenger = new ControllerMessenger<
      never,
      CountControllerEvent
    >();
    const controller = new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();
    const listener2 = sinon.stub();

    controllerMessenger.subscribe('CountController:stateChange', listener1);
    controllerMessenger.subscribe('CountController:stateChange', listener2);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toBe(1);
    expect(listener1.firstCall.args).toStrictEqual([
      { count: 1 },
      [{ op: 'replace', path: [], value: { count: 1 } }],
    ]);
    expect(listener2.callCount).toBe(1);
    expect(listener2.firstCall.args).toStrictEqual([
      { count: 1 },
      [{ op: 'replace', path: [], value: { count: 1 } }],
    ]);
  });

  it('should notify a subscriber with a selector of state changes', () => {
    const controllerMessenger = new ControllerMessenger<
      never,
      CountControllerEvent
    >();
    const controller = new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener = sinon.stub();
    controllerMessenger.subscribe(
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

    expect(listener.callCount).toBe(1);
    expect(listener.firstCall.args).toStrictEqual([1, 0]);
  });

  it('should not inform a subscriber of state changes if the selected value is unchanged', () => {
    const controllerMessenger = new ControllerMessenger<
      never,
      CountControllerEvent
    >();
    const controller = new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener = sinon.stub();
    controllerMessenger.subscribe(
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

    expect(listener.callCount).toBe(0);
  });

  it('should inform a subscriber of each state change once even after multiple subscriptions', () => {
    const controllerMessenger = new ControllerMessenger<
      never,
      CountControllerEvent
    >();
    const controller = new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();

    controllerMessenger.subscribe('CountController:stateChange', listener1);
    controllerMessenger.subscribe('CountController:stateChange', listener1);

    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toBe(1);
    expect(listener1.firstCall.args).toStrictEqual([
      { count: 1 },
      [{ op: 'replace', path: [], value: { count: 1 } }],
    ]);
  });

  it('should no longer inform a subscriber about state changes after unsubscribing', () => {
    const controllerMessenger = new ControllerMessenger<
      never,
      CountControllerEvent
    >();
    const controller = new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();

    controllerMessenger.subscribe('CountController:stateChange', listener1);
    controllerMessenger.unsubscribe('CountController:stateChange', listener1);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toBe(0);
  });

  it('should no longer inform a subscriber about state changes after unsubscribing once, even if they subscribed many times', () => {
    const controllerMessenger = new ControllerMessenger<
      never,
      CountControllerEvent
    >();
    const controller = new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();

    controllerMessenger.subscribe('CountController:stateChange', listener1);
    controllerMessenger.subscribe('CountController:stateChange', listener1);
    controllerMessenger.unsubscribe('CountController:stateChange', listener1);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toBe(0);
  });

  it('should throw when unsubscribing listener who was never subscribed', () => {
    const controllerMessenger = new ControllerMessenger<
      never,
      CountControllerEvent
    >();
    new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();

    expect(() => {
      controllerMessenger.unsubscribe('CountController:stateChange', listener1);
    }).toThrow('Subscription not found for event: CountController:stateChange');
  });

  it('should no longer update subscribers after being destroyed', () => {
    const controllerMessenger = new ControllerMessenger<
      never,
      CountControllerEvent
    >();
    const controller = new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();
    const listener2 = sinon.stub();

    controllerMessenger.subscribe('CountController:stateChange', listener1);
    controllerMessenger.subscribe('CountController:stateChange', listener2);
    controller.destroy();
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toBe(0);
    expect(listener2.callCount).toBe(0);
  });
});

describe('getAnonymizedState', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should return empty state', () => {
    expect(getAnonymizedState({}, {})).toStrictEqual({});
  });

  it('should return empty state when no properties are anonymized', () => {
    const anonymizedState = getAnonymizedState(
      { count: 1 },
      { count: { anonymous: false, persist: false } },
    );
    expect(anonymizedState).toStrictEqual({});
  });

  it('should return state that is already anonymized', () => {
    const anonymizedState = getAnonymizedState(
      {
        password: 'secret password',
        privateKey: '123',
        network: 'mainnet',
        tokens: ['DAI', 'USDC'],
      },
      {
        password: {
          anonymous: false,
          persist: false,
        },
        privateKey: {
          anonymous: false,
          persist: false,
        },
        network: {
          anonymous: true,
          persist: false,
        },
        tokens: {
          anonymous: true,
          persist: false,
        },
      },
    );
    expect(anonymizedState).toStrictEqual({
      network: 'mainnet',
      tokens: ['DAI', 'USDC'],
    });
  });

  it('should use anonymizing function to anonymize state', () => {
    const anonymizeTransactionHash = (hash: string) => {
      return hash.split('').reverse().join('');
    };

    const anonymizedState = getAnonymizedState(
      {
        transactionHash: '0x1234',
      },
      {
        transactionHash: {
          anonymous: anonymizeTransactionHash,
          persist: false,
        },
      },
    );

    expect(anonymizedState).toStrictEqual({ transactionHash: '4321x0' });
  });

  it('should allow returning a partial object from an anonymizing function', () => {
    const anonymizeTxMeta = (txMeta: { hash: string; value: number }) => {
      return { value: txMeta.value };
    };

    const anonymizedState = getAnonymizedState(
      {
        txMeta: {
          hash: '0x123',
          value: 10,
        },
      },
      {
        txMeta: {
          anonymous: anonymizeTxMeta,
          persist: false,
        },
      },
    );

    expect(anonymizedState).toStrictEqual({ txMeta: { value: 10 } });
  });

  it('should allow returning a nested partial object from an anonymizing function', () => {
    const anonymizeTxMeta = (txMeta: {
      hash: string;
      value: number;
      history: { hash: string; value: number }[];
    }) => {
      return {
        history: txMeta.history.map((entry) => {
          return { value: entry.value };
        }),
        value: txMeta.value,
      };
    };

    const anonymizedState = getAnonymizedState(
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
          anonymous: anonymizeTxMeta,
          persist: false,
        },
      },
    );

    expect(anonymizedState).toStrictEqual({
      txMeta: { history: [{ value: 9 }], value: 10 },
    });
  });

  it('should allow transforming types in an anonymizing function', () => {
    const anonymizedState = getAnonymizedState(
      {
        count: '1',
      },
      {
        count: {
          anonymous: (count) => Number(count),
          persist: false,
        },
      },
    );

    expect(anonymizedState).toStrictEqual({ count: 1 });
  });

  it('should suppress errors thrown when deriving state', () => {
    const setTimeoutStub = sinon.stub(globalThis, 'setTimeout');
    const persistentState = getAnonymizedState(
      {
        extraState: 'extraState',
        privateKey: '123',
        network: 'mainnet',
      },
      // @ts-expect-error Intentionally testing invalid state
      {
        privateKey: {
          anonymous: true,
          persist: true,
        },
        network: {
          anonymous: false,
          persist: false,
        },
      },
    );
    expect(persistentState).toStrictEqual({
      privateKey: '123',
    });
    expect(setTimeoutStub.callCount).toBe(1);
    const onTimeout = setTimeoutStub.firstCall.args[0];
    expect(() => onTimeout()).toThrow(`No metadata found for 'extraState'`);
  });
});

describe('getPersistentState', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should return empty state', () => {
    expect(getPersistentState({}, {})).toStrictEqual({});
  });

  it('should return empty state when no properties are persistent', () => {
    const persistentState = getPersistentState(
      { count: 1 },
      { count: { anonymous: false, persist: false } },
    );
    expect(persistentState).toStrictEqual({});
  });

  it('should return persistent state', () => {
    const persistentState = getPersistentState(
      {
        password: 'secret password',
        privateKey: '123',
        network: 'mainnet',
        tokens: ['DAI', 'USDC'],
      },
      {
        password: {
          anonymous: false,
          persist: true,
        },
        privateKey: {
          anonymous: false,
          persist: true,
        },
        network: {
          anonymous: false,
          persist: false,
        },
        tokens: {
          anonymous: false,
          persist: false,
        },
      },
    );
    expect(persistentState).toStrictEqual({
      password: 'secret password',
      privateKey: '123',
    });
  });

  it('should use function to derive persistent state', () => {
    const normalizeTransacitonHash = (hash: string) => {
      return hash.toLowerCase();
    };

    const persistentState = getPersistentState(
      {
        transactionHash: '0X1234',
      },
      {
        transactionHash: {
          anonymous: false,
          persist: normalizeTransacitonHash,
        },
      },
    );

    expect(persistentState).toStrictEqual({ transactionHash: '0x1234' });
  });

  it('should allow returning a partial object from a persist function', () => {
    const getPersistentTxMeta = (txMeta: { hash: string; value: number }) => {
      return { value: txMeta.value };
    };

    const persistentState = getPersistentState(
      {
        txMeta: {
          hash: '0x123',
          value: 10,
        },
      },
      {
        txMeta: {
          anonymous: false,
          persist: getPersistentTxMeta,
        },
      },
    );

    expect(persistentState).toStrictEqual({ txMeta: { value: 10 } });
  });

  it('should allow returning a nested partial object from a persist function', () => {
    const getPersistentTxMeta = (txMeta: {
      hash: string;
      value: number;
      history: { hash: string; value: number }[];
    }) => {
      return {
        history: txMeta.history.map((entry) => {
          return { value: entry.value };
        }),
        value: txMeta.value,
      };
    };

    const persistentState = getPersistentState(
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
          anonymous: false,
          persist: getPersistentTxMeta,
        },
      },
    );

    expect(persistentState).toStrictEqual({
      txMeta: { history: [{ value: 9 }], value: 10 },
    });
  });

  it('should allow transforming types in a persist function', () => {
    const persistentState = getPersistentState(
      {
        count: '1',
      },
      {
        count: {
          anonymous: false,
          persist: (count) => Number(count),
        },
      },
    );

    expect(persistentState).toStrictEqual({ count: 1 });
  });

  it('should suppress errors thrown when deriving state', () => {
    const setTimeoutStub = sinon.stub(globalThis, 'setTimeout');
    const persistentState = getPersistentState(
      {
        extraState: 'extraState',
        privateKey: '123',
        network: 'mainnet',
      },
      // @ts-expect-error Intentionally testing invalid state
      {
        privateKey: {
          anonymous: false,
          persist: true,
        },
        network: {
          anonymous: false,
          persist: false,
        },
      },
    );
    expect(persistentState).toStrictEqual({
      privateKey: '123',
    });
    expect(setTimeoutStub.callCount).toBe(1);
    const onTimeout = setTimeoutStub.firstCall.args[0];
    expect(() => onTimeout()).toThrow(`No metadata found for 'extraState'`);
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
    type VisitorControllerAction = {
      type: `${typeof visitorName}:clear`;
      handler: () => void;
    };
    type VisitorControllerEvent = {
      type: `${typeof visitorName}:stateChange`;
      payload: [VisitorControllerState, Patch[]];
    };

    const visitorControllerStateMetadata = {
      visitors: {
        persist: true,
        anonymous: true,
      },
    };

    type VisitorMessenger = RestrictedControllerMessenger<
      typeof visitorName,
      VisitorControllerAction | VisitorOverflowControllerAction,
      VisitorControllerEvent | VisitorOverflowControllerEvent,
      never,
      never
    >;
    class VisitorController extends BaseController<
      typeof visitorName,
      VisitorControllerState,
      VisitorMessenger
    > {
      constructor(messagingSystem: VisitorMessenger) {
        super({
          messenger: messagingSystem,
          metadata: visitorControllerStateMetadata,
          name: visitorName,
          state: { visitors: [] },
        });

        messagingSystem.registerActionHandler(
          'VisitorController:clear',
          this.clear,
        );
      }

      clear = () => {
        this.update(() => {
          return { visitors: [] };
        });
      };

      addVisitor(visitor: string) {
        this.update(({ visitors }) => {
          return { visitors: [...visitors, visitor] };
        });
      }

      destroy() {
        super.destroy();
      }
    }

    const visitorOverflowName = 'VisitorOverflowController';

    type VisitorOverflowControllerState = {
      maxVisitors: number;
    };
    type VisitorOverflowControllerAction = {
      type: `${typeof visitorOverflowName}:updateMax`;
      handler: (max: number) => void;
    };
    type VisitorOverflowControllerEvent = {
      type: `${typeof visitorOverflowName}:stateChange`;
      payload: [VisitorOverflowControllerState, Patch[]];
    };

    const visitorOverflowControllerMetadata = {
      maxVisitors: {
        persist: false,
        anonymous: true,
      },
    };

    type VisitorOverflowMessenger = RestrictedControllerMessenger<
      typeof visitorOverflowName,
      VisitorControllerAction | VisitorOverflowControllerAction,
      VisitorControllerEvent | VisitorOverflowControllerEvent,
      `${typeof visitorName}:clear`,
      `${typeof visitorName}:stateChange`
    >;

    class VisitorOverflowController extends BaseController<
      typeof visitorOverflowName,
      VisitorOverflowControllerState,
      VisitorOverflowMessenger
    > {
      constructor(messagingSystem: VisitorOverflowMessenger) {
        super({
          messenger: messagingSystem,
          metadata: visitorOverflowControllerMetadata,
          name: visitorOverflowName,
          state: { maxVisitors: 5 },
        });

        messagingSystem.registerActionHandler(
          'VisitorOverflowController:updateMax',
          this.updateMax,
        );

        messagingSystem.subscribe(
          'VisitorController:stateChange',
          this.onVisit,
        );
      }

      onVisit = ({ visitors }: VisitorControllerState) => {
        if (visitors.length > this.state.maxVisitors) {
          this.messagingSystem.call('VisitorController:clear');
        }
      };

      updateMax = (max: number) => {
        this.update(() => {
          return { maxVisitors: max };
        });
      };

      destroy() {
        super.destroy();
      }
    }

    it('should allow messaging between controllers', () => {
      const controllerMessenger = new ControllerMessenger<
        VisitorControllerAction | VisitorOverflowControllerAction,
        VisitorControllerEvent | VisitorOverflowControllerEvent
      >();
      const visitorControllerMessenger = controllerMessenger.getRestricted({
        name: visitorName,
        allowedActions: [],
        allowedEvents: [],
      });
      const visitorController = new VisitorController(
        visitorControllerMessenger,
      );
      const visitorOverflowControllerMessenger =
        controllerMessenger.getRestricted({
          name: visitorOverflowName,
          allowedActions: ['VisitorController:clear'],
          allowedEvents: ['VisitorController:stateChange'],
        });
      const visitorOverflowController = new VisitorOverflowController(
        visitorOverflowControllerMessenger,
      );

      controllerMessenger.call('VisitorOverflowController:updateMax', 2);
      visitorController.addVisitor('A');
      visitorController.addVisitor('B');
      visitorController.addVisitor('C'); // this should trigger an overflow

      expect(visitorOverflowController.state.maxVisitors).toBe(2);
      expect(visitorController.state.visitors).toHaveLength(0);
    });
  });
});
