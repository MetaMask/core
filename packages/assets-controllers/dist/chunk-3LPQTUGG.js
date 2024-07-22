"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunkMZI3SDQNjs = require('./chunk-MZI3SDQN.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/TokenDetectionController.ts
var _contractmetadata = require('@metamask/contract-metadata'); var _contractmetadata2 = _interopRequireDefault(_contractmetadata);
var _controllerutils = require('@metamask/controller-utils');
var _pollingcontroller = require('@metamask/polling-controller');
var DEFAULT_INTERVAL = 18e4;
function isEqualCaseInsensitive(value1, value2) {
  if (typeof value1 !== "string" || typeof value2 !== "string") {
    return false;
  }
  return value1.toLowerCase() === value2.toLowerCase();
}
var STATIC_MAINNET_TOKEN_LIST = Object.entries(
  _contractmetadata2.default
).reduce((acc, [base, contract]) => {
  const { logo, erc20, erc721, ...tokenMetadata } = contract;
  return {
    ...acc,
    [base.toLowerCase()]: {
      ...tokenMetadata,
      address: base.toLowerCase(),
      iconUrl: `images/contract/${logo}`,
      aggregators: []
    }
  };
}, {});
var controllerName = "TokenDetectionController";
var _intervalId, _selectedAccountId, _networkClientId, _tokenList, _disabled, _isUnlocked, _isDetectionEnabledFromPreferences, _isDetectionEnabledForNetwork, _getBalancesInSingleCall, _trackMetaMetricsEvent, _registerEventListeners, registerEventListeners_fn, _stopPolling, stopPolling_fn, _startPolling, startPolling_fn, _getCorrectChainIdAndNetworkClientId, getCorrectChainIdAndNetworkClientId_fn, _restartTokenDetection, restartTokenDetection_fn, _getSlicesOfTokensToDetect, getSlicesOfTokensToDetect_fn, _addDetectedTokens, addDetectedTokens_fn, _getSelectedAccount, getSelectedAccount_fn, _getSelectedAddress, getSelectedAddress_fn;
var TokenDetectionController = class extends _pollingcontroller.StaticIntervalPollingController {
  /**
   * Creates a TokenDetectionController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The controller messaging system.
   * @param options.disabled - If set to true, all network requests are blocked.
   * @param options.interval - Polling interval used to fetch new token rates
   * @param options.getBalancesInSingleCall - Gets the balances of a list of tokens for the given address.
   * @param options.trackMetaMetricsEvent - Sets options for MetaMetrics event tracking.
   */
  constructor({
    interval = DEFAULT_INTERVAL,
    disabled = true,
    getBalancesInSingleCall,
    trackMetaMetricsEvent,
    messenger
  }) {
    super({
      name: controllerName,
      messenger,
      state: {},
      metadata: {}
    });
    /**
     * Constructor helper for registering this controller's messaging system subscriptions to controller events.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _registerEventListeners);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _stopPolling);
    /**
     * Starts a new polling interval.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _startPolling);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getCorrectChainIdAndNetworkClientId);
    /**
     * Restart token detection polling period and call detectNewTokens
     * in case of address change or user session initialization.
     *
     * @param options - Options for restart token detection.
     * @param options.selectedAddress - the selectedAddress against which to detect for token balances
     * @param options.networkClientId - The ID of the network client to use.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _restartTokenDetection);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getSlicesOfTokensToDetect);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _addDetectedTokens);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getSelectedAccount);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getSelectedAddress);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _intervalId, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _selectedAccountId, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _networkClientId, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _tokenList, {});
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _disabled, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isUnlocked, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isDetectionEnabledFromPreferences, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isDetectionEnabledForNetwork, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getBalancesInSingleCall, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _trackMetaMetricsEvent, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _disabled, disabled);
    this.setIntervalLength(interval);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _selectedAccountId, _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAccount, getSelectedAccount_fn).call(this).id);
    const { chainId, networkClientId } = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getCorrectChainIdAndNetworkClientId, getCorrectChainIdAndNetworkClientId_fn).call(this);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _networkClientId, networkClientId);
    const { useTokenDetection: defaultUseTokenDetection } = this.messagingSystem.call("PreferencesController:getState");
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isDetectionEnabledFromPreferences, defaultUseTokenDetection);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isDetectionEnabledForNetwork, _chunkMZI3SDQNjs.isTokenDetectionSupportedForNetwork.call(void 0, chainId));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getBalancesInSingleCall, getBalancesInSingleCall);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _trackMetaMetricsEvent, trackMetaMetricsEvent);
    const { isUnlocked } = this.messagingSystem.call(
      "KeyringController:getState"
    );
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isUnlocked, isUnlocked);
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _registerEventListeners, registerEventListeners_fn).call(this);
  }
  /**
   * Allows controller to make active and passive polling requests
   */
  enable() {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _disabled, false);
  }
  /**
   * Blocks controller from making network calls
   */
  disable() {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _disabled, true);
  }
  /**
   * Internal isActive state
   * @type {boolean}
   */
  get isActive() {
    return !_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _disabled) && _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isUnlocked);
  }
  /**
   * Start polling for detected tokens.
   */
  async start() {
    this.enable();
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _startPolling, startPolling_fn).call(this);
  }
  /**
   * Stop polling for detected tokens.
   */
  stop() {
    this.disable();
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _stopPolling, stopPolling_fn).call(this);
  }
  async _executePoll(networkClientId, options) {
    if (!this.isActive) {
      return;
    }
    await this.detectTokens({
      networkClientId,
      selectedAddress: options.address
    });
  }
  /**
   * For each token in the token list provided by the TokenListController, checks the token's balance for the selected account address on the active network.
   * On mainnet, if token detection is disabled in preferences, ERC20 token auto detection will be triggered for each contract address in the legacy token list from the @metamask/contract-metadata repo.
   *
   * @param options - Options for token detection.
   * @param options.networkClientId - The ID of the network client to use.
   * @param options.selectedAddress - the selectedAddress against which to detect for token balances.
   */
  async detectTokens({
    networkClientId,
    selectedAddress
  } = {}) {
    if (!this.isActive) {
      return;
    }
    const addressAgainstWhichToDetect = selectedAddress ?? _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAddress, getSelectedAddress_fn).call(this);
    const { chainId, networkClientId: selectedNetworkClientId } = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getCorrectChainIdAndNetworkClientId, getCorrectChainIdAndNetworkClientId_fn).call(this, networkClientId);
    const chainIdAgainstWhichToDetect = chainId;
    const networkClientIdAgainstWhichToDetect = selectedNetworkClientId;
    if (!_chunkMZI3SDQNjs.isTokenDetectionSupportedForNetwork.call(void 0, chainIdAgainstWhichToDetect)) {
      return;
    }
    if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isDetectionEnabledFromPreferences) && chainIdAgainstWhichToDetect !== _controllerutils.ChainId.mainnet) {
      return;
    }
    const isTokenDetectionInactiveInMainnet = !_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isDetectionEnabledFromPreferences) && chainIdAgainstWhichToDetect === _controllerutils.ChainId.mainnet;
    const { tokensChainsCache } = this.messagingSystem.call(
      "TokenListController:getState"
    );
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _tokenList, isTokenDetectionInactiveInMainnet ? STATIC_MAINNET_TOKEN_LIST : tokensChainsCache[chainIdAgainstWhichToDetect]?.data ?? {});
    for (const tokensSlice of _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSlicesOfTokensToDetect, getSlicesOfTokensToDetect_fn).call(this, {
      chainId: chainIdAgainstWhichToDetect,
      selectedAddress: addressAgainstWhichToDetect
    })) {
      await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _addDetectedTokens, addDetectedTokens_fn).call(this, {
        tokensSlice,
        selectedAddress: addressAgainstWhichToDetect,
        networkClientId: networkClientIdAgainstWhichToDetect,
        chainId: chainIdAgainstWhichToDetect
      });
    }
  }
};
_intervalId = new WeakMap();
_selectedAccountId = new WeakMap();
_networkClientId = new WeakMap();
_tokenList = new WeakMap();
_disabled = new WeakMap();
_isUnlocked = new WeakMap();
_isDetectionEnabledFromPreferences = new WeakMap();
_isDetectionEnabledForNetwork = new WeakMap();
_getBalancesInSingleCall = new WeakMap();
_trackMetaMetricsEvent = new WeakMap();
_registerEventListeners = new WeakSet();
registerEventListeners_fn = function() {
  this.messagingSystem.subscribe("KeyringController:unlock", async () => {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isUnlocked, true);
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _restartTokenDetection, restartTokenDetection_fn).call(this);
  });
  this.messagingSystem.subscribe("KeyringController:lock", () => {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isUnlocked, false);
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _stopPolling, stopPolling_fn).call(this);
  });
  this.messagingSystem.subscribe(
    "TokenListController:stateChange",
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async ({ tokenList }) => {
      const hasTokens = Object.keys(tokenList).length;
      if (hasTokens) {
        await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _restartTokenDetection, restartTokenDetection_fn).call(this);
      }
    }
  );
  this.messagingSystem.subscribe(
    "PreferencesController:stateChange",
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async ({ useTokenDetection }) => {
      const selectedAccount = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAccount, getSelectedAccount_fn).call(this);
      const isDetectionChangedFromPreferences = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isDetectionEnabledFromPreferences) !== useTokenDetection;
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isDetectionEnabledFromPreferences, useTokenDetection);
      if (isDetectionChangedFromPreferences) {
        await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _restartTokenDetection, restartTokenDetection_fn).call(this, {
          selectedAddress: selectedAccount.address
        });
      }
    }
  );
  this.messagingSystem.subscribe(
    "AccountsController:selectedEvmAccountChange",
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (selectedAccount) => {
      const isSelectedAccountIdChanged = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _selectedAccountId) !== selectedAccount.id;
      if (isSelectedAccountIdChanged) {
        _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _selectedAccountId, selectedAccount.id);
        await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _restartTokenDetection, restartTokenDetection_fn).call(this, {
          selectedAddress: selectedAccount.address
        });
      }
    }
  );
  this.messagingSystem.subscribe(
    "NetworkController:networkDidChange",
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async ({ selectedNetworkClientId }) => {
      const isNetworkClientIdChanged = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _networkClientId) !== selectedNetworkClientId;
      const { chainId: newChainId } = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getCorrectChainIdAndNetworkClientId, getCorrectChainIdAndNetworkClientId_fn).call(this, selectedNetworkClientId);
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isDetectionEnabledForNetwork, _chunkMZI3SDQNjs.isTokenDetectionSupportedForNetwork.call(void 0, newChainId));
      if (isNetworkClientIdChanged && _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isDetectionEnabledForNetwork)) {
        _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _networkClientId, selectedNetworkClientId);
        await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _restartTokenDetection, restartTokenDetection_fn).call(this, {
          networkClientId: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _networkClientId)
        });
      }
    }
  );
};
_stopPolling = new WeakSet();
stopPolling_fn = function() {
  if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _intervalId)) {
    clearInterval(_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _intervalId));
  }
};
_startPolling = new WeakSet();
startPolling_fn = async function() {
  if (!this.isActive) {
    return;
  }
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _stopPolling, stopPolling_fn).call(this);
  await this.detectTokens();
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _intervalId, setInterval(async () => {
    await this.detectTokens();
  }, this.getIntervalLength()));
};
_getCorrectChainIdAndNetworkClientId = new WeakSet();
getCorrectChainIdAndNetworkClientId_fn = function(networkClientId) {
  if (networkClientId) {
    const networkConfiguration = this.messagingSystem.call(
      "NetworkController:getNetworkConfigurationByNetworkClientId",
      networkClientId
    );
    if (networkConfiguration) {
      return {
        chainId: networkConfiguration.chainId,
        networkClientId
      };
    }
  }
  const { selectedNetworkClientId } = this.messagingSystem.call(
    "NetworkController:getState"
  );
  const {
    configuration: { chainId }
  } = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    selectedNetworkClientId
  );
  return {
    chainId,
    networkClientId: selectedNetworkClientId
  };
};
_restartTokenDetection = new WeakSet();
restartTokenDetection_fn = async function({
  selectedAddress,
  networkClientId
} = {}) {
  await this.detectTokens({
    networkClientId,
    selectedAddress
  });
  this.setIntervalLength(DEFAULT_INTERVAL);
};
_getSlicesOfTokensToDetect = new WeakSet();
getSlicesOfTokensToDetect_fn = function({
  chainId,
  selectedAddress
}) {
  const { allTokens, allDetectedTokens, allIgnoredTokens } = this.messagingSystem.call("TokensController:getState");
  const [tokensAddresses, detectedTokensAddresses, ignoredTokensAddresses] = [
    allTokens,
    allDetectedTokens,
    allIgnoredTokens
  ].map(
    (tokens) => (tokens[chainId]?.[selectedAddress] ?? []).map(
      (value) => typeof value === "string" ? value : value.address
    )
  );
  const tokensToDetect = [];
  for (const tokenAddress of Object.keys(_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _tokenList))) {
    if ([
      tokensAddresses,
      detectedTokensAddresses,
      ignoredTokensAddresses
    ].every(
      (addresses) => !addresses.find(
        (address) => isEqualCaseInsensitive(address, tokenAddress)
      )
    )) {
      tokensToDetect.push(tokenAddress);
    }
  }
  const slicesOfTokensToDetect = [];
  for (let i = 0, size = 1e3; i < tokensToDetect.length; i += size) {
    slicesOfTokensToDetect.push(tokensToDetect.slice(i, i + size));
  }
  return slicesOfTokensToDetect;
};
_addDetectedTokens = new WeakSet();
addDetectedTokens_fn = async function({
  tokensSlice,
  selectedAddress,
  networkClientId,
  chainId
}) {
  await _controllerutils.safelyExecute.call(void 0, async () => {
    const balances = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getBalancesInSingleCall).call(this, selectedAddress, tokensSlice, networkClientId);
    const tokensWithBalance = [];
    const eventTokensDetails = [];
    for (const nonZeroTokenAddress of Object.keys(balances)) {
      const { decimals, symbol, aggregators, iconUrl, name } = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _tokenList)[nonZeroTokenAddress];
      eventTokensDetails.push(`${symbol} - ${nonZeroTokenAddress}`);
      tokensWithBalance.push({
        address: nonZeroTokenAddress,
        decimals,
        symbol,
        aggregators,
        image: iconUrl,
        isERC721: false,
        name
      });
    }
    if (tokensWithBalance.length) {
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackMetaMetricsEvent).call(this, {
        event: "Token Detected",
        category: "Wallet",
        properties: {
          tokens: eventTokensDetails,
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          token_standard: "ERC20",
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/naming-convention
          asset_type: "TOKEN"
        }
      });
      await this.messagingSystem.call(
        "TokensController:addDetectedTokens",
        tokensWithBalance,
        {
          selectedAddress,
          chainId
        }
      );
    }
  });
};
_getSelectedAccount = new WeakSet();
getSelectedAccount_fn = function() {
  return this.messagingSystem.call("AccountsController:getSelectedAccount");
};
_getSelectedAddress = new WeakSet();
getSelectedAddress_fn = function() {
  const account = this.messagingSystem.call(
    "AccountsController:getAccount",
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _selectedAccountId)
  );
  return account?.address || "";
};
var TokenDetectionController_default = TokenDetectionController;







exports.isEqualCaseInsensitive = isEqualCaseInsensitive; exports.STATIC_MAINNET_TOKEN_LIST = STATIC_MAINNET_TOKEN_LIST; exports.controllerName = controllerName; exports.TokenDetectionController = TokenDetectionController; exports.TokenDetectionController_default = TokenDetectionController_default;
//# sourceMappingURL=chunk-3LPQTUGG.js.map