import 'isomorphic-fetch';
import { stub } from 'sinon';
import * as fetchMock from 'fetch-mock';
import CurrencyRateController from '../src/assets/CurrencyRateController';

describe('CurrencyRateController', () => {
	beforeEach(() => {
		fetchMock
			.reset()
			.mock('*', () => new Response(JSON.stringify({ USD: 1337 })))
			.spy();
	});

	afterEach(fetchMock.reset);

	it('should set default state', () => {
		const controller = new CurrencyRateController();
		expect(controller.state).toEqual({
			conversionDate: 0,
			conversionRate: 0,
			currentCurrency: 'usd',
			nativeCurrency: 'ETH'
		});
	});

	it('should initialize with the default config', () => {
		const controller = new CurrencyRateController();
		expect(controller.config).toEqual({
			currentCurrency: 'usd',
			disabled: false,
			interval: 180000,
			nativeCurrency: 'ETH'
		});
	});

	it('should poll and update rate in the right interval', () => {
		return new Promise((resolve) => {
			const controller = new CurrencyRateController({ interval: 100 });
			const mock = stub(controller, 'fetchExchangeRate').resolves({});
			setTimeout(() => {
				expect(mock.called).toBe(true);
				expect(mock.calledTwice).toBe(false);
			}, 1);
			setTimeout(() => {
				expect(mock.calledTwice).toBe(true);
				mock.restore();
				resolve();
			}, 150);
		});
	});

	it('should not update rates if disabled', async () => {
		const controller = new CurrencyRateController({
			interval: 10
		});
		controller.fetchExchangeRate = stub().resolves({});
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
		await controller.fetchExchangeRate('usd');
		expect(fetchMock.calls()[0][0]).toContain(nativeCurrency);
	});
});
