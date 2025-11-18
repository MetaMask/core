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

  private readonly includeUsdRate;

  private readonly useExternalServices: () => boolean;

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
    this.includeUsdRate = includeUsdRate;
    this.useExternalServices = useExternalServices;
    this.setIntervalLength(interval);
    this.#tokenPricesService = tokenPricesService;
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

  async #fetchExchangeRatesWithFallback(
    nativeCurrenciesToFetch: Record<string, string>,
  ): Promise<CurrencyRateState['currencyRates']> {
    const { currentCurrency } = this.state;

    try {
      const priceApiExchangeRatesResponse =
        await this.#tokenPricesService.fetchExchangeRates({
          baseCurrency: currentCurrency,
          includeUsdRate: this.includeUsdRate,
          cryptocurrencies: [
            ...new Set(Object.values(nativeCurrenciesToFetch)),
          ],
        });

      const ratesPriceApi = Object.entries(nativeCurrenciesToFetch).reduce(
        (acc, [nativeCurrency, fetchedCurrency]) => {
          const rate =
            priceApiExchangeRatesResponse[fetchedCurrency.toLowerCase()];

          acc[nativeCurrency] = {
            conversionDate: rate !== undefined ? Date.now() / 1000 : null,
            conversionRate: rate?.value
              ? Number((1 / rate?.value).toFixed(2))
              : null,
            usdConversionRate: rate?.usd
              ? Number((1 / rate?.usd).toFixed(2))
              : null,
          };
          return acc;
        },
        {} as CurrencyRateState['currencyRates'],
      );
      return ratesPriceApi;
    } catch (error) {
      console.error('Failed to fetch exchange rates.', error);
    }

    // fallback using spot price from token prices service
    try {
      // Step 1: Get all network configurations to find matching chainIds for native currencies
      const networkControllerState = this.messenger.call(
        'NetworkController:getState',
      );
      const networkConfigurations =
        networkControllerState.networkConfigurationsByChainId;

      // Step 2: Build a map of nativeCurrency -> chainId(s)
      const currencyToChainIds = Object.entries(nativeCurrenciesToFetch).reduce(
        (acc, [nativeCurrency, fetchedCurrency]) => {
          // Find the first chainId that has this native currency
          const matchingEntry = (
            Object.entries(networkConfigurations) as [
              Hex,
              NetworkConfiguration,
            ][]
          ).find(
            ([, config]) =>
              config.nativeCurrency.toUpperCase() ===
              fetchedCurrency.toUpperCase(),
          );

          if (matchingEntry) {
            acc[nativeCurrency] = {
              fetchedCurrency,
              chainId: matchingEntry[0],
            };
          }

          return acc;
        },
        {} as Record<string, { fetchedCurrency: string; chainId: Hex }>,
      );

      // Step 3: Fetch token prices for each chainId
      const currencyToChainIdsEntries = Object.entries(currencyToChainIds);
      const ratesResults = await Promise.allSettled(
        currencyToChainIdsEntries.map(async ([nativeCurrency, { chainId }]) => {
          const nativeTokenAddress = getNativeTokenAddress(chainId);
          const tokenPrices = await this.#tokenPricesService.fetchTokenPrices({
            chainId,
            tokenAddresses: [nativeTokenAddress],
            currency: currentCurrency,
          });

          const tokenPrice = tokenPrices[nativeTokenAddress];

          return {
            nativeCurrency,
            conversionDate: tokenPrice ? Date.now() / 1000 : null,
            conversionRate: tokenPrice?.price ?? null,
            usdConversionRate: null, // Token prices service doesn't provide USD rate in this context
          };
        }),
      );
      const ratesFromTokenPrices = ratesResults.map((result, index) => {
        const [nativeCurrency, { chainId }] = currencyToChainIdsEntries[index];
        if (result.status === 'fulfilled') {
          return result.value;
        }
        console.error(
          `Failed to fetch token price for ${nativeCurrency} on chain ${chainId}`,
          result.reason,
        );
        return {
          nativeCurrency,
          conversionDate: null,
          conversionRate: null,
          usdConversionRate: null,
        };
      });

      // Step 4: Convert to the expected format
      const ratesFromTokenPricesService = ratesFromTokenPrices.reduce(
        (acc, rate) => {
          acc[rate.nativeCurrency] = {
            conversionDate: rate.conversionDate,
            conversionRate: rate.conversionRate,
            usdConversionRate: rate.usdConversionRate,
          };
          return acc;
        },
        {} as CurrencyRateState['currencyRates'],
      );

      return ratesFromTokenPricesService;
    } catch (error) {
      console.error(
        'Failed to fetch exchange rates from token prices service.',
        error,
      );
      // Return null state for all requested currencies
      return Object.keys(nativeCurrenciesToFetch).reduce(
        (acc, nativeCurrency) => {
          acc[nativeCurrency] = {
            conversionDate: null,
            conversionRate: null,
            usdConversionRate: null,
          };
          return acc;
        },
        {} as CurrencyRateState['currencyRates'],
      );
    }
  }

  /**
   * Updates the exchange rate for the current currency and native currency pairs.
   *
   * @param nativeCurrencies - The native currency symbols to fetch exchange rates for.
   */
  async updateExchangeRate(
    nativeCurrencies: (string | undefined)[],
  ): Promise<void> {
    if (!this.useExternalServices()) {
      return;
    }

    const releaseLock = await this.mutex.acquire();
    try {
      // For preloaded testnets (Goerli, Sepolia) we want to fetch exchange rate for real ETH.
      // Map each native currency to the symbol we want to fetch for it.
      const testnetSymbols = Object.values(TESTNET_TICKER_SYMBOLS);
      const nativeCurrenciesToFetch = nativeCurrencies.reduce(
        (acc, nativeCurrency) => {
          if (!nativeCurrency) {
            return acc;
          }

          acc[nativeCurrency] = testnetSymbols.includes(nativeCurrency)
            ? FALL_BACK_VS_CURRENCY
            : nativeCurrency;
          return acc;
        },
        {} as Record<string, string>,
      );

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
