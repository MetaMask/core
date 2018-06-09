import BaseController, { BaseConfig, BaseState } from './BaseController';

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
 * Token rates controller configuration
 *
 * @property interval - Polling interval used to fetch new token rates
 * @property tokens - List of tokens to track exchange rates for
 */
export interface TokenRatesConfig extends BaseConfig {
	interval: number;
	tokens: Token[];
}

/**
 * @type TokenRatesState
 *
 * Token rates controller state
 *
 * @property contractExchangeRates - Hash of token contract addresses to exchange rates
 */
export interface TokenRatesState extends BaseState {
	contractExchangeRates: { [address: string]: number };
}

/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 */
export class TokenRatesController extends BaseController<TokenRatesState, TokenRatesConfig> {
	private handle?: NodeJS.Timer;
	private tokenList: Token[] = [];

	private getPricingURL(address: string) {
		return `https://metamask.balanc3.net/prices?from=${address}&to=ETH&autoConversion=false&summaryOnly=true`;
	}

	/**
	 * Creates a TokenRatesController instance
	 *
	 * @param state - Initial state to set on this controller
	 * @param config - Initial options used to configure this controller
	 */
	constructor(state?: Partial<TokenRatesState>, config?: Partial<TokenRatesConfig>) {
		super(state, config);
		this.defaultConfig = {
			interval: 180000,
			tokens: []
		};
		this.defaultState = { contractExchangeRates: {} };
		this.initialize();
	}

	/**
	 * Sets a new polling interval
	 *
	 * @param interval - Polling interval used to fetch new token rates
	 */
	set interval(interval: number) {
		this.handle && clearInterval(this.handle);
		this.handle = setInterval(() => {
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
			return json && json.length ? json[0].averagePrice : /* istanbul ignore next */ 0;
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
		this.update({ contractExchangeRates });
	}
}

export default TokenRatesController;
