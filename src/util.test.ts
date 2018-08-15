import * as util from './util';

const { BN } = require('ethereumjs-util');

describe('util', () => {
	it('BNToHex', () => {
		expect(util.BNToHex(new BN('1337'))).toBe('0x539');
	});

	it('fractionBN', () => {
		expect(util.fractionBN(new BN('1337'), 9, 10).toNumber()).toBe(1203);
	});

	it('getBuyURL', () => {
		/* tslint:disable:max-line-length */
		expect(util.getBuyURL(undefined, 'foo', 1337)).toBe(
			'https://buy.coinbase.com/?code=9ec56d01-7e81-5017-930c-513daa27bb6a&amount=1337&address=foo&crypto_currency=ETH'
		);
		expect(util.getBuyURL('1', 'foo', 1337)).toBe(
			'https://buy.coinbase.com/?code=9ec56d01-7e81-5017-930c-513daa27bb6a&amount=1337&address=foo&crypto_currency=ETH'
		);
		expect(util.getBuyURL('3')).toBe('https://faucet.metamask.io/');
		expect(util.getBuyURL('4')).toBe('https://www.rinkeby.io/');
		expect(util.getBuyURL('42')).toBe('https://github.com/kovan-testnet/faucet');
	});

	it('hexToBN', () => {
		expect(util.hexToBN('0x1337').toNumber()).toBe(4919);
	});

	it('normalizeTransaction', () => {
		const normalized = util.normalizeTransaction({
			data: 'data',
			from: 'FROM',
			gas: 'gas',
			gasPrice: 'gasPrice',
			nonce: 'nonce',
			to: 'TO',
			value: 'value'
		});
		expect(normalized).toEqual({
			data: '0xdata',
			from: '0xfrom',
			gas: '0xgas',
			gasPrice: '0xgasPrice',
			nonce: '0xnonce',
			to: '0xto',
			value: '0xvalue'
		});
	});

	it('safelyExecute', async () => {
		await util.safelyExecute(() => {
			throw new Error('ahh');
		});
	});

	describe('validateTransaction', () => {
		it('should throw if no from address', () => {
			expect(() => util.validateTransaction({} as any)).toThrow();
		});

		it('should throw if non-string from address', () => {
			expect(() => util.validateTransaction({ from: 1337 } as any)).toThrow();
		});

		it('should throw if invalid from address', () => {
			expect(() => util.validateTransaction({ from: '1337' } as any)).toThrow();
		});

		it('should throw if no data', () => {
			expect(() =>
				util.validateTransaction({
					from: '0x3244e191f1b4903970224322180f1fbbc415696b',
					to: '0x'
				} as any)
			).toThrow();
			expect(() =>
				util.validateTransaction({
					from: '0x3244e191f1b4903970224322180f1fbbc415696b'
				} as any)
			).toThrow();
		});

		it('should delete data', () => {
			const transaction = {
				data: 'foo',
				from: '0x3244e191f1b4903970224322180f1fbbc415696b',
				to: '0x'
			};
			util.validateTransaction(transaction);
			expect(transaction.to).toBe(undefined);
		});

		it('should throw if invalid to address', () => {
			expect(() =>
				util.validateTransaction({
					from: '0x3244e191f1b4903970224322180f1fbbc415696b',
					to: '1337'
				} as any)
			).toThrow();
		});

		it('should throw if value includes dashes', () => {
			expect(() =>
				util.validateTransaction({
					from: '0x3244e191f1b4903970224322180f1fbbc415696b',
					to: '0x3244e191f1b4903970224322180f1fbbc415696b',
					value: '133-7'
				} as any)
			).toThrow();
			expect(() =>
				util.validateTransaction({
					from: '0x3244e191f1b4903970224322180f1fbbc415696b',
					to: '0x3244e191f1b4903970224322180f1fbbc415696b',
					value: '133.7'
				} as any)
			).toThrow();
		});
	});
});
