import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import {
  TESTNET_TICKER_SYMBOLS,
  FALL_BACK_VS_CURRENCY,
} from '@metamask/controller-utils';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import { Mutex } from 'async-mutex';

import { fetchExchangeRate as defaultFetchExchangeRate } from './crypto-compare-service';

/**
 * @type CurrencyRateState
 * @property currencyRates - Object keyed by native currency
 * @property currencyRates.conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 * @property currencyRates.conversionRate - Conversion rate from current base asset to the current currency
 * @property currentCurrency - Currently-active ISO 4217 currency code
 * @property usdConversionRate - Conversion rate from usd to the current currency
 */
export type CurrencyRateState = {
  currentCurrency: string;
  currencyRates: Record<
    string,
    {
      conversionDate: number | null;
      conversionRate: number | null;
      usdConversionRate: number | null;
    }
  >;
};

const name = 'CurrencyRateController';

export type CurrencyRateStateChange = ControllerStateChangeEvent<
  typeof name,
  CurrencyRateState
>;

export type CurrencyRateControllerEvents = CurrencyRateStateChange;

export type GetCurrencyRateState = ControllerGetStateAction<
  typeof name,
  CurrencyRateState
>;

export type CurrencyRateControllerActions = GetCurrencyRateState;

type AllowedActions = NetworkControllerGetNetworkClientByIdAction;

type CurrencyRateMessenger = RestrictedControllerMessenger<
  typeof name,
  CurrencyRateControllerActions | AllowedActions,
  CurrencyRateControllerEvents,
  AllowedActions['type'],
  never
>;

const metadata = {
  currentCurrency: { persist: true, anonymous: true },
  currencyRates: { persist: true, anonymous: true },
};

const defaultState = {
  currentCurrency: 'usd',
  currencyRates: {
    ETH: {
      conversionDate: 0,
      conversionRate: 0,
      usdConversionRate: null,
    },
  },
};

/**
 * Controller that passively polls on a set interval for an exchange rate from the current network
 * asset to the user's preferred currency.
 */
export class CurrencyRateController extends StaticIntervalPollingController<
  typeof name,
  CurrencyRateState,
  CurrencyRateMessenger
> {
  private readonly mutex = new Mutex();

  private readonly fetchExchangeRate;

  private readonly includeUsdRate;

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
    this.setIntervalLength(interval);
    this.fetchExchangeRate = fetchExchangeRate;
  }

  /**
   * Executes a function `callback` within a mutex lock to ensure that only one instance of `callback` runs at a time across all invocations of `#withLock`.
   * This method is useful for synchronizing access to a resource or section of code that should not be executed concurrently.
   *
   * @template R - The return type of the function `callback`.
   * @param callback - A callback to execute once the lock is acquired. This callback can be synchronous or asynchronous.
   * @returns A promise that resolves to the result of the function `callback`. The promise is fulfilled once `callback` has completed execution.
   * @example
   * async function criticalLogic() {
   *   // Critical logic code goes here.
   * }
   *
   * // Execute criticalLogic within a lock.
   * const result = await this.#withLock(criticalLogic);
   */
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  private async withLock<ReturnType>(callback: () => ReturnType) {
    const releaseLock = await this.mutex.acquire();
    try {
      return callback();
    } finally {
      releaseLock();
    }
  }

  /**
   * Sets a currency to track.
   *
   * @param currentCurrency - ISO 4217 currency code.
   */
  async setCurrentCurrency(currentCurrency: string) {
    const nativeCurrencies = Object.keys(this.state.currencyRates);
    await this.withLock(async () => {
      this.update(() => {
        return {
          ...defaultState,
          currentCurrency,
        };
      });
    });
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    nativeCurrencies.forEach(this.updateExchangeRate.bind(this));
  }

  /**
   * Updates the exchange rate for the current currency and native currency pair.
   *
   * @param nativeCurrency - The ticker symbol for the chain.
   */
  async updateExchangeRate(nativeCurrency: string): Promise<void> {
    await this.withLock(async () => {
      const { currentCurrency } = this.state;

      if (!this.shouldFetchExchangeRate(currentCurrency, nativeCurrency)) {
        return;
      }

      const nativeCurrencyForExchangeRate =
        this.getNativeCurrencyForExchangeRate(nativeCurrency);

      try {
        const { conversionRate, usdConversionRate } =
          await this.fetchExchangeRates(
            currentCurrency,
            nativeCurrencyForExchangeRate,
          );

        this.updateCurrencyRates(
          nativeCurrency,
          conversionRate,
          usdConversionRate,
        );
      } catch (error) {
        if (!this.isMarketDoesNotExistError(error)) {
          throw error;
        }
      }
    });
  }

  private shouldFetchExchangeRate(
    currentCurrency: string,
    nativeCurrency: string,
  ): boolean {
    return currentCurrency !== '' && nativeCurrency !== '';
  }

  private getNativeCurrencyForExchangeRate(nativeCurrency: string): string {
    return Object.values(TESTNET_TICKER_SYMBOLS).includes(nativeCurrency)
      ? FALL_BACK_VS_CURRENCY // ETH
      : nativeCurrency;
  }

  private async fetchExchangeRates(
    currentCurrency: string,
    nativeCurrency: string,
  ) {
    const fetchExchangeRateResponse = await this.fetchExchangeRate(
      currentCurrency,
      nativeCurrency,
      this.includeUsdRate,
    );

    return {
      conversionRate: fetchExchangeRateResponse.conversionRate,
      usdConversionRate: fetchExchangeRateResponse.usdConversionRate,
    };
  }

  private updateCurrencyRates(
    nativeCurrency: string,
    conversionRate: number | null,
    usdConversionRate: number | null,
  ): void {
    const conversionDate = Date.now() / 1000;
    const { currencyRates } = this.state;

    this.update(() => ({
      currencyRates: {
        ...currencyRates,
        [nativeCurrency]: {
          conversionDate,
          conversionRate,
          usdConversionRate,
        },
      },
      currentCurrency: this.state.currentCurrency,
    }));
  }

  private isMarketDoesNotExistError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.includes('market does not exist for this coin pair')
    );
  }

  /**
   * Prepare to discard this controller.
   *
   * This stops any active polling.
   */
  override destroy() {
    super.destroy();
    this.stopAllPolling();
  }

  /**
   * Updates exchange rate for the current currency.
   *
   * @param networkClientId - The network client ID used to get a ticker value.
   * @returns The controller state.
   */
  async _executePoll(networkClientId: NetworkClientId): Promise<void> {
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    await this.updateExchangeRate(networkClient.configuration.ticker);
  }
}

export default CurrencyRateController;
