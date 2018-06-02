import 'isomorphic-fetch';
import { stub } from 'sinon';
import TokenRatesController from './TokenRatesController';

describe('TokenRatesController', () => {
	it('should set default state', () => {
		const controller = new TokenRatesController();
		expect(controller.state).toEqual({ contractExchangeRates: {} });
	});

	it('should set default config', () => {
		const controller = new TokenRatesController();
		expect(controller.config).toEqual({
			interval: 180000,
			tokens: []
		});
	});

	it('should poll on correct interval', () => {
		const mock = stub(global, 'setInterval');
		/* tslint:disable-next-line:no-unused-expression */
		new TokenRatesController(undefined, { interval: 1337 });
		expect(mock.getCall(0).args[1]).toBe(1337);
		mock.restore();
	});

	it('should update rates on interval', () => {
		return new Promise((resolve) => {
			const controller = new TokenRatesController(undefined, { interval: 10 });
			const mock = stub(controller, 'updateExchangeRates');
			setTimeout(() => {
				expect(mock.called).toBe(true);
				mock.restore();
				resolve();
			}, 20);
		});
	});

	it('should update all rates', async () => {
		const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
		const controller = new TokenRatesController(undefined, { interval: 10 });
		expect(controller.state.contractExchangeRates).toEqual({});
		controller.tokens = [{ address, decimals: 18, symbol: 'EOS' }, { address: 'bar', decimals: 0, symbol: '' }];
		await controller.updateExchangeRates();
		expect(Object.keys(controller.state.contractExchangeRates)).toContain(address);
		expect(controller.state.contractExchangeRates[address]).toBeGreaterThan(0);
		expect(Object.keys(controller.state.contractExchangeRates)).toContain('bar');
		expect(controller.state.contractExchangeRates.bar).toEqual(0);
	});

	it('should not update rates if disabled', async () => {
		const controller = new TokenRatesController(undefined, {
			disabled: true,
			interval: 10,
			tokens: [{ address: 'bar', decimals: 0, symbol: '' }]
		});
		controller.fetchExchangeRate = stub();
		await controller.updateExchangeRates();
		expect((controller.fetchExchangeRate as any).called).toBe(false);
	});

	it('should clear previous interval', () => {
		const mock = stub(global, 'clearInterval');
		const controller = new TokenRatesController(undefined, { interval: 1337 });
		controller.interval = 1338;
		expect(mock.called).toBe(true);
		mock.restore();
	});
});
