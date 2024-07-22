"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkK7A3EOIMjs = require('./chunk-K7A3EOIM.js');




var _chunkMZI3SDQNjs = require('./chunk-MZI3SDQN.js');



var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/TokenListController.ts
var _controllerutils = require('@metamask/controller-utils');
var _pollingcontroller = require('@metamask/polling-controller');
var _asyncmutex = require('async-mutex');
var DEFAULT_INTERVAL = 24 * 60 * 60 * 1e3;
var DEFAULT_THRESHOLD = 24 * 60 * 60 * 1e3;
var name = "TokenListController";
var metadata = {
  tokenList: { persist: true, anonymous: true },
  tokensChainsCache: { persist: true, anonymous: true },
  preventPollingOnNetworkRestart: { persist: true, anonymous: true }
};
var getDefaultTokenListState = () => {
  return {
    tokenList: {},
    tokensChainsCache: {},
    preventPollingOnNetworkRestart: false
  };
};
var _onNetworkControllerStateChange, onNetworkControllerStateChange_fn, _fetchFromCache, fetchFromCache_fn;
var TokenListController = class extends _pollingcontroller.StaticIntervalPollingController {
  /**
   * Creates a TokenListController instance.
   *
   * @param options - The controller options.
   * @param options.chainId - The chain ID of the current network.
   * @param options.onNetworkStateChange - A function for registering an event handler for network state changes.
   * @param options.interval - The polling interval, in milliseconds.
   * @param options.cacheRefreshThreshold - The token cache expiry time, in milliseconds.
   * @param options.messenger - A restricted controller messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.preventPollingOnNetworkRestart - Determines whether to prevent poilling on network restart in extension.
   */
  constructor({
    chainId,
    preventPollingOnNetworkRestart = false,
    onNetworkStateChange,
    interval = DEFAULT_INTERVAL,
    cacheRefreshThreshold = DEFAULT_THRESHOLD,
    messenger,
    state
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...getDefaultTokenListState(), ...state }
    });
    /**
     * Updates state and restarts polling on changes to the network controller
     * state.
     *
     * @param networkControllerState - The updated network controller state.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onNetworkControllerStateChange);
    /**
     * Checks if the Cache timestamp is valid,
     * if yes data in cache will be returned
     * otherwise null will be returned.
     * @param chainId - The chain ID of the network for which to fetch the cache.
     * @returns The cached data, or `null` if the cache was expired.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _fetchFromCache);
    this.mutex = new (0, _asyncmutex.Mutex)();
    this.intervalDelay = interval;
    this.cacheRefreshThreshold = cacheRefreshThreshold;
    this.chainId = chainId;
    this.updatePreventPollingOnNetworkRestart(preventPollingOnNetworkRestart);
    this.abortController = new AbortController();
    if (onNetworkStateChange) {
      onNetworkStateChange(async (networkControllerState) => {
        await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onNetworkControllerStateChange, onNetworkControllerStateChange_fn).call(this, networkControllerState);
      });
    } else {
      this.messagingSystem.subscribe(
        "NetworkController:stateChange",
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async (networkControllerState) => {
          await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onNetworkControllerStateChange, onNetworkControllerStateChange_fn).call(this, networkControllerState);
        }
      );
    }
  }
  /**
   * Start polling for the token list.
   */
  async start() {
    if (!_chunkMZI3SDQNjs.isTokenListSupportedForNetwork.call(void 0, this.chainId)) {
      return;
    }
    await this.startPolling();
  }
  /**
   * Restart polling for the token list.
   */
  async restart() {
    this.stopPolling();
    await this.startPolling();
  }
  /**
   * Stop polling for the token list.
   */
  stop() {
    this.stopPolling();
  }
  /**
   * Prepare to discard this controller.
   *
   * This stops any active polling.
   */
  destroy() {
    super.destroy();
    this.stopPolling();
  }
  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
  /**
   * Starts a new polling interval.
   */
  async startPolling() {
    await _controllerutils.safelyExecute.call(void 0, () => this.fetchTokenList());
    this.intervalId = setInterval(async () => {
      await _controllerutils.safelyExecute.call(void 0, () => this.fetchTokenList());
    }, this.intervalDelay);
  }
  /**
   * Fetching token list from the Token Service API.
   *
   * @private
   * @param networkClientId - The ID of the network client triggering the fetch.
   * @returns A promise that resolves when this operation completes.
   */
  async _executePoll(networkClientId) {
    return this.fetchTokenList(networkClientId);
  }
  /**
   * Fetching token list from the Token Service API.
   *
   * @param networkClientId - The ID of the network client triggering the fetch.
   */
  async fetchTokenList(networkClientId) {
    const releaseLock = await this.mutex.acquire();
    let networkClient;
    if (networkClientId) {
      networkClient = this.messagingSystem.call(
        "NetworkController:getNetworkClientById",
        networkClientId
      );
    }
    const chainId = networkClient?.configuration.chainId ?? this.chainId;
    try {
      const { tokensChainsCache } = this.state;
      let tokenList = {};
      const cachedTokens = await _controllerutils.safelyExecute.call(void 0, 
        () => _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _fetchFromCache, fetchFromCache_fn).call(this, chainId)
      );
      if (cachedTokens) {
        tokenList = { ...cachedTokens };
      } else {
        const tokensFromAPI = await _controllerutils.safelyExecute.call(void 0, 
          () => _chunkK7A3EOIMjs.fetchTokenListByChainId.call(void 0, 
            chainId,
            this.abortController.signal
          )
        );
        if (!tokensFromAPI) {
          tokenList = { ...tokensChainsCache[chainId]?.data || {} };
          this.update(() => {
            return {
              ...this.state,
              tokenList,
              tokensChainsCache
            };
          });
          return;
        }
        for (const token of tokensFromAPI) {
          const formattedToken = {
            ...token,
            aggregators: _chunkMZI3SDQNjs.formatAggregatorNames.call(void 0, token.aggregators),
            iconUrl: _chunkMZI3SDQNjs.formatIconUrlWithProxy.call(void 0, {
              chainId,
              tokenAddress: token.address
            })
          };
          tokenList[token.address] = formattedToken;
        }
      }
      const updatedTokensChainsCache = {
        ...tokensChainsCache,
        [chainId]: {
          timestamp: Date.now(),
          data: tokenList
        }
      };
      this.update(() => {
        return {
          ...this.state,
          tokenList,
          tokensChainsCache: updatedTokensChainsCache
        };
      });
    } finally {
      releaseLock();
    }
  }
  /**
   * Clearing tokenList and tokensChainsCache explicitly.
   */
  clearingTokenListData() {
    this.update(() => {
      return {
        ...this.state,
        tokenList: {},
        tokensChainsCache: {}
      };
    });
  }
  /**
   * Updates preventPollingOnNetworkRestart from extension.
   *
   * @param shouldPreventPolling - Determine whether to prevent polling on network change
   */
  updatePreventPollingOnNetworkRestart(shouldPreventPolling) {
    this.update(() => {
      return {
        ...this.state,
        preventPollingOnNetworkRestart: shouldPreventPolling
      };
    });
  }
};
_onNetworkControllerStateChange = new WeakSet();
onNetworkControllerStateChange_fn = async function(networkControllerState) {
  const selectedNetworkClient = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    networkControllerState.selectedNetworkClientId
  );
  const { chainId } = selectedNetworkClient.configuration;
  if (this.chainId !== chainId) {
    this.abortController.abort();
    this.abortController = new AbortController();
    this.chainId = chainId;
    if (this.state.preventPollingOnNetworkRestart) {
      this.clearingTokenListData();
    } else {
      this.update(() => {
        return {
          ...this.state,
          tokenList: this.state.tokensChainsCache[this.chainId]?.data || {}
        };
      });
      await this.restart();
    }
  }
};
_fetchFromCache = new WeakSet();
fetchFromCache_fn = async function(chainId) {
  const { tokensChainsCache } = this.state;
  const dataCache = tokensChainsCache[chainId];
  const now = Date.now();
  if (dataCache?.data && now - dataCache?.timestamp < this.cacheRefreshThreshold) {
    return dataCache.data;
  }
  return null;
};
var TokenListController_default = TokenListController;





exports.getDefaultTokenListState = getDefaultTokenListState; exports.TokenListController = TokenListController; exports.TokenListController_default = TokenListController_default;
//# sourceMappingURL=chunk-ZAR4BIOC.js.map