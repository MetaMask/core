import {
  EtherscanRemoteTransactionSource
} from "./chunk-EKJXGERC.mjs";
import {
  incomingTransactionsLogger
} from "./chunk-UQQWZT6C.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/helpers/MultichainTrackingHelper.ts
import EthQuery from "@metamask/eth-query";
import { Mutex } from "async-mutex";
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
    __privateAdd(this, _stopTrackingByNetworkClientId);
    __privateAdd(this, _startTrackingByNetworkClientId);
    __privateAdd(this, _getNetworkClient);
    __privateAdd(this, _isMultichainEnabled, void 0);
    __privateAdd(this, _provider, void 0);
    __privateAdd(this, _nonceTracker, void 0);
    __privateAdd(this, _incomingTransactionOptions, void 0);
    __privateAdd(this, _findNetworkClientIdByChainId, void 0);
    __privateAdd(this, _getNetworkClientById, void 0);
    __privateAdd(this, _getNetworkClientRegistry, void 0);
    __privateAdd(this, _removeIncomingTransactionHelperListeners, void 0);
    __privateAdd(this, _removePendingTransactionTrackerListeners, void 0);
    __privateAdd(this, _createNonceTracker, void 0);
    __privateAdd(this, _createIncomingTransactionHelper, void 0);
    __privateAdd(this, _createPendingTransactionTracker, void 0);
    __privateAdd(this, _nonceMutexesByChainId, /* @__PURE__ */ new Map());
    __privateAdd(this, _trackingMap, /* @__PURE__ */ new Map());
    __privateAdd(this, _etherscanRemoteTransactionSourcesMap, /* @__PURE__ */ new Map());
    this.checkForPendingTransactionAndStartPolling = () => {
      for (const [, trackers] of __privateGet(this, _trackingMap)) {
        trackers.pendingTransactionTracker.startIfPendingTransactions();
      }
    };
    __privateAdd(this, _refreshTrackingMap, (networkClients) => {
      __privateGet(this, _refreshEtherscanRemoteTransactionSources).call(this, networkClients);
      const networkClientIds = Object.keys(networkClients);
      const existingNetworkClientIds = Array.from(__privateGet(this, _trackingMap).keys());
      const networkClientIdsToRemove = existingNetworkClientIds.filter(
        (id) => !networkClientIds.includes(id)
      );
      networkClientIdsToRemove.forEach((id) => {
        __privateMethod(this, _stopTrackingByNetworkClientId, stopTrackingByNetworkClientId_fn).call(this, id);
      });
      const networkClientIdsToAdd = networkClientIds.filter(
        (id) => !existingNetworkClientIds.includes(id)
      );
      networkClientIdsToAdd.forEach((id) => {
        __privateMethod(this, _startTrackingByNetworkClientId, startTrackingByNetworkClientId_fn).call(this, id);
      });
    });
    __privateAdd(this, _refreshEtherscanRemoteTransactionSources, (networkClients) => {
      const chainIdsInRegistry = /* @__PURE__ */ new Set();
      Object.values(networkClients).forEach(
        (networkClient) => chainIdsInRegistry.add(networkClient.configuration.chainId)
      );
      const existingChainIds = Array.from(
        __privateGet(this, _etherscanRemoteTransactionSourcesMap).keys()
      );
      const chainIdsToRemove = existingChainIds.filter(
        (chainId) => !chainIdsInRegistry.has(chainId)
      );
      chainIdsToRemove.forEach((chainId) => {
        __privateGet(this, _etherscanRemoteTransactionSourcesMap).delete(chainId);
      });
    });
    __privateSet(this, _isMultichainEnabled, isMultichainEnabled);
    __privateSet(this, _provider, provider);
    __privateSet(this, _nonceTracker, nonceTracker);
    __privateSet(this, _incomingTransactionOptions, incomingTransactionOptions);
    __privateSet(this, _findNetworkClientIdByChainId, findNetworkClientIdByChainId);
    __privateSet(this, _getNetworkClientById, getNetworkClientById);
    __privateSet(this, _getNetworkClientRegistry, getNetworkClientRegistry);
    __privateSet(this, _removeIncomingTransactionHelperListeners, removeIncomingTransactionHelperListeners);
    __privateSet(this, _removePendingTransactionTrackerListeners, removePendingTransactionTrackerListeners);
    __privateSet(this, _createNonceTracker, createNonceTracker);
    __privateSet(this, _createIncomingTransactionHelper, createIncomingTransactionHelper);
    __privateSet(this, _createPendingTransactionTracker, createPendingTransactionTracker);
    onNetworkStateChange((_, patches) => {
      if (__privateGet(this, _isMultichainEnabled)) {
        const networkClients = __privateGet(this, _getNetworkClientRegistry).call(this);
        patches.forEach(({ op, path }) => {
          if (op === "remove" && path[0] === "networkConfigurations") {
            const networkClientId = path[1];
            delete networkClients[networkClientId];
          }
        });
        __privateGet(this, _refreshTrackingMap).call(this, networkClients);
      }
    });
  }
  initialize() {
    if (!__privateGet(this, _isMultichainEnabled)) {
      return;
    }
    const networkClients = __privateGet(this, _getNetworkClientRegistry).call(this);
    __privateGet(this, _refreshTrackingMap).call(this, networkClients);
  }
  has(networkClientId) {
    return __privateGet(this, _trackingMap).has(networkClientId);
  }
  getEthQuery({
    networkClientId,
    chainId
  } = {}) {
    if (!__privateGet(this, _isMultichainEnabled)) {
      return new EthQuery(this.getProvider());
    }
    return new EthQuery(this.getProvider({ networkClientId, chainId }));
  }
  getProvider({
    networkClientId,
    chainId
  } = {}) {
    if (!__privateGet(this, _isMultichainEnabled)) {
      return __privateGet(this, _provider);
    }
    const networkClient = __privateMethod(this, _getNetworkClient, getNetworkClient_fn).call(this, {
      networkClientId,
      chainId
    });
    return networkClient?.provider || __privateGet(this, _provider);
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
    let nonceMutexesForChainId = __privateGet(this, _nonceMutexesByChainId).get(chainId);
    if (!nonceMutexesForChainId) {
      nonceMutexesForChainId = /* @__PURE__ */ new Map();
      __privateGet(this, _nonceMutexesByChainId).set(chainId, nonceMutexesForChainId);
    }
    let nonceMutexForKey = nonceMutexesForChainId.get(key);
    if (!nonceMutexForKey) {
      nonceMutexForKey = new Mutex();
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
    let nonceTracker = __privateGet(this, _nonceTracker);
    if (networkClientId && __privateGet(this, _isMultichainEnabled)) {
      const networkClient = __privateGet(this, _getNetworkClientById).call(this, networkClientId);
      releaseLockForChainIdKey = await this.acquireNonceLockForChainIdKey({
        chainId: networkClient.configuration.chainId,
        key: address
      });
      const trackers = __privateGet(this, _trackingMap).get(networkClientId);
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
      __privateGet(this, _trackingMap).get(networkClientId)?.incomingTransactionHelper.start();
    });
  }
  stopIncomingTransactionPolling(networkClientIds = []) {
    networkClientIds.forEach((networkClientId) => {
      __privateGet(this, _trackingMap).get(networkClientId)?.incomingTransactionHelper.stop();
    });
  }
  stopAllIncomingTransactionPolling() {
    for (const [, trackers] of __privateGet(this, _trackingMap)) {
      trackers.incomingTransactionHelper.stop();
    }
  }
  async updateIncomingTransactions(networkClientIds = []) {
    const promises = await Promise.allSettled(
      networkClientIds.map(async (networkClientId) => {
        return await __privateGet(this, _trackingMap).get(networkClientId)?.incomingTransactionHelper.update();
      })
    );
    promises.filter((result) => result.status === "rejected").forEach((result) => {
      incomingTransactionsLogger(
        "failed to update incoming transactions",
        result.reason
      );
    });
  }
  stopAllTracking() {
    for (const [networkClientId] of __privateGet(this, _trackingMap)) {
      __privateMethod(this, _stopTrackingByNetworkClientId, stopTrackingByNetworkClientId_fn).call(this, networkClientId);
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
  const trackers = __privateGet(this, _trackingMap).get(networkClientId);
  if (trackers) {
    trackers.pendingTransactionTracker.stop();
    __privateGet(this, _removePendingTransactionTrackerListeners).call(this, trackers.pendingTransactionTracker);
    trackers.incomingTransactionHelper.stop();
    __privateGet(this, _removeIncomingTransactionHelperListeners).call(this, trackers.incomingTransactionHelper);
    __privateGet(this, _trackingMap).delete(networkClientId);
  }
};
_startTrackingByNetworkClientId = new WeakSet();
startTrackingByNetworkClientId_fn = function(networkClientId) {
  const trackers = __privateGet(this, _trackingMap).get(networkClientId);
  if (trackers) {
    return;
  }
  const {
    provider,
    blockTracker,
    configuration: { chainId }
  } = __privateGet(this, _getNetworkClientById).call(this, networkClientId);
  let etherscanRemoteTransactionSource = __privateGet(this, _etherscanRemoteTransactionSourcesMap).get(chainId);
  if (!etherscanRemoteTransactionSource) {
    etherscanRemoteTransactionSource = new EtherscanRemoteTransactionSource({
      includeTokenTransfers: __privateGet(this, _incomingTransactionOptions).includeTokenTransfers
    });
    __privateGet(this, _etherscanRemoteTransactionSourcesMap).set(
      chainId,
      etherscanRemoteTransactionSource
    );
  }
  const nonceTracker = __privateGet(this, _createNonceTracker).call(this, {
    provider,
    blockTracker,
    chainId
  });
  const incomingTransactionHelper = __privateGet(this, _createIncomingTransactionHelper).call(this, {
    blockTracker,
    etherscanRemoteTransactionSource,
    chainId
  });
  const pendingTransactionTracker = __privateGet(this, _createPendingTransactionTracker).call(this, {
    provider,
    blockTracker,
    chainId
  });
  __privateGet(this, _trackingMap).set(networkClientId, {
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
      networkClient = __privateGet(this, _getNetworkClientById).call(this, networkClientId);
    } catch (err) {
      incomingTransactionsLogger("failed to get network client by networkClientId");
    }
  }
  if (!networkClient && chainId) {
    try {
      const networkClientIdForChainId = __privateGet(this, _findNetworkClientIdByChainId).call(this, chainId);
      networkClient = __privateGet(this, _getNetworkClientById).call(this, networkClientIdForChainId);
    } catch (err) {
      incomingTransactionsLogger("failed to get network client by chainId");
    }
  }
  return networkClient;
};

export {
  MultichainTrackingHelper
};
//# sourceMappingURL=chunk-4V4XIPCI.mjs.map