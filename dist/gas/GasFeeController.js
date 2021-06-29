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
exports.GasFeeController = exports.GAS_ESTIMATE_TYPES = exports.LEGACY_GAS_PRICES_API_URL = void 0;
const eth_query_1 = __importDefault(require("eth-query"));
const uuid_1 = require("uuid");
const ethereumjs_util_1 = require("ethereumjs-util");
const BaseControllerV2_1 = require("../BaseControllerV2");
const util_1 = require("../util");
const gas_util_1 = require("./gas-util");
const GAS_FEE_API = 'https://mock-gas-server.herokuapp.com/';
exports.LEGACY_GAS_PRICES_API_URL = `https://api.metaswap.codefi.network/gasPrices`;
/**
 * Indicates which type of gasEstimate the controller is currently returning.
 * This is useful as a way of asserting that the shape of gasEstimates matches
 * expectations. NONE is a special case indicating that no previous gasEstimate
 * has been fetched.
 */
exports.GAS_ESTIMATE_TYPES = {
    FEE_MARKET: 'fee-market',
    LEGACY: 'legacy',
    ETH_GASPRICE: 'eth_gasPrice',
    NONE: 'none',
};
const metadata = {
    gasFeeEstimates: { persist: true, anonymous: false },
    estimatedGasFeeTimeBounds: { persist: true, anonymous: false },
    gasEstimateType: { persist: true, anonymous: false },
};
const name = 'GasFeeController';
const defaultState = {
    gasFeeEstimates: {},
    estimatedGasFeeTimeBounds: {},
    gasEstimateType: exports.GAS_ESTIMATE_TYPES.NONE,
};
/**
 * Controller that retrieves gas fee estimate data and polls for updated data on a set interval
 */
