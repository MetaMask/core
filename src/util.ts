import { Block } from './BlockHistoryController';
import { Transaction } from './TransactionController';

const { addHexPrefix, BN, isValidAddress, stripHexPrefix } = require('ethereumjs-util');
const percentile = require('percentile');

const GWEI_BN = new BN('1000000000');
const NORMALIZERS: { [param in keyof Transaction]: any } = {
	data: (data: string) => addHexPrefix(data),
	from: (from: string) => addHexPrefix(from).toLowerCase(),
	gas: (gas: string) => addHexPrefix(gas),
	gasPrice: (gasPrice: string) => addHexPrefix(gasPrice),
	nonce: (nonce: string) => addHexPrefix(nonce),
	to: (to: string) => addHexPrefix(to).toLowerCase(),
	value: (value: string) => addHexPrefix(value)
};

/**
 * Converts a BN object to a hex string with a '0x' prefix
 *
 * @param inputBn - BN instance to convert to a hex string
 * @returns - '0x'-prefixed hex string
 *
 */
export function BNToHex(inputBn: any) {
	return addHexPrefix(inputBn.toString(16));
}

/**
 * Used to multiply a BN by a fraction
 *
 * @param targetBN - Number to multiply by a fraction
 * @param numerator - Numerator of the fraction multiplier
 * @param denominator - Denominator of the fraction multiplier
 * @returns - Product of the multiplication
 */
export function fractionBN(targetBN: any, numerator: number | string, denominator: number | string) {
	const numBN = new BN(numerator);
	const denomBN = new BN(denominator);
	return targetBN.mul(numBN).div(denomBN);
}

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
 * Return a URL that can be used to make API requests against Etherscan
 *
 * @param networkCode - Network code of desired network
 * @returns - URL to query Etherscan API
 */
export function getEtherscanURL(networkCode = '1') {
	switch (networkCode) {
		case '1':
			return 'https://api.etherscan.io/api';
		case '3':
			return 'https://api-ropsten.etherscan.io/api';
		case '4':
			return 'https://api-rinkeby.etherscan.io/api';
		case '42':
			return 'https://api-kovan.etherscan.io/api';
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
 * Converts a hex string to a BN object
 *
 * @param inputHex - Number represented as a hex string
 * @returns - A BN instance
 *
 */
export function hexToBN(inputHex: string) {
	return new BN(stripHexPrefix(inputHex), 16);
}

/**
 * Normalizes properties on a Transaction object
 *
 * @param transaction - Transaction object to normalize
 * @returns - Normalized Transaction object
 */
export function normalizeTransaction(transaction: Transaction) {
	const normalizedTransaction: Transaction = { from: '' };
	let key: keyof Transaction;
	for (key in NORMALIZERS) {
		if (transaction[key as keyof Transaction]) {
			normalizedTransaction[key] = NORMALIZERS[key](transaction[key]);
		}
	}
	return normalizedTransaction;
}

/**
 * Execute and return an asynchronous operation without throwing errors
 *
 * @param operation - Function returning a Promise
 * @returns - Promise resolving to the result of the async operation
 */
export async function safelyExecute(operation: () => Promise<any>) {
	try {
		return await operation();
	} catch (error) {
		/* tslint:disable-next-line:no-empty */
	}
}

/**
 * Validates a Transaction object for required properties and throws in
 * the event of any validation error.
 *
 * @param transaction - Transaction object to validate
 */
export function validateTransaction(transaction: Transaction) {
	if (!transaction.from || typeof transaction.from !== 'string' || !isValidAddress(transaction.from)) {
		throw new Error(`Invalid "from" address: ${transaction.from} must be a valid string.`);
	}
	if (transaction.to === '0x' || transaction.to === null) {
		if (transaction.data) {
			delete transaction.to;
		} else {
			throw new Error(`Invalid "to" address: ${transaction.to} must be a valid string.`);
		}
	} else if (transaction.to !== undefined && !isValidAddress(transaction.to)) {
		throw new Error(`Invalid "to" address: ${transaction.to} must be a valid string.`);
	}
	if (transaction.value !== undefined) {
		const value = transaction.value.toString();
		if (value.includes('-')) {
			throw new Error(`Invalid "value": ${value} is not a positive number.`);
		}
		if (value.includes('.')) {
			throw new Error(`Invalid "value": ${value} number must be denominated in wei.`);
		}
	}
}

export default {
	BNToHex,
	fractionBN,
	getBuyURL,
	getEtherscanURL,
	getGasPrice,
	hexToBN,
	normalizeTransaction,
	safelyExecute,
	validateTransaction
};
