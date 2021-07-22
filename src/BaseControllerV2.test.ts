import type { Draft, Patch } from 'immer';
import sinon from 'sinon';

import {
  BaseController,
  getAnonymizedState,
  getPersistentState,
} from './BaseControllerV2';
import {
  ControllerMessenger,
  RestrictedControllerMessenger,
} from './ControllerMessenger';

const countControllerName = 'CountController';

type CountControllerState = {
  count: number;
};
type CountControllerAction = {
  type: `${typeof countControllerName}:getState`;
  handler: () => CountControllerState;
};

type CountControllerEvent = {
  type: `${typeof countControllerName}:stateChange`;
  payload: [CountControllerState, Patch[]];
};

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
  return controllerMessenger.getRestricted<'CountController', never, never>({
    name: countControllerName,
  });
}

class CountController extends BaseController<
  typeof countControllerName,
  CountControllerState
> {
  update(
    callback: (
      state: Draft<CountControllerState>,
    ) => void | CountControllerState,
  ) {
    super.update(callback);
  }

  destroy() {
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

  it('should not allow mutating state directly', () => {
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

    expect(listener1.callCount).toStrictEqual(1);
    expect(listener1.firstCall.args).toStrictEqual([
      { count: 1 },
      [{ op: 'replace', path: [], value: { count: 1 } }],
    ]);
    expect(listener2.callCount).toStrictEqual(1);
    expect(listener2.firstCall.args).toStrictEqual([
      { count: 1 },
      [{ op: 'replace', path: [], value: { count: 1 } }],
    ]);
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

    expect(listener1.callCount).toStrictEqual(1);
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

    expect(listener1.callCount).toStrictEqual(0);
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

    expect(listener1.callCount).toStrictEqual(0);
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
    }).toThrow(
      "Subscription not found for event: 'CountController:stateChange'",
    );
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

    expect(listener1.callCount).toStrictEqual(0);
    expect(listener2.callCount).toStrictEqual(0);
  });
});

describe('getAnonymizedState', () => {
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
});

describe('getPersistentState', () => {
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
      VisitorControllerState
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
      VisitorOverflowControllerState
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
      const visitorControllerMessenger = controllerMessenger.getRestricted<
        typeof visitorName,
        never,
        never
      >({
        name: visitorName,
      });
      const visitorController = new VisitorController(
        visitorControllerMessenger,
      );
      const visitorOverflowControllerMessenger = controllerMessenger.getRestricted(
        {
          name: visitorOverflowName,
          allowedActions: ['VisitorController:clear'],
          allowedEvents: ['VisitorController:stateChange'],
        },
      );
      const visitorOverflowController = new VisitorOverflowController(
        visitorOverflowControllerMessenger,
      );

      controllerMessenger.call('VisitorOverflowController:updateMax', 2);
      visitorController.addVisitor('A');
      visitorController.addVisitor('B');
      visitorController.addVisitor('C'); // this should trigger an overflow

      expect(visitorOverflowController.state.maxVisitors).toStrictEqual(2);
      expect(visitorController.state.visitors).toHaveLength(0);
    });
  });
});
