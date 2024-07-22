import {
  fetchMultiExchangeRate
} from "./chunk-JTXPJ6TK.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/RatesController/RatesController.ts
import { BaseController } from "@metamask/base-controller";
import { Mutex } from "async-mutex";
var name = "RatesController";
var Cryptocurrency = /* @__PURE__ */ ((Cryptocurrency2) => {
  Cryptocurrency2["Btc"] = "btc";
  return Cryptocurrency2;
})(Cryptocurrency || {});
var DEFAULT_INTERVAL = 18e4;
var metadata = {
  fiatCurrency: { persist: true, anonymous: true },
  rates: { persist: true, anonymous: true },
  cryptocurrencies: { persist: true, anonymous: true }
};
var defaultState = {
  fiatCurrency: "usd",
  rates: {
    ["btc" /* Btc */]: {
      conversionDate: 0,
      conversionRate: "0"
    }
  },
  cryptocurrencies: ["btc" /* Btc */]
};
var _mutex, _fetchMultiExchangeRate, _includeUsdRate, _intervalLength, _intervalId, _withLock, withLock_fn, _executePoll, executePoll_fn, _updateRates, updateRates_fn;
var RatesController = class extends BaseController {
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
    fetchMultiExchangeRate: fetchMultiExchangeRate2 = fetchMultiExchangeRate
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state }
    });
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
    __privateAdd(this, _withLock);
    /**
     * Executes the polling operation to update rates.
     */
    __privateAdd(this, _executePoll);
    /**
     * Updates the rates by fetching new data.
     */
    __privateAdd(this, _updateRates);
    __privateAdd(this, _mutex, new Mutex());
    __privateAdd(this, _fetchMultiExchangeRate, void 0);
    __privateAdd(this, _includeUsdRate, void 0);
    __privateAdd(this, _intervalLength, void 0);
    __privateAdd(this, _intervalId, void 0);
    __privateSet(this, _includeUsdRate, includeUsdRate);
    __privateSet(this, _fetchMultiExchangeRate, fetchMultiExchangeRate2);
    __privateSet(this, _intervalLength, interval);
  }
  /**
   * Starts the polling process.
   */
  async start() {
    if (__privateGet(this, _intervalId)) {
      return;
    }
    this.messagingSystem.publish(`${name}:pollingStarted`);
    __privateSet(this, _intervalId, setInterval(() => {
      __privateMethod(this, _executePoll, executePoll_fn).call(this).catch(console.error);
    }, __privateGet(this, _intervalLength)));
  }
  /**
   * Stops the polling process.
   */
  async stop() {
    if (!__privateGet(this, _intervalId)) {
      return;
    }
    clearInterval(__privateGet(this, _intervalId));
    __privateSet(this, _intervalId, void 0);
    this.messagingSystem.publish(`${name}:pollingStopped`);
  }
  /**
   * Returns the current list of cryptocurrency.
   * @returns The cryptocurrency list.
   */
  getCryptocurrencyList() {
    const { cryptocurrencies } = this.state;
    return cryptocurrencies;
  }
  /**
   * Sets the list of supported cryptocurrencies.
   * @param list - The list of supported cryptocurrencies.
   */
  async setCryptocurrencyList(list) {
    await __privateMethod(this, _withLock, withLock_fn).call(this, () => {
      this.update(() => {
        return {
          ...this.state,
          fromCurrencies: list
        };
      });
    });
  }
  /**
   * Sets the internal fiat currency and update rates accordingly.
   * @param fiatCurrency - The fiat currency.
   */
  async setFiatCurrency(fiatCurrency) {
    if (fiatCurrency === "") {
      throw new Error("The currency can not be an empty string");
    }
    await __privateMethod(this, _withLock, withLock_fn).call(this, () => {
      this.update(() => {
        return {
          ...defaultState,
          fiatCurrency
        };
      });
    });
    await __privateMethod(this, _updateRates, updateRates_fn).call(this);
  }
};
_mutex = new WeakMap();
_fetchMultiExchangeRate = new WeakMap();
_includeUsdRate = new WeakMap();
_intervalLength = new WeakMap();
_intervalId = new WeakMap();
_withLock = new WeakSet();
withLock_fn = async function(callback) {
  const releaseLock = await __privateGet(this, _mutex).acquire();
  try {
    return callback();
  } finally {
    releaseLock();
  }
};
_executePoll = new WeakSet();
executePoll_fn = async function() {
  await __privateMethod(this, _updateRates, updateRates_fn).call(this);
};
_updateRates = new WeakSet();
updateRates_fn = async function() {
  await __privateMethod(this, _withLock, withLock_fn).call(this, async () => {
    const { fiatCurrency, cryptocurrencies } = this.state;
    const response = await __privateGet(this, _fetchMultiExchangeRate).call(this, fiatCurrency, cryptocurrencies, __privateGet(this, _includeUsdRate));
    const updatedRates = {};
    for (const [cryptocurrency, values] of Object.entries(response)) {
      updatedRates[cryptocurrency] = {
        conversionDate: Date.now(),
        conversionRate: values[fiatCurrency],
        ...__privateGet(this, _includeUsdRate) && { usdConversionRate: values.usd }
      };
    }
    this.update(() => {
      return {
        ...this.state,
        rates: updatedRates
      };
    });
  });
};

export {
  name,
  Cryptocurrency,
  RatesController
};
//# sourceMappingURL=chunk-SBWPU4VT.mjs.map