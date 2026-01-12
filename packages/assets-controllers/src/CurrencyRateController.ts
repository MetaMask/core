import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import {
  TESTNET_TICKER_SYMBOLS,
  FALL_BACK_VS_CURRENCY,
} from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkConfiguration,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';

import type { AbstractTokenPricesService } from './token-prices-service/abstract-token-prices-service';
import { getNativeTokenAddress } from './token-prices-service/codefi-v2';

/**
 * currencyRates - Object keyed by native currency
 *
 * currencyRates.conversionDate - Timestamp of conversion rate expressed in ms since UNIX epoch
 *
 * currencyRates.conversionRate - Conversion rate from current base asset to the current currency
 *
 * currentCurrency - Currently-active ISO 4217 currency code
 *
 * usdConversionRate - Conversion rate from usd to the current currency
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

type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction;

export type CurrencyRateMessenger = Messenger<
  typeof name,
  CurrencyRateControllerActions | AllowedActions,
  CurrencyRateControllerEvents
>;

const metadata: StateMetadata<CurrencyRateState> = {
  currentCurrency: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  currencyRates: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
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

const boundedPrecisionNumber = (value: number, precision = 9): number =>
  Number(value.toFixed(precision));

/**
 * Controller that passively polls on a set interval for an exchange rate from the current network
 * asset to the user's preferred currency.
 */
