import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import { safelyExecute } from './util';

/**
 * @type CurrencyRateConfig
 *
 * Currency rate controller configuration
 *
 * @property baseAsset - Symbol for the base asset used for conversion
 * @property currency - Currently-active ISO 4217 currency code
 * @property interval - Polling interval used to fetch new currency rate
 */
export interface CurrencyRateConfig extends BaseConfig {
	baseAsset: string;
	currency: string;
	interval: number;
}

/**
 * @type CurrencyRateState
 *
 * Currency rate controller state
 *
 * @property conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property conversionRate - Conversion rate from current base asset to the current currency
 * @property currentBaseAsset - Symbol for the base asset used for conversion
 * @property currentCurrency - Currently-active ISO 4217 currency code
 */
export interface CurrencyRateState extends BaseState {
	conversionDate: number;
	conversionRate: number;
	currentBaseAsset: string;
	currentCurrency: string;
}

/**
 * Controller that passively polls on a set interval for an exchange rate from the current base
 * asset to the current currency
 */
export class CurrencyRateController extends BaseController<CurrencyRateConfig, CurrencyRateState> {
	private activeBaseAsset = '';
	private activeCurrency = '';
	private handle?: NodeJS.Timer;

	private getPricingURL(currency: string, baseAsset: string) {
		return `https://min-api.cryptocompare.com/data/price?fsym=${baseAsset.toUpperCase()}&tsyms=${currency.toUpperCase()}`;
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
			baseAsset: 'eth',
			currency: 'usd',
			interval: 180000
		};
		this.defaultState = {
			conversionDate: 0,
			conversionRate: 0,
			currentBaseAsset: this.defaultConfig.baseAsset,
			currentCurrency: this.defaultConfig.currency
		};
		this.initialize();
	}

	/**
	 * Sets a new base asset
	 *
	 * @param symbol - Symbol for the base asset
	 */
	set baseAsset(symbol: string) {
		this.activeBaseAsset = symbol;
		safelyExecute(() => this.updateExchangeRate());
	}

	/**
	 * Sets a currency to track
	 *
	 * @param currency - ISO 4217 currency code
	 */
	set currency(currency: string) {
		this.activeCurrency = currency;
		safelyExecute(() => this.updateExchangeRate());
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
	 * Fetches the exchange rate for a given currency
	 *
	 * @param currency - ISO 4217 currency code
	 * @param baseAsset - Symbol for base asset
	 * @returns - Promise resolving to exchange rate for given currency
	 */
	async fetchExchangeRate(currency: string, baseAsset = this.activeBaseAsset): Promise<CurrencyRateState> {
		const response = await fetch(this.getPricingURL(currency, baseAsset));
		const json = await response.json();
		return {
			conversionDate: Date.now(),
			conversionRate: Number(json[currency.toUpperCase()]),
			currentBaseAsset: this.activeBaseAsset,
			currentCurrency: currency
		};
	}

	/**
	 * Sets a new currency to track and fetches its exchange rate
	 *
	 * @param currency - ISO 4217 currency code
	 * @returns - Promise resolving to exchange rate for given currency
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
		if (this.disabled || !this.activeCurrency || !this.activeBaseAsset) {
			return;
		}
		const { conversionDate, conversionRate } = await this.fetchExchangeRate(
			this.activeCurrency,
			this.activeBaseAsset
		);
		this.update({
			conversionDate,
			conversionRate,
			currentBaseAsset: this.activeBaseAsset,
			currentCurrency: this.activeCurrency
		});
		return this.state;
	}
}

export default CurrencyRateController;
