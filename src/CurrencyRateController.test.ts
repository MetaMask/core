import { stub, SinonStub } from 'sinon';
import CurrencyRateController from './CurrencyRateController';

describe('CurrencyRateController', () => {
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
			interval: 180000,
			nativeCurrency: 'eth'
		});
	});

	it('should poll on correct interval', () => {
		const mock = stub(global, 'setInterval');
		/* tslint:disable-next-line:no-unused-expression */
		new CurrencyRateController({ interval: 1337 });
		expect(mock.getCall(0).args[1]).toBe(1337);
		mock.restore();
	});

	it('should update rate on interval', () => {
		return new Promise((resolve) => {
			const controller = new CurrencyRateController({ interval: 10 });
			const mock = stub(controller, 'updateExchangeRate');
			setTimeout(() => {
				expect(mock.called).toBe(true);
				mock.restore();
				resolve();
			}, 20);
		});
	});

	it('should not update rates if disabled', async () => {
		const controller = new CurrencyRateController({
			disabled: true,
			interval: 10
		});
		controller.fetchExchangeRate = stub();
		await controller.updateExchangeRate();
		expect((controller.fetchExchangeRate as any).called).toBe(false);
	});

	it('should clear previous interval', () => {
		const mock = stub(global, 'clearInterval');
		const controller = new CurrencyRateController({ interval: 1337 });
		controller.interval = 1338;
		expect(mock.called).toBe(true);
		mock.restore();
	});

	it('should use default base asset', async () => {
		const nativeCurrency = 'FOO';
		const controller = new CurrencyRateController({ nativeCurrency });
		const mock = stub(window, 'fetch');
		(window.fetch as SinonStub).returns(
			Promise.resolve({
				json: () => ({ USD: 1337 })
			})
		);
		await controller.fetchExchangeRate('usd');
		mock.restore();
		expect(mock.getCall(0).args[0]).toContain(nativeCurrency);
	});
});
