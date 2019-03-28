import { stub } from 'sinon';
import CurrencyRateController from './CurrencyRateController';

describe('CurrencyRateController', () => {
	beforeEach(() => {
		const mock = stub(window, 'fetch');
		mock.resolves({
			json: () => ({ USD: 1337 })
		});
		mock.restore();
	});

	it('should set default state', () => {
		const controller = new CurrencyRateController();
		expect(controller.state).toEqual({
			conversionDate: 0,
			conversionRate: 0,
			currentCurrency: 'usd',
			nativeCurrency: 'eth'
		});
	});

	it('should set default config', () => {
		const controller = new CurrencyRateController();
		expect(controller.config).toEqual({
			currentCurrency: 'usd',
			disabled: true,
			interval: 180000,
			nativeCurrency: 'eth'
		});
	});

	it('should poll and update rate in the right interval', () => {
		return new Promise((resolve) => {
			const mock = stub(CurrencyRateController.prototype, 'fetchExchangeRate');
			// tslint:disable-next-line: no-unused-expression
			new CurrencyRateController({ interval: 10 });
			expect(mock.called).toBe(true);
			expect(mock.calledTwice).toBe(false);
			setTimeout(() => {
				expect(mock.calledTwice).toBe(true);
				mock.restore();
				resolve();
			}, 15);
		});
	});

	it('should not update rates if disabled', async () => {
		const controller = new CurrencyRateController({
			interval: 10
		});
		controller.fetchExchangeRate = stub();
		controller.disabled = true;
		await controller.updateExchangeRate();
		expect((controller.fetchExchangeRate as any).called).toBe(false);
	});

	it('should clear previous interval', () => {
		const mock = stub(global, 'clearTimeout');
		const controller = new CurrencyRateController({ interval: 1337 });
		return new Promise((resolve) => {
			setTimeout(() => {
				controller.poll(1338);
				expect(mock.called).toBe(true);
				mock.restore();
				resolve();
			}, 100);
		});
	});

	it('should update currency', async () => {
		const controller = new CurrencyRateController({ interval: 10 });
		expect(controller.state.conversionRate).toEqual(0);
		await controller.updateExchangeRate();
		expect(controller.state.conversionRate).toBeGreaterThan(0);
	});

	it('should use default base asset', async () => {
		const nativeCurrency = 'FOO';
		const controller = new CurrencyRateController({ nativeCurrency });
		const mock = stub(window, 'fetch');
		mock.resolves({
			json: () => ({ USD: 1337 })
		});
		await controller.fetchExchangeRate('usd');
		mock.restore();
		expect(mock.getCall(0).args[0]).toContain(nativeCurrency);
	});
});