class GasFeeController extends BaseControllerV2_1.BaseController {
    /**
     * Creates a GasFeeController instance
     *
     */
    constructor({ interval = 15000, messenger, state, fetchGasEstimates = gas_util_1.fetchGasEstimates, fetchEthGasPriceEstimate = gas_util_1.fetchEthGasPriceEstimate, fetchLegacyGasPriceEstimates = gas_util_1.fetchLegacyGasPriceEstimates, getCurrentNetworkEIP1559Compatibility, getCurrentAccountEIP1559Compatibility, getChainId, getCurrentNetworkLegacyGasAPICompatibility, getProvider, onNetworkStateChange, legacyAPIEndpoint = exports.LEGACY_GAS_PRICES_API_URL, EIP1559APIEndpoint = GAS_FEE_API, }) {
        super({
            name,
            metadata,
            messenger,
            state: Object.assign(Object.assign({}, defaultState), state),
        });
        this.intervalDelay = interval;
        this.fetchGasEstimates = fetchGasEstimates;
        this.fetchEthGasPriceEstimate = fetchEthGasPriceEstimate;
        this.fetchLegacyGasPriceEstimates = fetchLegacyGasPriceEstimates;
        this.pollTokens = new Set();
        this.getCurrentNetworkEIP1559Compatibility = getCurrentNetworkEIP1559Compatibility;
        this.getCurrentNetworkLegacyGasAPICompatibility = getCurrentNetworkLegacyGasAPICompatibility;
        this.getCurrentAccountEIP1559Compatibility = getCurrentAccountEIP1559Compatibility;
        this.EIP1559APIEndpoint = EIP1559APIEndpoint;
        this.legacyAPIEndpoint = legacyAPIEndpoint;
        this.getChainId = getChainId;
        const provider = getProvider();
        this.ethQuery = new eth_query_1.default(provider);
        onNetworkStateChange(() => {
            const newProvider = getProvider();
            this.ethQuery = new eth_query_1.default(newProvider);
        });
    }
    fetchGasFeeEstimates() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._fetchGasFeeEstimateData();
        });
    }
    getGasFeeEstimatesAndStartPolling(pollToken) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.pollTokens.size === 0) {
                yield this._fetchGasFeeEstimateData();
            }
            const _pollToken = pollToken || uuid_1.v1();
            this._startPolling(_pollToken);
            return _pollToken;
        });
    }
    /**
     * Gets and sets gasFeeEstimates in state
     *
     * @returns GasFeeEstimates
     */
    _fetchGasFeeEstimateData() {
        return __awaiter(this, void 0, void 0, function* () {
            let isEIP1559Compatible;
            const isLegacyGasAPICompatible = this.getCurrentNetworkLegacyGasAPICompatibility();
            let chainId = this.getChainId();
            if (typeof chainId === 'string' && ethereumjs_util_1.isHexString(chainId)) {
                chainId = parseInt(chainId, 16);
            }
            try {
                isEIP1559Compatible = yield this.getEIP1559Compatibility();
            }
            catch (e) {
                console.error(e);
                isEIP1559Compatible = false;
            }
            let newState = {
                gasFeeEstimates: {},
                estimatedGasFeeTimeBounds: {},
                gasEstimateType: exports.GAS_ESTIMATE_TYPES.NONE,
            };
            try {
                if (isEIP1559Compatible) {
                    const estimates = yield this.fetchGasEstimates(this.EIP1559APIEndpoint.replace('<chain_id>', `${chainId}`));
                    const { suggestedMaxPriorityFeePerGas, suggestedMaxFeePerGas, } = estimates.medium;
                    const estimatedGasFeeTimeBounds = this.getTimeEstimate(suggestedMaxPriorityFeePerGas, suggestedMaxFeePerGas);
                    newState = {
                        gasFeeEstimates: estimates,
                        estimatedGasFeeTimeBounds,
                        gasEstimateType: exports.GAS_ESTIMATE_TYPES.FEE_MARKET,
                    };
                }
                else if (isLegacyGasAPICompatible) {
                    const estimates = yield this.fetchLegacyGasPriceEstimates(this.legacyAPIEndpoint.replace('<chain_id>', `${chainId}`));
                    newState = {
                        gasFeeEstimates: estimates,
                        estimatedGasFeeTimeBounds: {},
                        gasEstimateType: exports.GAS_ESTIMATE_TYPES.LEGACY,
                    };
                }
                else {
                    throw new Error('Main gas fee/price estimation failed. Use fallback');
                }
            }
            catch (_a) {
                try {
                    const estimates = yield this.fetchEthGasPriceEstimate(this.ethQuery);
                    newState = {
                        gasFeeEstimates: estimates,
                        estimatedGasFeeTimeBounds: {},
                        gasEstimateType: exports.GAS_ESTIMATE_TYPES.ETH_GASPRICE,
                    };
                }
                catch (error) {
                    throw new Error(`Gas fee/price estimation failed. Message: ${error.message}`);
                }
            }
            this.update(() => {
                return newState;
            });
            return newState;
        });
    }
    /**
     * Remove the poll token, and stop polling if the set of poll tokens is empty
     */
    disconnectPoller(pollToken) {
        this.pollTokens.delete(pollToken);
        if (this.pollTokens.size === 0) {
            this.stopPolling();
        }
    }
    stopPolling() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.pollTokens.clear();
        this.resetState();
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
    // should take a token, so we know that we are only counting once for each open transaction
    _startPolling(pollToken) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.pollTokens.size === 0) {
                this._poll();
            }
            this.pollTokens.add(pollToken);
        });
    }
    _poll() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.intervalId) {
                clearInterval(this.intervalId);
            }
            this.intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                yield util_1.safelyExecute(() => this._fetchGasFeeEstimateData());
            }), this.intervalDelay);
        });
    }
    resetState() {
        this.update(() => {
            return defaultState;
        });
    }
    getEIP1559Compatibility() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const currentNetworkIsEIP1559Compatible = yield this.getCurrentNetworkEIP1559Compatibility();
            const currentAccountIsEIP1559Compatible = (_b = (_a = this.getCurrentAccountEIP1559Compatibility) === null || _a === void 0 ? void 0 : _a.call(this)) !== null && _b !== void 0 ? _b : true;
            return (currentNetworkIsEIP1559Compatible && currentAccountIsEIP1559Compatible);
        });
    }
    getTimeEstimate(maxPriorityFeePerGas, maxFeePerGas) {
        if (!this.state.gasFeeEstimates ||
            this.state.gasEstimateType !== exports.GAS_ESTIMATE_TYPES.FEE_MARKET) {
            return {};
        }
        return gas_util_1.calculateTimeEstimate(maxPriorityFeePerGas, maxFeePerGas, this.state.gasFeeEstimates);
    }
}
exports.GasFeeController = GasFeeController;
exports.default = GasFeeController;
//# sourceMappingURL=GasFeeController.js.map