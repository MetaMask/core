import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import { safelyExecute } from './util';
const Mutex = require('await-semaphore').Mutex;

/**
 * @type CurrencyRateConfig
 *
 * Currency rate controller configuration
 *
 * @property currentCurrency - Currently-active ISO 4217 currency code
 * @property interval - Polling interval used to fetch new currency rate
 * @property nativeCurrency - Symbol for the base asset used for conversion
 */
export interface CurrencyRateConfig extends BaseConfig {
	currentCurrency: string;
	interval: number;
	nativeCurrency: string;
}

/**
 * @type CurrencyRateState
 *
 * Currency rate controller state
 *
 * @property conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property conversionRate - Conversion rate from current base asset to the current currency
 * @property currentCurrency - Currently-active ISO 4217 currency code
 * @property nativeCurrency - Symbol for the base asset used for conversion
 */
export interface CurrencyRateState extends BaseState {
	conversionDate: number;
	conversionRate: number;
	currentCurrency: string;
	nativeCurrency: string;
}

/**
 * Controller that passively polls on a set interval for an exchange rate from the current base
 * asset to the current currency
 */
export class CurrencyRateController extends BaseController<CurrencyRateConfig, CurrencyRateState> {
	private activeCurrency = '';
	private activeNativeCurrency = '';
	private mutex = new Mutex();
	private handle?: NodeJS.Timer;

	private getPricingURL(currentCurrency: string, nativeCurrency: string) {
		return (
			`https://min-api.cryptocompare.com/data/price?fsym=` +
			`${nativeCurrency.toUpperCase()}&tsyms=${currentCurrency.toUpperCase()}`
		);
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
			currentCurrency: 'usd',
			disabled: true,
			interval: 180000,
			nativeCurrency: 'eth'
		};
		this.defaultState = {
			conversionDate: 0,
			conversionRate: 0,
			currentCurrency: this.defaultConfig.currentCurrency,
			nativeCurrency: this.defaultConfig.nativeCurrency
		};
		this.initialize();
		this.configure({ disabled: false }, false, false);
		this.poll();
	}

	/**
	 * Sets a currency to track
	 *
	 * @param currentCurrency - ISO 4217 currency code
	 */
	set currentCurrency(currentCurrency: string) {
		this.activeCurrency = currentCurrency;
		safelyExecute(() => this.updateExchangeRate());
	}

	/**
	 * Sets a new native currency
	 *
	 * @param symbol - Symbol for the base asset
	 */
	set nativeCurrency(symbol: string) {
		this.activeNativeCurrency = symbol;
		safelyExecute(() => this.updateExchangeRate());
	}

	/**
	 * Starts a new polling interval
	 *
	 * @param interval - Polling interval used to fetch new exchange rate
	 */
	async poll(interval?: number): Promise<void> {
		interval && this.configure({ interval }, false, false);
		this.handle && clearTimeout(this.handle);
		await safelyExecute(() => this.updateExchangeRate());
		this.handle = setTimeout(() => {
			this.poll(this.config.interval);
		}, this.config.interval);
	}

	/**
	 * Fetches the exchange rate for a given currency
	 *
	 * @param currency - ISO 4217 currency code
	 * @param nativeCurrency - Symbol for base asset
	 * @returns - Promise resolving to exchange rate for given currency
	 */
	async fetchExchangeRate(currency: string, nativeCurrency = this.activeNativeCurrency): Promise<CurrencyRateState> {
		const response = await fetch(this.getPricingURL(currency, nativeCurrency));
		const json = await response.json();
		return {
			conversionDate: Date.now(),
			conversionRate: Number(json[currency.toUpperCase()]),
			currentCurrency: currency,
			nativeCurrency
		};
	}

	/**
	 * Updates exchange rate for the current currency
	 *
	 * @returns Promise resolving to currency data or undefined if disabled
	 */
	async updateExchangeRate(): Promise<CurrencyRateState | void> {
		if (this.disabled || !this.activeCurrency || !this.activeNativeCurrency) {
			return;
		}
		const releaseLock = await this.mutex.acquire();
		const { conversionDate, conversionRate } = await this.fetchExchangeRate(
			this.activeCurrency,
			this.activeNativeCurrency
		);
		this.update({
			conversionDate,
			conversionRate,
			currentCurrency: this.activeCurrency,
			nativeCurrency: this.activeNativeCurrency
		});
		releaseLock();
		return this.state;
	}
}

export default CurrencyRateController;
