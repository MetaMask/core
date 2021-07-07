import { stub } from 'sinon';
import { BaseController, BaseConfig, BaseState } from './BaseController';

const STATE = { name: 'foo' };
const CONFIG = { disabled: true };

class TestController extends BaseController<BaseConfig, BaseState> {
  constructor(config?: BaseConfig, state?: BaseState) {
    super(config, state);
    this.initialize();
  }
}

describe('BaseController', () => {
  it('should set initial state', () => {
    const controller = new TestController(undefined, STATE);
    expect(controller.state).toStrictEqual(STATE);
  });

  it('should set initial config', () => {
    const controller = new TestController(CONFIG);
    expect(controller.config).toStrictEqual(CONFIG);
  });

  it('should overwrite state', () => {
    const controller = new TestController();
    expect(controller.state).toStrictEqual({});
    controller.update(STATE, true);
    expect(controller.state).toStrictEqual(STATE);
  });

  it('should overwrite config', () => {
    const controller = new TestController();
    expect(controller.config).toStrictEqual({});
    controller.configure(CONFIG, true);
    expect(controller.config).toStrictEqual(CONFIG);
  });

  it('should be able to partially update the config', () => {
    const controller = new TestController(CONFIG);
    expect(controller.config).toStrictEqual(CONFIG);
    controller.configure({ disabled: false }, false, false);
    expect(controller.config).toStrictEqual({ disabled: false });
  });

  it('should notify all listeners', () => {
    const controller = new TestController(undefined, STATE);
    const listenerOne = stub();
    const listenerTwo = stub();
    controller.subscribe(listenerOne);
    controller.subscribe(listenerTwo);
    controller.notify();
    expect(listenerOne.calledOnce).toBe(true);
    expect(listenerTwo.calledOnce).toBe(true);
    expect(listenerOne.getCall(0).args[0]).toStrictEqual(STATE);
    expect(listenerTwo.getCall(0).args[0]).toStrictEqual(STATE);
  });

  it('should not notify unsubscribed listeners', () => {
    const controller = new TestController();
    const listener = stub();
    controller.subscribe(listener);
    controller.unsubscribe(listener);
    controller.unsubscribe(() => null);
    controller.notify();
    expect(listener.called).toBe(false);
  });
});
