import {
  BaseController,
  deriveStateFromMetadata,
} from '@metamask/base-controller';
import type {
  ControllerStateChangeEvent,
  ControllerGetStateAction,
  StateConstraint,
} from '@metamask/base-controller';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { Patch } from 'immer';

import type {
  ChildControllerStateChangeEvents,
  ComposableControllerActions,
  ComposableControllerEvents,
} from './ComposableController';
import {
  ComposableController,
  INVALID_CONTROLLER_ERROR,
} from './ComposableController';

// Mock BaseController classes

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<FooMessenger> | MessengerActions<QuzMessenger>,
  MessengerEvents<FooMessenger> | MessengerEvents<QuzMessenger>
>;

type FooControllerState = {
  foo: string;
};
type FooControllerAction = ControllerGetStateAction<
  'FooController',
  FooControllerState
>;
type FooControllerEvent = {
  type: `FooController:stateChange`;
  payload: [FooControllerState, Patch[]];
};

type FooMessenger = Messenger<
  'FooController',
  FooControllerAction,
  FooControllerEvent | QuzControllerEvent,
  RootMessenger
>;

const fooControllerStateMetadata = {
  foo: {
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
    includeInStateLogs: false,
  },
};

class FooController extends BaseController<
  'FooController',
  FooControllerState,
  FooMessenger
> {
  constructor(messenger: FooMessenger) {
    super({
      messenger,
      metadata: fooControllerStateMetadata,
      name: 'FooController',
      state: { foo: 'foo' },
    });
  }

  updateFoo(foo: string): void {
    super.update((state) => {
      state.foo = foo;
    });
  }
}

type QuzControllerState = {
  quz: string;
};
type QuzControllerAction = ControllerGetStateAction<
  'QuzController',
  QuzControllerState
>;
type QuzControllerEvent = {
  type: `QuzController:stateChange`;
  payload: [QuzControllerState, Patch[]];
};

type QuzMessenger = Messenger<
  'QuzController',
  QuzControllerAction,
  QuzControllerEvent,
  RootMessenger
>;

const quzControllerStateMetadata = {
  quz: {
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
    includeInStateLogs: false,
  },
};

class QuzController extends BaseController<
  'QuzController',
  QuzControllerState,
  QuzMessenger
> {
  constructor(messenger: QuzMessenger) {
    super({
      messenger,
      metadata: quzControllerStateMetadata,
      name: 'QuzController',
      state: { quz: 'quz' },
    });
  }

  updateQuz(quz: string): void {
    super.update((state) => {
      state.quz = quz;
    });
  }
}

type ComposableControllerMessenger<State extends StateConstraint> = Messenger<
  'ComposableController',
  ControllerGetStateAction<'ComposableController', State>,
  | ControllerStateChangeEvent<'ComposableController', State>
  | FooControllerEvent,
  RootMessenger
>;

type ControllersMap = {
  /* eslint-disable @typescript-eslint/naming-convention */
  FooController: FooController;
  QuzController: QuzController;
  /* eslint-enable @typescript-eslint/naming-convention */
};

