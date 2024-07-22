"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }








var _chunk2MFVV2BXjs = require('./chunk-2MFVV2BX.js');

// src/GasFeeController.ts




var _controllerutils = require('@metamask/controller-utils');
var _ethquery = require('@metamask/eth-query'); var _ethquery2 = _interopRequireDefault(_ethquery);
var _pollingcontroller = require('@metamask/polling-controller');
var _uuid = require('uuid');
var LEGACY_GAS_PRICES_API_URL = `https://api.metaswap.codefi.network/gasPrices`;
var GAS_ESTIMATE_TYPES = {
  FEE_MARKET: "fee-market",
  LEGACY: "legacy",
  ETH_GASPRICE: "eth_gasPrice",
  NONE: "none"
};
var metadata = {
  gasFeeEstimatesByChainId: {
    persist: true,
    anonymous: false
  },
  gasFeeEstimates: { persist: true, anonymous: false },
  estimatedGasFeeTimeBounds: { persist: true, anonymous: false },
  gasEstimateType: { persist: true, anonymous: false },
  nonRPCGasFeeApisDisabled: { persist: true, anonymous: false }
};
var name = "GasFeeController";
var defaultState = {
  gasFeeEstimatesByChainId: {},
  gasFeeEstimates: {},
  estimatedGasFeeTimeBounds: {},
  gasEstimateType: GAS_ESTIMATE_TYPES.NONE,
  nonRPCGasFeeApisDisabled: false
};
var _getProvider, _onNetworkControllerDidChange, onNetworkControllerDidChange_fn;
var GasFeeController = class extends _pollingcontroller.StaticIntervalPollingController {
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
   * @param options.onNetworkDidChange - A function for registering an event handler for the
   * network state change event.
   * @param options.legacyAPIEndpoint - The legacy gas price API URL. This option is primarily for
   * testing purposes.
   * @param options.EIP1559APIEndpoint - The EIP-1559 gas price API URL.
   * @param options.clientId - The client ID used to identify to the gas estimation API who is
   * asking for estimates.
   */
  constructor({
    interval = 15e3,
    messenger,
    state,
    getCurrentNetworkEIP1559Compatibility,
    getCurrentAccountEIP1559Compatibility,
    getChainId,
    getCurrentNetworkLegacyGasAPICompatibility,
    getProvider,
    onNetworkDidChange,
    legacyAPIEndpoint = LEGACY_GAS_PRICES_API_URL,
    EIP1559APIEndpoint,
    clientId
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state }
    });
    _chunk2MFVV2BXjs.__privateAdd.call(void 0, this, _onNetworkControllerDidChange);
    _chunk2MFVV2BXjs.__privateAdd.call(void 0, this, _getProvider, void 0);
    this.intervalDelay = interval;
    this.setIntervalLength(interval);
    this.pollTokens = /* @__PURE__ */ new Set();
    this.getCurrentNetworkEIP1559Compatibility = getCurrentNetworkEIP1559Compatibility;
    this.getCurrentNetworkLegacyGasAPICompatibility = getCurrentNetworkLegacyGasAPICompatibility;
    this.getCurrentAccountEIP1559Compatibility = getCurrentAccountEIP1559Compatibility;
    _chunk2MFVV2BXjs.__privateSet.call(void 0, this, _getProvider, getProvider);
    this.EIP1559APIEndpoint = EIP1559APIEndpoint;
    this.legacyAPIEndpoint = legacyAPIEndpoint;
    this.clientId = clientId;
    this.ethQuery = new (0, _ethquery2.default)(_chunk2MFVV2BXjs.__privateGet.call(void 0, this, _getProvider).call(this));
    if (onNetworkDidChange && getChainId) {
      this.currentChainId = getChainId();
      onNetworkDidChange(async (networkControllerState) => {
        await _chunk2MFVV2BXjs.__privateMethod.call(void 0, this, _onNetworkControllerDidChange, onNetworkControllerDidChange_fn).call(this, networkControllerState);
      });
    } else {
      const { selectedNetworkClientId } = this.messagingSystem.call(
        "NetworkController:getState"
      );
      this.currentChainId = this.messagingSystem.call(
        "NetworkController:getNetworkClientById",
        selectedNetworkClientId
      ).configuration.chainId;
      this.messagingSystem.subscribe(
        "NetworkController:networkDidChange",
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async (networkControllerState) => {
          await _chunk2MFVV2BXjs.__privateMethod.call(void 0, this, _onNetworkControllerDidChange, onNetworkControllerDidChange_fn).call(this, networkControllerState);
        }
      );
    }
  }
  async resetPolling() {
    if (this.pollTokens.size !== 0) {
      const tokens = Array.from(this.pollTokens);
      this.stopPolling();
      await this.getGasFeeEstimatesAndStartPolling(tokens[0]);
      tokens.slice(1).forEach((token) => {
        this.pollTokens.add(token);
      });
    }
  }
  async fetchGasFeeEstimates(options) {
    return await this._fetchGasFeeEstimateData(options);
  }
  async getGasFeeEstimatesAndStartPolling(pollToken) {
    const _pollToken = pollToken || _uuid.v1.call(void 0, );
    this.pollTokens.add(_pollToken);
    if (this.pollTokens.size === 1) {
      await this._fetchGasFeeEstimateData();
      this._poll();
    }
    return _pollToken;
  }
  /**
   * Gets and sets gasFeeEstimates in state.
   *
   * @param options - The gas fee estimate options.
   * @param options.shouldUpdateState - Determines whether the state should be updated with the
   * updated gas estimates.
   * @returns The gas fee estimates.
   */
  async _fetchGasFeeEstimateData(options = {}) {
    const { shouldUpdateState = true, networkClientId } = options;
    let ethQuery, isEIP1559Compatible, isLegacyGasAPICompatible, decimalChainId;
    if (networkClientId !== void 0) {
      const networkClient = this.messagingSystem.call(
        "NetworkController:getNetworkClientById",
        networkClientId
      );
      isLegacyGasAPICompatible = networkClient.configuration.chainId === "0x38";
      decimalChainId = _controllerutils.convertHexToDecimal.call(void 0, networkClient.configuration.chainId);
      try {
        const result = await this.messagingSystem.call(
          "NetworkController:getEIP1559Compatibility",
          networkClientId
        );
        isEIP1559Compatible = result || false;
      } catch {
        isEIP1559Compatible = false;
      }
      ethQuery = new (0, _ethquery2.default)(networkClient.provider);
    }
    ethQuery ?? (ethQuery = this.ethQuery);
    isLegacyGasAPICompatible ?? (isLegacyGasAPICompatible = this.getCurrentNetworkLegacyGasAPICompatibility());
    decimalChainId ?? (decimalChainId = _controllerutils.convertHexToDecimal.call(void 0, this.currentChainId));
    try {
      isEIP1559Compatible ?? (isEIP1559Compatible = await this.getEIP1559Compatibility());
    } catch (e) {
      console.error(e);
      isEIP1559Compatible ?? (isEIP1559Compatible = false);
    }
    const gasFeeCalculations = await determineGasFeeCalculations({
      isEIP1559Compatible,
      isLegacyGasAPICompatible,
      fetchGasEstimates: _chunk2MFVV2BXjs.fetchGasEstimates,
      fetchGasEstimatesUrl: this.EIP1559APIEndpoint.replace(
        "<chain_id>",
        `${decimalChainId}`
      ),
      fetchLegacyGasPriceEstimates: _chunk2MFVV2BXjs.fetchLegacyGasPriceEstimates,
      fetchLegacyGasPriceEstimatesUrl: this.legacyAPIEndpoint.replace(
        "<chain_id>",
        `${decimalChainId}`
      ),
      fetchEthGasPriceEstimate: _chunk2MFVV2BXjs.fetchEthGasPriceEstimate,
      calculateTimeEstimate: _chunk2MFVV2BXjs.calculateTimeEstimate,
      clientId: this.clientId,
      ethQuery,
      nonRPCGasFeeApisDisabled: this.state.nonRPCGasFeeApisDisabled
    });
    if (shouldUpdateState) {
      const chainId = _controllerutils.toHex.call(void 0, decimalChainId);
      this.update((state) => {
        if (this.currentChainId === chainId) {
          state.gasFeeEstimates = gasFeeCalculations.gasFeeEstimates;
          state.estimatedGasFeeTimeBounds = gasFeeCalculations.estimatedGasFeeTimeBounds;
          state.gasEstimateType = gasFeeCalculations.gasEstimateType;
        }
        state.gasFeeEstimatesByChainId ?? (state.gasFeeEstimatesByChainId = {});
        state.gasFeeEstimatesByChainId[chainId] = {
          gasFeeEstimates: gasFeeCalculations.gasFeeEstimates,
          estimatedGasFeeTimeBounds: gasFeeCalculations.estimatedGasFeeTimeBounds,
          gasEstimateType: gasFeeCalculations.gasEstimateType
        };
      });
    }
    return gasFeeCalculations;
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
    this.intervalId = setInterval(async () => {
      await _controllerutils.safelyExecute.call(void 0, () => this._fetchGasFeeEstimateData());
    }, this.intervalDelay);
  }
  /**
   * Fetching token list from the Token Service API.
   *
   * @private
   * @param networkClientId - The ID of the network client triggering the fetch.
   * @returns A promise that resolves when this operation completes.
   */
  async _executePoll(networkClientId) {
    await this._fetchGasFeeEstimateData({ networkClientId });
  }
  resetState() {
    this.update(() => {
      return defaultState;
    });
  }
  async getEIP1559Compatibility() {
    const currentNetworkIsEIP1559Compatible = await this.getCurrentNetworkEIP1559Compatibility();
    const currentAccountIsEIP1559Compatible = this.getCurrentAccountEIP1559Compatibility?.() ?? true;
    return currentNetworkIsEIP1559Compatible && currentAccountIsEIP1559Compatible;
  }
  getTimeEstimate(maxPriorityFeePerGas, maxFeePerGas) {
    if (!this.state.gasFeeEstimates || this.state.gasEstimateType !== GAS_ESTIMATE_TYPES.FEE_MARKET) {
      return {};
    }
    return _chunk2MFVV2BXjs.calculateTimeEstimate.call(void 0, 
      maxPriorityFeePerGas,
      maxFeePerGas,
      this.state.gasFeeEstimates
    );
  }
  enableNonRPCGasFeeApis() {
    this.update((state) => {
      state.nonRPCGasFeeApisDisabled = false;
    });
  }
  disableNonRPCGasFeeApis() {
    this.update((state) => {
      state.nonRPCGasFeeApisDisabled = true;
    });
  }
};
_getProvider = new WeakMap();
_onNetworkControllerDidChange = new WeakSet();
onNetworkControllerDidChange_fn = async function({
  selectedNetworkClientId
}) {
  const newChainId = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    selectedNetworkClientId
  ).configuration.chainId;
  if (newChainId !== this.currentChainId) {
    this.ethQuery = new (0, _ethquery2.default)(_chunk2MFVV2BXjs.__privateGet.call(void 0, this, _getProvider).call(this));
    await this.resetPolling();
    this.currentChainId = newChainId;
  }
};
var GasFeeController_default = GasFeeController;

