import {
  fetchExchangeRate
} from "./chunk-JTXPJ6TK.mjs";

// src/CurrencyRateController.ts
import {
  TESTNET_TICKER_SYMBOLS,
  FALL_BACK_VS_CURRENCY
} from "@metamask/controller-utils";
import { StaticIntervalPollingController } from "@metamask/polling-controller";
import { Mutex } from "async-mutex";
var name = "CurrencyRateController";
var metadata = {
  currentCurrency: { persist: true, anonymous: true },
  currencyRates: { persist: true, anonymous: true }
};
var defaultState = {
  currentCurrency: "usd",
  currencyRates: {
    ETH: {
      conversionDate: 0,
      conversionRate: 0,
      usdConversionRate: null
    }
  }
};
var CurrencyRateController = class extends StaticIntervalPollingController {
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
    interval = 18e4,
    messenger,
    state,
    fetchExchangeRate: fetchExchangeRate2 = fetchExchangeRate
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state }
    });
    this.mutex = new Mutex();
    this.includeUsdRate = includeUsdRate;
    this.setIntervalLength(interval);
    this.fetchExchangeRate = fetchExchangeRate2;
  }
  /**
   * Sets a currency to track.
   *
   * @param currentCurrency - ISO 4217 currency code.
   */
  async setCurrentCurrency(currentCurrency) {
    const releaseLock = await this.mutex.acquire();
    const nativeCurrencies = Object.keys(this.state.currencyRates);
    try {
      this.update(() => {
        return {
          ...defaultState,
          currentCurrency
        };
      });
    } finally {
      releaseLock();
    }
    nativeCurrencies.forEach(this.updateExchangeRate.bind(this));
  }
  /**
   * Updates the exchange rate for the current currency and native currency pair.
   *
   * @param nativeCurrency - The ticker symbol for the chain.
   */
  async updateExchangeRate(nativeCurrency) {
    const releaseLock = await this.mutex.acquire();
    const { currentCurrency, currencyRates } = this.state;
    let conversionDate = null;
    let conversionRate = null;
    let usdConversionRate = null;
    const nativeCurrencyForExchangeRate = Object.values(
      TESTNET_TICKER_SYMBOLS
    ).includes(nativeCurrency) ? FALL_BACK_VS_CURRENCY : nativeCurrency;
    try {
      if (currentCurrency && nativeCurrency && // if either currency is an empty string we can skip the comparison
      // because it will result in an error from the api and ultimately
      // a null conversionRate either way.
      currentCurrency !== "" && nativeCurrency !== "") {
        const fetchExchangeRateResponse = await this.fetchExchangeRate(
          currentCurrency,
          nativeCurrencyForExchangeRate,
          this.includeUsdRate
        );
        conversionRate = fetchExchangeRateResponse.conversionRate;
        usdConversionRate = fetchExchangeRateResponse.usdConversionRate;
        conversionDate = Date.now() / 1e3;
      }
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("market does not exist for this coin pair"))) {
        throw error;
      }
    } finally {
      try {
        this.update(() => {
          return {
            currencyRates: {
              ...currencyRates,
              [nativeCurrency]: {
                conversionDate,
                conversionRate,
                usdConversionRate
              }
            },
            currentCurrency
          };
        });
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
  destroy() {
    super.destroy();
    this.stopAllPolling();
  }
  /**
   * Updates exchange rate for the current currency.
   *
   * @param networkClientId - The network client ID used to get a ticker value.
   * @returns The controller state.
   */
  async _executePoll(networkClientId) {
    const networkClient = this.messagingSystem.call(
      "NetworkController:getNetworkClientById",
      networkClientId
    );
    await this.updateExchangeRate(networkClient.configuration.ticker);
  }
};
var CurrencyRateController_default = CurrencyRateController;

export {
  CurrencyRateController,
  CurrencyRateController_default
};
//# sourceMappingURL=chunk-HJ5GXVDT.mjs.map