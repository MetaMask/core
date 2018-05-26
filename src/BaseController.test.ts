import { stub } from 'sinon';
import BaseController from './BaseController';

const STATE = { name: 'foo' };

describe('BaseController', () => {
	it('should set initial state', () => {
		const controller = new BaseController(STATE);
		expect(controller.state).toEqual(STATE);
	});

	it('should set and merge state', () => {
		const controller = new BaseController();
		controller.mergeState(STATE);
		expect(controller.state).toEqual(STATE);
	});

	it('should notify all listeners', () => {
		const controller = new BaseController(STATE);
		const listenerOne = stub();
		const listenerTwo = stub();
		controller.subscribe(listenerOne);
		controller.subscribe(listenerTwo);
		controller.notify();
		expect(listenerOne.calledOnce).toBe(true);
		expect(listenerTwo.calledOnce).toBe(true);
		expect(listenerOne.getCall(0).args[0]).toEqual(STATE);
		expect(listenerTwo.getCall(0).args[0]).toEqual(STATE);
	});

	it('should notify listeners on merge', () => {
		const controller = new BaseController();
		const listener = stub();
		controller.subscribe(listener);
		controller.mergeState(STATE);
		expect(listener.calledOnce).toBe(true);
		expect(listener.getCall(0).args[0]).toEqual(STATE);
	});

	it('should not notify unsubscribed listeners', () => {
		const controller = new BaseController();
		const listener = stub();
		controller.subscribe(listener);
		controller.unsubscribe(listener);
		controller.unsubscribe(() => null);
		controller.notify();
		expect(listener.called).toBe(false);
	});

	it('should not notify listeners when disabled dynamically', () => {
		const controller = new BaseController();
		controller.disabled = true;
		const listener = stub();
		controller.subscribe(listener);
		controller.notify();
		expect(listener.called).toBe(false);
	});

	it('should not notify listeners when disabled by default', () => {
		const controller = new BaseController(undefined, { disabled: true });
		const listener = stub();
		controller.subscribe(listener);
		controller.notify();
		expect(listener.called).toBe(false);
	});
});
