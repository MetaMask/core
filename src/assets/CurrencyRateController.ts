import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { safelyExecute, handleFetch } from '../util';

const { Mutex } = require('await-semaphore');

/**
 * @type CurrencyRateConfig
 *
 * Currency rate controller configuration
 *
 * @property currentCurrency - Currently-active ISO 4217 currency code
 * @property interval - Polling interval used to fetch new currency rate
 * @property nativeCurrency - Symbol for the base asset used for conversion
 * @property includeUSDRate - Whether to include the usd rate in addition to the currentCurrency
 */
export interface CurrencyRateConfig extends BaseConfig {
  currentCurrency: string;
  interval: number;
  nativeCurrency: string;
  includeUSDRate?: boolean;
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
 * @property usdConversionRate - Conversion rate from usd to the current currency
 */
export interface CurrencyRateState extends BaseState {
  conversionDate: number;
  conversionRate: number;
  currentCurrency: string;
  nativeCurrency: string;
  usdConversionRate?: number;
}

/**
 * Controller that passively polls on a set interval for an exchange rate from the current base
 * asset to the current currency
 */
export class CurrencyRateController extends BaseController<CurrencyRateConfig, CurrencyRateState> {
  /* Optional config to include conversion to usd in all price url fetches and on state */
  includeUSDRate?: boolean;

  private activeCurrency = '';

  private activeNativeCurrency = '';

  private mutex = new Mutex();

  private handle?: NodeJS.Timer;

  private getCurrentCurrencyFromState(state?: Partial<CurrencyRateState>) {
    return state && state.currentCurrency ? state.currentCurrency : 'usd';
  }

  private getPricingURL(currentCurrency: string, nativeCurrency: string, includeUSDRate?: boolean) {
    return (
      `https://min-api.cryptocompare.com/data/price?fsym=` +
      `${nativeCurrency.toUpperCase()}&tsyms=${currentCurrency.toUpperCase()}` +
      `${includeUSDRate ? ',USD' : ''}`
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
      currentCurrency: this.getCurrentCurrencyFromState(state),
      disabled: true,
      interval: 180000,
      nativeCurrency: 'ETH',
      includeUSDRate: false,
    };
    this.defaultState = {
      conversionDate: 0,
      conversionRate: 0,
      currentCurrency: this.defaultConfig.currentCurrency,
      nativeCurrency: this.defaultConfig.nativeCurrency,
    };
    if (config?.includeUSDRate) {
      this.defaultState.usdConversionRate = 0;
    }
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
   * @param includeUSDRate - Whether to add the USD rate to the fetch
   * @returns - Promise resolving to exchange rate for given currency
   */
  async fetchExchangeRate(currency: string, nativeCurrency = this.activeNativeCurrency, includeUSDRate?: boolean): Promise<CurrencyRateState> {
    const json = await handleFetch(this.getPricingURL(currency, nativeCurrency, includeUSDRate));
    const conversionRate = Number(json[currency.toUpperCase()]);
    const usdConversionRate = Number(json.USD);
    if (!Number.isFinite(conversionRate)) {
      throw new Error(`Invalid response for ${currency.toUpperCase()}: ${json[currency.toUpperCase()]}`);
    }
    if (includeUSDRate && !Number.isFinite(usdConversionRate)) {
      throw new Error(`Invalid response for usdConversionRate: ${json.USD}`);
    }

    return {
      conversionDate: Date.now() / 1000,
      conversionRate,
      currentCurrency: currency,
      nativeCurrency,
      usdConversionRate,
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
    try {
      const { conversionDate, conversionRate, usdConversionRate } = await this.fetchExchangeRate(
        this.activeCurrency,
        this.activeNativeCurrency,
        this.includeUSDRate,
      );
      const newState: CurrencyRateState = {
        conversionDate,
        conversionRate,
        currentCurrency: this.activeCurrency,
        nativeCurrency: this.activeNativeCurrency,
      };
      if (this.includeUSDRate) {
        newState.usdConversionRate = usdConversionRate;
      }
      this.update(newState);

      return this.state;
    } finally {
      releaseLock();
    }
  }
}

export default CurrencyRateController;
