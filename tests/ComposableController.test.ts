import { stub } from 'sinon';
import BaseController, { BaseConfig, BaseState } from '../src/BaseController';
import ComposableController from '../src/ComposableController';

interface TestState extends BaseState {
  test: any;
}

interface FooState extends BaseState {
  foo: any;
}

class FooController extends BaseController<BaseConfig, FooState> {
  name = 'FooController';

  constructor(config?: BaseConfig, state?: TestState) {
    super(config, state);
    this.defaultState = { foo: {} };
    this.initialize();
  }
}

class TestController extends BaseController<BaseConfig, TestState> {
  name = 'TestController';

  requiredControllers = ['FooController'];

  constructor(config?: BaseConfig, state?: TestState) {
    super(config, state);
    this.defaultState = { test: {} };
    this.initialize();
  }
}

describe('ComposableController', () => {
  it('should compose controller state', () => {
    const controller = new ComposableController([
      new BaseController(),
    ]);
    expect(controller.state).toEqual({
      BaseController: {},
    });
  });

  it('should compose flat controller state', () => {
    const controller = new ComposableController([
      new FooController(),
      new TestController(),
    ]);
    expect(controller.flatState).toEqual({
      foo: {},
      test: {},
    });
  });

  it('should expose sibling context', () => {
    const controller = new ComposableController([
      new FooController(),
      new TestController(),
    ]);
    const addressContext = controller.context.FooController.context.TestController as TestController;
    expect(addressContext).toBeDefined();
    addressContext.update({ test: 'baz' });
    expect(controller.flatState).toEqual({
      foo: {},
      test: 'baz',
    });
  });

  it('should get and set new stores', () => {
    const controller = new ComposableController();
    const addressBook = new FooController();
    controller.controllers = [addressBook];
    expect(controller.controllers).toEqual([addressBook]);
  });

  it('should set initial state', () => {
    const state = {
      FooController: {
        foo: [
          {
            1: {
              address: 'bar',
              chainId: '1',
              isEns: false,
              memo: '',
              name: 'foo',
            },
          },
        ],
      },
    };
    const controller = new ComposableController([new FooController()], state);
    expect(controller.state).toEqual(state);
  });

  it('should notify listeners of nested state change', () => {
    const addressBookController = new TestController();
    const controller = new ComposableController([new FooController(), addressBookController]);
    const listener = stub();
    controller.subscribe(listener);
    addressBookController.update({ test: 'baz' });
    expect(listener.calledOnce).toBe(true);
    expect(listener.getCall(0).args[0]).toEqual({
      FooController: {
        foo: {},
      },
      TestController: {
        test: 'baz',
      },
    });
  });
});
