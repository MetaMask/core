import { Block } from './BlockHistoryController';

const BN = require('ethereumjs-util').BN;
const percentile = require('percentile');
const GWEI_BN = new BN('1000000000');

/**
 * Return a URL that can be used to obtain ETH for a given network
 *
 * @param networkCode - Network code of desired network
 * @param address - Address to deposit obtained ETH
 * @param amount - How much ETH is desired
 * @returns - URL to buy ETH based on network
 */
export function getBuyURL(networkCode = '1', address?: string, amount = 5) {
	switch (networkCode) {
		case '1':
			/* tslint:disable-next-line:max-line-length */
			return `https://buy.coinbase.com/?code=9ec56d01-7e81-5017-930c-513daa27bb6a&amount=${amount}&address=${address}&crypto_currency=ETH`;
		case '3':
			return 'https://faucet.metamask.io/';
		case '4':
			return 'https://www.rinkeby.io/';
		case '42':
			return 'https://github.com/kovan-testnet/faucet';
	}
}

/**
 * Calculates lowest gas price that would've been included in 50% of recent blocks
 *
 * @param recentBlocks - List of recent blocks
 * @returns - Gas price based on recent blocks
 */
export function getGasPrice(recentBlocks: Block[]) {
	if (recentBlocks.length === 0) {
		return `0x${GWEI_BN.toString(16)}`;
	}

	const lowestPrices = recentBlocks
		.map((block) => {
			if (!block.gasPrices || block.gasPrices.length < 1) {
				return GWEI_BN;
			}
			return block.gasPrices
				.map((hexPrefix) => hexPrefix.substr(2))
				.map((hex) => new BN(hex, 16))
				.sort((a, b) => (a.gt(b) ? 1 : -1))[0];
		})
		.map((num) => num.div(GWEI_BN).toNumber());

	const percentileNum = percentile(50, lowestPrices);
	const percentileNumBn = new BN(percentileNum);
	return `0x${percentileNumBn.mul(GWEI_BN).toString(16)}`;
}

/**
 * Execute and return an asynchronous operation without throwing errors
 *
 * @param operation - Function returning a Promise
 * @returns - Result of the asynchronous operation
 */
export async function safelyExecute(operation: () => Promise<any>) {
	try {
		return await operation();
	} catch (error) {
		/* tslint:disable-next-line:no-empty */
	}
}
