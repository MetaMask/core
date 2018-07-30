import { stub } from 'sinon';
import PhishingController from './PhishingController';

describe('PhishingController', () => {
	it('should set default state', () => {
		const controller = new PhishingController();
		expect(controller.state.phishing).toHaveProperty('blacklist');
		expect(controller.state.phishing).toHaveProperty('fuzzylist');
		expect(controller.state.phishing).toHaveProperty('version');
		expect(controller.state.phishing).toHaveProperty('whitelist');
	});

	it('should set default config', () => {
		const controller = new PhishingController();
		expect(controller.config).toEqual({ interval: 180000 });
	});

	it('should poll on correct interval', () => {
		const mock = stub(global, 'setInterval');
		/* tslint:disable-next-line:no-unused-expression */
		new PhishingController(undefined, { interval: 1337 });
		expect(mock.getCall(0).args[1]).toBe(1337);
		mock.restore();
	});

	it('should update lists on interval', () => {
		return new Promise((resolve) => {
			const controller = new PhishingController(undefined, { interval: 10 });
			const mock = stub(controller, 'updatePhishingLists');
			setTimeout(() => {
				expect(mock.called).toBe(true);
				mock.restore();
				resolve();
			}, 20);
		});
	});

	it('should update lists', async () => {
		const controller = new PhishingController();
		controller.update({}, true);
		await controller.updatePhishingLists();
		expect(controller.state.phishing).toHaveProperty('blacklist');
		expect(controller.state.phishing).toHaveProperty('fuzzylist');
		expect(controller.state.phishing).toHaveProperty('version');
		expect(controller.state.phishing).toHaveProperty('whitelist');
	});

	it('should not update infura rate if disabled', async () => {
		const controller = new PhishingController(undefined, { disabled: true });
		controller.update({}, true);
		await controller.updatePhishingLists();
		expect(controller.state.phishing).toBe(undefined);
	});

	it('should clear previous interval', () => {
		const mock = stub(global, 'clearInterval');
		const controller = new PhishingController(undefined, { interval: 1337 });
		controller.interval = 1338;
		expect(mock.called).toBe(true);
		mock.restore();
	});

	it('should verify approved domain', () => {
		const controller = new PhishingController();
		expect(controller.test('metamask.io')).toBe(false);
	});
});
