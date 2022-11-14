"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _TokenListController_instances, _TokenListController_onNetworkStateChangeCallback;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenListController = void 0;
const async_mutex_1 = require("async-mutex");
const abort_controller_1 = require("abort-controller");
const base_controller_1 = require("@metamask/base-controller");
const controller_utils_1 = require("@metamask/controller-utils");
const assetsUtil_1 = require("./assetsUtil");
const token_service_1 = require("./token-service");
const DEFAULT_INTERVAL = 24 * 60 * 60 * 1000;
const DEFAULT_THRESHOLD = 24 * 60 * 60 * 1000;
const name = 'TokenListController';
const metadata = {
    tokenList: { persist: true, anonymous: true },
    tokensChainsCache: { persist: true, anonymous: true },
    preventPollingOnNetworkRestart: { persist: true, anonymous: true },
};
const defaultState = {
    tokenList: {},
    tokensChainsCache: {},
    preventPollingOnNetworkRestart: false,
};
/**
 * Controller that passively polls on a set interval for the list of tokens from metaswaps api
 */
class TokenListController extends base_controller_1.BaseControllerV2 {
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
    constructor({ chainId, preventPollingOnNetworkRestart = false, onNetworkStateChange, interval = DEFAULT_INTERVAL, cacheRefreshThreshold = DEFAULT_THRESHOLD, messenger, state, }) {
        super({
            name,
            metadata,
            messenger,
            state: Object.assign(Object.assign({}, defaultState), state),
        });
        _TokenListController_instances.add(this);
        this.mutex = new async_mutex_1.Mutex();
        this.intervalDelay = interval;
        this.cacheRefreshThreshold = cacheRefreshThreshold;
        this.chainId = chainId;
        this.updatePreventPollingOnNetworkRestart(preventPollingOnNetworkRestart);
        this.abortController = new abort_controller_1.AbortController();
        if (onNetworkStateChange) {
            onNetworkStateChange((networkStateOrProviderConfig) => __awaiter(this, void 0, void 0, function* () {
                // this check for "provider" is for testing purposes, since in the extension this callback will receive
                // an object typed as NetworkState but within repo we can only simulate as if the callback receives an
                // object typed as ProviderConfig
                if ('provider' in networkStateOrProviderConfig) {
                    yield __classPrivateFieldGet(this, _TokenListController_instances, "m", _TokenListController_onNetworkStateChangeCallback).call(this, networkStateOrProviderConfig.provider);
                }
                else {
                    yield __classPrivateFieldGet(this, _TokenListController_instances, "m", _TokenListController_onNetworkStateChangeCallback).call(this, networkStateOrProviderConfig);
                }
            }));
        }
        else {
            this.messagingSystem.subscribe('NetworkController:providerChange', (providerConfig) => __awaiter(this, void 0, void 0, function* () {
                yield __classPrivateFieldGet(this, _TokenListController_instances, "m", _TokenListController_onNetworkStateChangeCallback).call(this, providerConfig);
            }));
        }
    }
    /**
     * Start polling for the token list.
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(0, assetsUtil_1.isTokenListSupportedForNetwork)(this.chainId)) {
                return;
            }
            yield this.startPolling();
        });
    }
    /**
     * Restart polling for the token list.
     */
    restart() {
        return __awaiter(this, void 0, void 0, function* () {
            this.stopPolling();
            yield this.startPolling();
        });
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
    startPolling() {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, controller_utils_1.safelyExecute)(() => this.fetchTokenList());
            this.intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                yield (0, controller_utils_1.safelyExecute)(() => this.fetchTokenList());
            }), this.intervalDelay);
        });
    }
    /**
     * Fetching token list from the Token Service API.
     */
    fetchTokenList() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            try {
                const { tokensChainsCache } = this.state;
                let tokenList = {};
                const cachedTokens = yield (0, controller_utils_1.safelyExecute)(() => this.fetchFromCache());
                if (cachedTokens) {
                    // Use non-expired cached tokens
                    tokenList = Object.assign({}, cachedTokens);
                }
                else {
                    // Fetch fresh token list
                    const tokensFromAPI = yield (0, controller_utils_1.safelyExecute)(() => (0, token_service_1.fetchTokenList)(this.chainId, this.abortController.signal));
                    if (!tokensFromAPI) {
                        // Fallback to expired cached tokens
                        tokenList = Object.assign({}, (((_a = tokensChainsCache[this.chainId]) === null || _a === void 0 ? void 0 : _a.data) || {}));
                        this.update(() => {
                            return Object.assign(Object.assign({}, this.state), { tokenList,
                                tokensChainsCache });
                        });
                        return;
                    }
                    // Filtering out tokens with less than 3 occurrences and native tokens
                    const filteredTokenList = tokensFromAPI.filter((token) => token.occurrences &&
                        token.occurrences >= 3 &&
                        token.address !== '0x0000000000000000000000000000000000000000');
                    // Removing the tokens with symbol conflicts
                    const symbolsList = filteredTokenList.map((token) => token.symbol);
                    const duplicateSymbols = [
                        ...new Set(symbolsList.filter((symbol, index) => symbolsList.indexOf(symbol) !== index)),
                    ];
                    const uniqueTokenList = filteredTokenList.filter((token) => !duplicateSymbols.includes(token.symbol));
                    for (const token of uniqueTokenList) {
                        const formattedToken = Object.assign(Object.assign({}, token), { aggregators: (0, assetsUtil_1.formatAggregatorNames)(token.aggregators), iconUrl: (0, assetsUtil_1.formatIconUrlWithProxy)({
                                chainId: this.chainId,
                                tokenAddress: token.address,
                            }) });
                        tokenList[token.address] = formattedToken;
                    }
                }
                const updatedTokensChainsCache = Object.assign(Object.assign({}, tokensChainsCache), { [this.chainId]: {
                        timestamp: Date.now(),
                        data: tokenList,
                    } });
                this.update(() => {
                    return Object.assign(Object.assign({}, this.state), { tokenList, tokensChainsCache: updatedTokensChainsCache });
                });
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Checks if the Cache timestamp is valid,
     * if yes data in cache will be returned
     * otherwise null will be returned.
     *
     * @returns The cached data, or `null` if the cache was expired.
     */
    fetchFromCache() {
        return __awaiter(this, void 0, void 0, function* () {
            const { tokensChainsCache } = this.state;
            const dataCache = tokensChainsCache[this.chainId];
            const now = Date.now();
            if ((dataCache === null || dataCache === void 0 ? void 0 : dataCache.data) &&
                now - (dataCache === null || dataCache === void 0 ? void 0 : dataCache.timestamp) < this.cacheRefreshThreshold) {
                return dataCache.data;
            }
            return null;
        });
    }
    /**
     * Clearing tokenList and tokensChainsCache explicitly.
     */
    clearingTokenListData() {
        this.update(() => {
            return Object.assign(Object.assign({}, this.state), { tokenList: {}, tokensChainsCache: {} });
        });
    }
    /**
     * Updates preventPollingOnNetworkRestart from extension.
     *
     * @param shouldPreventPolling - Determine whether to prevent polling on network change
     */
    updatePreventPollingOnNetworkRestart(shouldPreventPolling) {
        this.update(() => {
            return Object.assign(Object.assign({}, this.state), { preventPollingOnNetworkRestart: shouldPreventPolling });
        });
    }
}
exports.TokenListController = TokenListController;
_TokenListController_instances = new WeakSet(), _TokenListController_onNetworkStateChangeCallback = function _TokenListController_onNetworkStateChangeCallback(providerConfig) {
    return __awaiter(this, void 0, void 0, function* () {
        if (this.chainId !== providerConfig.chainId) {
            this.abortController.abort();
            this.abortController = new abort_controller_1.AbortController();
            this.chainId = providerConfig.chainId;
            if (this.state.preventPollingOnNetworkRestart) {
                this.clearingTokenListData();
            }
            else {
                // Ensure tokenList is referencing data from correct network
                this.update(() => {
                    var _a;
                    return Object.assign(Object.assign({}, this.state), { tokenList: ((_a = this.state.tokensChainsCache[this.chainId]) === null || _a === void 0 ? void 0 : _a.data) || {} });
                });
                yield this.restart();
            }
        }
    });
};
exports.default = TokenListController;
//# sourceMappingURL=TokenListController.js.map