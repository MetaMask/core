import { BaseController } from '@metamask/base-controller';
import { Mutex } from 'async-mutex';

import { fetchMultiExchangeRate as defaultFetchExchangeRate } from '../crypto-compare-service';
import type {
  ConversionRates,
  RatesState,
  RatesMessenger,
  RatesControllerArgs,
} from './types';

export const name = 'RatesController';

const DEFAULT_CURRENCIES = {
  btc: 'btc',
};

const metadata = {
  currency: { persist: true, anonymous: true },
  rates: { persist: true, anonymous: true },
  cryptocurrencyList: { persist: true, anonymous: true },
};

const defaultState = {
  currency: 'usd',
  rates: {
    btc: {
      conversionDate: 0,
      conversionRate: 0,
      usdConversionRate: null,
    },
  },
  cryptocurrencyList: [DEFAULT_CURRENCIES.btc],
};

export class RatesController extends BaseController<
  typeof name,
  RatesState,
  RatesMessenger
> {
  readonly #mutex = new Mutex();

  readonly #fetchMultiExchangeRate;

  readonly #onStart;

  readonly #onStop;

  readonly #includeUsdRate;

  #intervalId: NodeJS.Timeout | undefined;

  #intervalLength: number | undefined;

  /**
   * Creates a BtcRateController instance.
   *
   * @param options - Constructor options.
   * @param options.includeUsdRate - Keep track of the USD rate in addition to the current currency rate.
   * @param options.interval - The polling interval, in milliseconds.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.fetchMultiExchangeRate - Fetches the exchange rate from an external API. This option is primarily meant for use in unit tests.
   * @param options.onStart - Optional callback to be executed when the polling stops.
   * @param options.onStop - Optional callback to be executed when the polling starts.
   */
  constructor({
    interval = 180000,
    messenger,
    state,
    includeUsdRate,
    fetchMultiExchangeRate = defaultFetchExchangeRate,
    onStart,
    onStop,
  }: RatesControllerArgs) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.#includeUsdRate = includeUsdRate;
    this.#fetchMultiExchangeRate = fetchMultiExchangeRate;
    this.#onStart = onStart;
    this.#onStop = onStop;
    this.#setIntervalLength(interval);
  }

  /**
   * Sets the interval length for polling.
   *
   * @param intervalLength - The length of the interval in milliseconds.
   */
  #setIntervalLength(intervalLength: number) {
    this.#intervalLength = intervalLength;
  }

  /**
   * Updates the BTC rates by fetching new data.
   */
  async updateRates(): Promise<void> {
    const releaseLock = await this.#mutex.acquire();
    const { currency, cryptocurrencyList } = this.state;

    try {
      const response = await this.#fetchMultiExchangeRate(
        currency,
        cryptocurrencyList,
        this.#includeUsdRate,
      );

      const updatedRates: ConversionRates = {};
      for (const [key, value] of Object.entries(response)) {
        updatedRates[key] = {
          conversionDate: Date.now() / 1000,
          conversionRate: value[currency],
          usdConversionRate: value.usd || null,
        };
      }

      this.update(() => {
        return {
          ...this.state,
          rates: updatedRates,
        };
      });
    } finally {
      releaseLock();
    }
  }

  /**
   * Executes the polling operation to update rates.
   */
  async #executePoll(): Promise<void> {
    await this.updateRates();
  }

  /**
   * Starts the polling process.
   */
  async start(): Promise<void> {
    if (this.#intervalId) {
      return;
    }

    await this.#onStart?.();
    this.#intervalId = setInterval(() => {
      this.#executePoll().catch(console.error);
    }, this.#intervalLength);
  }

  /**
   * Stops the polling process.
   */
  async stop(): Promise<void> {
    if (!this.#intervalId) {
      return;
    }

    clearInterval(this.#intervalId);
    this.#intervalId = undefined;
    await this.#onStop?.();
  }

  getCryptocurrencyList(): string[] {
    const { cryptocurrencyList } = this.state;
    return cryptocurrencyList;
  }

  setCryptocurrencyList(list: string[]): void {
    this.update(() => {
      return {
        ...this.state,
        cryptocurrencyList: list,
      };
    });
  }

  async setCurrency(currency: string) {
    if (currency === '') {
      throw new Error("The currency can't be an empty string");
    }
    const releaseLock = await this.#mutex.acquire();
    try {
      this.update(() => {
        return {
          ...defaultState,
          currency,
        };
      });
    } finally {
      releaseLock();
    }
    await this.updateRates();
  }
}
