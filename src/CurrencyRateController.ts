import BaseController, { BaseConfig, BaseState } from './BaseController';

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
export class CurrencyRateController extends BaseController<CurrencyRateState, CurrencyRateConfig> {
	private activeCurrency: string = '';
	private handle?: NodeJS.Timer;

	private getPricingURL(currency: string) {
		return `https://api.infura.io/v1/ticker/eth${currency.toLowerCase()}`;
	}

	/**
	 * Creates a CurrencyRateController instance
	 *
	 * @param state - Initial state to set on this controller
	 * @param config - Initial options used to configure this controller
	 */
	constructor(state?: Partial<CurrencyRateState>, config?: Partial<CurrencyRateConfig>) {
		super(state, config);
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
	 * @param interval - Polling interval used to fetch new exchange rates
	 */
	set interval(interval: number) {
		this.handle && clearInterval(this.handle);
		this.updateExchangeRate();
		this.handle = setInterval(() => {
			this.updateExchangeRate();
		}, interval);
	}

	/**
	 * Sets a currency to track a exchange rate for
	 *
	 * @param currency - ISO 4217 currency code
	 */
	set currency(currency: string) {
		this.activeCurrency = currency;
		this.updateExchangeRate();
	}

	/**
	 * Fetches the exchange rate for a given currency
	 *
	 * @param currency - ISO 4217 currency code
	 * @returns - Promise resolving to exchange rate for given currecy
	 */
	async fetchExchangeRate(currency: string): Promise<CurrencyRateState> {
		const fallback = { conversionDate: 0, conversionRate: 0, currentCurrency: this.activeCurrency };
		try {
			const response = await fetch(this.getPricingURL(currency));
			const json = await response.json();
			/* istanbul ignore next */
			if (json && json.bid) {
				return {
					conversionDate: Number(json.timestamp),
					conversionRate: Number(json.bid),
					currentCurrency: this.activeCurrency
				};
			} else {
			/* istanbul ignore next */
				return fallback;
			}
		} catch (error) {
			return fallback;
		}
	}

	/**
	 * Updates exchange rates for the current currency
	 */
	async updateExchangeRate() {
		if (this.disabled) {
			return;
		}
		const { conversionDate, conversionRate } = await this.fetchExchangeRate(this.activeCurrency);
		this.update({ conversionDate, conversionRate, currentCurrency: this.activeCurrency });
	}
}

export default CurrencyRateController;
