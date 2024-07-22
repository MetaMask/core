"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/helpers/IncomingTransactionHelper.ts
var _asyncmutex = require('async-mutex');
var _events = require('events'); var _events2 = _interopRequireDefault(_events);
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
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _sortTransactionsByTime);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getNewTransactions);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getUpdatedTransactions);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isTransactionOutdated);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getLastFetchedBlockNumberDec);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getFromBlock);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateLastFetchedBlockNumber);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getBlockNumberKey);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _canStart);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _blockTracker, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getCurrentAccount, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getLastFetchedBlockNumbers, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getLocalTransactions, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getChainId, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isEnabled, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isRunning, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _mutex, new (0, _asyncmutex.Mutex)());
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onLatestBlock, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _queryEntireHistory, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _remoteTransactionSource, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _transactionLimit, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateTransactions, void 0);
    this.hub = new (0, _events2.default)();
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _blockTracker, blockTracker);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getCurrentAccount, getCurrentAccount);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getLastFetchedBlockNumbers, getLastFetchedBlockNumbers);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getLocalTransactions, getLocalTransactions || (() => []));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getChainId, getChainId);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isEnabled, isEnabled ?? (() => true));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isRunning, false);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _queryEntireHistory, queryEntireHistory ?? true);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _remoteTransactionSource, remoteTransactionSource);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _transactionLimit, transactionLimit);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _updateTransactions, updateTransactions ?? false);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _onLatestBlock, async (blockNumberHex) => {
      try {
        await this.update(blockNumberHex);
      } catch (error) {
        console.error("Error while checking incoming transactions", error);
      }
    });
  }
  start() {
    if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isRunning)) {
      return;
    }
    if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _canStart, canStart_fn).call(this)) {
      return;
    }
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _blockTracker).addListener("latest", _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _onLatestBlock));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isRunning, true);
  }
  stop() {
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _blockTracker).removeListener("latest", _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _onLatestBlock));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isRunning, false);
  }
  async update(latestBlockNumberHex) {
    const releaseLock = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _mutex).acquire();
    _chunkS6VGOPUYjs.incomingTransactionsLogger.call(void 0, "Checking for incoming transactions");
    try {
      if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _canStart, canStart_fn).call(this)) {
        return;
      }
      const latestBlockNumber = parseInt(
        latestBlockNumberHex || await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _blockTracker).getLatestBlock(),
        16
      );
      const additionalLastFetchedKeys = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _remoteTransactionSource).getLastBlockVariations?.() ?? [];
      const fromBlock = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getFromBlock, getFromBlock_fn).call(this, latestBlockNumber);
      const account = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getCurrentAccount).call(this);
      const currentChainId = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getChainId).call(this);
      let remoteTransactions = [];
      try {
        remoteTransactions = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _remoteTransactionSource).fetchTransactions({
          address: account.address,
          currentChainId,
          fromBlock,
          limit: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _transactionLimit)
        });
      } catch (error) {
        _chunkS6VGOPUYjs.incomingTransactionsLogger.call(void 0, "Error while fetching remote transactions", error);
        return;
      }
      if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _updateTransactions)) {
        const address = account.address.toLowerCase();
        remoteTransactions = remoteTransactions.filter(
          (tx) => tx.txParams.to?.toLowerCase() === address
        );
      }
      const localTransactions = !_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _updateTransactions) ? [] : _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getLocalTransactions).call(this);
      const newTransactions = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getNewTransactions, getNewTransactions_fn).call(this, remoteTransactions, localTransactions);
      const updatedTransactions = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getUpdatedTransactions, getUpdatedTransactions_fn).call(this, remoteTransactions, localTransactions);
      if (newTransactions.length > 0 || updatedTransactions.length > 0) {
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _sortTransactionsByTime, sortTransactionsByTime_fn).call(this, newTransactions);
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _sortTransactionsByTime, sortTransactionsByTime_fn).call(this, updatedTransactions);
        _chunkS6VGOPUYjs.incomingTransactionsLogger.call(void 0, "Found incoming transactions", {
          new: newTransactions,
          updated: updatedTransactions
        });
        this.hub.emit("transactions", {
          added: newTransactions,
          updated: updatedTransactions
        });
      }
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateLastFetchedBlockNumber, updateLastFetchedBlockNumber_fn).call(this, remoteTransactions, additionalLastFetchedKeys);
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
      (localTx) => remoteTx.hash === localTx.hash && _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isTransactionOutdated, isTransactionOutdated_fn).call(this, remoteTx, localTx)
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
  const additionalLastFetchedKeys = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _remoteTransactionSource).getLastBlockVariations?.() ?? [];
  const lastFetchedKey = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getBlockNumberKey, getBlockNumberKey_fn).call(this, additionalLastFetchedKeys);
  const lastFetchedBlockNumbers = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getLastFetchedBlockNumbers).call(this);
  return lastFetchedBlockNumbers[lastFetchedKey];
};
_getFromBlock = new WeakSet();
getFromBlock_fn = function(latestBlockNumber) {
  const lastFetchedBlockNumber = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getLastFetchedBlockNumberDec, getLastFetchedBlockNumberDec_fn).call(this);
  if (lastFetchedBlockNumber) {
    return lastFetchedBlockNumber + 1;
  }
  return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _queryEntireHistory) ? void 0 : latestBlockNumber - RECENT_HISTORY_BLOCK_RANGE;
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
  const lastFetchedKey = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getBlockNumberKey, getBlockNumberKey_fn).call(this, additionalKeys);
  const lastFetchedBlockNumbers = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getLastFetchedBlockNumbers).call(this);
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
  const currentChainId = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getChainId).call(this);
  const currentAccount = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getCurrentAccount).call(this)?.address.toLowerCase();
  return [currentChainId, currentAccount, ...additionalKeys].join("#");
};
_canStart = new WeakSet();
canStart_fn = function() {
  const isEnabled = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isEnabled).call(this);
  const currentChainId = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getChainId).call(this);
  const isSupportedNetwork = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _remoteTransactionSource).isSupportedNetwork(currentChainId);
  return isEnabled && isSupportedNetwork;
};



exports.IncomingTransactionHelper = IncomingTransactionHelper;
//# sourceMappingURL=chunk-RHDPOIS4.js.map