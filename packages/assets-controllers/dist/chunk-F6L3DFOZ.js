"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkZG5MS2TOjs = require('./chunk-ZG5MS2TO.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/RatesController/RatesController.ts
var _basecontroller = require('@metamask/base-controller');
var _asyncmutex = require('async-mutex');
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
var RatesController = class extends _basecontroller.BaseController {
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
    fetchMultiExchangeRate: fetchMultiExchangeRate2 = _chunkZG5MS2TOjs.fetchMultiExchangeRate
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
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _withLock);
    /**
     * Executes the polling operation to update rates.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _executePoll);
    /**
     * Updates the rates by fetching new data.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateRates);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _mutex, new (0, _asyncmutex.Mutex)());
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _fetchMultiExchangeRate, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _includeUsdRate, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _intervalLength, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _intervalId, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _includeUsdRate, includeUsdRate);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _fetchMultiExchangeRate, fetchMultiExchangeRate2);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _intervalLength, interval);
  }
  /**
   * Starts the polling process.
   */
  async start() {
    if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _intervalId)) {
      return;
    }
    this.messagingSystem.publish(`${name}:pollingStarted`);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _intervalId, setInterval(() => {
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _executePoll, executePoll_fn).call(this).catch(console.error);
    }, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _intervalLength)));
  }
  /**
   * Stops the polling process.
   */
  async stop() {
    if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _intervalId)) {
      return;
    }
    clearInterval(_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _intervalId));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _intervalId, void 0);
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
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _withLock, withLock_fn).call(this, () => {
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
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _withLock, withLock_fn).call(this, () => {
      this.update(() => {
        return {
          ...defaultState,
          fiatCurrency
        };
      });
    });
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateRates, updateRates_fn).call(this);
  }
};
_mutex = new WeakMap();
_fetchMultiExchangeRate = new WeakMap();
_includeUsdRate = new WeakMap();
_intervalLength = new WeakMap();
_intervalId = new WeakMap();
_withLock = new WeakSet();
withLock_fn = async function(callback) {
  const releaseLock = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _mutex).acquire();
  try {
    return callback();
  } finally {
    releaseLock();
  }
};
_executePoll = new WeakSet();
executePoll_fn = async function() {
  await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateRates, updateRates_fn).call(this);
};
_updateRates = new WeakSet();
updateRates_fn = async function() {
  await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _withLock, withLock_fn).call(this, async () => {
    const { fiatCurrency, cryptocurrencies } = this.state;
    const response = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _fetchMultiExchangeRate).call(this, fiatCurrency, cryptocurrencies, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _includeUsdRate));
    const updatedRates = {};
    for (const [cryptocurrency, values] of Object.entries(response)) {
      updatedRates[cryptocurrency] = {
        conversionDate: Date.now(),
        conversionRate: values[fiatCurrency],
        ..._chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _includeUsdRate) && { usdConversionRate: values.usd }
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





exports.name = name; exports.Cryptocurrency = Cryptocurrency; exports.RatesController = RatesController;
//# sourceMappingURL=chunk-F6L3DFOZ.js.map