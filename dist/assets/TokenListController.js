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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenListController = void 0;
const async_mutex_1 = require("async-mutex");
const BaseControllerV2_1 = require("../BaseControllerV2");
const util_1 = require("../util");
const token_service_1 = require("../apis/token-service");
const DEFAULT_INTERVAL = 60 * 60 * 1000;
const DEFAULT_THRESHOLD = 60 * 30 * 1000;
const name = 'TokenListController';
const metadata = {
    tokenList: { persist: true, anonymous: true },
    tokensChainsCache: { persist: true, anonymous: true },
};
const defaultState = {
    tokenList: {},
    tokensChainsCache: {},
};
/**
 * Controller that passively polls on a set interval for the list of tokens from metaswaps api
 */
class TokenListController extends BaseControllerV2_1.BaseController {
    /**
     * Creates a TokenListController instance
     *
     * @param options - Constructor options
     * @param options.interval - The polling interval, in milliseconds
     * @param options.messenger - A reference to the messaging system
     * @param options.state - Initial state to set on this controller
     */
    constructor({ chainId, onNetworkStateChange, interval = DEFAULT_INTERVAL, cacheRefreshThreshold = DEFAULT_THRESHOLD, messenger, state, }) {
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
        onNetworkStateChange((networkState) => __awaiter(this, void 0, void 0, function* () {
            this.chainId = networkState.provider.chainId;
            yield util_1.safelyExecute(() => this.fetchTokenList());
        }));
    }
    /**
     * Start polling for the token list
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.startPolling();
        });
    }
    /**
     * Stop polling for the token list
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
     * Starts a new polling interval
     */
    startPolling() {
        return __awaiter(this, void 0, void 0, function* () {
            yield util_1.safelyExecute(() => this.fetchTokenList());
            this.intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                yield util_1.safelyExecute(() => this.fetchTokenList());
            }), this.intervalDelay);
        });
    }
    /**
     * Fetching token list from the Token Service API
     */
    fetchTokenList() {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            try {
                const tokensFromAPI = yield util_1.safelyExecute(() => this.fetchFromCache());
                const { tokensChainsCache } = this.state;
                const tokenList = {};
                // filtering out tokens with less than 2 occurences
                const filteredTokenList = tokensFromAPI.filter((token) => token.occurrences >= 2);
                // removing the tokens with symbol conflicts
                const symbolsList = filteredTokenList.map((token) => token.symbol);
                const duplicateSymbols = [
                    ...new Set(symbolsList.filter((symbol, index) => symbolsList.indexOf(symbol) !== index)),
                ];
                const uniqueTokenList = filteredTokenList.filter((token) => !duplicateSymbols.includes(token.symbol));
                for (const token of uniqueTokenList) {
                    tokenList[token.address] = token;
                }
                this.update(() => {
                    return {
                        tokenList,
                        tokensChainsCache,
                    };
                });
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Checks if the Cache timestamp is valid,
     *  if yes data in cache will be returned
     *  otherwise a call to the API service will be made.
     * @returns Promise that resolves into a TokenList
     */
    fetchFromCache() {
        return __awaiter(this, void 0, void 0, function* () {
            const _a = this.state, { tokensChainsCache } = _a, tokensData = __rest(_a, ["tokensChainsCache"]);
            const dataCache = tokensChainsCache[this.chainId];
            const now = Date.now();
            if ((dataCache === null || dataCache === void 0 ? void 0 : dataCache.data) &&
                now - (dataCache === null || dataCache === void 0 ? void 0 : dataCache.timestamp) < this.cacheRefreshThreshold) {
                return dataCache.data;
            }
            const tokenList = yield util_1.safelyExecute(() => token_service_1.fetchTokenList(this.chainId));
            const updatedTokensChainsCache = Object.assign(Object.assign({}, tokensChainsCache), { [this.chainId]: {
                    timestamp: Date.now(),
                    data: tokenList,
                } });
            this.update(() => {
                return Object.assign(Object.assign({}, tokensData), { tokensChainsCache: updatedTokensChainsCache });
            });
            return tokenList;
        });
    }
    /**
     * Calls the API to sync the tokens in the token service
     */
    syncTokens() {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            try {
                yield util_1.safelyExecute(() => token_service_1.syncTokens(this.chainId));
                const { tokenList, tokensChainsCache } = this.state;
                const updatedTokensChainsCache = Object.assign(Object.assign({}, tokensChainsCache), { [this.chainId]: {
                        timestamp: 0,
                        data: [],
                    } });
                this.update(() => {
                    return {
                        tokenList,
                        tokensChainsCache: updatedTokensChainsCache,
                    };
                });
            }
            finally {
                releaseLock();
            }
        });
    }
    /**
     * Fetch metadata for a token whose address is send to the API
     * @param tokenAddress
     * @returns Promise that resolvesto Token Metadata
     */
    fetchTokenMetadata(tokenAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            try {
                const token = yield util_1.safelyExecute(() => token_service_1.fetchTokenMetadata(this.chainId, tokenAddress));
                return token;
            }
            finally {
                releaseLock();
            }
        });
    }
}
exports.TokenListController = TokenListController;
exports.default = TokenListController;
//# sourceMappingURL=TokenListController.js.map