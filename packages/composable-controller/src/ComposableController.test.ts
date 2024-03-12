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
  FooControllerEvent,
  never,
  never
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

// Mock BaseControllerV1 classes

type BarControllerState = BaseState & {
  bar: string;
};

class BarController extends BaseControllerV1<never, BarControllerState> {
  defaultState = {
    bar: 'bar',
  };

  override name = 'BarController';

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

  override name = 'BazController';

  constructor() {
    super();
    this.initialize();
  }
}

describe('ComposableController', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('BaseControllerV1', () => {
    it('should compose controller state', () => {
      const composableMessenger = new ControllerMessenger<
        never,
        ComposableControllerEvents
      >().getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: [],
      });
      const controller = new ComposableController({
        controllers: [new BarController(), new BazController()],
        messenger: composableMessenger,
      });

      expect(controller.state).toStrictEqual({
        BarController: { bar: 'bar' },
        BazController: { baz: 'baz' },
      });
    });

    it('should notify listeners of nested state change', () => {
      const controllerMessenger = new ControllerMessenger<
        never,
        ComposableControllerEvents
      >();
      const composableMessenger = controllerMessenger.getRestricted({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: [],
      });
      const barController = new BarController();
      new ComposableController({
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

      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        FooControllerEvent['type']
      >({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: ['FooController:stateChange'],
      });
      const composableController = new ComposableController({
        controllers: [fooController],
        messenger: composableControllerMessenger,
      });
      expect(composableController.state).toStrictEqual({
        FooController: { foo: 'foo' },
      });
    });

    it('should notify listeners of nested state change', () => {
      const controllerMessenger = new ControllerMessenger<
        never,
        ComposableControllerEvents | FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        FooControllerEvent['type']
      >({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: ['FooController:stateChange'],
      });
      new ComposableController({
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
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        FooControllerEvent['type']
      >({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: ['FooController:stateChange'],
      });
      const composableController = new ComposableController({
        controllers: [barController, fooController],
        messenger: composableControllerMessenger,
      });
      expect(composableController.state).toStrictEqual({
        BarController: { bar: 'bar' },
        FooController: { foo: 'foo' },
      });
    });

    it('should notify listeners of BaseControllerV1 state change', () => {
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        ComposableControllerEvents | FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        FooControllerEvent['type']
      >({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: ['FooController:stateChange'],
      });
      new ComposableController({
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
      const barController = new BarController();
      const controllerMessenger = new ControllerMessenger<
        never,
        ComposableControllerEvents | FooControllerEvent
      >();
      const fooControllerMessenger = controllerMessenger.getRestricted({
        name: 'FooController',
        allowedActions: [],
        allowedEvents: [],
      });
      const fooController = new FooController(fooControllerMessenger);
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        FooControllerEvent['type']
      >({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: ['FooController:stateChange'],
      });
      new ComposableController({
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
      const notController = new JsonRpcEngine();
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
      const composableControllerMessenger = controllerMessenger.getRestricted<
        'ComposableController',
        never,
        FooControllerEvent['type']
      >({
        name: 'ComposableController',
        allowedActions: [],
        allowedEvents: ['FooController:stateChange'],
      });
      expect(
        () =>
          new ComposableController({
            // @ts-expect-error - Suppressing type error to test for runtime error handling
            controllers: [notController, fooController],
            messenger: composableControllerMessenger,
          }),
      ).toThrow(
        'Invalid controller: controller must extend from BaseController or BaseControllerV1',
      );
    });
  });
});
