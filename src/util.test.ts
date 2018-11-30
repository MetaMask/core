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

	describe('manageCollectibleImage', () => {
		const address1 = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
		const address2 = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ac';
		const image = 'https://api.godsunchained.com/v0/image/351?format=card&quality=diamond';
		expect(util.manageCollectibleImage(address1, image)).toEqual('https://api.godsunchained.com/v0/image/351');
		expect(util.manageCollectibleImage(address2, image)).toEqual(image);
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

	it('normalizeMessageData', () => {
		const firstNormalized = util.normalizeMessageData(
			'879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0'
		);
		const secondNormalized = util.normalizeMessageData('somedata');
		expect(firstNormalized).toEqual('0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0');
		expect(secondNormalized).toEqual('0x736f6d6564617461');
	});

	it('messageHexToString', () => {
		const str = util.hexToText('68656c6c6f207468657265');
		expect(str).toEqual('hello there');
	});

	describe('validatePersonalSignMessageData', () => {
		it('should throw if no from address', () => {
			expect(() =>
				util.validatePersonalSignMessageData({
					data: '0x879a05'
				} as any)
			).toThrow();
		});

		it('should throw if invalid from address', () => {
			expect(() =>
				util.validatePersonalSignMessageData({
					data: '0x879a05',
					from: '3244e191f1b4903970224322180f1fbbc415696b'
				} as any)
			).toThrow();
		});

		it('should throw if invalid type from address', () => {
			expect(() =>
				util.validatePersonalSignMessageData({
					data: '0x879a05',
					from: 123
				} as any)
			).toThrow();
		});

		it('should throw if no data', () => {
			expect(() =>
				util.validatePersonalSignMessageData({
					data: '0x879a05'
				} as any)
			).toThrow();
		});

		it('should throw if invalid tyoe data', () => {
			expect(() =>
				util.validatePersonalSignMessageData({
					data: 123,
					from: '0x3244e191f1b4903970224322180f1fbbc415696b'
				} as any)
			).toThrow();
		});
	});

	describe('validateTypedMessageDataV1', () => {
		it('should throw if no from address legacy', () => {
			expect(() =>
				util.validateTypedSignMessageV1Data({
					data: []
				} as any)
			).toThrow('Invalid "from" address:');
		});

		it('should throw if invalid from address', () => {
			expect(() =>
				util.validateTypedSignMessageV1Data({
					data: [],
					from: '3244e191f1b4903970224322180f1fbbc415696b'
				} as any)
			).toThrow('Invalid "from" address:');
		});

		it('should throw if invalid type from address', () => {
			expect(() =>
				util.validateTypedSignMessageV1Data({
					data: [],
					from: 123
				} as any)
			).toThrow('Invalid "from" address:');
		});

		it('should throw if incorrect data', () => {
			expect(() =>
				util.validateTypedSignMessageV1Data({
					data: '0x879a05',
					from: '0x3244e191f1b4903970224322180f1fbbc415696b'
				} as any)
			).toThrow('Invalid message "data":');
		});

		it('should throw if no data', () => {
			expect(() =>
				util.validateTypedSignMessageV1Data({
					data: '0x879a05',
					from: '0x3244e191f1b4903970224322180f1fbbc415696b'
				} as any)
			).toThrow('Invalid message "data":');
		});

		it('should throw if invalid type data', () => {
			expect(() =>
				util.validateTypedSignMessageV1Data({
					data: [],
					from: '0x3244e191f1b4903970224322180f1fbbc415696b'
				} as any)
			).toThrow('Expected EIP712 typed data.');
		});
	});

	describe('validateTypedMessageDataV3', () => {
		it('should throw if no from address', () => {
			expect(() =>
				util.validateTypedSignMessageV3Data(
					{
						data: '0x879a05'
					} as any,
					1
				)
			).toThrow('Invalid "from" address:');
		});

		it('should throw if invalid from address', () => {
			expect(() =>
				util.validateTypedSignMessageV3Data(
					{
						data: '0x879a05',
						from: '3244e191f1b4903970224322180f1fbbc415696b'
					} as any,
					1
				)
			).toThrow('Invalid "from" address:');
		});

		it('should throw if invalid type from address', () => {
			expect(() =>
				util.validateTypedSignMessageV3Data(
					{
						data: '0x879a05',
						from: 123
					} as any,
					1
				)
			).toThrow('Invalid "from" address:');
		});

		it('should throw if array data', () => {
			expect(() =>
				util.validateTypedSignMessageV3Data(
					{
						data: [],
						from: '0x3244e191f1b4903970224322180f1fbbc415696b'
					} as any,
					1
				)
			).toThrow('Invalid message "data":');
		});

		it('should throw if no array data', () => {
			expect(() =>
				util.validateTypedSignMessageV3Data(
					{
						from: '0x3244e191f1b4903970224322180f1fbbc415696b'
					} as any,
					1
				)
			).toThrow('Invalid message "data":');
		});

		it('should throw if no json valid data', () => {
			expect(() =>
				util.validateTypedSignMessageV3Data(
					{
						data: 'uh oh',
						from: '0x3244e191f1b4903970224322180f1fbbc415696b'
					} as any,
					1
				)
			).toThrow('Data must be passed as a valid JSON string.');
		});

		it('should throw if data not in typed message schema', () => {
			expect(() =>
				util.validateTypedSignMessageV3Data(
					{
						data: '{"greetings":"I am Alice"}',
						from: '0x3244e191f1b4903970224322180f1fbbc415696b'
					} as any,
					1
				)
			).toThrow('Data must conform to EIP-712 schema.');
		});
	});
});