describe('ComposableController', () => {
  describe('BaseController', () => {
    it('should compose controller state', () => {
      type ComposableControllerState = {
        /* eslint-disable @typescript-eslint/naming-convention */
        QuzController: QuzControllerState;
        FooController: FooControllerState;
        /* eslint-enable @typescript-eslint/naming-convention */
      };
      const messenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });
      const fooMessenger: FooMessenger = new Messenger({
        namespace: 'FooController',
        parent: messenger,
      });
      messenger.delegate({
        messenger: fooMessenger,
        events: ['QuzController:stateChange'],
      });
      const quzMessenger: QuzMessenger = new Messenger({
        namespace: 'QuzController',
        parent: messenger,
      });
      const fooController = new FooController(fooMessenger);
      const quzController = new QuzController(quzMessenger);

      const composableControllerMessenger = new Messenger<
        'ComposableController',
        never,
        FooControllerEvent | QuzControllerEvent,
        RootMessenger
      >({
        namespace: 'ComposableController',
        parent: messenger,
      });
      messenger.delegate({
        messenger: composableControllerMessenger,
        events: ['FooController:stateChange', 'QuzController:stateChange'],
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
        /* eslint-disable @typescript-eslint/naming-convention */
        FooController: FooControllerState;
        /* eslint-enable @typescript-eslint/naming-convention */
      };
      const messenger = new Messenger<
        MockAnyNamespace,
        | FooControllerAction
        | ComposableControllerActions<ComposableControllerState>,
        | FooControllerEvent
        | ComposableControllerEvents<ComposableControllerState>
      >({
        namespace: MOCK_ANY_NAMESPACE,
      });
      const fooControllerMessenger = new Messenger<
        'FooController',
        FooControllerAction,
        FooControllerEvent,
        typeof messenger
      >({
        namespace: 'FooController',
        parent: messenger,
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger: ComposableControllerMessenger<ComposableControllerState> =
        new Messenger({
          namespace: 'ComposableController',
          parent: messenger,
        });
      messenger.delegate({
        messenger: composableControllerMessenger,
        events: ['FooController:stateChange'],
      });
      // eslint-disable-next-line no-new
      new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          FooController: fooController,
        },
        messenger: composableControllerMessenger,
      });

      const listener = jest.fn();
      composableControllerMessenger.subscribe(
        'ComposableController:stateChange',
        listener,
      );
      fooController.updateFoo('qux');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toStrictEqual({
        FooController: {
          foo: 'qux',
        },
      });
    });
  });

  it('should notify listeners of BaseController state change', () => {
    type ComposableControllerState = {
      /* eslint-disable @typescript-eslint/naming-convention */
      QuzController: QuzControllerState;
      FooController: FooControllerState;
      /* eslint-enable @typescript-eslint/naming-convention */
    };
    const messenger = new Messenger<
      MockAnyNamespace,
      | ComposableControllerActions<ComposableControllerState>
      | QuzControllerAction
      | FooControllerAction,
      | ComposableControllerEvents<ComposableControllerState>
      | ChildControllerStateChangeEvents<ComposableControllerState>
    >({ namespace: MOCK_ANY_NAMESPACE });
    const quzControllerMessenger = new Messenger<
      'QuzController',
      QuzControllerAction,
      QuzControllerEvent,
      typeof messenger
    >({
      namespace: 'QuzController',
      parent: messenger,
    });
    const quzController = new QuzController(quzControllerMessenger);
    const fooControllerMessenger = new Messenger<
      'FooController',
      FooControllerAction,
      FooControllerEvent,
      typeof messenger
    >({
      namespace: 'FooController',
      parent: messenger,
    });
    const fooController = new FooController(fooControllerMessenger);
    const composableControllerMessenger = new Messenger<
      'ComposableController',
      ComposableControllerActions<ComposableControllerState>,
      | ComposableControllerEvents<ComposableControllerState>
      | FooControllerEvent
      | QuzControllerEvent,
      typeof messenger
    >({
      namespace: 'ComposableController',
      parent: messenger,
    });
    messenger.delegate({
      messenger: composableControllerMessenger,
      events: ['QuzController:stateChange', 'FooController:stateChange'],
    });
    // eslint-disable-next-line no-new
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

    const listener = jest.fn();
    messenger.subscribe('ComposableController:stateChange', listener);
    fooController.updateFoo('qux');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toStrictEqual({
      QuzController: {
        quz: 'quz',
      },
      FooController: {
        foo: 'qux',
      },
    });
  });

  it('should not throw if child state change event subscription fails', () => {
    type ComposableControllerState = {
      /* eslint-disable @typescript-eslint/naming-convention */
      FooController: FooControllerState;
      /* eslint-enable @typescript-eslint/naming-convention */
    };
    const messenger = new Messenger<
      MockAnyNamespace,
      | ComposableControllerActions<ComposableControllerState>
      | FooControllerAction,
      ComposableControllerEvents<ComposableControllerState> | FooControllerEvent
    >({ namespace: MOCK_ANY_NAMESPACE });
    const fooControllerMessenger = new Messenger<
      'FooController',
      FooControllerAction,
      FooControllerEvent,
      typeof messenger
    >({
      namespace: 'FooController',
      parent: messenger,
    });
    const fooController = new FooController(fooControllerMessenger);
    const composableControllerMessenger = new Messenger<
      'ComposableController',
      ComposableControllerActions<ComposableControllerState>,
      | ComposableControllerEvents<ComposableControllerState>
      | FooControllerEvent,
      typeof messenger
    >({
      namespace: 'ComposableController',
      parent: messenger,
    });
    messenger.delegate({
      messenger: composableControllerMessenger,
      events: ['FooController:stateChange'],
    });
    jest
      .spyOn(composableControllerMessenger, 'subscribe')
      .mockImplementation(() => {
        throw new Error();
      });
    expect(
      () =>
        new ComposableController({
          controllers: {
            FooController: fooController,
          },
          messenger: composableControllerMessenger,
        }),
    ).not.toThrow();
  });

  it('should throw if controller messenger not provided', () => {
    const messenger = new Messenger<
      MockAnyNamespace,
      QuzControllerAction | FooControllerAction,
      QuzControllerEvent | FooControllerEvent
    >({ namespace: MOCK_ANY_NAMESPACE });
    const quzControllerMessenger = new Messenger<
      'QuzController',
      QuzControllerAction,
      QuzControllerEvent,
      typeof messenger
    >({
      namespace: 'QuzController',
      parent: messenger,
    });
    const quzController = new QuzController(quzControllerMessenger);
    const fooControllerMessenger = new Messenger<
      'FooController',
      FooControllerAction,
      FooControllerEvent,
      typeof messenger
    >({
      namespace: 'FooController',
      parent: messenger,
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
      /* eslint-disable @typescript-eslint/naming-convention */
      FooController: FooControllerState;
      /* eslint-enable @typescript-eslint/naming-convention */
    };
    const notController = new JsonRpcEngine();
    const messenger = new Messenger<
      MockAnyNamespace,
      | ComposableControllerActions<ComposableControllerState>
      | FooControllerAction,
      ComposableControllerEvents<ComposableControllerState> | FooControllerEvent
    >({ namespace: MOCK_ANY_NAMESPACE });
    const fooControllerMessenger = new Messenger<
      'FooController',
      FooControllerAction,
      FooControllerEvent,
      typeof messenger
    >({
      namespace: 'FooController',
      parent: messenger,
    });
    const fooController = new FooController(fooControllerMessenger);
    const composableControllerMessenger = new Messenger<
      'ComposableController',
      ComposableControllerActions<ComposableControllerState>,
      | ComposableControllerEvents<ComposableControllerState>
      | FooControllerEvent,
      typeof messenger
    >({
      namespace: 'ComposableController',
      parent: messenger,
    });
    messenger.delegate({
      messenger: composableControllerMessenger,
      events: ['FooController:stateChange'],
    });
    expect(
      () =>
        new ComposableController<
          /* eslint-disable @typescript-eslint/naming-convention */
          // @ts-expect-error - Suppressing type error to test for runtime error handling
          ComposableControllerState & {
            JsonRpcEngine: Record<string, unknown>;
          },
          {
            JsonRpcEngine: typeof notController;
            FooController: FooController;
          }
          /* eslint-enable @typescript-eslint/naming-convention */
        >({
          controllers: {
            JsonRpcEngine: notController,
            FooController: fooController,
          },
          messenger: composableControllerMessenger,
        }),
    ).toThrow(INVALID_CONTROLLER_ERROR);
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      type ComposableControllerState = {
        /* eslint-disable @typescript-eslint/naming-convention */
        FooController: FooControllerState;
        /* eslint-enable @typescript-eslint/naming-convention */
      };
      const messenger = new Messenger<
        MockAnyNamespace,
        | ComposableControllerActions<ComposableControllerState>
        | FooControllerAction,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
      >({ namespace: MOCK_ANY_NAMESPACE });
      const fooControllerMessenger = new Messenger<
        'FooController',
        FooControllerAction,
        FooControllerEvent,
        typeof messenger
      >({
        namespace: 'FooController',
        parent: messenger,
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = new Messenger<
        'ComposableController',
        ComposableControllerActions<ComposableControllerState>,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent,
        typeof messenger
      >({
        namespace: 'ComposableController',
        parent: messenger,
      });
      messenger.delegate({
        messenger: composableControllerMessenger,
        events: ['FooController:stateChange'],
      });
      const controller = new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          FooController: fooController,
        },
        messenger: composableControllerMessenger,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`
        {
          "FooController": {
            "foo": "foo",
          },
        }
      `);
    });

    it('includes expected state in state logs', () => {
      type ComposableControllerState = {
        /* eslint-disable @typescript-eslint/naming-convention */
        FooController: FooControllerState;
        /* eslint-enable @typescript-eslint/naming-convention */
      };
      const messenger = new Messenger<
        MockAnyNamespace,
        | ComposableControllerActions<ComposableControllerState>
        | FooControllerAction,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
      >({ namespace: MOCK_ANY_NAMESPACE });
      const fooControllerMessenger = new Messenger<
        'FooController',
        FooControllerAction,
        FooControllerEvent,
        typeof messenger
      >({
        namespace: 'FooController',
        parent: messenger,
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = new Messenger<
        'ComposableController',
        ComposableControllerActions<ComposableControllerState>,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent,
        typeof messenger
      >({
        namespace: 'ComposableController',
        parent: messenger,
      });
      messenger.delegate({
        messenger: composableControllerMessenger,
        events: ['FooController:stateChange'],
      });
      const controller = new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          FooController: fooController,
        },
        messenger: composableControllerMessenger,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('persists expected state', () => {
      type ComposableControllerState = {
        /* eslint-disable @typescript-eslint/naming-convention */
        FooController: FooControllerState;
        /* eslint-enable @typescript-eslint/naming-convention */
      };
      const messenger = new Messenger<
        MockAnyNamespace,
        | ComposableControllerActions<ComposableControllerState>
        | FooControllerAction,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
      >({ namespace: MOCK_ANY_NAMESPACE });
      const fooControllerMessenger = new Messenger<
        'FooController',
        FooControllerAction,
        FooControllerEvent,
        typeof messenger
      >({
        namespace: 'FooController',
        parent: messenger,
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = new Messenger<
        'ComposableController',
        ComposableControllerActions<ComposableControllerState>,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent,
        typeof messenger
      >({
        namespace: 'ComposableController',
        parent: messenger,
      });
      messenger.delegate({
        messenger: composableControllerMessenger,
        events: ['FooController:stateChange'],
      });
      const controller = new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          FooController: fooController,
        },
        messenger: composableControllerMessenger,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "FooController": {
            "foo": "foo",
          },
        }
      `);
    });

    it('exposes expected state to UI', () => {
      type ComposableControllerState = {
        /* eslint-disable @typescript-eslint/naming-convention */
        FooController: FooControllerState;
        /* eslint-enable @typescript-eslint/naming-convention */
      };
      const messenger = new Messenger<
        MockAnyNamespace,
        | ComposableControllerActions<ComposableControllerState>
        | FooControllerAction,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
      >({ namespace: MOCK_ANY_NAMESPACE });
      const fooControllerMessenger = new Messenger<
        'FooController',
        FooControllerAction,
        FooControllerEvent,
        typeof messenger
      >({
        namespace: 'FooController',
        parent: messenger,
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = new Messenger<
        'ComposableController',
        ComposableControllerActions<ComposableControllerState>,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent,
        typeof messenger
      >({
        namespace: 'ComposableController',
        parent: messenger,
      });
      messenger.delegate({
        messenger: composableControllerMessenger,
        events: ['FooController:stateChange'],
      });
      const controller = new ComposableController<
        ComposableControllerState,
        Pick<ControllersMap, keyof ComposableControllerState>
      >({
        controllers: {
          FooController: fooController,
        },
        messenger: composableControllerMessenger,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });
  });
});