// src/determineGasFeeCalculations.ts
async function determineGasFeeCalculations(args) {
  try {
    return await getEstimatesUsingFallbacks(args);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Gas fee/price estimation failed. Message: ${error.message}`
      );
    }
    throw error;
  }
}
async function getEstimatesUsingFallbacks(request) {
  const {
    isEIP1559Compatible,
    isLegacyGasAPICompatible,
    nonRPCGasFeeApisDisabled
  } = request;
  try {
    if (isEIP1559Compatible && !nonRPCGasFeeApisDisabled) {
      return await getEstimatesUsingFeeMarketEndpoint(request);
    }
    if (isLegacyGasAPICompatible && !nonRPCGasFeeApisDisabled) {
      return await getEstimatesUsingLegacyEndpoint(request);
    }
    throw new Error("Main gas fee/price estimation failed. Use fallback");
  } catch {
    return await getEstimatesUsingProvider(request);
  }
}
async function getEstimatesUsingFeeMarketEndpoint(request) {
  const {
    fetchGasEstimates: fetchGasEstimates2,
    fetchGasEstimatesUrl,
    clientId,
    calculateTimeEstimate: calculateTimeEstimate2
  } = request;
  const estimates = await fetchGasEstimates2(fetchGasEstimatesUrl, clientId);
  const { suggestedMaxPriorityFeePerGas, suggestedMaxFeePerGas } = estimates.medium;
  const estimatedGasFeeTimeBounds = calculateTimeEstimate2(
    suggestedMaxPriorityFeePerGas,
    suggestedMaxFeePerGas,
    estimates
  );
  return {
    gasFeeEstimates: estimates,
    estimatedGasFeeTimeBounds,
    gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET
  };
}
async function getEstimatesUsingLegacyEndpoint(request) {
  const {
    fetchLegacyGasPriceEstimates: fetchLegacyGasPriceEstimates2,
    fetchLegacyGasPriceEstimatesUrl,
    clientId
  } = request;
  const estimates = await fetchLegacyGasPriceEstimates2(
    fetchLegacyGasPriceEstimatesUrl,
    clientId
  );
  return {
    gasFeeEstimates: estimates,
    estimatedGasFeeTimeBounds: {},
    gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY
  };
}
async function getEstimatesUsingProvider(request) {
  const { ethQuery, fetchEthGasPriceEstimate: fetchEthGasPriceEstimate2 } = request;
  const estimates = await fetchEthGasPriceEstimate2(ethQuery);
  return {
    gasFeeEstimates: estimates,
    estimatedGasFeeTimeBounds: {},
    gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE
  };
}







exports.determineGasFeeCalculations = determineGasFeeCalculations; exports.LEGACY_GAS_PRICES_API_URL = LEGACY_GAS_PRICES_API_URL; exports.GAS_ESTIMATE_TYPES = GAS_ESTIMATE_TYPES; exports.GasFeeController = GasFeeController; exports.GasFeeController_default = GasFeeController_default;
//# sourceMappingURL=chunk-S5H5NUEH.js.map