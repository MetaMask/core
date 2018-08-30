import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import { safelyExecute } from './util';

/**
 * @type CurrencyRateConfig
 *
 * Currency rate controller configuration
 *
 * @property currency - Currently-active ISO 4217 currency code
 * @property interval - Polling interval used to fetch new currency rate
 */
export interface CurrencyRateConfig extends BaseConfig {
	currency: string;
	interval: number;
}

/**
 * @type CurrencyRateState
 *
 * Currency rate controller state
 *
 * @property conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property conversionRate - Conversion rate from ETH to the selected currency
 * @property currentCurrency - Currently-active ISO 4217 currency code
 */
export interface CurrencyRateState extends BaseState {
	conversionDate: number;
	conversionRate: number;
	currentCurrency: string;
}

/**
 * Controller that passively polls on a set interval for an ETH-to-fiat exchange rate
 */
export class CurrencyRateController extends BaseController<CurrencyRateConfig, CurrencyRateState> {
	private activeCurrency: string = '';
	private handle?: NodeJS.Timer;

	private getPricingURL(currency: string) {
		return `https://api.infura.io/v1/ticker/eth${currency.toLowerCase()}`;
	}

	/**
	 * Name of this controller used during composition
	 */
	name = 'CurrencyRateController';

	/**
	 * Creates a CurrencyRateController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<CurrencyRateConfig>, state?: Partial<CurrencyRateState>) {
		super(config, state);
		this.defaultConfig = {
			currency: 'usd',
			interval: 180000
		};
		this.defaultState = {
			conversionDate: 0,
			conversionRate: 0,
			currentCurrency: this.defaultConfig.currency
		};
		this.initialize();
	}

	/**
	 * Sets a new polling interval
	 *
	 * @param interval - Polling interval used to fetch new exchange rate
	 */
	set interval(interval: number) {
		this.handle && clearInterval(this.handle);
		safelyExecute(() => this.updateExchangeRate());
		this.handle = setInterval(() => {
			safelyExecute(() => this.updateExchangeRate());
		}, interval);
	}

	/**
	 * Sets a currency to track a exchange rate for
	 *
	 * @param currency - ISO 4217 currency code
	 */
	set currency(currency: string) {
		this.activeCurrency = currency;
		safelyExecute(() => this.updateExchangeRate());
	}

	/**
	 * Fetches the exchange rate for a given currency
	 *
	 * @param currency - ISO 4217 currency code
	 * @returns - Promise resolving to exchange rate for given currecy
	 */
	async fetchExchangeRate(currency: string): Promise<CurrencyRateState> {
		const response = await fetch(this.getPricingURL(currency));
		const json = await response.json();
		return {
			conversionDate: Number(json.timestamp),
			conversionRate: Number(json.bid),
			currentCurrency: this.activeCurrency
		};
	}

	/**
	 * Sets a new currency to track and fetches its exchange rate
	 *
	 * @param currency - ISO 4217 currency code
	 * @returns - Promise resolving to exchange rate for given currecy
	 */
	async updateCurrency(currency: string): Promise<CurrencyRateState | void> {
		this.configure({ currency });
		return this.updateExchangeRate();
	}

	/**
	 * Updates exchange rate for the current currency
	 *
	 * @returns Promise resolving to currency data or undefined if disabled
	 */
	async updateExchangeRate(): Promise<CurrencyRateState | void> {
		if (this.disabled) {
			return;
		}
		const { conversionDate, conversionRate } = await this.fetchExchangeRate(this.activeCurrency);
		this.update({ conversionDate, conversionRate, currentCurrency: this.activeCurrency });
		return this.state;
	}
}

export default CurrencyRateController;
