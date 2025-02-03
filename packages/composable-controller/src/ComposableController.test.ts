// `ComposableControllerState` type objects are keyed with controller names written in PascalCase.
/* eslint-disable @typescript-eslint/naming-convention */

import type { BaseState, RestrictedMessenger } from '@metamask/base-controller';
import {
  BaseController,
  BaseControllerV1,
  Messenger,
} from '@metamask/base-controller';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { Patch } from 'immer';
import * as sinon from 'sinon';

import type {
  ChildControllerStateChangeEvents,
  ComposableControllerEvents,
} from './ComposableController';
import {
  ComposableController,
  INVALID_CONTROLLER_ERROR,
} from './ComposableController';

// Mock BaseController classes

type FooControllerState = {
  foo: string;
};
type FooControllerEvent = {
  type: `FooController:stateChange`;
  payload: [FooControllerState, Patch[]];
};

type FooMessenger = RestrictedMessenger<
  'FooController',
  never,
  FooControllerEvent | QuzControllerEvent,
  never,
  QuzControllerEvent['type']
>;

const fooControllerStateMetadata = {
  foo: {
    persist: true,
    anonymous: true,
  },
};

class FooController extends BaseController<
  'FooController',
  FooControllerState,
  FooMessenger
> {
  constructor(messagingSystem: FooMessenger) {
    super({
      messenger: messagingSystem,
      metadata: fooControllerStateMetadata,
      name: 'FooController',
      state: { foo: 'foo' },
    });
  }

  updateFoo(foo: string) {
    super.update((state) => {
      state.foo = foo;
    });
  }
}

type QuzControllerState = {
  quz: string;
};
type QuzControllerEvent = {
  type: `QuzController:stateChange`;
  payload: [QuzControllerState, Patch[]];
};

type QuzMessenger = RestrictedMessenger<
  'QuzController',
  never,
  QuzControllerEvent,
  never,
  never
>;

const quzControllerStateMetadata = {
  quz: {
    persist: true,
    anonymous: true,
  },
};

class QuzController extends BaseController<
  'QuzController',
  QuzControllerState,
  QuzMessenger
> {
  constructor(messagingSystem: QuzMessenger) {
    super({
      messenger: messagingSystem,
      metadata: quzControllerStateMetadata,
      name: 'QuzController',
      state: { quz: 'quz' },
    });
  }

  updateQuz(quz: string) {
    super.update((state) => {
      state.quz = quz;
    });
  }
}

// Mock BaseControllerV1 classes

type BarControllerState = BaseState & {
  bar: string;
};

class BarController extends BaseControllerV1<never, BarControllerState> {
  defaultState = {
    bar: 'bar',
  };

  override name = 'BarController' as const;

  constructor() {
    super();
    this.initialize();
  }

  updateBar(bar: string) {
    super.update({ bar });
  }
}

type BazControllerState = BaseState & {
  baz: string;
};
type BazControllerEvent = {
  type: `BazController:stateChange`;
  payload: [BazControllerState, Patch[]];
};

type BazMessenger = RestrictedMessenger<
  'BazController',
  never,
  BazControllerEvent,
  never,
  never
>;

class BazController extends BaseControllerV1<never, BazControllerState> {
  defaultState = {
    baz: 'baz',
  };

  override name = 'BazController' as const;

  protected messagingSystem: BazMessenger;

  constructor({ messenger }: { messenger: BazMessenger }) {
    super();
    this.initialize();
    this.messagingSystem = messenger;
  }
}

type ControllerWithoutStateChangeEventState = {
  qux: string;
};

type ControllerWithoutStateChangeEventMessenger = RestrictedMessenger<
  'ControllerWithoutStateChangeEvent',
  never,
  QuzControllerEvent,
  never,
  QuzControllerEvent['type']
>;

const controllerWithoutStateChangeEventStateMetadata = {
  qux: {
    persist: true,
    anonymous: true,
  },
};

class ControllerWithoutStateChangeEvent extends BaseController<
  'ControllerWithoutStateChangeEvent',
  ControllerWithoutStateChangeEventState,
  ControllerWithoutStateChangeEventMessenger
> {
  constructor(messagingSystem: ControllerWithoutStateChangeEventMessenger) {
    super({
      messenger: messagingSystem,
      metadata: controllerWithoutStateChangeEventStateMetadata,
      name: 'ControllerWithoutStateChangeEvent',
      state: { qux: 'qux' },
    });
  }

  updateState(qux: string) {
    super.update((state) => {
      state.qux = qux;
    });
  }
}

type ControllersMap = {
  FooController: FooController;
  QuzController: QuzController;
  BarController: BarController;
  BazController: BazController;
  ControllerWithoutStateChangeEvent: ControllerWithoutStateChangeEvent;
};

