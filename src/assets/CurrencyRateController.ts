import { Mutex } from 'async-mutex';
import type { Patch } from 'immer';

import { BaseController } from '../BaseControllerV2';
import { safelyExecute } from '../util';
import { fetchExchangeRate as defaultFetchExchangeRate } from '../apis/crypto-compare';

import type { RestrictedControllerMessenger } from '../ControllerMessenger';

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
export type CurrencyRateState = {
  conversionDate: number;
  conversionRate: number;
  currentCurrency: string;
  nativeCurrency: string;
  pendingCurrentCurrency: string | null;
  pendingNativeCurrency: string | null;
  usdConversionRate: number | null;
};

const name = 'CurrencyRateController';

export type CurrencyRateStateChange = {
  type: `${typeof name}:stateChange`;
  payload: [CurrencyRateState, Patch[]];
};

const metadata = {
  conversionDate: { persist: true, anonymous: true },
  conversionRate: { persist: true, anonymous: true },
  currentCurrency: { persist: true, anonymous: true },
  nativeCurrency: { persist: true, anonymous: true },
  pendingCurrentCurrency: { persist: false, anonymous: true },
  pendingNativeCurrency: { persist: false, anonymous: true },
  usdConversionRate: { persist: true, anonymous: true },
};

const defaultState = {
  conversionDate: 0,
  conversionRate: 0,
  currentCurrency: 'usd',
  nativeCurrency: 'ETH',
  pendingCurrentCurrency: null,
  pendingNativeCurrency: null,
  usdConversionRate: null,
};

/**
 * Controller that passively polls on a set interval for an exchange rate from the current base
 * asset to the current currency
 */
export class CurrencyRateController extends BaseController<
  typeof name,
  CurrencyRateState
> {
  private mutex = new Mutex();

  private intervalId?: NodeJS.Timeout;

  private intervalDelay;

  private fetchExchangeRate;

  private includeUsdRate;

  /**
   * Creates a CurrencyRateController instance
   *
   * @param options - Constructor options
   * @param options.includeUsdRate - Keep track of the USD rate in addition to the current currency rate
   * @param options.interval - The polling interval, in milliseconds
   * @param options.messenger - A reference to the messaging system
   * @param options.state - Initial state to set on this controller
   * @param options.fetchExchangeRate - Fetches the exchange rate from an external API. This option is primarily meant for use in unit tests.
   */
  constructor({
    includeUsdRate = false,
    interval = 180000,
    messenger,
    state,
    fetchExchangeRate = defaultFetchExchangeRate,
  }: {
    includeUsdRate?: boolean;
    interval?: number;
    messenger: RestrictedControllerMessenger<
      typeof name,
      any,
      any,
      never,
      never
    >;
    state?: Partial<CurrencyRateState>;
    fetchExchangeRate?: typeof defaultFetchExchangeRate;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.includeUsdRate = includeUsdRate;
    this.intervalDelay = interval;
    this.fetchExchangeRate = fetchExchangeRate;
  }

  /**
   * Start polling for the currency rate
   */
  async start() {
    await this.startPolling();
  }

  /**
   * Stop polling for the currency rate
   */
  stop() {
    this.stopPolling();
  }

  /**
   * Prepare to discard this controller.
   *
   * This stops any active polling.
   */
  destroy() {
    super.destroy();
    this.stopPolling();
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
    await this.updateExchangeRate();
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
    await this.updateExchangeRate();
  }

  private stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * Starts a new polling interval
   */
  private async startPolling(): Promise<void> {
    this.stopPolling();
    // TODO: Expose polling currency rate update errors
    await safelyExecute(() => this.updateExchangeRate());
    this.intervalId = setInterval(async () => {
      await safelyExecute(() => this.updateExchangeRate());
    }, this.intervalDelay);
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
      const {
        conversionDate,
        conversionRate,
        usdConversionRate,
      } = await this.fetchExchangeRate(
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
