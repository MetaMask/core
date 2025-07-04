/* eslint-disable jest/no-export */
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
  isBaseController,
} from './BaseControllerV2';
import { Messenger } from './Messenger';
import type { RestrictedMessenger } from './RestrictedMessenger';
import { JsonRpcEngine } from '../../json-rpc-engine/src';

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
    persist: true,
    anonymous: true,
  },
};

type CountMessenger = RestrictedMessenger<
  typeof countControllerName,
  CountControllerAction,
  CountControllerEvent,
  never,
  never
>;

/**
 * Constructs a restricted messenger for the Count controller.
 *
 * @param messenger - The messenger.
 * @returns A restricted messenger for the Count controller.
 */
export function getCountMessenger(
  messenger?: Messenger<CountControllerAction, CountControllerEvent>,
): CountMessenger {
  if (!messenger) {
    messenger = new Messenger<CountControllerAction, CountControllerEvent>();
  }
  return messenger.getRestricted({
    name: countControllerName,
    allowedActions: [],
    allowedEvents: [],
  });
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

type MessagesMessenger = RestrictedMessenger<
  typeof messagesControllerName,
  MessagesControllerAction,
  MessagesControllerEvent,
  never,
  never
>;

/**
 * Constructs a restricted messenger for the Messages controller.
 *
 * @param messenger - The messenger.
 * @returns A restricted messenger for the Messages controller.
 */
function getMessagesMessenger(
  messenger?: Messenger<MessagesControllerAction, MessagesControllerEvent>,
): MessagesMessenger {
  if (!messenger) {
    messenger = new Messenger<
      MessagesControllerAction,
      MessagesControllerEvent
    >();
  }
  return messenger.getRestricted({
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

describe('isBaseController', () => {
  it('should return true if passed a V2 controller', () => {
    const messenger = new Messenger<
      CountControllerAction,
      CountControllerEvent
    >();
    const controller = new CountController({
      messenger: getCountMessenger(messenger),
      name: countControllerName,
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    expect(isBaseController(controller)).toBe(true);
  });

  it('should return false if passed a non-controller', () => {
    const notController = new JsonRpcEngine();
    expect(isBaseController(notController)).toBe(false);
  });
});

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
    const messenger = new Messenger<
      CountControllerAction,
      CountControllerEvent
    >();
    new CountController({
      messenger: getCountMessenger(messenger),
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
    const messenger = new Messenger<never, CountControllerEvent>();
    const controller = new CountController({
      messenger: getCountMessenger(messenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();

    messenger.subscribe('CountController:stateChange', listener1);
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
    const messenger = new Messenger<never, CountControllerEvent>();
    const controller = new CountController({
      messenger: getCountMessenger(messenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();
    const listener2 = sinon.stub();

    messenger.subscribe('CountController:stateChange', listener1);
    messenger.subscribe('CountController:stateChange', listener2);
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
    const messenger = new Messenger<never, CountControllerEvent>();
    const controller = new CountController({
      messenger: getCountMessenger(messenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener = sinon.stub();
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

    expect(listener.callCount).toBe(1);
    expect(listener.firstCall.args).toStrictEqual([1, 0]);
  });

  it('should not inform a subscriber of state changes if the selected value is unchanged', () => {
    const messenger = new Messenger<never, CountControllerEvent>();
    const controller = new CountController({
      messenger: getCountMessenger(messenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener = sinon.stub();
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

    expect(listener.callCount).toBe(0);
  });

  it('should inform a subscriber of each state change once even after multiple subscriptions', () => {
    const messenger = new Messenger<never, CountControllerEvent>();
    const controller = new CountController({
      messenger: getCountMessenger(messenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();

    messenger.subscribe('CountController:stateChange', listener1);
    messenger.subscribe('CountController:stateChange', listener1);

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
    const messenger = new Messenger<never, CountControllerEvent>();
    const controller = new CountController({
      messenger: getCountMessenger(messenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();

    messenger.subscribe('CountController:stateChange', listener1);
    messenger.unsubscribe('CountController:stateChange', listener1);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toBe(0);
  });

  it('should no longer inform a subscriber about state changes after unsubscribing once, even if they subscribed many times', () => {
    const messenger = new Messenger<never, CountControllerEvent>();
    const controller = new CountController({
      messenger: getCountMessenger(messenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();

    messenger.subscribe('CountController:stateChange', listener1);
    messenger.subscribe('CountController:stateChange', listener1);
    messenger.unsubscribe('CountController:stateChange', listener1);
    controller.update(() => {
      return { count: 1 };
    });

    expect(listener1.callCount).toBe(0);
  });

  it('should throw when unsubscribing listener who was never subscribed', () => {
    const messenger = new Messenger<never, CountControllerEvent>();
    new CountController({
      messenger: getCountMessenger(messenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();

    expect(() => {
      messenger.unsubscribe('CountController:stateChange', listener1);
    }).toThrow('Subscription not found for event: CountController:stateChange');
  });

  it('should no longer update subscribers after being destroyed', () => {
    const messenger = new Messenger<never, CountControllerEvent>();
    const controller = new CountController({
      messenger: getCountMessenger(messenger),
      name: 'CountController',
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    const listener1 = sinon.stub();
    const listener2 = sinon.stub();

    messenger.subscribe('CountController:stateChange', listener1);
    messenger.subscribe('CountController:stateChange', listener2);
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

    type VisitorMessenger = RestrictedMessenger<
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

    type VisitorOverflowMessenger = RestrictedMessenger<
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
      const messenger = new Messenger<
        VisitorControllerAction | VisitorOverflowControllerAction,
        VisitorControllerEvent | VisitorOverflowControllerEvent
      >();
      const visitorControllerMessenger = messenger.getRestricted({
        name: visitorName,
        allowedActions: [],
        allowedEvents: [],
      });
      const visitorController = new VisitorController(
        visitorControllerMessenger,
      );
      const visitorOverflowControllerMessenger = messenger.getRestricted({
        name: visitorOverflowName,
        allowedActions: ['VisitorController:clear'],
        allowedEvents: ['VisitorController:stateChange'],
      });
      const visitorOverflowController = new VisitorOverflowController(
        visitorOverflowControllerMessenger,
      );

      messenger.call('VisitorOverflowController:updateMax', 2);
      visitorController.addVisitor('A');
      visitorController.addVisitor('B');
      visitorController.addVisitor('C'); // this should trigger an overflow

      expect(visitorOverflowController.state.maxVisitors).toBe(2);
      expect(visitorController.state.visitors).toHaveLength(0);
    });
  });

  describe('registerActionHandlers', () => {
    type TestControllerActions =
      | {
          type: 'TestController:testMethod';
          handler: () => string;
        }
      | { type: 'TestController:method1'; handler: () => string }
      | { type: 'TestController:method2'; handler: () => string }
      | { type: 'TestController:getInstanceValue'; handler: () => string };

    type TestControllerMessenger = RestrictedMessenger<
      'TestController',
      TestControllerActions,
      never,
      never,
      never
    >;

    /**
     * Factory function to create a test controller with configurable action handler registration
     *
     * @param options - Configuration options for the test controller
     * @param options.methodsToRegister - Array of method names to register as action handlers
     * @param options.excludedMethods - Optional array of method names to exclude from registration
     * @param options.exceptions - Optional map of method names to custom handlers
     * @param options.instanceValue - Optional custom value for the controller instance
     * @returns Object containing the messenger and controller instances
     */
    function createTestController(options: {
      methodsToRegister: readonly string[];
      excludedMethods?: readonly string[];
      exceptions?: Record<string, (...args: unknown[]) => unknown>;
      instanceValue?: string;
    }) {
      const {
        methodsToRegister,
        excludedMethods = [],
        exceptions = {},
        instanceValue = 'controller instance',
      } = options;

      class TestController extends BaseController<
        'TestController',
        CountControllerState,
        TestControllerMessenger
      > {
        private readonly instanceValue = instanceValue;

        constructor(messenger: TestControllerMessenger) {
          super({
            messenger,
            name: 'TestController',
            state: { count: 0 },
            metadata: countControllerStateMetadata,
          });
          this.registerActionHandlers(
            methodsToRegister as readonly (keyof this & string)[],
            excludedMethods,
            exceptions as Partial<
              Record<keyof this & string, (...args: unknown[]) => unknown>
            >,
          );
        }

        testMethod() {
          return 'test result';
        }

        method1() {
          return 'method1 result';
        }

        method2() {
          return 'method2 result';
        }

        getInstanceValue() {
          return this.instanceValue;
        }
      }

      const messenger = new Messenger<TestControllerActions, never>();
      const controller = new TestController(
        messenger.getRestricted({
          name: 'TestController',
          allowedActions: [],
          allowedEvents: [],
        }),
      );

      return { messenger, controller };
    }

    it('should register action handlers for specified methods using the simplified API', () => {
      const { messenger } = createTestController({
        methodsToRegister: ['testMethod', 'method1'],
      });

      const testResult = messenger.call('TestController:testMethod');
      expect(testResult).toBe('test result');

      const method1Result = messenger.call('TestController:method1');
      expect(method1Result).toBe('method1 result');
    });

    it('should register action handlers with exclusions and exceptions', () => {
      const customMethod1 = () => 'custom method1 result';

      const { messenger } = createTestController({
        methodsToRegister: ['method1', 'method2'],
        excludedMethods: ['method2'],
        exceptions: { method1: customMethod1 },
      });

      // method1 should use the custom handler
      const result1 = messenger.call('TestController:method1');
      expect(result1).toBe('custom method1 result');

      // method2 should not be registered due to exclusion
      expect(() => {
        messenger.call('TestController:method2');
      }).toThrow(
        'A handler for TestController:method2 has not been registered',
      );
    });

    it('should properly bind methods to the controller instance', () => {
      const { messenger } = createTestController({
        methodsToRegister: ['getInstanceValue'],
        instanceValue: 'custom instance value',
      });

      // Verify the method is properly bound to the controller instance
      const result = messenger.call('TestController:getInstanceValue');
      expect(result).toBe('custom instance value');
    });

    it('should handle empty method registration', () => {
      const { messenger } = createTestController({
        methodsToRegister: [],
      });

      // None of the methods should be registered
      expect(() => {
        messenger.call('TestController:testMethod');
      }).toThrow(
        'A handler for TestController:testMethod has not been registered',
      );

      expect(() => {
        messenger.call('TestController:method1');
      }).toThrow(
        'A handler for TestController:method1 has not been registered',
      );
    });

    it('should handle multiple exclusions', () => {
      const { messenger } = createTestController({
        methodsToRegister: ['testMethod', 'method1', 'method2'],
        excludedMethods: ['method1', 'method2'],
      });

      // Only testMethod should be registered
      const testResult = messenger.call('TestController:testMethod');
      expect(testResult).toBe('test result');

      expect(() => {
        messenger.call('TestController:method1');
      }).toThrow(
        'A handler for TestController:method1 has not been registered',
      );

      expect(() => {
        messenger.call('TestController:method2');
      }).toThrow(
        'A handler for TestController:method2 has not been registered',
      );
    });

    it('should exclude methods that match hard exclusion patterns', () => {
      // Test that constructor and messagingSystem are always excluded regardless of excludedMethods
      const { messenger: messengerWithDefaults } = createTestController({
        methodsToRegister: ['testMethod', 'method1'],
        // excludedMethods not specified - uses default empty array, but constructor/messagingSystem still excluded
      });

      const { messenger: messengerWithEmptyExclusions } = createTestController({
        methodsToRegister: ['testMethod', 'method1'],
        excludedMethods: [], // Explicitly empty - only hard exclusions apply
      });

      // Both should register the same methods since constructor/messagingSystem are always excluded
      expect(messengerWithDefaults.call('TestController:testMethod')).toBe(
        'test result',
      );
      expect(messengerWithDefaults.call('TestController:method1')).toBe(
        'method1 result',
      );

      expect(
        messengerWithEmptyExclusions.call('TestController:testMethod'),
      ).toBe('test result');
      expect(messengerWithEmptyExclusions.call('TestController:method1')).toBe(
        'method1 result',
      );
    });

    it('should demonstrate exclusion behavior with explicit exclusions', () => {
      // Test explicit exclusions in addition to hard exclusions
      const { messenger: messengerWithExplicitExclusions } =
        createTestController({
          methodsToRegister: ['testMethod', 'method1', 'method2'],
          excludedMethods: ['method1'], // Explicitly exclude method1 (in addition to hard exclusions)
        });

      const { messenger: messengerWithNoCustomExclusions } =
        createTestController({
          methodsToRegister: ['testMethod', 'method1', 'method2'],
          // No custom exclusions - only hard exclusions (constructor, messagingSystem) apply
        });

      // With explicit exclusions: method1 should be excluded (in addition to hard exclusions)
      expect(
        messengerWithExplicitExclusions.call('TestController:testMethod'),
      ).toBe('test result');
      expect(
        messengerWithExplicitExclusions.call('TestController:method2'),
      ).toBe('method2 result');
      expect(() => {
        messengerWithExplicitExclusions.call('TestController:method1');
      }).toThrow(
        'A handler for TestController:method1 has not been registered',
      );

      // With no custom exclusions: all methods should be registered (hard exclusions don't affect these method names)
      expect(
        messengerWithNoCustomExclusions.call('TestController:testMethod'),
      ).toBe('test result');
      expect(
        messengerWithNoCustomExclusions.call('TestController:method1'),
      ).toBe('method1 result');
      expect(
        messengerWithNoCustomExclusions.call('TestController:method2'),
      ).toBe('method2 result');
    });

    it('should never register hard-excluded methods even when explicitly requested', () => {
      type ExtendedTestActions = {
        type: 'TestController:normalMethod';
        handler: () => string;
      };

      const messenger = new Messenger<ExtendedTestActions, never>();

      // Create a mock controller-like object with the hard-excluded method names
      const mockController = {
        name: 'TestController',
        constructor: () => 'constructor called',
        messagingSystem: () => 'messagingSystem called',
        normalMethod: () => 'normal method called',
      };

      // Try to register methods including the hard-excluded ones
      messenger.registerActionHandlers(
        mockController,
        ['constructor', 'messagingSystem', 'normalMethod'],
        [], // Empty exclusions - but hard exclusions should still apply
      );

      // normalMethod should be registered
      expect(messenger.call('TestController:normalMethod')).toBe(
        'normal method called',
      );

      // Hard-excluded methods should NEVER be registered, regardless of being in methodNames
      expect(() => {
        // @ts-expect-error - TestController:constructor is hard-excluded
        messenger.call('TestController:constructor');
      }).toThrow(
        'A handler for TestController:constructor has not been registered',
      );

      expect(() => {
        // @ts-expect-error - TestController:messagingSystem is hard-excluded
        messenger.call('TestController:messagingSystem');
      }).toThrow(
        'A handler for TestController:messagingSystem has not been registered',
      );
    });

    it('should register action handlers through "registerActionHandlers" method from BaseController', () => {
      const messenger = new Messenger<TestControllerActions, never>();
      const restrictedMessenger = messenger.getRestricted({
        name: 'TestController',
        allowedActions: [],
        allowedEvents: [],
      });

      class TestController extends BaseController<
        'TestController',
        CountControllerState,
        TestControllerMessenger
      > {
        constructor() {
          super({
            messenger: restrictedMessenger,
            name: 'TestController',
            state: { count: 0 },
            metadata: countControllerStateMetadata,
          });

          this.registerActionHandlers(['testMethod', 'method1']);
        }

        testMethod() {
          return 'test result from BaseController';
        }

        method1() {
          return 'method1 result from BaseController';
        }
      }

      new TestController();

      const testResult = messenger.call('TestController:testMethod');
      expect(testResult).toBe('test result from BaseController');

      const method1Result = messenger.call('TestController:method1');
      expect(method1Result).toBe('method1 result from BaseController');
    });
  });
});
