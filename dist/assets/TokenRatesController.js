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
exports.TokenRatesController = void 0;
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
const constants_1 = require("../constants");
const crypto_compare_1 = require("../apis/crypto-compare");
const CoinGeckoApi = {
    BASE_URL: 'https://api.coingecko.com/api/v3',
    getTokenPriceURL(chainSlug, query) {
        return `${this.BASE_URL}/simple/token_price/${chainSlug}?${query}`;
    },
    getPlatformsURL() {
        return `${this.BASE_URL}/asset_platforms`;
    },
    getSupportedVsCurrencies() {
        return `${this.BASE_URL}/simple/supported_vs_currencies`;
    },
};
/**
 * Finds the chain slug in the data array given a chainId.
 *
 * @param chainId - The current chain ID.
 * @param data - A list platforms supported by the CoinGecko API.
 * @returns The CoinGecko slug for the given chain ID, or `null` if the slug was not found.
 */
function findChainSlug(chainId, data) {
    var _a;
    if (!data) {
        return null;
    }
    const chain = (_a = data.find(({ chain_identifier }) => chain_identifier !== null && String(chain_identifier) === chainId)) !== null && _a !== void 0 ? _a : null;
    return (chain === null || chain === void 0 ? void 0 : chain.id) || null;
}
/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the TokensController
 */
