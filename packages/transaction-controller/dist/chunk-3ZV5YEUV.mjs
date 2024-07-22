import {
  incomingTransactionsLogger
} from "./chunk-UQQWZT6C.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/helpers/IncomingTransactionHelper.ts
import { Mutex } from "async-mutex";
import EventEmitter from "events";
var RECENT_HISTORY_BLOCK_RANGE = 10;
var UPDATE_CHECKS = [
  (txMeta) => txMeta.status,
  (txMeta) => txMeta.txParams.gasUsed
];
var _blockTracker, _getCurrentAccount, _getLastFetchedBlockNumbers, _getLocalTransactions, _getChainId, _isEnabled, _isRunning, _mutex, _onLatestBlock, _queryEntireHistory, _remoteTransactionSource, _transactionLimit, _updateTransactions, _sortTransactionsByTime, sortTransactionsByTime_fn, _getNewTransactions, getNewTransactions_fn, _getUpdatedTransactions, getUpdatedTransactions_fn, _isTransactionOutdated, isTransactionOutdated_fn, _getLastFetchedBlockNumberDec, getLastFetchedBlockNumberDec_fn, _getFromBlock, getFromBlock_fn, _updateLastFetchedBlockNumber, updateLastFetchedBlockNumber_fn, _getBlockNumberKey, getBlockNumberKey_fn, _canStart, canStart_fn;
var IncomingTransactionHelper = class {
  constructor({
    blockTracker,
    getCurrentAccount,
    getLastFetchedBlockNumbers,
    getLocalTransactions,
    getChainId,
    isEnabled,
    queryEntireHistory,
    remoteTransactionSource,
    transactionLimit,
    updateTransactions
  }) {
    __privateAdd(this, _sortTransactionsByTime);
    __privateAdd(this, _getNewTransactions);
    __privateAdd(this, _getUpdatedTransactions);
    __privateAdd(this, _isTransactionOutdated);
    __privateAdd(this, _getLastFetchedBlockNumberDec);
    __privateAdd(this, _getFromBlock);
    __privateAdd(this, _updateLastFetchedBlockNumber);
    __privateAdd(this, _getBlockNumberKey);
    __privateAdd(this, _canStart);
    __privateAdd(this, _blockTracker, void 0);
    __privateAdd(this, _getCurrentAccount, void 0);
    __privateAdd(this, _getLastFetchedBlockNumbers, void 0);
    __privateAdd(this, _getLocalTransactions, void 0);
    __privateAdd(this, _getChainId, void 0);
    __privateAdd(this, _isEnabled, void 0);
    __privateAdd(this, _isRunning, void 0);
    __privateAdd(this, _mutex, new Mutex());
    __privateAdd(this, _onLatestBlock, void 0);
    __privateAdd(this, _queryEntireHistory, void 0);
    __privateAdd(this, _remoteTransactionSource, void 0);
    __privateAdd(this, _transactionLimit, void 0);
    __privateAdd(this, _updateTransactions, void 0);
    this.hub = new EventEmitter();
    __privateSet(this, _blockTracker, blockTracker);
    __privateSet(this, _getCurrentAccount, getCurrentAccount);
    __privateSet(this, _getLastFetchedBlockNumbers, getLastFetchedBlockNumbers);
    __privateSet(this, _getLocalTransactions, getLocalTransactions || (() => []));
    __privateSet(this, _getChainId, getChainId);
    __privateSet(this, _isEnabled, isEnabled ?? (() => true));
    __privateSet(this, _isRunning, false);
    __privateSet(this, _queryEntireHistory, queryEntireHistory ?? true);
    __privateSet(this, _remoteTransactionSource, remoteTransactionSource);
    __privateSet(this, _transactionLimit, transactionLimit);
    __privateSet(this, _updateTransactions, updateTransactions ?? false);
    __privateSet(this, _onLatestBlock, async (blockNumberHex) => {
      try {
        await this.update(blockNumberHex);
      } catch (error) {
        console.error("Error while checking incoming transactions", error);
      }
    });
  }
  start() {
    if (__privateGet(this, _isRunning)) {
      return;
    }
    if (!__privateMethod(this, _canStart, canStart_fn).call(this)) {
      return;
    }
    __privateGet(this, _blockTracker).addListener("latest", __privateGet(this, _onLatestBlock));
    __privateSet(this, _isRunning, true);
  }
  stop() {
    __privateGet(this, _blockTracker).removeListener("latest", __privateGet(this, _onLatestBlock));
    __privateSet(this, _isRunning, false);
  }
  async update(latestBlockNumberHex) {
    const releaseLock = await __privateGet(this, _mutex).acquire();
    incomingTransactionsLogger("Checking for incoming transactions");
    try {
      if (!__privateMethod(this, _canStart, canStart_fn).call(this)) {
        return;
      }
      const latestBlockNumber = parseInt(
        latestBlockNumberHex || await __privateGet(this, _blockTracker).getLatestBlock(),
        16
      );
      const additionalLastFetchedKeys = __privateGet(this, _remoteTransactionSource).getLastBlockVariations?.() ?? [];
      const fromBlock = __privateMethod(this, _getFromBlock, getFromBlock_fn).call(this, latestBlockNumber);
      const account = __privateGet(this, _getCurrentAccount).call(this);
      const currentChainId = __privateGet(this, _getChainId).call(this);
      let remoteTransactions = [];
      try {
        remoteTransactions = await __privateGet(this, _remoteTransactionSource).fetchTransactions({
          address: account.address,
          currentChainId,
          fromBlock,
          limit: __privateGet(this, _transactionLimit)
        });
      } catch (error) {
        incomingTransactionsLogger("Error while fetching remote transactions", error);
        return;
      }
      if (!__privateGet(this, _updateTransactions)) {
        const address = account.address.toLowerCase();
        remoteTransactions = remoteTransactions.filter(
          (tx) => tx.txParams.to?.toLowerCase() === address
        );
      }
      const localTransactions = !__privateGet(this, _updateTransactions) ? [] : __privateGet(this, _getLocalTransactions).call(this);
      const newTransactions = __privateMethod(this, _getNewTransactions, getNewTransactions_fn).call(this, remoteTransactions, localTransactions);
      const updatedTransactions = __privateMethod(this, _getUpdatedTransactions, getUpdatedTransactions_fn).call(this, remoteTransactions, localTransactions);
      if (newTransactions.length > 0 || updatedTransactions.length > 0) {
        __privateMethod(this, _sortTransactionsByTime, sortTransactionsByTime_fn).call(this, newTransactions);
        __privateMethod(this, _sortTransactionsByTime, sortTransactionsByTime_fn).call(this, updatedTransactions);
        incomingTransactionsLogger("Found incoming transactions", {
          new: newTransactions,
          updated: updatedTransactions
        });
        this.hub.emit("transactions", {
          added: newTransactions,
          updated: updatedTransactions
        });
      }
      __privateMethod(this, _updateLastFetchedBlockNumber, updateLastFetchedBlockNumber_fn).call(this, remoteTransactions, additionalLastFetchedKeys);
    } finally {
      releaseLock();
    }
  }
};
_blockTracker = new WeakMap();
_getCurrentAccount = new WeakMap();
_getLastFetchedBlockNumbers = new WeakMap();
_getLocalTransactions = new WeakMap();
_getChainId = new WeakMap();
_isEnabled = new WeakMap();
_isRunning = new WeakMap();
_mutex = new WeakMap();
_onLatestBlock = new WeakMap();
_queryEntireHistory = new WeakMap();
_remoteTransactionSource = new WeakMap();
_transactionLimit = new WeakMap();
_updateTransactions = new WeakMap();
_sortTransactionsByTime = new WeakSet();
sortTransactionsByTime_fn = function(transactions) {
  transactions.sort((a, b) => a.time < b.time ? -1 : 1);
};
_getNewTransactions = new WeakSet();
getNewTransactions_fn = function(remoteTxs, localTxs) {
  return remoteTxs.filter(
    (tx) => !localTxs.some(({ hash }) => hash === tx.hash)
  );
};
_getUpdatedTransactions = new WeakSet();
getUpdatedTransactions_fn = function(remoteTxs, localTxs) {
  return remoteTxs.filter(
    (remoteTx) => localTxs.some(
      (localTx) => remoteTx.hash === localTx.hash && __privateMethod(this, _isTransactionOutdated, isTransactionOutdated_fn).call(this, remoteTx, localTx)
    )
  );
};
_isTransactionOutdated = new WeakSet();
isTransactionOutdated_fn = function(remoteTx, localTx) {
  return UPDATE_CHECKS.some(
    (getValue) => getValue(remoteTx) !== getValue(localTx)
  );
};
_getLastFetchedBlockNumberDec = new WeakSet();
getLastFetchedBlockNumberDec_fn = function() {
  const additionalLastFetchedKeys = __privateGet(this, _remoteTransactionSource).getLastBlockVariations?.() ?? [];
  const lastFetchedKey = __privateMethod(this, _getBlockNumberKey, getBlockNumberKey_fn).call(this, additionalLastFetchedKeys);
  const lastFetchedBlockNumbers = __privateGet(this, _getLastFetchedBlockNumbers).call(this);
  return lastFetchedBlockNumbers[lastFetchedKey];
};
_getFromBlock = new WeakSet();
getFromBlock_fn = function(latestBlockNumber) {
  const lastFetchedBlockNumber = __privateMethod(this, _getLastFetchedBlockNumberDec, getLastFetchedBlockNumberDec_fn).call(this);
  if (lastFetchedBlockNumber) {
    return lastFetchedBlockNumber + 1;
  }
  return __privateGet(this, _queryEntireHistory) ? void 0 : latestBlockNumber - RECENT_HISTORY_BLOCK_RANGE;
};
_updateLastFetchedBlockNumber = new WeakSet();
updateLastFetchedBlockNumber_fn = function(remoteTxs, additionalKeys) {
  let lastFetchedBlockNumber = -1;
  for (const tx of remoteTxs) {
    const currentBlockNumberValue = tx.blockNumber ? parseInt(tx.blockNumber, 10) : -1;
    lastFetchedBlockNumber = Math.max(
      lastFetchedBlockNumber,
      currentBlockNumberValue
    );
  }
  if (lastFetchedBlockNumber === -1) {
    return;
  }
  const lastFetchedKey = __privateMethod(this, _getBlockNumberKey, getBlockNumberKey_fn).call(this, additionalKeys);
  const lastFetchedBlockNumbers = __privateGet(this, _getLastFetchedBlockNumbers).call(this);
  const previousValue = lastFetchedBlockNumbers[lastFetchedKey];
  if (previousValue >= lastFetchedBlockNumber) {
    return;
  }
  this.hub.emit("updatedLastFetchedBlockNumbers", {
    lastFetchedBlockNumbers: {
      ...lastFetchedBlockNumbers,
      [lastFetchedKey]: lastFetchedBlockNumber
    },
    blockNumber: lastFetchedBlockNumber
  });
};
_getBlockNumberKey = new WeakSet();
getBlockNumberKey_fn = function(additionalKeys) {
  const currentChainId = __privateGet(this, _getChainId).call(this);
  const currentAccount = __privateGet(this, _getCurrentAccount).call(this)?.address.toLowerCase();
  return [currentChainId, currentAccount, ...additionalKeys].join("#");
};
_canStart = new WeakSet();
canStart_fn = function() {
  const isEnabled = __privateGet(this, _isEnabled).call(this);
  const currentChainId = __privateGet(this, _getChainId).call(this);
  const isSupportedNetwork = __privateGet(this, _remoteTransactionSource).isSupportedNetwork(currentChainId);
  return isEnabled && isSupportedNetwork;
};

export {
  IncomingTransactionHelper
};
//# sourceMappingURL=chunk-3ZV5YEUV.mjs.map