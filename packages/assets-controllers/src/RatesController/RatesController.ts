import { BaseController } from '@metamask/base-controller';
import { Mutex } from 'async-mutex';

import { fetchMultiExchangeRate as defaultFetchExchangeRate } from '../crypto-compare-service';
import type {
  RatesMessenger,
  ConversionRates,
  RatesControllerState,
  RatesControllerOptions,
} from './types';

export const name = 'RatesController';

export enum Cryptocurrency {
  Btc = 'btc',
}

const DEFAULT_INTERVAL = 180000;

const metadata = {
  currency: { persist: true, anonymous: true },
  rates: { persist: true, anonymous: true },
  fromCurrencies: { persist: true, anonymous: true },
};

const defaultState = {
  currency: 'usd',
  rates: {
    [Cryptocurrency.Btc]: {
      conversionDate: 0,
      conversionRate: '0',
    },
  },
  fromCurrencies: [Cryptocurrency.Btc],
};

export class RatesController extends BaseController<
  typeof name,
  RatesControllerState,
  RatesMessenger
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

  async #withLock<R>(f: () => R) {
    const releaseLock = await this.#mutex.acquire();
    try {
      return f();
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
   * Updates the rates by fetching new data.
   */
  async updateRates(): Promise<void> {
    await this.#withLock(async () => {
      const { currency, fromCurrencies } = this.state;
      const response = await this.#fetchMultiExchangeRate(
        currency,
        fromCurrencies,
        this.#includeUsdRate,
      );

      const updatedRates: ConversionRates = {};
      for (const [cryptocurrency, values] of Object.entries(response)) {
        updatedRates[cryptocurrency] = {
          // Divided by 1000 to convert to ms
          conversionDate: Date.now() / 1000,
          conversionRate: values[currency],
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

  getCryptocurrencyList(): Cryptocurrency[] {
    const { fromCurrencies } = this.state;
    return fromCurrencies;
  }

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

  async setCurrency(currency: string) {
    if (currency === '') {
      throw new Error('The currency can not be an empty string');
    }

    await this.#withLock(() => {
      this.update(() => {
        return {
          ...defaultState,
          currency,
        };
      });
    });
    await this.updateRates();
  }
}
