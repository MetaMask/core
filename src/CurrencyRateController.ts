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
	currency?: string;
	interval?: number;
}

/**
 * @type CurrencyRateState
 *
 * Currency rate controller state
 *
 * @property conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property conversionRate - Conversion rate from ETH to the selected currency
 */
export interface CurrencyRateState extends BaseState {
	conversionDate: number;
	conversionRate: number;
}

/**
 * Controller that passively polls on a set interval for an ETH-to-fiat exchange rate
 */
export class CurrencyRateController extends BaseController<CurrencyRateState, CurrencyRateConfig> {
	private activeCurrency: string = '';
	private handle?: number;

	private getPricingURL(currency: string) {
		return `https://api.infura.io/v1/ticker/eth${currency.toLowerCase()}`;
	}

	/**
	 * Default options used to configure this controller
	 */
	defaultConfig = {
		currency: 'usd',
		interval: 1000
	};

	/**
	 * Default state set on this controller
	 */
	defaultState = {
		conversionDate: 0,
		conversionRate: 0
	};

	/**
	 * Creates a CurrencyRateController instance
	 *
	 * @param state - Initial state to set on this controller
	 * @param config - Initial options used to configure this controller
	 */
	constructor(state?: CurrencyRateState, config?: CurrencyRateConfig) {
		super(state, config);
		this.initialize();
	}

	/**
	 * Sets a new polling interval
	 *
	 * @param interval - Polling interval used to fetch new token rates
	 */
	set interval(interval: number) {
		this.handle && window.clearInterval(this.handle);
		this.handle = window.setInterval(() => {
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
		const fallback = { conversionDate: 0, conversionRate: 0 };
		try {
			const response = await fetch(this.getPricingURL(currency));
			const json = await response.json();
			return json && json.bid
				? { conversionDate: Number(json.timestamp), conversionRate: Number(json.bid) }
				: /* istanbul ignore next */ fallback;
		} catch (error) {
			return fallback;
		}
	}

	/**
	 * Updates exchange rates for all tokens
	 */
	async updateExchangeRate() {
		if (this.disabled) {
			return;
		}
		const { conversionDate, conversionRate } = await this.fetchExchangeRate(this.activeCurrency);
		this.update({ conversionDate, conversionRate });
	}
}

export default CurrencyRateController;