class TokenRatesController extends BaseController_1.BaseController {
    /**
     * Creates a TokenRatesController instance.
     *
     * @param options - The controller options.
     * @param options.onTokensStateChange - Allows subscribing to token controller state changes.
     * @param options.onCurrencyRateStateChange - Allows subscribing to currency rate controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network state changes.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onTokensStateChange, onCurrencyRateStateChange, onNetworkStateChange, }, config, state) {
        super(config, state);
        this.tokenList = [];
        this.supportedChains = {
            timestamp: 0,
            data: null,
        };
        this.supportedVsCurrencies = {
            timestamp: 0,
            data: [],
        };
        /**
         * Name of this controller used during composition
         */
        this.name = 'TokenRatesController';
        this.defaultConfig = {
            disabled: true,
            interval: 3 * 60 * 1000,
            nativeCurrency: 'eth',
            chainId: '',
            tokens: [],
            threshold: 6 * 60 * 60 * 1000,
        };
        this.defaultState = {
            contractExchangeRates: {},
        };
        this.initialize();
        this.configure({ disabled: false }, false, false);
        onTokensStateChange(({ tokens, detectedTokens }) => {
            this.configure({ tokens: [...tokens, ...detectedTokens] });
        });
        onCurrencyRateStateChange((currencyRateState) => {
            this.configure({ nativeCurrency: currencyRateState.nativeCurrency });
        });
        onNetworkStateChange(({ provider }) => {
            const { chainId } = provider;
            this.update({ contractExchangeRates: {} });
            this.configure({ chainId });
        });
        this.poll();
    }
    /**
     * Sets a new polling interval.
     *
     * @param interval - Polling interval used to fetch new token rates.
     */
    poll(interval) {
        return __awaiter(this, void 0, void 0, function* () {
            interval && this.configure({ interval }, false, false);
            this.handle && clearTimeout(this.handle);
            yield (0, util_1.safelyExecute)(() => this.updateExchangeRates());
            this.handle = setTimeout(() => {
                this.poll(this.config.interval);
            }, this.config.interval);
        });
    }
    /**
     * Sets a new chainId.
     *
     * TODO: Replace this with a method.
     *
     * @param _chainId - The current chain ID.
     */
    set chainId(_chainId) {
        !this.disabled && (0, util_1.safelyExecute)(() => this.updateExchangeRates());
    }
    get chainId() {
        throw new Error('Property only used for setting');
    }
    /**
     * Sets a new token list to track prices.
     *
     * TODO: Replace this with a method.
     *
     * @param tokens - List of tokens to track exchange rates for.
     */
    set tokens(tokens) {
        this.tokenList = tokens;
        !this.disabled && (0, util_1.safelyExecute)(() => this.updateExchangeRates());
    }
    get tokens() {
        throw new Error('Property only used for setting');
    }
    /**
     * Fetches a pairs of token address and native currency.
     *
     * @param chainSlug - Chain string identifier.
     * @param vsCurrency - Query according to tokens in tokenList and native currency.
     * @returns The exchange rates for the given pairs.
     */
    fetchExchangeRate(chainSlug, vsCurrency) {
        return __awaiter(this, void 0, void 0, function* () {
            const tokenPairs = this.tokenList.map((token) => token.address).join(',');
            const query = `contract_addresses=${tokenPairs}&vs_currencies=${vsCurrency.toLowerCase()}`;
            return (0, util_1.handleFetch)(CoinGeckoApi.getTokenPriceURL(chainSlug, query));
        });
    }
    /**
     * Checks if the current native currency is a supported vs currency to use
     * to query for token exchange rates.
     *
     * @param nativeCurrency - The native currency of the currently active network.
     * @returns A boolean indicating whether it's a supported vsCurrency.
     */
    checkIsSupportedVsCurrency(nativeCurrency) {
        return __awaiter(this, void 0, void 0, function* () {
            const { threshold } = this.config;
            const { timestamp, data } = this.supportedVsCurrencies;
            const now = Date.now();
            if (now - timestamp > threshold) {
                const currencies = yield (0, util_1.handleFetch)(CoinGeckoApi.getSupportedVsCurrencies());
                this.supportedVsCurrencies = {
                    data: currencies,
                    timestamp: Date.now(),
                };
                return currencies.includes(nativeCurrency.toLowerCase());
            }
            return data.includes(nativeCurrency.toLowerCase());
        });
    }
    /**
     * Gets current chain ID slug from cached supported platforms CoinGecko API response.
     * If cached supported platforms response is stale, fetches and updates it.
     *
     * @returns The CoinGecko slug for the current chain ID.
     */
    getChainSlug() {
        return __awaiter(this, void 0, void 0, function* () {
            const { threshold, chainId } = this.config;
            const { data, timestamp } = this.supportedChains;
            const now = Date.now();
            if (now - timestamp > threshold) {
                const platforms = yield (0, util_1.handleFetch)(CoinGeckoApi.getPlatformsURL());
                this.supportedChains = {
                    data: platforms,
                    timestamp: Date.now(),
                };
                return findChainSlug(chainId, platforms);
            }
            return findChainSlug(chainId, data);
        });
    }
    /**
     * Updates exchange rates for all tokens.
     */
    updateExchangeRates() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.tokenList.length === 0 || this.disabled) {
                return;
            }
            const slug = yield this.getChainSlug();
            let newContractExchangeRates = {};
            if (!slug) {
                this.tokenList.forEach((token) => {
                    const address = (0, util_1.toChecksumHexAddress)(token.address);
                    newContractExchangeRates[address] = undefined;
                });
            }
            else {
                const { nativeCurrency } = this.config;
                newContractExchangeRates = yield this.fetchAndMapExchangeRates(nativeCurrency, slug);
            }
            this.update({ contractExchangeRates: newContractExchangeRates });
        });
    }
    /**
     * Checks if the active network's native currency is supported by the coingecko API.
     * If supported, it fetches and maps contractExchange rates to a format to be consumed by the UI.
     * If not supported, it fetches contractExchange rates and maps them from token/fallback-currency
     * to token/nativeCurrency.
     *
     * @param nativeCurrency - The native currency of the currently active network.
     * @param slug - The unique slug used to id the chain by the coingecko api
     * should be used to query token exchange rates.
     * @returns An object with conversion rates for each token
     * related to the network's native currency.
     */
    fetchAndMapExchangeRates(nativeCurrency, slug) {
        return __awaiter(this, void 0, void 0, function* () {
            const contractExchangeRates = {};
            // check if native currency is supported as a vs_currency by the API
            const nativeCurrencySupported = yield this.checkIsSupportedVsCurrency(nativeCurrency);
            if (nativeCurrencySupported) {
                // If it is we can do a simple fetch against the CoinGecko API
                const prices = yield this.fetchExchangeRate(slug, nativeCurrency);
                this.tokenList.forEach((token) => {
                    const price = prices[token.address.toLowerCase()];
                    contractExchangeRates[(0, util_1.toChecksumHexAddress)(token.address)] = price
                        ? price[nativeCurrency.toLowerCase()]
                        : 0;
                });
            }
            else {
                // if native currency is not supported we need to use a fallback vsCurrency, get the exchange rates
                // in token/fallback-currency format and convert them to expected token/nativeCurrency format.
                let tokenExchangeRates;
                let vsCurrencyToNativeCurrencyConversionRate = 0;
                try {
                    [
                        tokenExchangeRates,
                        { conversionRate: vsCurrencyToNativeCurrencyConversionRate },
                    ] = yield Promise.all([
                        this.fetchExchangeRate(slug, constants_1.FALL_BACK_VS_CURRENCY),
                        (0, crypto_compare_1.fetchExchangeRate)(nativeCurrency, constants_1.FALL_BACK_VS_CURRENCY, false),
                    ]);
                }
                catch (error) {
                    if (error instanceof Error &&
                        error.message.includes('market does not exist for this coin pair')) {
                        return {};
                    }
                    throw error;
                }
                for (const [tokenAddress, conversion] of Object.entries(tokenExchangeRates)) {
                    const tokenToVsCurrencyConversionRate = conversion[constants_1.FALL_BACK_VS_CURRENCY.toLowerCase()];
                    contractExchangeRates[(0, util_1.toChecksumHexAddress)(tokenAddress)] =
                        tokenToVsCurrencyConversionRate *
                            vsCurrencyToNativeCurrencyConversionRate;
                }
            }
            return contractExchangeRates;
        });
    }
}
exports.TokenRatesController = TokenRatesController;
exports.default = TokenRatesController;
//# sourceMappingURL=TokenRatesController.js.map