/** Result from attempting to fetch rates from the primary Price API */
type PriceApiResult = {
  /** Successfully fetched rates */
  rates: CurrencyRateState['currencyRates'];
  /** Currencies that failed and need fallback */
  failedCurrencies: Record<string, string>;
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
  readonly #mutex = new Mutex();

  readonly #includeUsdRate: boolean;

  readonly #useExternalServices: () => boolean;

  readonly #tokenPricesService: AbstractTokenPricesService;

  /**
   * Creates a CurrencyRateController instance.
   *
   * @param options - Constructor options.
   * @param options.includeUsdRate - Keep track of the USD rate in addition to the current currency rate.
   * @param options.interval - The polling interval, in milliseconds.
   * @param options.messenger - A reference to the messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.useExternalServices - Feature Switch for using external services (default: true)
   * @param options.tokenPricesService - An object in charge of retrieving token prices
   */
  constructor({
    includeUsdRate = false,
    interval = 180000,
    useExternalServices = () => true,
    messenger,
    state,
    tokenPricesService,
  }: {
    includeUsdRate?: boolean;
    interval?: number;
    messenger: CurrencyRateMessenger;
    state?: Partial<CurrencyRateState>;
    useExternalServices?: () => boolean;
    tokenPricesService: AbstractTokenPricesService;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.#includeUsdRate = includeUsdRate;
    this.#useExternalServices = useExternalServices;
    this.setIntervalLength(interval);
    this.#tokenPricesService = tokenPricesService;
  }

  /**
   * Sets a currency to track.
   *
   * @param currentCurrency - ISO 4217 currency code.
   */
  async setCurrentCurrency(currentCurrency: string): Promise<void> {
    const releaseLock = await this.#mutex.acquire();
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
   * Attempts to fetch exchange rates from the primary Price API.
   *
   * @param nativeCurrenciesToFetch - Map of native currency to the currency symbol to fetch.
   * @param currentCurrency - The current fiat currency to get rates for.
   * @returns Object containing successful rates and currencies that failed.
   */
  async #fetchRatesFromPriceApi(
    nativeCurrenciesToFetch: Record<string, string>,
    currentCurrency: string,
  ): Promise<PriceApiResult> {
    const rates: CurrencyRateState['currencyRates'] = {};
    let failedCurrencies: Record<string, string> = {};

    try {
      const response = await this.#tokenPricesService.fetchExchangeRates({
        baseCurrency: currentCurrency,
        includeUsdRate: this.#includeUsdRate,
        cryptocurrencies: [...new Set(Object.values(nativeCurrenciesToFetch))],
      });

      Object.entries(nativeCurrenciesToFetch).forEach(
        ([nativeCurrency, fetchedCurrency]) => {
          const rate = response[fetchedCurrency.toLowerCase()];

          if (rate?.value) {
            rates[nativeCurrency] = {
              conversionDate: Date.now() / 1000,
              conversionRate: boundedPrecisionNumber(1 / rate.value),
              usdConversionRate: rate?.usd
                ? boundedPrecisionNumber(1 / rate.usd)
                : null,
            };
          } else {
            failedCurrencies[nativeCurrency] = fetchedCurrency;
          }
        },
      );
    } catch (error) {
      console.error('Failed to fetch exchange rates.', error);
      failedCurrencies = { ...nativeCurrenciesToFetch };
    }

    return { rates, failedCurrencies };
  }

  /**
   * Fetches exchange rates from the token prices service as a fallback.
   *
   * @param failedCurrencies - Map of native currencies that need fallback fetching.
   * @param currentCurrency - The current fiat currency to get rates for.
   * @returns Exchange rates fetched from token prices service.
   */
  async #fetchRatesFromTokenPricesService(
    failedCurrencies: Record<string, string>,
    currentCurrency: string,
  ): Promise<CurrencyRateState['currencyRates']> {
    const networkControllerState = this.messenger.call(
      'NetworkController:getState',
    );
    const networkConfigurations =
      networkControllerState.networkConfigurationsByChainId;

    // Build a map of nativeCurrency -> chainId for failed currencies
    const currencyToChainIds = Object.entries(failedCurrencies).reduce<
      Record<string, { fetchedCurrency: string; chainId: Hex }>
    >((acc, [nativeCurrency, fetchedCurrency]) => {
      const matchingEntry = (
        Object.entries(networkConfigurations) as [Hex, NetworkConfiguration][]
      ).find(
        ([, config]) =>
          config.nativeCurrency.toUpperCase() === fetchedCurrency.toUpperCase(),
      );

      if (matchingEntry) {
        acc[nativeCurrency] = { fetchedCurrency, chainId: matchingEntry[0] };
      }
      return acc;
    }, {});

    const currencyToChainIdsEntries = Object.entries(currencyToChainIds);
    const ratesResults = await Promise.allSettled(
      currencyToChainIdsEntries.map(async ([nativeCurrency, { chainId }]) => {
        const nativeTokenAddress = getNativeTokenAddress(chainId);
        const tokenPrices = await this.#tokenPricesService.fetchTokenPrices({
          assets: [{ chainId, tokenAddress: nativeTokenAddress }],
          currency: currentCurrency,
        });

        const tokenPrice = tokenPrices.find(
          (item) =>
            item.tokenAddress.toLowerCase() ===
            nativeTokenAddress.toLowerCase(),
        );

        return {
          nativeCurrency,
          conversionDate: tokenPrice ? Date.now() / 1000 : null,
          conversionRate: tokenPrice?.price
            ? boundedPrecisionNumber(tokenPrice.price)
            : null,
          usdConversionRate: null,
        };
      }),
    );

    return ratesResults.reduce<CurrencyRateState['currencyRates']>(
      (acc, result, index) => {
        const [nativeCurrency, { chainId }] = currencyToChainIdsEntries[index];

        if (result.status === 'fulfilled') {
          acc[nativeCurrency] = {
            conversionDate: result.value.conversionDate,
            conversionRate: result.value.conversionRate,
            usdConversionRate: result.value.usdConversionRate,
          };
        } else {
          console.error(
            `Failed to fetch token price for ${nativeCurrency} on chain ${chainId}`,
            result.reason,
          );
          acc[nativeCurrency] = {
            conversionDate: null,
            conversionRate: null,
            usdConversionRate: null,
          };
        }
        return acc;
      },
      {},
    );
  }

  /**
   * Creates null rate entries for currencies that couldn't be fetched.
   *
   * @param currencies - Array of currency symbols to create null entries for.
   * @param existingRates - Rates that were already successfully fetched (to avoid overwriting).
   * @returns Null rate entries for currencies not in existingRates.
   */
  #createNullRatesForCurrencies(
    currencies: string[],
    existingRates: CurrencyRateState['currencyRates'],
  ): CurrencyRateState['currencyRates'] {
    return currencies.reduce<CurrencyRateState['currencyRates']>(
      (acc, nativeCurrency) => {
        if (!existingRates[nativeCurrency]) {
          acc[nativeCurrency] = {
            conversionDate: null,
            conversionRate: null,
            usdConversionRate: null,
          };
        }
        return acc;
      },
      {},
    );
  }

  /**
   * Fetches exchange rates with fallback logic.
   * First tries the Price API, then falls back to token prices service for any failed currencies.
   *
   * @param nativeCurrenciesToFetch - Map of native currency to the currency symbol to fetch.
   * @returns Exchange rates for all requested currencies.
   */
  async #fetchExchangeRatesWithFallback(
    nativeCurrenciesToFetch: Record<string, string>,
  ): Promise<CurrencyRateState['currencyRates']> {
    const { currentCurrency } = this.state;

    // Step 1: Try the Price API exchange rates first
    const { rates: ratesPriceApi, failedCurrencies } =
      await this.#fetchRatesFromPriceApi(
        nativeCurrenciesToFetch,
        currentCurrency,
      );

    // Step 2: If all currencies succeeded, return early
    if (Object.keys(failedCurrencies).length === 0) {
      return ratesPriceApi;
    }

    // Step 3: Fallback using token prices service for failed currencies
    let ratesFromFallback: CurrencyRateState['currencyRates'] = {};
    try {
      ratesFromFallback = await this.#fetchRatesFromTokenPricesService(
        failedCurrencies,
        currentCurrency,
      );
    } catch (error) {
      console.error(
        'Failed to fetch exchange rates from token prices service.',
        error,
      );
    }

    // Step 4: Create null rates for any currencies that failed both approaches
    const nullRates = this.#createNullRatesForCurrencies(
      Object.keys(failedCurrencies),
      ratesFromFallback,
    );

    // Step 5: Merge all results - Price API rates take priority, then fallback, then null rates
    return {
      ...nullRates,
      ...ratesFromFallback,
      ...ratesPriceApi,
    };
  }

  /**
   * Updates the exchange rate for the current currency and native currency pairs.
   *
   * @param nativeCurrencies - The native currency symbols to fetch exchange rates for.
   */
  async updateExchangeRate(
    nativeCurrencies: (string | undefined)[],
  ): Promise<void> {
    if (!this.#useExternalServices()) {
      return;
    }

    const releaseLock = await this.#mutex.acquire();
    try {
      // For preloaded testnets (Goerli, Sepolia) we want to fetch exchange rate for real ETH.
      // Map each native currency to the symbol we want to fetch for it.
      const testnetSymbols = Object.values(TESTNET_TICKER_SYMBOLS);
      const nativeCurrenciesToFetch = nativeCurrencies.reduce<
        Record<string, string>
      >((acc, nativeCurrency) => {
        if (!nativeCurrency) {
          return acc;
        }

        acc[nativeCurrency] = testnetSymbols.includes(nativeCurrency)
          ? FALL_BACK_VS_CURRENCY
          : nativeCurrency;
        return acc;
      }, {});

      const rates = await this.#fetchExchangeRatesWithFallback(
        nativeCurrenciesToFetch,
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
  override destroy(): void {
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
