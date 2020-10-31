import { Mutex } from 'await-semaphore';

import BaseController from '../base-controller-v2';
import { safelyExecute } from '../util';
import { fetchExchangeRate as defaultFetchExchangeRate } from '../crypto-compare';

/**
 * @type CurrencyRateState
 *
 * @property conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property conversionRate - Conversion rate from current base asset to the current currency
 * @property currentCurrency - Currently-active ISO 4217 currency code
 * @property nativeCurrency - Symbol for the base asset used for conversion
 * @property pendingCurrentCurrency - The currency being switched to
 * @property pendingNativeCurrency - The base asset currency being switched to
 * @property usdConversionRate - Conversion rate from usd to the current currency
 */
export interface CurrencyRateState {
  conversionDate: number;
  conversionRate: number;
  currentCurrency: string;
  nativeCurrency: string;
  pendingCurrentCurrency: string | null;
  pendingNativeCurrency: string | null;
  usdConversionRate?: number;
}

const schema = {
  conversionDate: { persist: true, anonymous: true },
  conversionRate: { persist: true, anonymous: true },
  currentCurrency: { persist: true, anonymous: true },
  nativeCurrency: { persist: true, anonymous: true },
  pendingCurrentCurrency: { persist: false, anonymous: true },
  pendingNativeCurrency: { persist: false, anonymous: true },
  usdConversionRate: { persist: false, anonymous: true },
};

/**
 * Controller that passively polls on a set interval for an exchange rate from the current base
 * asset to the current currency
 */
export class CurrencyRateController extends BaseController<CurrencyRateState> {

  private static defaultState = {
    conversionDate: 0,
    conversionRate: 0,
    currentCurrency: 'usd',
    nativeCurrency: 'ETH',
    pendingCurrentCurrency: null,
    pendingNativeCurrency: null,
  };

  private mutex = new Mutex();

  private handle?: NodeJS.Timer;

  private interval = 180000;

  private fetchExchangeRate;

  private includeUsdRate;

  /**
   * Creates a CurrencyRateController instance
   *
   * @param state - Initial state to set on this controller
   */
  constructor(state?: Partial<CurrencyRateState>, includeUsdRate = false, fetchExchangeRate = defaultFetchExchangeRate) {
    super({ ...CurrencyRateController.defaultState, ...state }, schema);
    this.includeUsdRate = includeUsdRate;
    this.fetchExchangeRate = fetchExchangeRate;
    this.poll();
  }

  destroy() {
    super.destroy();
    if (this.handle) {
      clearTimeout(this.handle);
    }
  }

  /**
   * Sets a currency to track
   *
   * @param currentCurrency - ISO 4217 currency code
   */
  async setCurrentCurrency(currentCurrency: string) {
    this.update((state) => {
      state.pendingCurrentCurrency = currentCurrency;
    });
    await safelyExecute(() => this.updateExchangeRate());
  }

  /**
   * Sets a new native currency
   *
   * @param symbol - Symbol for the base asset
   */
  async setNativeCurrency(symbol: string) {
    this.update((state) => {
      state.pendingNativeCurrency = symbol;
    });
    await safelyExecute(() => this.updateExchangeRate());
  }

  /**
   * Starts a new polling interval
   */
  async poll(): Promise<void> {
    this.handle && clearTimeout(this.handle);
    await safelyExecute(() => this.updateExchangeRate());
    this.handle = setTimeout(() => {
      this.poll();
    }, this.interval);
  }

  /**
   * Updates exchange rate for the current currency
   */
  async updateExchangeRate(): Promise<CurrencyRateState | void> {
    const releaseLock = await this.mutex.acquire();
    const {
      currentCurrency,
      nativeCurrency,
      pendingCurrentCurrency,
      pendingNativeCurrency,
    } = this.state;
    try {
      const { conversionDate, conversionRate, usdConversionRate } = await this.fetchExchangeRate(
        pendingCurrentCurrency || currentCurrency,
        pendingNativeCurrency || nativeCurrency,
        this.includeUsdRate,
      );
      this.update(() => {
        return {
          conversionDate,
          conversionRate,
          currentCurrency: pendingCurrentCurrency || currentCurrency,
          nativeCurrency: pendingNativeCurrency || nativeCurrency,
          pendingCurrentCurrency: null,
          pendingNativeCurrency: null,
          usdConversionRate,
        };
      });
    } finally {
      releaseLock();
    }
  }
}

export default CurrencyRateController;
