import * as sinon from 'sinon';

import { JsonRpcEngine } from '../../json-rpc-engine/src';
import type { BaseConfig, BaseState } from './BaseControllerV1';
import {
  BaseControllerV1 as BaseController,
  isBaseControllerV1,
} from './BaseControllerV1';
import type {
  CountControllerAction,
  CountControllerEvent,
} from './BaseControllerV2.test';
import {
  CountController,
  countControllerName,
  countControllerStateMetadata,
  getCountMessenger,
} from './BaseControllerV2.test';
import { ControllerMessenger } from './ControllerMessenger';

const STATE = { name: 'foo' };
const CONFIG = { disabled: true };

// eslint-disable-next-line jest/no-export
export class TestController extends BaseController<BaseConfig, BaseState> {
  constructor(config?: BaseConfig, state?: BaseState) {
    super(config, state);
    this.initialize();
  }
}

describe('isBaseControllerV1', () => {
  it('should return false if passed a V1 controller', () => {
    const controller = new TestController();
    expect(isBaseControllerV1(controller)).toBe(true);
  });

  it('should return false if passed a V2 controller', () => {
    const controllerMessenger = new ControllerMessenger<
      CountControllerAction,
      CountControllerEvent
    >();
    const controller = new CountController({
      messenger: getCountMessenger(controllerMessenger),
      name: countControllerName,
      state: { count: 0 },
      metadata: countControllerStateMetadata,
    });
    expect(isBaseControllerV1(controller)).toBe(false);
  });

  it('should return false if passed a non-controller', () => {
    const notController = new JsonRpcEngine();
    // @ts-expect-error Intentionally passing invalid input to test runtime behavior
    expect(isBaseControllerV1(notController)).toBe(false);
  });
});

describe('BaseController', () => {
  afterEach(() => {
    sinon.restore();
  });

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
    const listenerOne = sinon.stub();
    const listenerTwo = sinon.stub();
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
    const listener = sinon.stub();
    controller.subscribe(listener);
    controller.unsubscribe(listener);
    controller.unsubscribe(() => null);
    controller.notify();
    expect(listener.called).toBe(false);
  });
});
