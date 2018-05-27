import BaseController, { BaseConfig, BaseState } from './BaseController';

const DEFAULT_UPDATE_INTERVAL = 1000;

/**
 * @type Token
 *
 * Token representation
 *
 * @property address - Hex address of the token contract
 * @property decimals - Number of decimals the token uses
 * @property symbol - Symbol of the token
 */
export interface Token {
	address: string;
	decimals: number;
	symbol: string;
}

/**
 * @type TokenRatesConfig
 *
 * TokenRates controller configuration
 *
 * @property interval - Polling interval used to fetch new token rates
 */
export interface TokenRatesConfig extends BaseConfig {
	interval?: number;
}

/**
 * @type TokenRatesState
 *
 * TokenRatesController state
 *
 * @property contractExchangeRates - Hash of token contract addresses to exchange rates
 */
export interface TokenRatesState extends BaseState {
	contractExchangeRates: { [address: string]: number };
}

/**
 * Controller class that polls for token exchange
 * rates based on the current account's token list
 */
export class TokenRatesController extends BaseController<TokenRatesState, TokenRatesConfig> {
	private handle?: number;
	private tokenList: Token[] = [];

	private getPricingURL(address: string) {
		return `https://metamask.balanc3.net/prices?from=${address}&to=ETH&autoConversion=false&summaryOnly=true`;
	}

	/**
	 * Creates a TokenRatesController
	 *
	 * @param config - Options to configure this controller
	 */
	constructor(initialState?: TokenRatesState, config?: TokenRatesConfig) {
		super(initialState, config);
		this.interval = (config && config.interval) || DEFAULT_UPDATE_INTERVAL;
	}

	/**
	 * Sets a new polling interval
	 *
	 * @param interval - Polling interval used to fetch new token rates
	 */
	set interval(interval: number) {
		this.handle && window.clearInterval(this.handle);
		this.handle = window.setInterval(() => {
			this.updateExchangeRates();
		}, interval);
	}

	/**
	 * Sets a new token list to track prices
	 *
	 * @param tokens - List of tokens to track exchange rates for
	 */
	set tokens(tokens: Token[]) {
		this.tokenList = tokens;
		this.updateExchangeRates();
	}

	/**
	 * Fetches a token exchange rate by address
	 *
	 * @param address - Token contract address
	 * @returns - Promise resolving to exchange rate for given contract address
	 */
	async fetchExchangeRate(address: string): Promise<number> {
		try {
			const response = await fetch(this.getPricingURL(address));
			const json = await response.json();
			return json && json.length ? json[0].averagePrice : 0;
		} catch (error) {
			/* istanbul ignore next */
			return 0;
		}
	}

	/**
	 * Updates exchange rates for all tokens
	 */
	async updateExchangeRates() {
		if (this.disabled) {
			return;
		}
		const contractExchangeRates: { [address: string]: number } = {};
		for (const i in this.tokenList) {
			const address = this.tokenList[i].address;
			contractExchangeRates[address] = await this.fetchExchangeRate(address);
		}
		this.mergeState({ contractExchangeRates });
	}
}

export default TokenRatesController;
