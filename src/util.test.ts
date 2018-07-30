import * as util from './util';

describe('util', () => {
	it('should estimate gas based on recent blocks', () => {
		const price1 = util.getGasPrice([
			{ gasPrices: ['0x174876e800', '0x12A05F200'] },
			{ gasPrices: ['0x12A05F200', '0x174876e800'] },
			{ gasPrices: ['0x174876e800', '0x174876e800'] },
			{ gasPrices: ['0x174876e800', '0x174876e800'] },
			{ gasPrices: [] }
		] as any);
		expect(price1).toBe('0x12a05f200');
		const price2 = util.getGasPrice([] as any);
		expect(price2).toBe('0x3b9aca00');
	});

	it('should return correct buy URL', () => {
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
});
