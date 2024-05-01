import { BaseController } from '@metamask/base-controller';
import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';

import { fetchExchangeRate as defaultFetchExchangeRate } from '../crypto-compare-service';

/**
 * Represents the state structure for the BtcRateController.
 */
export type RatesState = {
  currency: string;
  rates: Record<
    string,
    {
      conversionDate: number | null;
      conversionRate: number | null;
      usdConversionRate: number | null;
    }
  >;
};

const name = 'RatesController';

/**
 * Type definition for BtcRateController state change events.
 */
export type RatesStateChange = ControllerStateChangeEvent<
  typeof name,
  RatesState
>;

export type RatesControllerEvents = RatesStateChange;

/**
 * Type definition for getting the BtcRateController.
 */
export type GetRatesState = ControllerGetStateAction<typeof name, RatesState>;

export type RatesControllerActions = GetRatesState;

type RatesMessenger = RestrictedControllerMessenger<
  typeof name,
  RatesControllerActions,
  RatesControllerEvents,
  never,
  never
>;

const metadata = {
  currency: { persist: true, anonymous: true },
  rates: { persist: true, anonymous: true },
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
};

const DEFAULT_CURRENCIES = {
  btc: 'BTC',
  sol: 'SOL',
};

export class RatesController extends BaseController<
  typeof name,
  RatesState,
  RatesMessenger
> {
  readonly #fetchExchangeRate;

  readonly #onStart;

  readonly #onStop;

  readonly #includeUsdRate;

  #intervalId: NodeJS.Timeout | undefined;

  #intervalLength: number | undefined = 1000;

  /**
   * Creates a BtcRateController instance.
   *
   * @param options - Constructor options.
   * @param options.includeUsdRate - Keep track of the USD rate in addition to the current currency rate.
   * @param options.interval - The polling interval, in milliseconds.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.fetchExchangeRate - Fetches the exchange rate from an external API. This option is primarily meant for use in unit tests.
   * @param options.onStart - Optional callback to be executed when the polling stops.
   * @param options.onStop - Optional callback to be executed when the polling starts.
   */
  constructor({
    interval = 180000,
    messenger,
    state,
    includeUsdRate,
    fetchExchangeRate = defaultFetchExchangeRate,
    onStart,
    onStop,
  }: {
    includeUsdRate?: boolean;
    interval?: number;
    messenger: RatesMessenger;
    state?: Partial<RatesState>;
    fetchExchangeRate?: typeof defaultFetchExchangeRate;
    onStart?: () => Promise<unknown>;
    onStop?: () => Promise<unknown>;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.#includeUsdRate = includeUsdRate;
    this.#fetchExchangeRate = fetchExchangeRate;
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
  async #updateRates(): Promise<void> {
    const { currency } = this.state;
    // const cryptoCurrencies: string =
    //   Object.values(DEFAULT_CURRENCIES).join(',');
    const response = await this.#fetchExchangeRate(
      currency,
      DEFAULT_CURRENCIES.btc,
      this.#includeUsdRate,
    );
    const { conversionRate, usdConversionRate } = response;
    this.update(() => {
      return {
        rates: {
          btc: {
            conversionDate: Date.now() / 1000,
            conversionRate,
            usdConversionRate,
          },
        },
        currency,
      };
    });
  }

  /**
   * Executes the polling operation to update rates.
   */
  async #executePoll(): Promise<void> {
    await this.#updateRates();
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
}
