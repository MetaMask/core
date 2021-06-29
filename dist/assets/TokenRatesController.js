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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenRatesController = void 0;
const BaseController_1 = __importDefault(require("../BaseController"));
const util_1 = require("../util");
/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the AssetsController
 */
class TokenRatesController extends BaseController_1.default {
    /**
     * Creates a TokenRatesController instance
     *
     * @param options
     * @param options.onAssetsStateChange - Allows subscribing to assets controller state changes
     * @param options.onCurrencyRateStateChange - Allows subscribing to currency rate controller state changes
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor({ onAssetsStateChange, onCurrencyRateStateChange, }, config, state) {
        super(config, state);
        this.tokenList = [];
        /**
         * Name of this controller used during composition
         */
        this.name = 'TokenRatesController';
        this.defaultConfig = {
            disabled: true,
            interval: 180000,
            nativeCurrency: 'eth',
            tokens: [],
        };
        this.defaultState = { contractExchangeRates: {} };
        this.initialize();
        this.configure({ disabled: false }, false, false);
        onAssetsStateChange((assetsState) => {
            this.configure({ tokens: assetsState.tokens });
        });
        onCurrencyRateStateChange((currencyRateState) => {
            this.configure({ nativeCurrency: currencyRateState.nativeCurrency });
        });
        this.poll();
    }
    getPricingURL(query) {
        return `https://api.coingecko.com/api/v3/simple/token_price/ethereum?${query}`;
    }
    /**
     * Sets a new polling interval
     *
     * @param interval - Polling interval used to fetch new token rates
     */
    poll(interval) {
        return __awaiter(this, void 0, void 0, function* () {
            interval && this.configure({ interval }, false, false);
            this.handle && clearTimeout(this.handle);
            yield util_1.safelyExecute(() => this.updateExchangeRates());
            this.handle = setTimeout(() => {
                this.poll(this.config.interval);
            }, this.config.interval);
        });
    }
    /**
     * Sets a new token list to track prices
     *
     * TODO: Replace this wth a method
     *
     * @param tokens - List of tokens to track exchange rates for
     */
    set tokens(tokens) {
        this.tokenList = tokens;
        !this.disabled && util_1.safelyExecute(() => this.updateExchangeRates());
    }
    get tokens() {
        throw new Error('Property only used for setting');
    }
    /**
     * Fetches a pairs of token address and native currency
     *
     * @param query - Query according to tokens in tokenList and native currency
     * @returns - Promise resolving to exchange rates for given pairs
     */
    fetchExchangeRate(query) {
        return __awaiter(this, void 0, void 0, function* () {
            return util_1.handleFetch(this.getPricingURL(query));
        });
    }
    /**
     * Updates exchange rates for all tokens
     *
     * @returns Promise resolving when this operation completes
     */
    updateExchangeRates() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.tokenList.length === 0) {
                return;
            }
            const newContractExchangeRates = {};
            const { nativeCurrency } = this.config;
            const pairs = this.tokenList.map((token) => token.address).join(',');
            const query = `contract_addresses=${pairs}&vs_currencies=${nativeCurrency.toLowerCase()}`;
            const prices = yield this.fetchExchangeRate(query);
            this.tokenList.forEach((token) => {
                const address = util_1.toChecksumHexAddress(token.address);
                const price = prices[token.address.toLowerCase()];
                newContractExchangeRates[address] = price
                    ? price[nativeCurrency.toLowerCase()]
                    : 0;
            });
            this.update({ contractExchangeRates: newContractExchangeRates });
        });
    }
}
exports.TokenRatesController = TokenRatesController;
exports.default = TokenRatesController;
//# sourceMappingURL=TokenRatesController.js.map