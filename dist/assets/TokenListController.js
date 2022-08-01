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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenListController = void 0;
const async_mutex_1 = require("async-mutex");
const abort_controller_1 = require("abort-controller");
const BaseControllerV2_1 = require("../BaseControllerV2");
const util_1 = require("../util");
const token_service_1 = require("../apis/token-service");
const assetsUtil_1 = require("./assetsUtil");
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
class TokenListController extends BaseControllerV2_1.BaseController {
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
        this.mutex = new async_mutex_1.Mutex();
        this.intervalDelay = interval;
        this.cacheRefreshThreshold = cacheRefreshThreshold;
        this.chainId = chainId;
        this.updatePreventPollingOnNetworkRestart(preventPollingOnNetworkRestart);
        this.abortController = new abort_controller_1.AbortController();
        onNetworkStateChange((networkState) => __awaiter(this, void 0, void 0, function* () {
            if (this.chainId !== networkState.provider.chainId) {
                this.abortController.abort();
                this.abortController = new abort_controller_1.AbortController();
                this.chainId = networkState.provider.chainId;
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
        }));
    }
    /**
     * Start polling for the token list.
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(0, util_1.isTokenListSupportedForNetwork)(this.chainId)) {
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
            yield (0, util_1.safelyExecute)(() => this.fetchTokenList());
            this.intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                yield (0, util_1.safelyExecute)(() => this.fetchTokenList());
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
                const cachedTokens = yield (0, util_1.safelyExecute)(() => this.fetchFromCache());
                if (cachedTokens) {
                    // Use non-expired cached tokens
                    tokenList = Object.assign({}, cachedTokens);
                }
                else {
                    // Fetch fresh token list
                    const tokensFromAPI = yield (0, util_1.safelyExecute)(() => (0, token_service_1.fetchTokenList)(this.chainId, this.abortController.signal));
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
exports.default = TokenListController;
//# sourceMappingURL=TokenListController.js.map