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
const determineGasFeeCalculations_1 = __importDefault(require("./determineGasFeeCalculations"));
const fetchGasEstimatesViaEthFeeHistory_1 = __importDefault(require("./fetchGasEstimatesViaEthFeeHistory"));
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
     * Creates a GasFeeController instance.
     *
     * @param options - The controller options.
     * @param options.interval - The time in milliseconds to wait between polls.
     * @param options.messenger - The controller messenger.
     * @param options.state - The initial state.
     * @param options.getCurrentNetworkEIP1559Compatibility - Determines whether or not the current
     * network is EIP-1559 compatible.
     * @param options.getCurrentNetworkLegacyGasAPICompatibility - Determines whether or not the
     * current network is compatible with the legacy gas price API.
     * @param options.getCurrentAccountEIP1559Compatibility - Determines whether or not the current
     * account is EIP-1559 compatible.
     * @param options.getChainId - Returns the current chain ID.
     * @param options.getProvider - Returns a network provider for the current network.
     * @param options.onNetworkStateChange - A function for registering an event handler for the
     * network state change event.
     * @param options.legacyAPIEndpoint - The legacy gas price API URL. This option is primarily for
     * testing purposes.
     * @param options.EIP1559APIEndpoint - The EIP-1559 gas price API URL. This option is primarily
     * for testing purposes.
     * @param options.clientId - The client ID used to identify to the gas estimation API who is
     * asking for estimates.
     */
    constructor({ interval = 15000, messenger, state, getCurrentNetworkEIP1559Compatibility, getCurrentAccountEIP1559Compatibility, getChainId, getCurrentNetworkLegacyGasAPICompatibility, getProvider, onNetworkStateChange, legacyAPIEndpoint = exports.LEGACY_GAS_PRICES_API_URL, EIP1559APIEndpoint = GAS_FEE_API, clientId, }) {
        super({
            name,
            metadata,
            messenger,
            state: Object.assign(Object.assign({}, defaultState), state),
        });
        this.intervalDelay = interval;
        this.pollTokens = new Set();
        this.getCurrentNetworkEIP1559Compatibility =
            getCurrentNetworkEIP1559Compatibility;
        this.getCurrentNetworkLegacyGasAPICompatibility =
            getCurrentNetworkLegacyGasAPICompatibility;
        this.getCurrentAccountEIP1559Compatibility =
            getCurrentAccountEIP1559Compatibility;
        this.EIP1559APIEndpoint = EIP1559APIEndpoint;
        this.legacyAPIEndpoint = legacyAPIEndpoint;
        this.getChainId = getChainId;
        this.currentChainId = this.getChainId();
        const provider = getProvider();
        this.ethQuery = new eth_query_1.default(provider);
        this.clientId = clientId;
        onNetworkStateChange(() => __awaiter(this, void 0, void 0, function* () {
            const newProvider = getProvider();
            const newChainId = this.getChainId();
            this.ethQuery = new eth_query_1.default(newProvider);
            if (this.currentChainId !== newChainId) {
                this.currentChainId = newChainId;
                yield this.resetPolling();
            }
        }));
    }
    resetPolling() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.pollTokens.size !== 0) {
                const tokens = Array.from(this.pollTokens);
                this.stopPolling();
                yield this.getGasFeeEstimatesAndStartPolling(tokens[0]);
                tokens.slice(1).forEach((token) => {
                    this.pollTokens.add(token);
                });
            }
        });
    }
    fetchGasFeeEstimates(options) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._fetchGasFeeEstimateData(options);
        });
    }
    getGasFeeEstimatesAndStartPolling(pollToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const _pollToken = pollToken || (0, uuid_1.v1)();
            this.pollTokens.add(_pollToken);
            if (this.pollTokens.size === 1) {
                yield this._fetchGasFeeEstimateData();
                this._poll();
            }
            return _pollToken;
        });
    }
    /**
     * Gets and sets gasFeeEstimates in state.
     *
     * @param options - The gas fee estimate options.
     * @param options.shouldUpdateState - Determines whether the state should be updated with the
     * updated gas estimates.
     * @returns The gas fee estimates.
     */
    _fetchGasFeeEstimateData(options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const { shouldUpdateState = true } = options;
            let isEIP1559Compatible;
            const isLegacyGasAPICompatible = this.getCurrentNetworkLegacyGasAPICompatibility();
            let chainId = this.getChainId();
            if (typeof chainId === 'string' && (0, ethereumjs_util_1.isHexString)(chainId)) {
                chainId = parseInt(chainId, 16);
            }
            try {
                isEIP1559Compatible = yield this.getEIP1559Compatibility();
            }
            catch (e) {
                console.error(e);
                isEIP1559Compatible = false;
            }
            const gasFeeCalculations = yield (0, determineGasFeeCalculations_1.default)({
                isEIP1559Compatible,
                isLegacyGasAPICompatible,
                fetchGasEstimates: gas_util_1.fetchGasEstimates,
                fetchGasEstimatesUrl: this.EIP1559APIEndpoint.replace('<chain_id>', `${chainId}`),
                fetchGasEstimatesViaEthFeeHistory: fetchGasEstimatesViaEthFeeHistory_1.default,
                fetchLegacyGasPriceEstimates: gas_util_1.fetchLegacyGasPriceEstimates,
                fetchLegacyGasPriceEstimatesUrl: this.legacyAPIEndpoint.replace('<chain_id>', `${chainId}`),
                fetchEthGasPriceEstimate: gas_util_1.fetchEthGasPriceEstimate,
                calculateTimeEstimate: gas_util_1.calculateTimeEstimate,
                clientId: this.clientId,
                ethQuery: this.ethQuery,
            });
            if (shouldUpdateState) {
                this.update((state) => {
                    state.gasFeeEstimates = gasFeeCalculations.gasFeeEstimates;
                    state.estimatedGasFeeTimeBounds =
                        gasFeeCalculations.estimatedGasFeeTimeBounds;
                    state.gasEstimateType = gasFeeCalculations.gasEstimateType;
                });
            }
            return gasFeeCalculations;
        });
    }
    /**
     * Remove the poll token, and stop polling if the set of poll tokens is empty.
     *
     * @param pollToken - The poll token to disconnect.
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
    _poll() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
            yield (0, util_1.safelyExecute)(() => this._fetchGasFeeEstimateData());
        }), this.intervalDelay);
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
        return (0, gas_util_1.calculateTimeEstimate)(maxPriorityFeePerGas, maxFeePerGas, this.state.gasFeeEstimates);
    }
}
exports.GasFeeController = GasFeeController;
exports.default = GasFeeController;
//# sourceMappingURL=GasFeeController.js.map