import { Mutex } from 'async-mutex';
import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { safelyExecute } from '../util';
import { fetchExchangeRate as defaultFetchExchangeRate } from '../apis/crypto-compare';

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
export class CurrencyRateController extends BaseController<
  CurrencyRateConfig,
  CurrencyRateState
> {
  /* Optional config to include conversion to usd in all price url fetches and on state */
  includeUSDRate?: boolean;

  private activeCurrency = '';

  private activeNativeCurrency = '';

  private mutex = new Mutex();

  private handle?: NodeJS.Timer;

  private fetchExchangeRate: typeof defaultFetchExchangeRate;

  private getCurrentCurrencyFromState(state?: Partial<CurrencyRateState>) {
    return state?.currentCurrency ? state.currentCurrency : 'usd';
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
  constructor(
    config?: Partial<CurrencyRateConfig>,
    state?: Partial<CurrencyRateState>,
    fetchExchangeRate = defaultFetchExchangeRate,
  ) {
    super(config, state);
    this.fetchExchangeRate = fetchExchangeRate;
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
      usdConversionRate: 0,
    };
    this.initialize();
    this.configure({ disabled: false }, false, false);
    this.poll();
  }

  /**
   * Sets a currency to track
   *
   * TODO: Replace this wth a method
   *
   * @param currentCurrency - ISO 4217 currency code
   */
  set currentCurrency(currentCurrency: string) {
    this.activeCurrency = currentCurrency;
    safelyExecute(() => this.updateExchangeRate());
  }

  get currentCurrency() {
    throw new Error('Property only used for setting');
  }

  /**
   * Sets a new native currency
   *
   * TODO: Replace this wth a method
   *
   * @param symbol - Symbol for the base asset
   */
  set nativeCurrency(symbol: string) {
    this.activeNativeCurrency = symbol;
    safelyExecute(() => this.updateExchangeRate());
  }

  get nativeCurrency() {
    throw new Error('Property only used for setting');
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
   * Updates exchange rate for the current currency
   *
   * @returns Promise resolving to currency data or undefined if disabled
   */
  async updateExchangeRate(): Promise<CurrencyRateState | void> {
    if (this.disabled || !this.activeCurrency || !this.activeNativeCurrency) {
      return undefined;
    }
    const releaseLock = await this.mutex.acquire();
    try {
      const {
        conversionDate,
        conversionRate,
        usdConversionRate,
      } = await this.fetchExchangeRate(
        this.activeCurrency,
        this.activeNativeCurrency,
        this.includeUSDRate,
      );
      const newState: CurrencyRateState = {
        conversionDate,
        conversionRate,
        currentCurrency: this.activeCurrency,
        nativeCurrency: this.activeNativeCurrency,
        usdConversionRate: this.includeUSDRate
          ? usdConversionRate
          : this.defaultState.usdConversionRate,
      };
      this.update(newState);

      return this.state;
    } finally {
      releaseLock();
    }
  }
}

export default CurrencyRateController;
