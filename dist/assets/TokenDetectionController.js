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
const DEFAULT_INTERVAL = 180000;
/**
 * Controller that passively polls on a set interval for Tokens auto detection
 */
class TokenDetectionController extends BaseController_1.BaseController {
    /**
     * Creates a TokenDetectionController instance.
     *
     * @param options - The controller options.
     * @param options.onPreferencesStateChange - Allows subscribing to preferences controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.onTokenListStateChange - Allows subscribing to token list controller state changes.
     * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
     * @param options.addDetectedTokens - Add a list of detected tokens.
     * @param options.getTokenListState - Gets the current state of the TokenList controller.
     * @param options.getTokensState - Gets the current state of the Tokens controller.
     * @param options.getNetworkState - Gets the state of the network controller.
     * @param options.getPreferencesState - Gets the state of the preferences controller.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, onTokenListStateChange, getBalancesInSingleCall, addDetectedTokens, getTokenListState, getTokensState, getNetworkState, getPreferencesState, }, config, state) {
        const { provider: { chainId: defaultChainId }, } = getNetworkState();
        const { useTokenDetection: defaultUseTokenDetection } = getPreferencesState();
        super(config, state);
        /**
         * Name of this controller used during composition
         */
        this.name = 'TokenDetectionController';
        this.defaultConfig = Object.assign({ interval: DEFAULT_INTERVAL, selectedAddress: '', disabled: true, chainId: defaultChainId, isDetectionEnabledFromPreferences: defaultUseTokenDetection, isDetectionEnabledForNetwork: (0, util_1.isTokenDetectionSupportedForNetwork)(defaultChainId) }, config);
        this.initialize();
        this.getTokensState = getTokensState;
        this.getTokenListState = getTokenListState;
        this.addDetectedTokens = addDetectedTokens;
        this.getBalancesInSingleCall = getBalancesInSingleCall;
        onTokenListStateChange(({ tokenList }) => {
            const hasTokens = Object.keys(tokenList).length;
            if (hasTokens) {
                this.detectTokens();
            }
        });
        onPreferencesStateChange(({ selectedAddress, useTokenDetection }) => {
            const { selectedAddress: currentSelectedAddress, isDetectionEnabledFromPreferences, } = this.config;
            const isSelectedAddressChanged = selectedAddress !== currentSelectedAddress;
            const isDetectionChangedFromPreferences = isDetectionEnabledFromPreferences !== useTokenDetection;
            this.configure({
                isDetectionEnabledFromPreferences: useTokenDetection,
                selectedAddress,
            });
            if (useTokenDetection &&
                (isSelectedAddressChanged || isDetectionChangedFromPreferences)) {
                this.detectTokens();
            }
        });
        onNetworkStateChange(({ provider: { chainId } }) => {
            const { chainId: currentChainId } = this.config;
            const isDetectionEnabledForNetwork = (0, util_1.isTokenDetectionSupportedForNetwork)(chainId);
            const isChainIdChanged = currentChainId !== chainId;
            this.configure({
                chainId,
                isDetectionEnabledForNetwork,
            });
            if (isDetectionEnabledForNetwork && isChainIdChanged) {
                this.detectTokens();
            }
        });
    }
    /**
     * Start polling for detected tokens.
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            this.configure({ disabled: false });
            yield this.startPolling();
        });
    }
    /**
     * Stop polling for detected tokens.
     */
    stop() {
        this.configure({ disabled: true });
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
            const { disabled, isDetectionEnabledForNetwork, isDetectionEnabledFromPreferences, } = this.config;
            if (disabled ||
                !isDetectionEnabledForNetwork ||
                !isDetectionEnabledFromPreferences) {
                return;
            }
            const { tokens } = this.getTokensState();
            const { selectedAddress } = this.config;
            const tokensAddresses = tokens.map(
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
            /* istanbul ignore else */
            if (!selectedAddress) {
                return;
            }
            for (const tokensSlice of sliceOfTokensToDetect) {
                if (tokensSlice.length === 0) {
                    break;
                }
                yield (0, util_1.safelyExecute)(() => __awaiter(this, void 0, void 0, function* () {
                    const balances = yield this.getBalancesInSingleCall(selectedAddress, tokensSlice);
                    const tokensToAdd = [];
                    for (const tokenAddress in balances) {
                        let ignored;
                        /* istanbul ignore else */
                        const { ignoredTokens } = this.getTokensState();
                        if (ignoredTokens.length) {
                            ignored = ignoredTokens.find((ignoredTokenAddress) => ignoredTokenAddress === (0, util_1.toChecksumHexAddress)(tokenAddress));
                        }
                        const caseInsensitiveTokenKey = Object.keys(tokenList).find((i) => i.toLowerCase() === tokenAddress.toLowerCase()) || '';
                        if (ignored === undefined) {
                            const { decimals, symbol, aggregators, iconUrl } = tokenList[caseInsensitiveTokenKey];
                            tokensToAdd.push({
                                address: tokenAddress,
                                decimals,
                                symbol,
                                aggregators,
                                image: iconUrl,
                                isERC721: false,
                            });
                        }
                    }
                    if (tokensToAdd.length) {
                        yield this.addDetectedTokens(tokensToAdd);
                    }
                }));
            }
        });
    }
}
exports.TokenDetectionController = TokenDetectionController;
exports.default = TokenDetectionController;
//# sourceMappingURL=TokenDetectionController.js.map