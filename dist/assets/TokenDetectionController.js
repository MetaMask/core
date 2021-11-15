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
exports.TokenDetectionController = void 0;
const BaseController_1 = require("../BaseController");
const util_1 = require("../util");
const constants_1 = require("../constants");
const DEFAULT_INTERVAL = 180000;
/**
 * Controller that passively polls on a set interval for Tokens auto detection
 */
class TokenDetectionController extends BaseController_1.BaseController {
    /**
     * Creates a TokenDetectionController instance.
     *
     * @param options - The controller options.
     * @param options.onTokensStateChange - Allows subscribing to tokens controller state changes.
     * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
     * @param options.addTokens - Add a list of tokens.
     * @param options.getTokenListState - Gets the current state of the TokenList controller.
     * @param options.getTokensState - Gets the current state of the Tokens controller.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onTokensStateChange, onPreferencesStateChange, onNetworkStateChange, getBalancesInSingleCall, addTokens, getTokenListState, getTokensState, }, config, state) {
        super(config, state);
        /**
         * Name of this controller used during composition
         */
        this.name = 'TokenDetectionController';
        /**
         * Checks whether network is mainnet or not.
         *
         * @returns Whether current network is mainnet.
         */
        this.isMainnet = () => this.config.networkType === constants_1.MAINNET;
        this.defaultConfig = {
            interval: DEFAULT_INTERVAL,
            networkType: constants_1.MAINNET,
            selectedAddress: '',
            tokens: [],
        };
        this.initialize();
        this.getTokensState = getTokensState;
        this.getTokenListState = getTokenListState;
        this.addTokens = addTokens;
        onTokensStateChange(({ tokens }) => {
            this.configure({ tokens });
        });
        onPreferencesStateChange(({ selectedAddress }) => {
            const actualSelectedAddress = this.config.selectedAddress;
            if (selectedAddress !== actualSelectedAddress) {
                this.configure({ selectedAddress });
                this.detectTokens();
            }
        });
        onNetworkStateChange(({ provider }) => {
            this.configure({ networkType: provider.type });
        });
        this.getBalancesInSingleCall = getBalancesInSingleCall;
        this.start();
    }
    /**
     * Start polling for the currency rate.
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isMainnet() || this.disabled) {
                return;
            }
            yield this.startPolling();
        });
    }
    /**
     * Stop polling for the currency rate.
     */
    stop() {
        this.stopPolling();
    }
    stopPolling() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
    /**
     * Starts a new polling interval.
     *
     * @param interval - An interval on which to poll.
     */
    startPolling(interval) {
        return __awaiter(this, void 0, void 0, function* () {
            interval && this.configure({ interval }, false, false);
            this.stopPolling();
            yield this.detectTokens();
            this.intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                yield this.detectTokens();
            }), this.config.interval);
        });
    }
    /**
     * Triggers asset ERC20 token auto detection for each contract address in contract metadata on mainnet.
     */
    detectTokens() {
        return __awaiter(this, void 0, void 0, function* () {
            /* istanbul ignore if */
            if (!this.isMainnet() || this.disabled) {
                return;
            }
            const tokensAddresses = this.config.tokens.map(
            /* istanbul ignore next*/ (token) => token.address.toLowerCase());
            const { tokenList } = this.getTokenListState();
            const tokensToDetect = [];
            for (const address in tokenList) {
                if (!tokensAddresses.includes(address)) {
                    tokensToDetect.push(address);
                }
            }
            const sliceOfTokensToDetect = [];
            sliceOfTokensToDetect[0] = tokensToDetect.slice(0, 1000);
            sliceOfTokensToDetect[1] = tokensToDetect.slice(1000, tokensToDetect.length - 1);
            const { selectedAddress } = this.config;
            /* istanbul ignore else */
            if (!selectedAddress) {
                return;
            }
            for (const tokensSlice of sliceOfTokensToDetect) {
                if (tokensSlice.length === 0) {
                    break;
                }
                yield util_1.safelyExecute(() => __awaiter(this, void 0, void 0, function* () {
                    const balances = yield this.getBalancesInSingleCall(selectedAddress, tokensSlice);
                    const tokensToAdd = [];
                    for (const tokenAddress in balances) {
                        let ignored;
                        /* istanbul ignore else */
                        const { ignoredTokens } = this.getTokensState();
                        if (ignoredTokens.length) {
                            ignored = ignoredTokens.find((ignoredTokenAddress) => ignoredTokenAddress === util_1.toChecksumHexAddress(tokenAddress));
                        }
                        const caseInsensitiveTokenKey = Object.keys(tokenList).find((i) => i.toLowerCase() === tokenAddress.toLowerCase()) || '';
                        if (ignored === undefined) {
                            tokensToAdd.push({
                                address: tokenAddress,
                                decimals: tokenList[caseInsensitiveTokenKey].decimals,
                                symbol: tokenList[caseInsensitiveTokenKey].symbol,
                            });
                        }
                    }
                    if (tokensToAdd.length) {
                        yield this.addTokens(tokensToAdd);
                    }
                }));
            }
        });
    }
}
exports.TokenDetectionController = TokenDetectionController;
exports.default = TokenDetectionController;
//# sourceMappingURL=TokenDetectionController.js.map