import { stub } from 'sinon';
import PhishingController from '../src/third-party/PhishingController';

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

	it('should poll and update rate in the right interval', () => {
		return new Promise((resolve) => {
			const mock = stub(PhishingController.prototype, 'updatePhishingLists');
			// tslint:disable-next-line: no-unused-expression
			new PhishingController({ interval: 10 });
			expect(mock.called).toBe(true);
			expect(mock.calledTwice).toBe(false);
			setTimeout(() => {
				expect(mock.calledTwice).toBe(true);
				mock.restore();
				resolve();
			}, 15);
		});
	});

	it('should clear previous interval', () => {
		const mock = stub(global, 'clearTimeout');
		const controller = new PhishingController({ interval: 1337 });
		return new Promise((resolve) => {
			setTimeout(() => {
				controller.poll(1338);
				expect(mock.called).toBe(true);
				mock.restore();
				resolve();
			}, 100);
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
		const controller = new PhishingController({ disabled: true });
		controller.update({}, true);
		await controller.updatePhishingLists();
		expect(controller.state.phishing).toBe(undefined);
	});

	it('should not update rates if disabled', async () => {
		const mock = stub(window, 'fetch');
		mock.resolves({
			json: () => ({})
		});
		const controller = new PhishingController({
			disabled: true,
			interval: 10
		});
		await controller.updatePhishingLists();

		expect(mock.called).toBe(false);

		mock.restore();
	});

	it('should verify approved domain', () => {
		const controller = new PhishingController();
		expect(controller.test('metamask.io')).toBe(false);
	});

	it('should bypass a given domain', () => {
		const controller = new PhishingController();
		controller.bypass('electrum.mx');
		controller.bypass('electrum.mx');
		expect(controller.test('electrum.mx')).toBe(false);
	});

	it('should not update phishing lists if fetch returns 304', async () => {
		const mock = stub(window, 'fetch');
		mock.resolves({ status: 304 });
		const controller = new PhishingController();
		const oldState = controller.state.phishing;
		await controller.updatePhishingLists();
		expect(controller.state.phishing).toBe(oldState);
		mock.restore();
	});

	it('should not update phishing lists if fetch returns error', async () => {
		const mock = stub(window, 'fetch');
		mock.resolves({ status: 500 });
		const controller = new PhishingController();
		await expect(controller.updatePhishingLists()).rejects.toThrowError(/Fetch failed with status '500'/u);
		mock.restore();
	});
});
