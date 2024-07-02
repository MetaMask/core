import type {
  BaseState,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  BaseController,
  BaseControllerV1,
  ControllerMessenger,
} from '@metamask/base-controller';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { Patch } from 'immer';
import * as sinon from 'sinon';

import type { ComposableControllerEvents } from './ComposableController';
import { ComposableController } from './ComposableController';

// Mock BaseController classes

type FooControllerState = {
  foo: string;
};
type FooControllerEvent = {
  type: `FooController:stateChange`;
  payload: [FooControllerState, Patch[]];
};

type FooMessenger = RestrictedControllerMessenger<
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

type QuzMessenger = RestrictedControllerMessenger<
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

class BazController extends BaseControllerV1<never, BazControllerState> {
  defaultState = {
    baz: 'baz',
  };

  override name = 'BazController' as const;

  constructor() {
    super();
    this.initialize();
  }
}

type ControllersMap = {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  FooController: FooController;
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  QuzController: QuzController;
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  BarController: BarController;
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  BazController: BazController;
};

describe('ComposableController', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('BaseControllerV1', () => {
    it('should compose controller state', () => {
      type ComposableControllerState = {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        BarController: BarControllerState;
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        BazController: BazControllerState;
      };

      const composableMessenger = new ControllerMessenger<
        never,
        ComposableControllerEvents<ComposableControllerState>
      >().getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: [],
      });
      const controller = new ComposableController<
        ComposableControllerState,
        ControllersMap[keyof ComposableControllerState]
      >({
        controllers: [new BarController(), new BazController()],
        messenger: composableMessenger,
      });

      expect(controller.state).toStrictEqual({
        BarController: { bar: 'bar' },
        BazController: { baz: 'baz' },
      });
    });

    it('should notify listeners of nested state change', () => {
      type ComposableControllerState = {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        BarController: BarControllerState;
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        ComposableControllerEvents<ComposableControllerState>
      >();
      const composableMessenger = controllerMessenger.getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: [],
      });
      const barController = new BarController();
      new ComposableController<
        ComposableControllerState,
        ControllersMap[keyof ComposableControllerState]
      >({
        controllers: [barController],
        messenger: composableMessenger,
      });
      const listener = sinon.stub();
      controllerMessenger.subscribe(
        'ComposableController:stateChange',
        listener,
      );
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
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        FooController: FooControllerState;
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        QuzController: QuzControllerState;
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
        | QuzControllerEvent
      >();
      const fooMessenger = controllerMessenger.getRestricted<
        'FooController',
        never,
        QuzControllerEvent['type']
      >({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: ['QuzController:stateChange'],
      });
      const quzMessenger = controllerMessenger.getRestricted({
        name: 'QuzController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooMessenger);
      const quzController = new QuzController(quzMessenger);

      const composableControllerMessenger = controllerMessenger.getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: [
          'FooController:stateChange',
          'QuzController:stateChange',
        ],
      });
      const composableController = new ComposableController<
        ComposableControllerState,
        ControllersMap[keyof ComposableControllerState]
      >({
        controllers: [fooController, quzController],
        messenger: composableControllerMessenger,
      });
      expect(composableController.state).toStrictEqual({
        FooController: { foo: 'foo' },
        QuzController: { quz: 'quz' },
      });
    });

    it('should notify listeners of nested state change', () => {
      type ComposableControllerState = {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        FooController: FooControllerState;
      };
      const controllerMessenger = new ControllerMessenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
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
      new ComposableController<
        ComposableControllerState,
        ControllersMap[keyof ComposableControllerState]
      >({
        controllers: [fooController],
        messenger: composableControllerMessenger,
      });

      const listener = sinon.stub();
      controllerMessenger.subscribe(
        'ComposableController:stateChange',
        listener,
      );
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
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        BarController: BarControllerState;
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        FooController: FooControllerState;
      };
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
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
      const composableController = new ComposableController<
        ComposableControllerState,
        ControllersMap[keyof ComposableControllerState]
      >({
        controllers: [barController, fooController],
        messenger: composableControllerMessenger,
      });
      expect(composableController.state).toStrictEqual({
        BarController: { bar: 'bar' },
        FooController: { foo: 'foo' },
      });
    });

    it('should notify listeners of BaseControllerV1 state change', () => {
      type ComposableControllerState = {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        BarController: BarControllerState;
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        FooController: FooControllerState;
      };
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
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
      new ComposableController<
        ComposableControllerState,
        ControllersMap[keyof ComposableControllerState]
      >({
        controllers: [barController, fooController],
        messenger: composableControllerMessenger,
      });
      const listener = sinon.stub();
      controllerMessenger.subscribe(
        'ComposableController:stateChange',
        listener,
      );
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
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        BarController: BarControllerState;
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        FooController: FooControllerState;
      };
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
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
      new ComposableController<
        ComposableControllerState,
        ControllersMap[keyof ComposableControllerState]
      >({
        controllers: [barController, fooController],
        messenger: composableControllerMessenger,
      });

      const listener = sinon.stub();
      controllerMessenger.subscribe(
        'ComposableController:stateChange',
        listener,
      );
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

    it('should throw if controller messenger not provided', () => {
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        FooControllerEvent
      >();
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
            controllers: [barController, fooController],
          }),
      ).toThrow('Messaging system is required');
    });

    it('should throw if composing a controller that does not extend from BaseController', () => {
      type ComposableControllerState = {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        FooController: FooControllerState;
      };
      const notController = new JsonRpcEngine();
      const controllerMessenger = new ControllerMessenger<
        never,
        | ComposableControllerEvents<ComposableControllerState>
        | FooControllerEvent
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
            ComposableControllerState,
            ControllersMap[keyof ComposableControllerState]
          >({
            // @ts-expect-error - Suppressing type error to test for runtime error handling
            controllers: [notController, fooController],
            messenger: composableControllerMessenger,
          }),
      ).toThrow(
        'Invalid component: component must be a MessengerConsumer or a controller inheriting from BaseControllerV1.',
      );
    });
  });
});
