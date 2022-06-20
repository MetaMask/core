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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenListController = void 0;
const contract_metadata_1 = __importDefault(require("@metamask/contract-metadata"));
const async_mutex_1 = require("async-mutex");
// eslint-disable-next-line import/no-named-as-default
const abort_controller_1 = __importDefault(require("abort-controller"));
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
    // private abortSignal: AbortSignal;
    /**
     * Creates a TokenListController instance.
     *
     * @param options - The controller options.
     * @param options.chainId - The chain ID of the current network.
     * @param options.useStaticTokenList - Indicates whether to use the static token list or not.
     * @param options.onNetworkStateChange - A function for registering an event handler for network state changes.
     * @param options.onPreferencesStateChange -A function for registering an event handler for preference state changes.
     * @param options.interval - The polling interval, in milliseconds.
     * @param options.cacheRefreshThreshold - The token cache expiry time, in milliseconds.
     * @param options.messenger - A restricted controller messenger.
     * @param options.state - Initial state to set on this controller.
     */
    constructor({ chainId, useStaticTokenList, onNetworkStateChange, onPreferencesStateChange, interval = DEFAULT_INTERVAL, cacheRefreshThreshold = DEFAULT_THRESHOLD, messenger, state, }) {
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
        this.useStaticTokenList = useStaticTokenList;
        this.abortController = new abort_controller_1.default();
        onNetworkStateChange((networkState) => __awaiter(this, void 0, void 0, function* () {
            if (this.chainId !== networkState.provider.chainId) {
                this.abortController.abort();
                this.abortController = new abort_controller_1.default();
                this.chainId = networkState.provider.chainId;
                yield this.restart();
            }
        }));
        onPreferencesStateChange((preferencesState) => __awaiter(this, void 0, void 0, function* () {
            if (this.useStaticTokenList !== preferencesState.useStaticTokenList) {
                this.abortController.abort();
                this.abortController = new abort_controller_1.default();
                this.useStaticTokenList = preferencesState.useStaticTokenList;
                yield this.restart();
            }
        }));
    }
    /**
     * Start polling for the token list.
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
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
     * Fetching token list.
     */
    fetchTokenList() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.useStaticTokenList) {
                yield this.fetchFromStaticTokenList();
            }
            else {
                yield this.fetchFromDynamicTokenList();
            }
        });
    }
    /**
     * Fetching token list from the contract-metadata as a fallback.
     */
    fetchFromStaticTokenList() {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenList = {};
            for (const tokenAddress in contract_metadata_1.default) {
                const _a = contract_metadata_1.default[tokenAddress], { erc20, logo: filePath } = _a, token = __rest(_a, ["erc20", "logo"]);
                if (erc20) {
                    tokenList[tokenAddress] = Object.assign(Object.assign({}, token), { address: tokenAddress, iconUrl: filePath, occurrences: null });
                }
            }
            this.update(() => {
                return {
                    tokenList,
                    tokensChainsCache: {},
                };
            });
        });
    }
    /**
     * Fetching token list from the Token Service API.
     */
    fetchFromDynamicTokenList() {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            try {
                const cachedTokens = yield (0, util_1.safelyExecute)(() => this.fetchFromCache());
                const _a = this.state, { tokensChainsCache } = _a, tokensData = __rest(_a, ["tokensChainsCache"]);
                const tokenList = {};
                if (cachedTokens) {
                    for (const token of cachedTokens) {
                        tokenList[token.address] = token;
                    }
                }
                else {
                    const tokensFromAPI = yield (0, util_1.safelyExecute)(() => (0, token_service_1.fetchTokenList)(this.chainId, this.abortController.signal));
                    if (!tokensFromAPI) {
                        const backupTokenList = tokensChainsCache[this.chainId]
                            ? tokensChainsCache[this.chainId].data
                            : [];
                        for (const token of backupTokenList) {
                            tokenList[token.address] = token;
                        }
                        this.update(() => {
                            return Object.assign(Object.assign({}, tokensData), { tokenList,
                                tokensChainsCache });
                        });
                        return;
                    }
                    // filtering out tokens with less than 2 occurrences
                    const filteredTokenList = tokensFromAPI.filter((token) => token.occurrences && token.occurrences >= 2);
                    // removing the tokens with symbol conflicts
                    const symbolsList = filteredTokenList.map((token) => token.symbol);
                    const duplicateSymbols = [
                        ...new Set(symbolsList.filter((symbol, index) => symbolsList.indexOf(symbol) !== index)),
                    ];
                    const uniqueTokenList = filteredTokenList.filter((token) => !duplicateSymbols.includes(token.symbol));
                    for (const token of uniqueTokenList) {
                        tokenList[token.address] = token;
                    }
                }
                const updatedTokensChainsCache = Object.assign(Object.assign({}, tokensChainsCache), { [this.chainId]: {
                        timestamp: Date.now(),
                        data: Object.values(tokenList),
                    } });
                this.update(() => {
                    return Object.assign(Object.assign({}, tokensData), { tokenList, tokensChainsCache: updatedTokensChainsCache });
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
     * Fetch metadata for a token.
     *
     * @param tokenAddress - The address of the token.
     * @returns The token metadata.
     */
    fetchTokenMetadata(tokenAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const releaseLock = yield this.mutex.acquire();
            try {
                const token = (yield (0, token_service_1.fetchTokenMetadata)(this.chainId, tokenAddress, this.abortController.signal));
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