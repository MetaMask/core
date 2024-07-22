import {
  ZERO_ADDRESS
} from "./chunk-XQO3EG4J.mjs";
import {
  fetchExchangeRate
} from "./chunk-JTXPJ6TK.mjs";
import {
  TOKEN_PRICES_BATCH_SIZE,
  reduceInBatchesSerially
} from "./chunk-BZEAPSD5.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/TokenRatesController.ts
import {
  safelyExecute,
  toChecksumHexAddress,
  FALL_BACK_VS_CURRENCY,
  toHex
} from "@metamask/controller-utils";
import { StaticIntervalPollingController } from "@metamask/polling-controller";
import { createDeferredPromise } from "@metamask/utils";
import { isEqual } from "lodash";
var DEFAULT_INTERVAL = 18e4;
var controllerName = "TokenRatesController";
async function getCurrencyConversionRate({
  from,
  to
}) {
  const includeUSDRate = false;
  try {
    const result = await fetchExchangeRate(
      to,
      from,
      includeUSDRate
    );
    return result.conversionRate;
  } catch (error) {
    if (error instanceof Error && error.message.includes("market does not exist for this coin pair")) {
      return null;
    }
    throw error;
  }
}
var tokenRatesControllerMetadata = {
  marketData: { persist: true, anonymous: false }
};
var getDefaultTokenRatesControllerState = () => {
  return {
    marketData: {}
  };
};
var _handle, _pollState, _tokenPricesService, _inProcessExchangeRateUpdates, _selectedAccountId, _disabled, _chainId, _ticker, _interval, _allTokens, _allDetectedTokens, _subscribeToTokensStateChange, subscribeToTokensStateChange_fn, _subscribeToNetworkStateChange, subscribeToNetworkStateChange_fn, _subscribeToAccountChange, subscribeToAccountChange_fn, _getTokenAddresses, getTokenAddresses_fn, _getSelectedAccount, getSelectedAccount_fn, _getChainIdAndTicker, getChainIdAndTicker_fn, _getTokensControllerState, getTokensControllerState_fn, _stopPoll, stopPoll_fn, _poll, poll_fn, _fetchAndMapExchangeRates, fetchAndMapExchangeRates_fn, _fetchAndMapExchangeRatesForSupportedNativeCurrency, fetchAndMapExchangeRatesForSupportedNativeCurrency_fn, _fetchAndMapExchangeRatesForUnsupportedNativeCurrency, fetchAndMapExchangeRatesForUnsupportedNativeCurrency_fn;
var TokenRatesController = class extends StaticIntervalPollingController {
  /**
   * Creates a TokenRatesController instance.
   *
   * @param options - The controller options.
   * @param options.interval - The polling interval in ms
   * @param options.disabled - Boolean to track if network requests are blocked
   * @param options.tokenPricesService - An object in charge of retrieving token price
   * @param options.messenger - The controller messenger instance for communication
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    disabled = false,
    tokenPricesService,
    messenger,
    state
  }) {
    super({
      name: controllerName,
      messenger,
      state: { ...getDefaultTokenRatesControllerState(), ...state },
      metadata: tokenRatesControllerMetadata
    });
    __privateAdd(this, _subscribeToTokensStateChange);
    __privateAdd(this, _subscribeToNetworkStateChange);
    __privateAdd(this, _subscribeToAccountChange);
    /**
     * Get the user's tokens for the given chain.
     *
     * @param chainId - The chain ID.
     * @returns The list of tokens addresses for the current chain
     */
    __privateAdd(this, _getTokenAddresses);
    __privateAdd(this, _getSelectedAccount);
    __privateAdd(this, _getChainIdAndTicker);
    __privateAdd(this, _getTokensControllerState);
    /**
     * Clear the active polling timer, if present.
     */
    __privateAdd(this, _stopPoll);
    /**
     * Poll for exchange rate updates.
     */
    __privateAdd(this, _poll);
    /**
     * Uses the token prices service to retrieve exchange rates for tokens in a
     * particular currency.
     *
     * If the price API does not support the given chain ID, returns an empty
     * object.
     *
     * If the price API does not support the given currency, retrieves exchange
     * rates in a known currency instead, then converts those rates using the
     * exchange rate between the known currency and desired currency.
     *
     * @param args - The arguments to this function.
     * @param args.tokenAddresses - Addresses for tokens.
     * @param args.chainId - The EIP-155 ID of the chain where the tokens live.
     * @param args.nativeCurrency - The native currency in which to request
     * exchange rates.
     * @returns A map from token address to its exchange rate in the native
     * currency, or an empty map if no exchange rates can be obtained for the
     * chain ID.
     */
    __privateAdd(this, _fetchAndMapExchangeRates);
    /**
     * Retrieves prices in the given currency for the given tokens on the given
     * chain. Ensures that token addresses are checksum addresses.
     *
     * @param args - The arguments to this function.
     * @param args.tokenAddresses - Addresses for tokens.
     * @param args.chainId - The EIP-155 ID of the chain where the tokens live.
     * @param args.nativeCurrency - The native currency in which to request
     * prices.
     * @returns A map of the token addresses (as checksums) to their prices in the
     * native currency.
     */
    __privateAdd(this, _fetchAndMapExchangeRatesForSupportedNativeCurrency);
    /**
     * If the price API does not support a given native currency, then we need to
     * convert it to a fallback currency and feed that currency into the price
     * API, then convert the prices to our desired native currency.
     *
     * @param args - The arguments to this function.
     * @param args.tokenAddresses - Addresses for tokens.
     * @param args.nativeCurrency - The native currency in which to request
     * prices.
     * @returns A map of the token addresses (as checksums) to their prices in the
     * native currency.
     */
    __privateAdd(this, _fetchAndMapExchangeRatesForUnsupportedNativeCurrency);
    __privateAdd(this, _handle, void 0);
    __privateAdd(this, _pollState, "Inactive" /* Inactive */);
    __privateAdd(this, _tokenPricesService, void 0);
    __privateAdd(this, _inProcessExchangeRateUpdates, {});
    __privateAdd(this, _selectedAccountId, void 0);
    __privateAdd(this, _disabled, void 0);
    __privateAdd(this, _chainId, void 0);
    __privateAdd(this, _ticker, void 0);
    __privateAdd(this, _interval, void 0);
    __privateAdd(this, _allTokens, void 0);
    __privateAdd(this, _allDetectedTokens, void 0);
    this.setIntervalLength(interval);
    __privateSet(this, _tokenPricesService, tokenPricesService);
    __privateSet(this, _disabled, disabled);
    __privateSet(this, _interval, interval);
    const { chainId: currentChainId, ticker: currentTicker } = __privateMethod(this, _getChainIdAndTicker, getChainIdAndTicker_fn).call(this);
    __privateSet(this, _chainId, currentChainId);
    __privateSet(this, _ticker, currentTicker);
    __privateSet(this, _selectedAccountId, __privateMethod(this, _getSelectedAccount, getSelectedAccount_fn).call(this).id);
    const { allTokens, allDetectedTokens } = __privateMethod(this, _getTokensControllerState, getTokensControllerState_fn).call(this);
    __privateSet(this, _allTokens, allTokens);
    __privateSet(this, _allDetectedTokens, allDetectedTokens);
    __privateMethod(this, _subscribeToTokensStateChange, subscribeToTokensStateChange_fn).call(this);
    __privateMethod(this, _subscribeToNetworkStateChange, subscribeToNetworkStateChange_fn).call(this);
    __privateMethod(this, _subscribeToAccountChange, subscribeToAccountChange_fn).call(this);
  }
  /**
   * Allows controller to make active and passive polling requests
   */
  enable() {
    __privateSet(this, _disabled, false);
  }
  /**
   * Blocks controller from making network calls
   */
  disable() {
    __privateSet(this, _disabled, true);
  }
  /**
   * Start (or restart) polling.
   */
  async start() {
    __privateMethod(this, _stopPoll, stopPoll_fn).call(this);
    __privateSet(this, _pollState, "Active" /* Active */);
    await __privateMethod(this, _poll, poll_fn).call(this);
  }
  /**
   * Stop polling.
   */
  stop() {
    __privateMethod(this, _stopPoll, stopPoll_fn).call(this);
    __privateSet(this, _pollState, "Inactive" /* Inactive */);
  }
  /**
   * Updates exchange rates for all tokens.
   */
  async updateExchangeRates() {
    await this.updateExchangeRatesByChainId({
      chainId: __privateGet(this, _chainId),
      nativeCurrency: __privateGet(this, _ticker)
    });
  }
  /**
   * Updates exchange rates for all tokens.
   *
   * @param options - The options to fetch exchange rates.
   * @param options.chainId - The chain ID.
   * @param options.nativeCurrency - The ticker for the chain.
   */
  async updateExchangeRatesByChainId({
    chainId,
    nativeCurrency
  }) {
    if (__privateGet(this, _disabled)) {
      return;
    }
    const tokenAddresses = __privateMethod(this, _getTokenAddresses, getTokenAddresses_fn).call(this, chainId);
    const updateKey = `${chainId}:${nativeCurrency}`;
    if (updateKey in __privateGet(this, _inProcessExchangeRateUpdates)) {
      await __privateGet(this, _inProcessExchangeRateUpdates)[updateKey];
      return;
    }
    const {
      promise: inProgressUpdate,
      resolve: updateSucceeded,
      reject: updateFailed
    } = createDeferredPromise({ suppressUnhandledRejection: true });
    __privateGet(this, _inProcessExchangeRateUpdates)[updateKey] = inProgressUpdate;
    try {
      const contractInformations = await __privateMethod(this, _fetchAndMapExchangeRates, fetchAndMapExchangeRates_fn).call(this, {
        tokenAddresses,
        chainId,
        nativeCurrency
      });
      const marketData = {
        [chainId]: {
          ...contractInformations ?? {}
        }
      };
      this.update((state) => {
        state.marketData = marketData;
      });
      updateSucceeded();
    } catch (error) {
      updateFailed(error);
      throw error;
    } finally {
      delete __privateGet(this, _inProcessExchangeRateUpdates)[updateKey];
    }
  }
  /**
   * Updates token rates for the given networkClientId
   *
   * @param networkClientId - The network client ID used to get a ticker value.
   * @returns The controller state.
   */
  async _executePoll(networkClientId) {
    const networkClient = this.messagingSystem.call(
      "NetworkController:getNetworkClientById",
      networkClientId
    );
    await this.updateExchangeRatesByChainId({
      chainId: networkClient.configuration.chainId,
      nativeCurrency: networkClient.configuration.ticker
    });
  }
};
_handle = new WeakMap();
_pollState = new WeakMap();
_tokenPricesService = new WeakMap();
_inProcessExchangeRateUpdates = new WeakMap();
_selectedAccountId = new WeakMap();
_disabled = new WeakMap();
_chainId = new WeakMap();
_ticker = new WeakMap();
_interval = new WeakMap();
_allTokens = new WeakMap();
_allDetectedTokens = new WeakMap();
_subscribeToTokensStateChange = new WeakSet();
subscribeToTokensStateChange_fn = function() {
  this.messagingSystem.subscribe(
    "TokensController:stateChange",
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async ({ allTokens, allDetectedTokens }) => {
      const previousTokenAddresses = __privateMethod(this, _getTokenAddresses, getTokenAddresses_fn).call(this, __privateGet(this, _chainId));
      __privateSet(this, _allTokens, allTokens);
      __privateSet(this, _allDetectedTokens, allDetectedTokens);
      const newTokenAddresses = __privateMethod(this, _getTokenAddresses, getTokenAddresses_fn).call(this, __privateGet(this, _chainId));
      if (!isEqual(previousTokenAddresses, newTokenAddresses) && __privateGet(this, _pollState) === "Active" /* Active */) {
        await this.updateExchangeRates();
      }
    },
    ({ allTokens, allDetectedTokens }) => {
      return { allTokens, allDetectedTokens };
    }
  );
};
_subscribeToNetworkStateChange = new WeakSet();
subscribeToNetworkStateChange_fn = function() {
  this.messagingSystem.subscribe(
    "NetworkController:stateChange",
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async ({ selectedNetworkClientId }) => {
      const {
        configuration: { chainId, ticker }
      } = this.messagingSystem.call(
        "NetworkController:getNetworkClientById",
        selectedNetworkClientId
      );
      if (__privateGet(this, _chainId) !== chainId || __privateGet(this, _ticker) !== ticker) {
        this.update((state) => {
          state.marketData = {};
        });
        __privateSet(this, _chainId, chainId);
        __privateSet(this, _ticker, ticker);
        if (__privateGet(this, _pollState) === "Active" /* Active */) {
          await this.updateExchangeRates();
        }
      }
    }
  );
};
_subscribeToAccountChange = new WeakSet();
subscribeToAccountChange_fn = function() {
  this.messagingSystem.subscribe(
    "AccountsController:selectedEvmAccountChange",
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (selectedAccount) => {
      if (__privateGet(this, _selectedAccountId) !== selectedAccount.id) {
        __privateSet(this, _selectedAccountId, selectedAccount.id);
        if (__privateGet(this, _pollState) === "Active" /* Active */) {
          await this.updateExchangeRates();
        }
      }
    }
  );
};
_getTokenAddresses = new WeakSet();
getTokenAddresses_fn = function(chainId) {
  const selectedAccount = this.messagingSystem.call(
    "AccountsController:getAccount",
    __privateGet(this, _selectedAccountId)
  );
  const selectedAddress = selectedAccount?.address ?? "";
  const tokens = __privateGet(this, _allTokens)[chainId]?.[selectedAddress] || [];
  const detectedTokens = __privateGet(this, _allDetectedTokens)[chainId]?.[selectedAddress] || [];
  return [
    ...new Set(
      [...tokens, ...detectedTokens].map(
        (token) => toHex(toChecksumHexAddress(token.address))
      )
    )
  ].sort();
};
_getSelectedAccount = new WeakSet();
getSelectedAccount_fn = function() {
  const selectedAccount = this.messagingSystem.call(
    "AccountsController:getSelectedAccount"
  );
  return selectedAccount;
};
_getChainIdAndTicker = new WeakSet();
getChainIdAndTicker_fn = function() {
  const { selectedNetworkClientId } = this.messagingSystem.call(
    "NetworkController:getState"
  );
  const networkClient = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    selectedNetworkClientId
  );
  return {
    chainId: networkClient.configuration.chainId,
    ticker: networkClient.configuration.ticker
  };
};
_getTokensControllerState = new WeakSet();
getTokensControllerState_fn = function() {
  const { allTokens, allDetectedTokens } = this.messagingSystem.call(
    "TokensController:getState"
  );
  return {
    allTokens,
    allDetectedTokens
  };
};
_stopPoll = new WeakSet();
stopPoll_fn = function() {
  if (__privateGet(this, _handle)) {
    clearTimeout(__privateGet(this, _handle));
  }
};
_poll = new WeakSet();
poll_fn = async function() {
  await safelyExecute(() => this.updateExchangeRates());
  __privateSet(this, _handle, setTimeout(() => {
    __privateMethod(this, _poll, poll_fn).call(this);
  }, __privateGet(this, _interval)));
};
_fetchAndMapExchangeRates = new WeakSet();
fetchAndMapExchangeRates_fn = async function({
  tokenAddresses,
  chainId,
  nativeCurrency
}) {
  if (!__privateGet(this, _tokenPricesService).validateChainIdSupported(chainId)) {
    return tokenAddresses.reduce((obj, tokenAddress) => {
      obj = {
        ...obj,
        [tokenAddress]: void 0
      };
      return obj;
    }, {});
  }
  if (__privateGet(this, _tokenPricesService).validateCurrencySupported(nativeCurrency)) {
    return await __privateMethod(this, _fetchAndMapExchangeRatesForSupportedNativeCurrency, fetchAndMapExchangeRatesForSupportedNativeCurrency_fn).call(this, {
      tokenAddresses,
      chainId,
      nativeCurrency
    });
  }
  return await __privateMethod(this, _fetchAndMapExchangeRatesForUnsupportedNativeCurrency, fetchAndMapExchangeRatesForUnsupportedNativeCurrency_fn).call(this, {
    tokenAddresses,
    nativeCurrency
  });
};
_fetchAndMapExchangeRatesForSupportedNativeCurrency = new WeakSet();
fetchAndMapExchangeRatesForSupportedNativeCurrency_fn = async function({
  tokenAddresses,
  chainId,
  nativeCurrency
}) {
  let contractNativeInformations;
  const tokenPricesByTokenAddress = await reduceInBatchesSerially({
    values: [...tokenAddresses].sort(),
    batchSize: TOKEN_PRICES_BATCH_SIZE,
    eachBatch: async (allTokenPricesByTokenAddress, batch) => {
      const tokenPricesByTokenAddressForBatch = await __privateGet(this, _tokenPricesService).fetchTokenPrices({
        tokenAddresses: batch,
        chainId,
        currency: nativeCurrency
      });
      return {
        ...allTokenPricesByTokenAddress,
        ...tokenPricesByTokenAddressForBatch
      };
    },
    initialResult: {}
  });
  contractNativeInformations = tokenPricesByTokenAddress;
  if (tokenAddresses.length === 0) {
    const contractNativeInformationsNative = await __privateGet(this, _tokenPricesService).fetchTokenPrices({
      tokenAddresses: [],
      chainId,
      currency: nativeCurrency
    });
    contractNativeInformations = {
      [ZERO_ADDRESS]: {
        currency: nativeCurrency,
        ...contractNativeInformationsNative[ZERO_ADDRESS]
      }
    };
  }
  return Object.entries(contractNativeInformations).reduce(
    (obj, [tokenAddress, token]) => {
      obj = {
        ...obj,
        [tokenAddress]: { ...token }
      };
      return obj;
    },
    {}
  );
};
_fetchAndMapExchangeRatesForUnsupportedNativeCurrency = new WeakSet();
fetchAndMapExchangeRatesForUnsupportedNativeCurrency_fn = async function({
  tokenAddresses,
  nativeCurrency
}) {
  const [
    contractExchangeInformations,
    fallbackCurrencyToNativeCurrencyConversionRate
  ] = await Promise.all([
    __privateMethod(this, _fetchAndMapExchangeRatesForSupportedNativeCurrency, fetchAndMapExchangeRatesForSupportedNativeCurrency_fn).call(this, {
      tokenAddresses,
      chainId: __privateGet(this, _chainId),
      nativeCurrency: FALL_BACK_VS_CURRENCY
    }),
    getCurrencyConversionRate({
      from: FALL_BACK_VS_CURRENCY,
      to: nativeCurrency
    })
  ]);
  if (fallbackCurrencyToNativeCurrencyConversionRate === null) {
    return {};
  }
  const updatedContractExchangeRates = Object.entries(
    contractExchangeInformations
  ).reduce((acc, [tokenAddress, token]) => {
    acc = {
      ...acc,
      [tokenAddress]: {
        ...token,
        price: token.price ? token.price * fallbackCurrencyToNativeCurrencyConversionRate : void 0
      }
    };
    return acc;
  }, {});
  return updatedContractExchangeRates;
};
var TokenRatesController_default = TokenRatesController;

export {
  controllerName,
  getDefaultTokenRatesControllerState,
  TokenRatesController,
  TokenRatesController_default
};
//# sourceMappingURL=chunk-CUFSPB7T.mjs.map