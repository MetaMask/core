import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import AssetsController from './AssetsController';
import { safelyExecute } from './util';

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
 * for tokens stored in the AssetsController
 */
export class TokenRatesController extends BaseController<TokenRatesConfig, TokenRatesState> {
	private handle?: NodeJS.Timer;
	private tokenList: Token[] = [];

	private getPricingURL(address: string) {
		return `https://metamask.balanc3.net/prices?from=${address}&to=ETH&autoConversion=false&summaryOnly=true`;
	}

	/**
	 * Name of this controller used during composition
	 */
	name = 'TokenRatesController';

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers = ['AssetsController'];

	/**
	 * Creates a TokenRatesController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<TokenRatesConfig>, state?: Partial<TokenRatesState>) {
		super(config, state);
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
		safelyExecute(() => this.updateExchangeRates());
		this.handle = setInterval(() => {
			safelyExecute(() => this.updateExchangeRates());
		}, interval);
	}

	/**
	 * Sets a new token list to track prices
	 *
	 * @param tokens - List of tokens to track exchange rates for
	 */
	set tokens(tokens: Token[]) {
		this.tokenList = tokens;
		safelyExecute(() => this.updateExchangeRates());
	}

	/**
	 * Fetches a token exchange rate by address
	 *
	 * @param address - Token contract address
	 * @returns - Promise resolving to exchange rate for given contract address
	 */
	async fetchExchangeRate(address: string): Promise<number> {
		const response = await fetch(this.getPricingURL(address));
		const json = await response.json();
		return json && json.length ? json[0].averagePrice : /* istanbul ignore next */ 0;
	}

	/**
	 * Extension point called if and when this controller is composed
	 * with other controllers using a ComposableController
	 */
	onComposed() {
		super.onComposed();
		const assets = this.context.AssetsController as AssetsController;
		assets.subscribe(({ tokens }) => {
			this.configure({ tokens });
		});
	}

	/**
	 * Updates exchange rates for all tokens
	 *
	 * @returns Promise resolving when this operation completes
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