describe('ComposableController', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('BaseControllerV1', () => {
    it('should compose controller state', () => {
      type ComposableControllerState = {
        BarController: BarControllerState;
        BazController: BazControllerState;
      };

      const composableMessenger = new Messenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | ChildControllerStateChangeEvents<ComposableControllerState>
      >().getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: [
          'BarController:stateChange',
          'BazController:stateChange',
        ],
      });
      const controller = new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          BarController: new BarController(),
          BazController: new BazController({
            messenger: new Messenger<never, never>().getRestricted({
              name: 'BazController',
              allowedActions: [],
              allowedEvents: [],
            }),
          }),
        },
        messenger: composableMessenger,
      });

      expect(controller.state).toStrictEqual({
        BarController: { bar: 'bar' },
        BazController: { baz: 'baz' },
      });
    });

    it('should notify listeners of nested state change', () => {
      type ComposableControllerState = {
        BarController: BarControllerState;
      };
      const messenger = new Messenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | ChildControllerStateChangeEvents<ComposableControllerState>
      >();
      const composableMessenger = messenger.getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: ['BarController:stateChange'],
      });
      const barController = new BarController();
      new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: { BarController: barController },
        messenger: composableMessenger,
      });
      const listener = sinon.stub();
      messenger.subscribe('ComposableController:stateChange', listener);
      barController.updateBar('something different');

      expect(listener.calledOnce).toBe(true);
      expect(listener.getCall(0).args[0]).toStrictEqual({
        BarController: {
          bar: 'something different',
        },
      });
    });
  });

  describe('BaseControllerV2', () => {
    it('should compose controller state', () => {
      type ComposableControllerState = {
        FooController: FooControllerState;
        QuzController: QuzControllerState;
      };
      const messenger = new Messenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
        | QuzControllerEvent
      >();
      const fooMessenger = messenger.getRestricted<
        'FooController',
        never,
        QuzControllerEvent['type']
      >({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: ['QuzController:stateChange'],
      });
      const quzMessenger = messenger.getRestricted({
        name: 'QuzController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooMessenger);
      const quzController = new QuzController(quzMessenger);

      const composableControllerMessenger = messenger.getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: [
          'FooController:stateChange',
          'QuzController:stateChange',
        ],
      });
      const composableController = new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          FooController: fooController,
          QuzController: quzController,
        },
        messenger: composableControllerMessenger,
      });
      expect(composableController.state).toStrictEqual({
        FooController: { foo: 'foo' },
        QuzController: { quz: 'quz' },
      });
    });

    it('should notify listeners of nested state change', () => {
      type ComposableControllerState = {
        FooController: FooControllerState;
      };
      const messenger = new Messenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
      >();
      const fooControllerMessenger = messenger.getRestricted({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = messenger.getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: ['FooController:stateChange'],
      });
      new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          FooController: fooController,
        },
        messenger: composableControllerMessenger,
      });

      const listener = sinon.stub();
      messenger.subscribe('ComposableController:stateChange', listener);
      fooController.updateFoo('bar');

      expect(listener.calledOnce).toBe(true);
      expect(listener.getCall(0).args[0]).toStrictEqual({
        FooController: {
          foo: 'bar',
        },
      });
    });
  });

  describe('Mixed BaseControllerV1 and BaseControllerV2', () => {
    it('should compose controller state', () => {
      type ComposableControllerState = {
        BarController: BarControllerState;
        FooController: FooControllerState;
      };
      const barController = new BarController();
      const messenger = new Messenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | ChildControllerStateChangeEvents<ComposableControllerState>
      >();
      const fooControllerMessenger = messenger.getRestricted({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = messenger.getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: [
          'BarController:stateChange',
          'FooController:stateChange',
        ],
      });
      const composableController = new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          BarController: barController,
          FooController: fooController,
        },
        messenger: composableControllerMessenger,
      });
      expect(composableController.state).toStrictEqual({
        BarController: { bar: 'bar' },
        FooController: { foo: 'foo' },
      });
    });

    it('should notify listeners of BaseControllerV1 state change', () => {
      type ComposableControllerState = {
        BarController: BarControllerState;
        FooController: FooControllerState;
      };
      const barController = new BarController();
      const messenger = new Messenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | ChildControllerStateChangeEvents<ComposableControllerState>
      >();
      const fooControllerMessenger = messenger.getRestricted({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableMessenger = messenger.getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: [
          'BarController:stateChange',
          'FooController:stateChange',
        ],
      });
      new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          BarController: barController,
          FooController: fooController,
        },
        messenger: composableMessenger,
      });
      const listener = sinon.stub();
      messenger.subscribe('ComposableController:stateChange', listener);
      barController.updateBar('foo');

      expect(listener.calledOnce).toBe(true);
      expect(listener.getCall(0).args[0]).toStrictEqual({
        BarController: {
          bar: 'foo',
        },
        FooController: {
          foo: 'foo',
        },
      });
    });

    it('should notify listeners of BaseControllerV2 state change', () => {
      type ComposableControllerState = {
        BarController: BarControllerState;
        FooController: FooControllerState;
      };
      const barController = new BarController();
      const messenger = new Messenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | ChildControllerStateChangeEvents<ComposableControllerState>
      >();
      const fooControllerMessenger = messenger.getRestricted({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = messenger.getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: [
          'BarController:stateChange',
          'FooController:stateChange',
        ],
      });
      new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          BarController: barController,
          FooController: fooController,
        },
        messenger: composableControllerMessenger,
      });

      const listener = sinon.stub();
      messenger.subscribe('ComposableController:stateChange', listener);
      fooController.updateFoo('bar');

      expect(listener.calledOnce).toBe(true);
      expect(listener.getCall(0).args[0]).toStrictEqual({
        BarController: {
          bar: 'bar',
        },
        FooController: {
          foo: 'bar',
        },
      });
    });

    it('should throw if messenger not provided', () => {
      const barController = new BarController();
      const messenger = new Messenger<never, FooControllerEvent>();
      const fooControllerMessenger = messenger.getRestricted({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooControllerMessenger);
      expect(
        () =>
          // @ts-expect-error - Suppressing type error to test for runtime error handling
          new ComposableController({
            controllers: {
              BarController: barController,
              FooController: fooController,
            },
          }),
      ).toThrow('Messaging system is required');
    });

    it('should throw if composing a controller that does not extend from BaseController', () => {
      type ComposableControllerState = {
        FooController: FooControllerState;
      };
      const notController = new JsonRpcEngine();
      const messenger = new Messenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
      >();
      const fooControllerMessenger = messenger.getRestricted({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = messenger.getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: ['FooController:stateChange'],
      });
      expect(
        () =>
          new ComposableController<
            ComposableControllerState & {
              JsonRpcEngine: Record<string, unknown>;
            },
            // @ts-expect-error - Suppressing type error to test for runtime error handling
            {
              JsonRpcEngine: typeof notController;
              FooController: FooController;
            }
          >({
            controllers: {
              JsonRpcEngine: notController,
              FooController: fooController,
            },
            messenger: composableControllerMessenger,
          }),
      ).toThrow(INVALID_CONTROLLER_ERROR);
    });
  });

  it('should not throw if composing a controller without a `stateChange` event', () => {
    const messenger = new Messenger<never, FooControllerEvent>();
    const controllerWithoutStateChangeEventMessenger = messenger.getRestricted({
      name: 'ControllerWithoutStateChangeEvent',
      allowedActions: [],
      allowedEvents: [],
    });
    const controllerWithoutStateChangeEvent =
      new ControllerWithoutStateChangeEvent(
        controllerWithoutStateChangeEventMessenger,
      );
    const fooControllerMessenger = messenger.getRestricted({
      name: 'FooController',
      allowedActions: [],
      allowedEvents: [],
    });
    const fooController = new FooController(fooControllerMessenger);
    expect(
      () =>
        new ComposableController({
          controllers: {
            ControllerWithoutStateChangeEvent:
              controllerWithoutStateChangeEvent,
            FooController: fooController,
          },
          messenger: messenger.getRestricted({
            name: 'ComposableController',
            allowedActions: [],
            allowedEvents: ['FooController:stateChange'],
          }),
        }),
    ).not.toThrow();
  });

  it('should not throw if a child controller `stateChange` event is missing from the messenger events allowlist', () => {
    const messenger = new Messenger<
      never,
      FooControllerEvent | QuzControllerEvent
    >();
    const QuzControllerMessenger = messenger.getRestricted({
      name: 'QuzController',
      allowedActions: [],
      allowedEvents: [],
    });
    const quzController = new QuzController(QuzControllerMessenger);
    const fooControllerMessenger = messenger.getRestricted({
      name: 'FooController',
      allowedActions: [],
      allowedEvents: [],
    });
    const fooController = new FooController(fooControllerMessenger);
    expect(
      () =>
        new ComposableController({
          controllers: {
            QuzController: quzController,
            FooController: fooController,
          },
          messenger: messenger.getRestricted({
            name: 'ComposableController',
            allowedActions: [],
            allowedEvents: ['FooController:stateChange'],
          }),
        }),
    ).not.toThrow();
  });
});
