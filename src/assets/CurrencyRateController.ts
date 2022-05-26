import { Mutex } from 'async-mutex';
import type { Patch } from 'immer';

import { BaseController } from '../BaseControllerV2';
import { safelyExecute } from '../util';
import { fetchExchangeRate as defaultFetchExchangeRate } from '../apis/crypto-compare';

import type { RestrictedControllerMessenger } from '../ControllerMessenger';

/**
 * @type CurrencyRateState
 * @property conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property conversionRate - Conversion rate from current base asset to the current currency
 * @property currentCurrency - Currently-active ISO 4217 currency code
 * @property nativeCurrency - Symbol for the base asset used for conversion
 * @property pendingCurrentCurrency - The currency being switched to
 * @property pendingNativeCurrency - The base asset currency being switched to
 * @property usdConversionRate - Conversion rate from usd to the current currency
 */
export type CurrencyRateState = {
  conversionDate: number | null;
  conversionRate: number | null;
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

export type GetCurrencyRateState = {
  type: `${typeof name}:getState`;
  handler: () => CurrencyRateState;
};

type CurrencyRateMessenger = RestrictedControllerMessenger<
  typeof name,
  GetCurrencyRateState,
  CurrencyRateStateChange,
  never,
  never
>;

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
  CurrencyRateState,
  CurrencyRateMessenger
> {
  private mutex = new Mutex();

  private intervalId?: NodeJS.Timeout;

  private intervalDelay;

  private fetchExchangeRate;

  private includeUsdRate;

  /**
   * Creates a CurrencyRateController instance.
   *
   * @param options - Constructor options.
   * @param options.includeUsdRate - Keep track of the USD rate in addition to the current currency rate.
   * @param options.interval - The polling interval, in milliseconds.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
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
    messenger: CurrencyRateMessenger;
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
   * Start polling for the currency rate.
   */
  async start() {
    await this.startPolling();
  }

  /**
   * Stop polling for the currency rate.
   */
  stop() {
    this.stopPolling();
  }

  /**
   * Prepare to discard this controller.
   *
   * This stops any active polling.
   */
  override destroy() {
    super.destroy();
    this.stopPolling();
  }

  /**
   * Sets a currency to track.
   *
   * @param currentCurrency - ISO 4217 currency code.
   */
  async setCurrentCurrency(currentCurrency: string) {
    this.update((state) => {
      state.pendingCurrentCurrency = currentCurrency;
    });
    await this.updateExchangeRate();
  }

  /**
   * Sets a new native currency.
   *
   * @param symbol - Symbol for the base asset.
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
   * Starts a new polling interval.
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
   * Updates exchange rate for the current currency.
   *
   * @returns The controller state.
   */
  async updateExchangeRate(): Promise<CurrencyRateState | void> {
    const releaseLock = await this.mutex.acquire();
    const {
      currentCurrency: stateCurrentCurrency,
      nativeCurrency: stateNativeCurrency,
      pendingCurrentCurrency,
      pendingNativeCurrency,
    } = this.state;

    let conversionDate: number | null = null;
    let conversionRate: number | null = null;
    let usdConversionRate: number | null = null;
    const currentCurrency = pendingCurrentCurrency ?? stateCurrentCurrency;
    const nativeCurrency = pendingNativeCurrency ?? stateNativeCurrency;

    try {
      if (
        currentCurrency &&
        nativeCurrency &&
        // if either currency is an empty string we can skip the comparison
        // because it will result in an error from the api and ultimately
        // a null conversionRate either way.
        currentCurrency !== '' &&
        nativeCurrency !== ''
      ) {
        ({ conversionRate, usdConversionRate } = await this.fetchExchangeRate(
          currentCurrency,
          nativeCurrency,
          this.includeUsdRate,
        ));
        conversionDate = Date.now() / 1000;
      }
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          error.message.includes('market does not exist for this coin pair')
        )
      ) {
        throw error;
      }
    } finally {
      try {
        this.update(() => {
          return {
            conversionDate,
            conversionRate,
            // we currently allow and handle an empty string as a valid nativeCurrency
            // in cases where a user has not entered a native ticker symbol for a custom network
            // currentCurrency is not from user input but this protects us from unexpected changes.
            nativeCurrency,
            currentCurrency,
            pendingCurrentCurrency: null,
            pendingNativeCurrency: null,
            usdConversionRate,
          };
        });
      } finally {
        releaseLock();
      }
    }
    return this.state;
  }
}

export default CurrencyRateController;
