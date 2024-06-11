import { BaseController } from '@metamask/base-controller';
import { Mutex } from 'async-mutex';

import { fetchMultiExchangeRate as defaultFetchExchangeRate } from '../crypto-compare-service';
import type {
  ConversionRates,
  RatesControllerState,
  RatesControllerOptions,
  RatesControllerMessenger,
} from './types';

export const name = 'RatesController';

export enum Cryptocurrency {
  Btc = 'btc',
}

const DEFAULT_INTERVAL = 180000;

const metadata = {
  fiatCurrency: { persist: true, anonymous: true },
  rates: { persist: true, anonymous: true },
  cryptocurrencies: { persist: true, anonymous: true },
};

const defaultState = {
  fiatCurrency: 'usd',
  rates: {
    [Cryptocurrency.Btc]: {
      conversionDate: 0,
      conversionRate: '0',
    },
  },
  cryptocurrencies: [Cryptocurrency.Btc],
};

export class RatesController extends BaseController<
  typeof name,
  RatesControllerState,
  RatesControllerMessenger
> {
  readonly #mutex = new Mutex();

  readonly #fetchMultiExchangeRate;

  readonly #includeUsdRate;

  #intervalLength: number;

  #intervalId: NodeJS.Timeout | undefined;

  /**
   * Creates a RatesController instance.
   *
   * @param options - Constructor options.
   * @param options.includeUsdRate - Keep track of the USD rate in addition to the current currency rate.
   * @param options.interval - The polling interval, in milliseconds.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.fetchMultiExchangeRate - Fetches the exchange rate from an external API. This option is primarily meant for use in unit tests.
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    messenger,
    state,
    includeUsdRate,
    fetchMultiExchangeRate = defaultFetchExchangeRate,
  }: RatesControllerOptions) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.#includeUsdRate = includeUsdRate;
    this.#fetchMultiExchangeRate = fetchMultiExchangeRate;
    this.#intervalLength = interval;
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  async #withLock<R>(callback: () => R) {
    const releaseLock = await this.#mutex.acquire();
    try {
      return callback();
    } finally {
      releaseLock();
    }
  }

  /**
   * Executes the polling operation to update rates.
   */
  async #executePoll(): Promise<void> {
    await this.#updateRates();
  }

  /**
   * Updates the rates by fetching new data.
   */
  async #updateRates(): Promise<void> {
    await this.#withLock(async () => {
      const { fiatCurrency, cryptocurrencies } = this.state;
      const response: Record<
        Cryptocurrency,
        Record<string, string>
      > = await this.#fetchMultiExchangeRate(
        fiatCurrency,
        cryptocurrencies,
        this.#includeUsdRate,
      );

      const updatedRates: ConversionRates = {};
      for (const [cryptocurrency, values] of Object.entries(response)) {
        updatedRates[cryptocurrency] = {
          conversionDate: Date.now(),
          conversionRate: values[fiatCurrency],
          ...(this.#includeUsdRate && { usdConversionRate: values.usd }),
        };
      }

      this.update(() => {
        return {
          ...this.state,
          rates: updatedRates,
        };
      });
    });
  }

  /**
   * Starts the polling process.
   */
  async start(): Promise<void> {
    if (this.#intervalId) {
      return;
    }

    this.messagingSystem.publish(`${name}:pollingStarted`);

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
    this.messagingSystem.publish(`${name}:pollingStopped`);
  }

  /**
   * Returns the current list of cryptocurrency.
   * @returns The cryptocurrency list.
   */
  getCryptocurrencyList(): Cryptocurrency[] {
    const { cryptocurrencies } = this.state;
    return cryptocurrencies;
  }

  /**
   * Sets the list of supported cryptocurrencies.
   * @param list - The list of supported cryptocurrencies.
   */
  async setCryptocurrencyList(list: Cryptocurrency[]): Promise<void> {
    await this.#withLock(() => {
      this.update(() => {
        return {
          ...this.state,
          fromCurrencies: list,
        };
      });
    });
  }

  /**
   * Sets the internal fiat currency and update rates accordingly.
   * @param fiatCurrency - The fiat currency.
   */
  async setFiatCurrency(fiatCurrency: string): Promise<void> {
    if (fiatCurrency === '') {
      throw new Error('The currency can not be an empty string');
    }

    await this.#withLock(() => {
      this.update(() => {
        return {
          ...defaultState,
          fiatCurrency,
        };
      });
    });
    await this.#updateRates();
  }
}
