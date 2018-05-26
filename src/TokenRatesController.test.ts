import 'isomorphic-fetch';
import { stub } from 'sinon';
import TokenRatesController from './TokenRatesController';

describe('TokenRatesController', () => {
	it('should poll on correct interval', () => {
		const mock = stub(window, 'setInterval');
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
		expect(controller.state.contractExchangeRates).toBeUndefined();
		controller.tokens = [{ address, decimals: 18, symbol: 'EOS' }, { address: 'bar', decimals: 0, symbol: '' }];
		await controller.updateExchangeRates();
		expect(Object.keys(controller.state.contractExchangeRates)).toContain(address);
		expect(Object.keys(controller.state.contractExchangeRates)).toContain('bar');
	});

	it('should not update rates if disabled', async () => {
		const controller = new TokenRatesController(undefined, { interval: 10, disabled: true });
		controller.tokens = [{ address: 'bar', decimals: 0, symbol: '' }];
		await controller.updateExchangeRates();
		expect(controller.state.contractExchangeRates).toBeUndefined();
	});

	it('should clear previous interval', () => {
		const mock = stub(window, 'clearInterval');
		const controller = new TokenRatesController(undefined, { interval: 1337 });
		controller.interval = 1338;
		expect(mock.called).toBe(true);
		mock.restore();
	});

	it('should fetch each token rate based on address', async () => {
		const controller = new TokenRatesController();
		controller.fetchExchangeRate = async (address) => 1337;
		controller.tokens = [{ address: 'foo', decimals: 0, symbol: '' }, { address: 'bar', decimals: 0, symbol: '' }];
		await controller.updateExchangeRates();
		expect(controller.state.contractExchangeRates).toEqual({
			bar: 1337,
			foo: 1337
		});
	});
});
