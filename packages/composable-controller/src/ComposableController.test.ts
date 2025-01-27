// `ComposableControllerState` type objects are keyed with controller names written in PascalCase.
/* eslint-disable @typescript-eslint/naming-convention */

import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController, ControllerMessenger } from '@metamask/base-controller';
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
  ControllerWithoutStateChangeEvent: ControllerWithoutStateChangeEvent;
};

describe('ComposableController', () => {
  afterEach(() => {
    sinon.restore();
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
      controllerMessenger.subscribe(
        'ComposableController:stateChange',
        listener,
      );
      fooController.updateFoo('qux');

      expect(listener.calledOnce).toBe(true);
      expect(listener.getCall(0).args[0]).toStrictEqual({
        FooController: {
          foo: 'qux',
        },
      });
    });
  });

  it('should notify listeners of BaseControllerV2 state change', () => {
    type ComposableControllerState = {
      QuzController: QuzControllerState;
      FooController: FooControllerState;
    };
    const controllerMessenger = new ControllerMessenger<
      never,
      | ComposableControllerEvents<ComposableControllerState>
      | ChildControllerStateChangeEvents<ComposableControllerState>
    >();
    const quzControllerMessenger = controllerMessenger.getRestricted({
      name: 'QuzController',
      allowedActions: [],
      allowedEvents: [],
    });
    const quzController = new QuzController(quzControllerMessenger);
    const fooControllerMessenger = controllerMessenger.getRestricted({
      name: 'FooController',
      allowedActions: [],
      allowedEvents: [],
    });
    const fooController = new FooController(fooControllerMessenger);
    const composableControllerMessenger = controllerMessenger.getRestricted({
      name: 'ComposableController',
      allowedActions: [],
      allowedEvents: ['QuzController:stateChange', 'FooController:stateChange'],
    });
    new ComposableController<
      ComposableControllerState,
      Pick<ControllersMap, keyof ComposableControllerState>
    >({
      controllers: {
        QuzController: quzController,
        FooController: fooController,
      },
      messenger: composableControllerMessenger,
    });

    const listener = sinon.stub();
    controllerMessenger.subscribe('ComposableController:stateChange', listener);
    fooController.updateFoo('qux');

    expect(listener.calledOnce).toBe(true);
    expect(listener.getCall(0).args[0]).toStrictEqual({
      QuzController: {
        quz: 'quz',
      },
      FooController: {
        foo: 'qux',
      },
    });
  });

  it('should throw if controller messenger not provided', () => {
    const controllerMessenger = new ControllerMessenger<
      never,
      FooControllerEvent
    >();
    const quzControllerMessenger = controllerMessenger.getRestricted({
      name: 'QuzController',
      allowedActions: [],
      allowedEvents: [],
    });
    const quzController = new QuzController(quzControllerMessenger);
    const fooControllerMessenger = controllerMessenger.getRestricted({
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
            QuzController: quzController,
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
    const controllerMessenger = new ControllerMessenger<
      never,
      ComposableControllerEvents<ComposableControllerState> | FooControllerEvent
    >();
    const fooControllerMessenger = controllerMessenger.getRestricted({
      name: 'FooController',
      allowedActions: [],
      allowedEvents: [],
    });
    const fooController = new FooController(fooControllerMessenger);
    const composableControllerMessenger = controllerMessenger.getRestricted({
      name: 'ComposableController',
      allowedActions: [],
      allowedEvents: ['FooController:stateChange'],
    });
    expect(
      () =>
        new ComposableController<
      // @ts-expect-error - Suppressing type error to test for runtime error handling
      ComposableControllerState & {
        JsonRpcEngine: Record<string, unknown>;
      },
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
