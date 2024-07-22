"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunk7NMV2NPMjs = require('./chunk-7NMV2NPM.js');


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/helpers/MultichainTrackingHelper.ts
var _ethquery = require('@metamask/eth-query'); var _ethquery2 = _interopRequireDefault(_ethquery);
var _asyncmutex = require('async-mutex');
var _isMultichainEnabled, _provider, _nonceTracker, _incomingTransactionOptions, _findNetworkClientIdByChainId, _getNetworkClientById, _getNetworkClientRegistry, _removeIncomingTransactionHelperListeners, _removePendingTransactionTrackerListeners, _createNonceTracker, _createIncomingTransactionHelper, _createPendingTransactionTracker, _nonceMutexesByChainId, _trackingMap, _etherscanRemoteTransactionSourcesMap, _refreshTrackingMap, _stopTrackingByNetworkClientId, stopTrackingByNetworkClientId_fn, _startTrackingByNetworkClientId, startTrackingByNetworkClientId_fn, _refreshEtherscanRemoteTransactionSources, _getNetworkClient, getNetworkClient_fn;
var MultichainTrackingHelper = class {
  constructor({
    isMultichainEnabled,
    provider,
    nonceTracker,
    incomingTransactionOptions,
    findNetworkClientIdByChainId,
    getNetworkClientById,
    getNetworkClientRegistry,
    removeIncomingTransactionHelperListeners,
    removePendingTransactionTrackerListeners,
    createNonceTracker,
    createIncomingTransactionHelper,
    createPendingTransactionTracker,
    onNetworkStateChange
  }) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _stopTrackingByNetworkClientId);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _startTrackingByNetworkClientId);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getNetworkClient);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isMultichainEnabled, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _provider, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _nonceTracker, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _incomingTransactionOptions, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _findNetworkClientIdByChainId, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getNetworkClientById, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getNetworkClientRegistry, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _removeIncomingTransactionHelperListeners, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _removePendingTransactionTrackerListeners, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _createNonceTracker, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _createIncomingTransactionHelper, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _createPendingTransactionTracker, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _nonceMutexesByChainId, /* @__PURE__ */ new Map());
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _trackingMap, /* @__PURE__ */ new Map());
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _etherscanRemoteTransactionSourcesMap, /* @__PURE__ */ new Map());
    this.checkForPendingTransactionAndStartPolling = () => {
      for (const [, trackers] of _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap)) {
        trackers.pendingTransactionTracker.startIfPendingTransactions();
      }
    };
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _refreshTrackingMap, (networkClients) => {
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _refreshEtherscanRemoteTransactionSources).call(this, networkClients);
      const networkClientIds = Object.keys(networkClients);
      const existingNetworkClientIds = Array.from(_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap).keys());
      const networkClientIdsToRemove = existingNetworkClientIds.filter(
        (id) => !networkClientIds.includes(id)
      );
      networkClientIdsToRemove.forEach((id) => {
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _stopTrackingByNetworkClientId, stopTrackingByNetworkClientId_fn).call(this, id);
      });
      const networkClientIdsToAdd = networkClientIds.filter(
        (id) => !existingNetworkClientIds.includes(id)
      );
      networkClientIdsToAdd.forEach((id) => {
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _startTrackingByNetworkClientId, startTrackingByNetworkClientId_fn).call(this, id);
      });
    });
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _refreshEtherscanRemoteTransactionSources, (networkClients) => {
      const chainIdsInRegistry = /* @__PURE__ */ new Set();
      Object.values(networkClients).forEach(
        (networkClient) => chainIdsInRegistry.add(networkClient.configuration.chainId)
      );
      const existingChainIds = Array.from(
        _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _etherscanRemoteTransactionSourcesMap).keys()
      );
      const chainIdsToRemove = existingChainIds.filter(
        (chainId) => !chainIdsInRegistry.has(chainId)
      );
      chainIdsToRemove.forEach((chainId) => {
        _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _etherscanRemoteTransactionSourcesMap).delete(chainId);
      });
    });
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isMultichainEnabled, isMultichainEnabled);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _provider, provider);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _nonceTracker, nonceTracker);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _incomingTransactionOptions, incomingTransactionOptions);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _findNetworkClientIdByChainId, findNetworkClientIdByChainId);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getNetworkClientById, getNetworkClientById);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getNetworkClientRegistry, getNetworkClientRegistry);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _removeIncomingTransactionHelperListeners, removeIncomingTransactionHelperListeners);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _removePendingTransactionTrackerListeners, removePendingTransactionTrackerListeners);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _createNonceTracker, createNonceTracker);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _createIncomingTransactionHelper, createIncomingTransactionHelper);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _createPendingTransactionTracker, createPendingTransactionTracker);
    onNetworkStateChange((_, patches) => {
      if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isMultichainEnabled)) {
        const networkClients = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getNetworkClientRegistry).call(this);
        patches.forEach(({ op, path }) => {
          if (op === "remove" && path[0] === "networkConfigurations") {
            const networkClientId = path[1];
            delete networkClients[networkClientId];
          }
        });
        _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _refreshTrackingMap).call(this, networkClients);
      }
    });
  }
  initialize() {
    if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isMultichainEnabled)) {
      return;
    }
    const networkClients = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getNetworkClientRegistry).call(this);
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _refreshTrackingMap).call(this, networkClients);
  }
  has(networkClientId) {
    return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap).has(networkClientId);
  }
  getEthQuery({
    networkClientId,
    chainId
  } = {}) {
    if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isMultichainEnabled)) {
      return new (0, _ethquery2.default)(this.getProvider());
    }
    return new (0, _ethquery2.default)(this.getProvider({ networkClientId, chainId }));
  }
  getProvider({
    networkClientId,
    chainId
  } = {}) {
    if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isMultichainEnabled)) {
      return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _provider);
    }
    const networkClient = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getNetworkClient, getNetworkClient_fn).call(this, {
      networkClientId,
      chainId
    });
    return networkClient?.provider || _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _provider);
  }
  /**
   * Gets the mutex intended to guard the nonceTracker for a particular chainId and key .
   *
   * @param opts - The options object.
   * @param opts.chainId - The hex chainId.
   * @param opts.key - The hex address (or constant) pertaining to the chainId
   * @returns Mutex instance for the given chainId and key pair
   */
  async acquireNonceLockForChainIdKey({
    chainId,
    key = "global"
  }) {
    let nonceMutexesForChainId = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _nonceMutexesByChainId).get(chainId);
    if (!nonceMutexesForChainId) {
      nonceMutexesForChainId = /* @__PURE__ */ new Map();
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _nonceMutexesByChainId).set(chainId, nonceMutexesForChainId);
    }
    let nonceMutexForKey = nonceMutexesForChainId.get(key);
    if (!nonceMutexForKey) {
      nonceMutexForKey = new (0, _asyncmutex.Mutex)();
      nonceMutexesForChainId.set(key, nonceMutexForKey);
    }
    return await nonceMutexForKey.acquire();
  }
  /**
   * Gets the next nonce according to the nonce-tracker.
   * Ensure `releaseLock` is called once processing of the `nonce` value is complete.
   *
   * @param address - The hex string address for the transaction.
   * @param networkClientId - The network client ID for the transaction, used to fetch the correct nonce tracker.
   * @returns object with the `nextNonce` `nonceDetails`, and the releaseLock.
   */
  async getNonceLock(address, networkClientId) {
    let releaseLockForChainIdKey;
    let nonceTracker = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _nonceTracker);
    if (networkClientId && _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isMultichainEnabled)) {
      const networkClient = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getNetworkClientById).call(this, networkClientId);
      releaseLockForChainIdKey = await this.acquireNonceLockForChainIdKey({
        chainId: networkClient.configuration.chainId,
        key: address
      });
      const trackers = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap).get(networkClientId);
      if (!trackers) {
        throw new Error("missing nonceTracker for networkClientId");
      }
      nonceTracker = trackers.nonceTracker;
    }
    try {
      const nonceLock = await nonceTracker.getNonceLock(address);
      return {
        ...nonceLock,
        releaseLock: () => {
          nonceLock.releaseLock();
          releaseLockForChainIdKey?.();
        }
      };
    } catch (err) {
      releaseLockForChainIdKey?.();
      throw err;
    }
  }
  startIncomingTransactionPolling(networkClientIds = []) {
    networkClientIds.forEach((networkClientId) => {
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap).get(networkClientId)?.incomingTransactionHelper.start();
    });
  }
  stopIncomingTransactionPolling(networkClientIds = []) {
    networkClientIds.forEach((networkClientId) => {
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap).get(networkClientId)?.incomingTransactionHelper.stop();
    });
  }
  stopAllIncomingTransactionPolling() {
    for (const [, trackers] of _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap)) {
      trackers.incomingTransactionHelper.stop();
    }
  }
  async updateIncomingTransactions(networkClientIds = []) {
    const promises = await Promise.allSettled(
      networkClientIds.map(async (networkClientId) => {
        return await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap).get(networkClientId)?.incomingTransactionHelper.update();
      })
    );
    promises.filter((result) => result.status === "rejected").forEach((result) => {
      _chunkS6VGOPUYjs.incomingTransactionsLogger.call(void 0, 
        "failed to update incoming transactions",
        result.reason
      );
    });
  }
  stopAllTracking() {
    for (const [networkClientId] of _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap)) {
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _stopTrackingByNetworkClientId, stopTrackingByNetworkClientId_fn).call(this, networkClientId);
    }
  }
};
_isMultichainEnabled = new WeakMap();
_provider = new WeakMap();
_nonceTracker = new WeakMap();
_incomingTransactionOptions = new WeakMap();
_findNetworkClientIdByChainId = new WeakMap();
_getNetworkClientById = new WeakMap();
_getNetworkClientRegistry = new WeakMap();
_removeIncomingTransactionHelperListeners = new WeakMap();
_removePendingTransactionTrackerListeners = new WeakMap();
_createNonceTracker = new WeakMap();
_createIncomingTransactionHelper = new WeakMap();
_createPendingTransactionTracker = new WeakMap();
_nonceMutexesByChainId = new WeakMap();
_trackingMap = new WeakMap();
_etherscanRemoteTransactionSourcesMap = new WeakMap();
_refreshTrackingMap = new WeakMap();
_stopTrackingByNetworkClientId = new WeakSet();
stopTrackingByNetworkClientId_fn = function(networkClientId) {
  const trackers = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap).get(networkClientId);
  if (trackers) {
    trackers.pendingTransactionTracker.stop();
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _removePendingTransactionTrackerListeners).call(this, trackers.pendingTransactionTracker);
    trackers.incomingTransactionHelper.stop();
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _removeIncomingTransactionHelperListeners).call(this, trackers.incomingTransactionHelper);
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap).delete(networkClientId);
  }
};
_startTrackingByNetworkClientId = new WeakSet();
startTrackingByNetworkClientId_fn = function(networkClientId) {
  const trackers = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap).get(networkClientId);
  if (trackers) {
    return;
  }
  const {
    provider,
    blockTracker,
    configuration: { chainId }
  } = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getNetworkClientById).call(this, networkClientId);
  let etherscanRemoteTransactionSource = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _etherscanRemoteTransactionSourcesMap).get(chainId);
  if (!etherscanRemoteTransactionSource) {
    etherscanRemoteTransactionSource = new (0, _chunk7NMV2NPMjs.EtherscanRemoteTransactionSource)({
      includeTokenTransfers: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _incomingTransactionOptions).includeTokenTransfers
    });
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _etherscanRemoteTransactionSourcesMap).set(
      chainId,
      etherscanRemoteTransactionSource
    );
  }
  const nonceTracker = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _createNonceTracker).call(this, {
    provider,
    blockTracker,
    chainId
  });
  const incomingTransactionHelper = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _createIncomingTransactionHelper).call(this, {
    blockTracker,
    etherscanRemoteTransactionSource,
    chainId
  });
  const pendingTransactionTracker = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _createPendingTransactionTracker).call(this, {
    provider,
    blockTracker,
    chainId
  });
  _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _trackingMap).set(networkClientId, {
    nonceTracker,
    incomingTransactionHelper,
    pendingTransactionTracker
  });
};
_refreshEtherscanRemoteTransactionSources = new WeakMap();
_getNetworkClient = new WeakSet();
getNetworkClient_fn = function({
  networkClientId,
  chainId
} = {}) {
  let networkClient;
  if (networkClientId) {
    try {
      networkClient = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getNetworkClientById).call(this, networkClientId);
    } catch (err) {
      _chunkS6VGOPUYjs.incomingTransactionsLogger.call(void 0, "failed to get network client by networkClientId");
    }
  }
  if (!networkClient && chainId) {
    try {
      const networkClientIdForChainId = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _findNetworkClientIdByChainId).call(this, chainId);
      networkClient = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getNetworkClientById).call(this, networkClientIdForChainId);
    } catch (err) {
      _chunkS6VGOPUYjs.incomingTransactionsLogger.call(void 0, "failed to get network client by chainId");
    }
  }
  return networkClient;
};



exports.MultichainTrackingHelper = MultichainTrackingHelper;
//# sourceMappingURL=chunk-6OLJWLKK.js.map