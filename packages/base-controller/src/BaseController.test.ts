/* eslint-disable jest/no-export */
import type { Json } from '@metamask/utils';
import type { Draft, Patch } from 'immer';
import * as sinon from 'sinon';

import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StatePropertyMetadata,
} from './BaseController';
import {
  BaseController,
  deriveStateFromMetadata,
  getAnonymizedState,
  getPersistentState,
  isBaseController,
} from './BaseController';
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
      {
        count: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
      },
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
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
        privateKey: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
        network: {
          anonymous: true,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
        tokens: {
          anonymous: true,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
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
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
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
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
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
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
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
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
      },
    );

    expect(anonymizedState).toStrictEqual({ count: 1 });
  });

  it('reports thrown error when deriving state', () => {
    const captureException = jest.fn();
    const anonymizedState = getAnonymizedState(
      {
        extraState: 'extraState',
        privateKey: '123',
        network: 'mainnet',
      },
      // @ts-expect-error Intentionally testing invalid state
      {
        privateKey: {
          anonymous: true,
          includeInStateLogs: true,
          persist: true,
          usedInUi: true,
        },
        network: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
      },
      captureException,
    );

    expect(anonymizedState).toStrictEqual({
      privateKey: '123',
    });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      new Error(`No metadata found for 'extraState'`),
    );
  });

  it('logs thrown error and captureException error to console if captureException throws', () => {
    const consoleError = jest.fn();
    const testError = new Error('Test error');
    const captureException = jest.fn().mockImplementation(() => {
      throw testError;
    });
    jest.spyOn(console, 'error').mockImplementation(consoleError);
    const anonymizedState = getAnonymizedState(
      {
        extraState: 'extraState',
        privateKey: '123',
        network: 'mainnet',
      },
      // @ts-expect-error Intentionally testing invalid state
      {
        privateKey: {
          anonymous: true,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
        network: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
      },
      captureException,
    );

    expect(anonymizedState).toStrictEqual({
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

    const anonymizedState = getAnonymizedState(
      {
        extraState: 'extraState',
        privateKey: '123',
        network: 'mainnet',
      },
      // @ts-expect-error Intentionally testing invalid state
      {
        privateKey: {
          anonymous: true,
          includeInStateLogs: true,
          persist: true,
          usedInUi: true,
        },
        network: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
      },
    );

    expect(anonymizedState).toStrictEqual({
      privateKey: '123',
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      new Error(`No metadata found for 'extraState'`),
    );
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
      {
        count: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
      },
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
          includeInStateLogs: false,
          persist: true,
          usedInUi: false,
        },
        privateKey: {
          anonymous: false,
          includeInStateLogs: false,
          persist: true,
          usedInUi: false,
        },
        network: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
        tokens: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
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
          includeInStateLogs: false,
          persist: normalizeTransacitonHash,
          usedInUi: false,
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
          includeInStateLogs: false,
          persist: getPersistentTxMeta,
          usedInUi: false,
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
          includeInStateLogs: false,
          persist: getPersistentTxMeta,
          usedInUi: false,
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
          includeInStateLogs: false,
          persist: (count) => Number(count),
          usedInUi: false,
        },
      },
    );

    expect(persistentState).toStrictEqual({ count: 1 });
  });

  it('reports thrown error when deriving state', () => {
    const captureException = jest.fn();
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
          includeInStateLogs: false,
          persist: true,
          usedInUi: false,
        },
        network: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: true,
        },
      },
      captureException,
    );

    expect(persistentState).toStrictEqual({
      privateKey: '123',
    });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      new Error(`No metadata found for 'extraState'`),
    );
  });

  it('logs thrown error and captureException error to console if captureException throws', () => {
    const consoleError = jest.fn();
    const testError = new Error('Test error');
    const captureException = jest.fn().mockImplementation(() => {
      throw testError;
    });
    jest.spyOn(console, 'error').mockImplementation(consoleError);
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
          includeInStateLogs: false,
          persist: true,
          usedInUi: false,
        },
        network: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: false,
        },
      },
      captureException,
    );

    expect(persistentState).toStrictEqual({
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
          includeInStateLogs: false,
          persist: true,
          usedInUi: false,
        },
        network: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          usedInUi: true,
        },
      },
    );

    expect(persistentState).toStrictEqual({
      privateKey: '123',
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      new Error(`No metadata found for 'extraState'`),
    );
  });
});

describe('deriveStateFromMetadata', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('returns an empty object when deriving state for an unset property', () => {
    const derivedState = deriveStateFromMetadata(
      { count: 1 },
      {
        count: {
          anonymous: false,
          includeInStateLogs: false,
          persist: false,
          // usedInUi is not set
        },
      },
      'usedInUi',
    );

    expect(derivedState).toStrictEqual({});
  });

  describe.each([
    'anonymous',
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
            anonymous: false,
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
            anonymous: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          privateKey: {
            anonymous: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          network: {
            anonymous: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: false,
          },
          tokens: {
            anonymous: false,
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
        const normalizeTransactionHash = (hash: string) => {
          return hash.toLowerCase();
        };

        const derivedState = deriveStateFromMetadata(
          {
            transactionHash: '0X1234',
          },
          {
            transactionHash: {
              anonymous: false,
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
        const getDerivedTxMeta = (txMeta: { hash: string; value: number }) => {
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
              anonymous: false,
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
        }) => {
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
              anonymous: false,
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
              anonymous: false,
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
            anonymous: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          network: {
            anonymous: false,
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
            anonymous: false,
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
            anonymous: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          network: {
            anonymous: false,
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
            anonymous: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          network: {
            anonymous: false,
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
            anonymous: false,
            includeInStateLogs: false,
            persist: false,
            usedInUi: false,
            [property]: true,
          },
          network: {
            anonymous: false,
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
