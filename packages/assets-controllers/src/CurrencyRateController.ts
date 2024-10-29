import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import {
  TESTNET_TICKER_SYMBOLS,
  FALL_BACK_VS_CURRENCY,
} from '@metamask/controller-utils';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import { Mutex } from 'async-mutex';

import { fetchMultiExchangeRate as defaultFetchMultiExchangeRate } from './crypto-compare-service';

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

/** The input to start polling for the {@link CurrencyRateController} */
type CurrencyRatePollingInput = {
  nativeCurrencies: string[];
};

/**
 * Controller that passively polls on a set interval for an exchange rate from the current network
 * asset to the user's preferred currency.
 */
export class CurrencyRateController extends StaticIntervalPollingController<CurrencyRatePollingInput>()<
  typeof name,
  CurrencyRateState,
  CurrencyRateMessenger
> {
  private readonly mutex = new Mutex();

  private readonly fetchMultiExchangeRate;

  private readonly includeUsdRate;

  /**
   * Creates a CurrencyRateController instance.
   *
   * @param options - Constructor options.
   * @param options.includeUsdRate - Keep track of the USD rate in addition to the current currency rate.
   * @param options.interval - The polling interval, in milliseconds.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.fetchMultiExchangeRate - Fetches the exchange rate from an external API. This option is primarily meant for use in unit tests.
   */
  constructor({
    includeUsdRate = false,
    interval = 180000,
    messenger,
    state,
    fetchMultiExchangeRate = defaultFetchMultiExchangeRate,
  }: {
    includeUsdRate?: boolean;
    interval?: number;
    messenger: CurrencyRateMessenger;
    state?: Partial<CurrencyRateState>;
    fetchMultiExchangeRate?: typeof defaultFetchMultiExchangeRate;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.includeUsdRate = includeUsdRate;
    this.setIntervalLength(interval);
    this.fetchMultiExchangeRate = fetchMultiExchangeRate;
  }

  /**
   * Sets a currency to track.
   *
   * @param currentCurrency - ISO 4217 currency code.
   */
  async setCurrentCurrency(currentCurrency: string) {
    const releaseLock = await this.mutex.acquire();
    const nativeCurrencies = Object.keys(this.state.currencyRates);
    try {
      this.update(() => {
        return {
          ...defaultState,
          currentCurrency,
        };
      });
    } finally {
      releaseLock();
    }
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.updateExchangeRate(nativeCurrencies);
  }

  /**
   * Updates the exchange rate for the current currency and native currency pairs.
   *
   * @param nativeCurrencies - The native currency symbols to fetch exchange rates for.
   */
  async updateExchangeRate(nativeCurrencies: string[]): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    try {
      const { currentCurrency } = this.state;

      // For preloaded testnets (Goerli, Sepolia) we want to fetch exchange rate for real ETH.
      // Map each native currency to the symbol we want to fetch for it.
      const testnetSymbols = Object.values(TESTNET_TICKER_SYMBOLS);
      const nativeCurrenciesToFetch = [...new Set(nativeCurrencies)].reduce(
        (acc, nativeCurrency) => {
          acc[nativeCurrency] = testnetSymbols.includes(nativeCurrency)
            ? FALL_BACK_VS_CURRENCY
            : nativeCurrency;
          return acc;
        },
        {} as Record<string, string>,
      );

      const fetchExchangeRateResponse = await this.fetchMultiExchangeRate(
        currentCurrency,
        Object.values(nativeCurrenciesToFetch),
        this.includeUsdRate,
      );

      const rates = Object.entries(nativeCurrenciesToFetch).reduce(
        (acc, [nativeCurrency, fetchedCurrency]) => {
          const rate = fetchExchangeRateResponse[fetchedCurrency.toLowerCase()];
          acc[nativeCurrency] = {
            conversionDate: rate !== undefined ? Date.now() / 1000 : null,
            conversionRate: rate?.[currentCurrency.toLowerCase()] ?? null,
            usdConversionRate: rate?.usd ?? null,
          };
          return acc;
        },
        {} as CurrencyRateState['currencyRates'],
      );

      this.update((state) => {
        state.currencyRates = {
          ...state.currencyRates,
          ...rates,
        };
      });
    } catch (error) {
      console.error('Failed to fetch exchange rates.', error);
      throw error;
    } finally {
      releaseLock();
    }
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
   * @param input - The input for the poll.
   * @param input.nativeCurrencies - The native currency symbols to poll prices for.
   */
  async _executePoll({
    nativeCurrencies,
  }: CurrencyRatePollingInput): Promise<void> {
    await this.updateExchangeRate(nativeCurrencies);
  }
}

export default CurrencyRateController;
