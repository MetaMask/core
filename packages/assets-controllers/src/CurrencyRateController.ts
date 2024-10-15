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

/** The input to start polling for the {@link CurrencyRateController} */
type CurrencyRatePollingInput = {
  networkClientId: NetworkClientId;
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
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    nativeCurrencies.forEach(this.updateExchangeRate.bind(this));
  }

  /**
   * Updates the exchange rate for the current currency and native currency pair.
   *
   * @param nativeCurrency - The ticker symbol for the chain.
   */
  async updateExchangeRate(nativeCurrency: string): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    const { currentCurrency, currencyRates } = this.state;

    let conversionDate: number | null = null;
    let conversionRate: number | null = null;
    let usdConversionRate: number | null = null;

    // For preloaded testnets (Goerli, Sepolia) we want to fetch exchange rate for real ETH.
    const nativeCurrencyForExchangeRate = Object.values(
      TESTNET_TICKER_SYMBOLS,
    ).includes(nativeCurrency)
      ? FALL_BACK_VS_CURRENCY // ETH
      : nativeCurrency;

    let shouldUpdateState = true;
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
        const fetchExchangeRateResponse = await this.fetchExchangeRate(
          currentCurrency,
          nativeCurrencyForExchangeRate,
          this.includeUsdRate,
        );
        conversionRate = fetchExchangeRateResponse.conversionRate;
        usdConversionRate = fetchExchangeRateResponse.usdConversionRate;
        conversionDate = Date.now() / 1000;
      }
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          error.message.includes('market does not exist for this coin pair')
        )
      ) {
        // Don't update state on transient / unexpected errors
        shouldUpdateState = false;
        throw error;
      }
    } finally {
      try {
        if (shouldUpdateState) {
          this.update(() => {
            return {
              currencyRates: {
                ...currencyRates,
                [nativeCurrency]: {
                  conversionDate,
                  conversionRate,
                  usdConversionRate,
                },
              },
              currentCurrency,
            };
          });
        }
      } finally {
        releaseLock();
      }
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
   * @param input.networkClientId - The network client ID used to get a ticker value.
   */
  async _executePoll({
    networkClientId,
  }: CurrencyRatePollingInput): Promise<void> {
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    await this.updateExchangeRate(networkClient.configuration.ticker);
  }
}

export default CurrencyRateController;
