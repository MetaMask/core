"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/helpers/PendingTransactionTracker.ts
var _controllerutils = require('@metamask/controller-utils');
var _events = require('events'); var _events2 = _interopRequireDefault(_events);
var _lodash = require('lodash');
var DROPPED_BLOCK_COUNT = 3;
var RECEIPT_STATUS_SUCCESS = "0x1";
var RECEIPT_STATUS_FAILURE = "0x0";
var MAX_RETRY_BLOCK_DISTANCE = 50;
var KNOWN_TRANSACTION_ERRORS = [
  "replacement transaction underpriced",
  "known transaction",
  "gas price too low to replace",
  "transaction with the same hash was already imported",
  "gateway timeout",
  "nonce too low"
];
var log = _chunkS6VGOPUYjs.createModuleLogger.call(void 0, _chunkS6VGOPUYjs.projectLogger, "pending-transactions");
var _approveTransaction, _blockTracker, _droppedBlockCountByHash, _getChainId, _getEthQuery, _getTransactions, _isResubmitEnabled, _listener, _getGlobalLock, _publishTransaction, _running, _beforeCheckPendingTransaction, _beforePublish, _start, start_fn, _onLatestBlock, onLatestBlock_fn, _checkTransactions, checkTransactions_fn, _resubmitTransactions, resubmitTransactions_fn, _isKnownTransactionError, isKnownTransactionError_fn, _resubmitTransaction, resubmitTransaction_fn, _isResubmitDue, isResubmitDue_fn, _checkTransaction, checkTransaction_fn, _onTransactionConfirmed, onTransactionConfirmed_fn, _isTransactionDropped, isTransactionDropped_fn, _isNonceTaken, isNonceTaken_fn, _getPendingTransactions, getPendingTransactions_fn, _warnTransaction, warnTransaction_fn, _failTransaction, failTransaction_fn, _dropTransaction, dropTransaction_fn, _updateTransaction, updateTransaction_fn, _getTransactionReceipt, getTransactionReceipt_fn, _getBlockByHash, getBlockByHash_fn, _getNetworkTransactionCount, getNetworkTransactionCount_fn, _getCurrentChainTransactions, getCurrentChainTransactions_fn;
var PendingTransactionTracker = class {
  constructor({
    approveTransaction,
    blockTracker,
    getChainId,
    getEthQuery,
    getTransactions,
    isResubmitEnabled,
    getGlobalLock,
    publishTransaction,
    hooks
  }) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _start);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onLatestBlock);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _checkTransactions);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _resubmitTransactions);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isKnownTransactionError);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _resubmitTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isResubmitDue);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _checkTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onTransactionConfirmed);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isTransactionDropped);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isNonceTaken);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getPendingTransactions);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _warnTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _failTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _dropTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getTransactionReceipt);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getBlockByHash);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getNetworkTransactionCount);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getCurrentChainTransactions);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _approveTransaction, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _blockTracker, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _droppedBlockCountByHash, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getChainId, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getEthQuery, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getTransactions, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isResubmitEnabled, void 0);
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _listener, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getGlobalLock, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _publishTransaction, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _running, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _beforeCheckPendingTransaction, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _beforePublish, void 0);
    this.startIfPendingTransactions = () => {
      const pendingTransactions = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getPendingTransactions, getPendingTransactions_fn).call(this);
      if (pendingTransactions.length) {
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _start, start_fn).call(this);
      } else {
        this.stop();
      }
    };
    this.hub = new (0, _events2.default)();
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _approveTransaction, approveTransaction);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _blockTracker, blockTracker);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _droppedBlockCountByHash, /* @__PURE__ */ new Map());
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getChainId, getChainId);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getEthQuery, getEthQuery);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getTransactions, getTransactions);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isResubmitEnabled, isResubmitEnabled ?? (() => true));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _listener, _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onLatestBlock, onLatestBlock_fn).bind(this));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getGlobalLock, getGlobalLock);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _publishTransaction, publishTransaction);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _running, false);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _beforePublish, hooks?.beforePublish ?? (() => true));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _beforeCheckPendingTransaction, hooks?.beforeCheckPendingTransaction ?? (() => true));
  }
  /**
   * Force checks the network if the given transaction is confirmed and updates it's status.
   *
   * @param txMeta - The transaction to check
   */
  async forceCheckTransaction(txMeta) {
    const releaseLock = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getGlobalLock).call(this);
    try {
      await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _checkTransaction, checkTransaction_fn).call(this, txMeta);
    } catch (error) {
      log("Failed to check transaction", error);
    } finally {
      releaseLock();
    }
  }
  stop() {
    if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _running)) {
      return;
    }
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _blockTracker).removeListener("latest", _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _listener));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _running, false);
    log("Stopped polling");
  }
};
_approveTransaction = new WeakMap();
_blockTracker = new WeakMap();
_droppedBlockCountByHash = new WeakMap();
_getChainId = new WeakMap();
_getEthQuery = new WeakMap();
_getTransactions = new WeakMap();
_isResubmitEnabled = new WeakMap();
_listener = new WeakMap();
_getGlobalLock = new WeakMap();
_publishTransaction = new WeakMap();
_running = new WeakMap();
_beforeCheckPendingTransaction = new WeakMap();
_beforePublish = new WeakMap();
_start = new WeakSet();
start_fn = function() {
  if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _running)) {
    return;
  }
  _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _blockTracker).on("latest", _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _listener));
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _running, true);
  log("Started polling");
};
_onLatestBlock = new WeakSet();
onLatestBlock_fn = async function(latestBlockNumber) {
  const releaseLock = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getGlobalLock).call(this);
  try {
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _checkTransactions, checkTransactions_fn).call(this);
  } catch (error) {
    log("Failed to check transactions", error);
  } finally {
    releaseLock();
  }
  try {
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _resubmitTransactions, resubmitTransactions_fn).call(this, latestBlockNumber);
  } catch (error) {
    log("Failed to resubmit transactions", error);
  }
};
_checkTransactions = new WeakSet();
checkTransactions_fn = async function() {
  log("Checking transactions");
  const pendingTransactions = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getPendingTransactions, getPendingTransactions_fn).call(this);
  if (!pendingTransactions.length) {
    log("No pending transactions to check");
    return;
  }
  log("Found pending transactions to check", {
    count: pendingTransactions.length,
    ids: pendingTransactions.map((tx) => tx.id)
  });
  await Promise.all(
    pendingTransactions.map((tx) => _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _checkTransaction, checkTransaction_fn).call(this, tx))
  );
};
_resubmitTransactions = new WeakSet();
resubmitTransactions_fn = async function(latestBlockNumber) {
  if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isResubmitEnabled).call(this) || !_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _running)) {
    return;
  }
  log("Resubmitting transactions");
  const pendingTransactions = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getPendingTransactions, getPendingTransactions_fn).call(this);
  if (!pendingTransactions.length) {
    log("No pending transactions to resubmit");
    return;
  }
  log("Found pending transactions to resubmit", {
    count: pendingTransactions.length,
    ids: pendingTransactions.map((tx) => tx.id)
  });
  for (const txMeta of pendingTransactions) {
    try {
      await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _resubmitTransaction, resubmitTransaction_fn).call(this, txMeta, latestBlockNumber);
    } catch (error) {
      const errorMessage = error.value?.message?.toLowerCase() || error.message.toLowerCase();
      if (_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isKnownTransactionError, isKnownTransactionError_fn).call(this, errorMessage)) {
        log("Ignoring known transaction error", errorMessage);
        return;
      }
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _warnTransaction, warnTransaction_fn).call(this, txMeta, error.message, "There was an error when resubmitting this transaction.");
    }
  }
};
_isKnownTransactionError = new WeakSet();
isKnownTransactionError_fn = function(errorMessage) {
  return KNOWN_TRANSACTION_ERRORS.some(
    (knownError) => errorMessage.includes(knownError)
  );
};
_resubmitTransaction = new WeakSet();
resubmitTransaction_fn = async function(txMeta, latestBlockNumber) {
  if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isResubmitDue, isResubmitDue_fn).call(this, txMeta, latestBlockNumber)) {
    return;
  }
  const { rawTx } = txMeta;
  if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _beforePublish).call(this, txMeta)) {
    return;
  }
  if (!rawTx?.length) {
    log("Approving transaction as no raw value");
    await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _approveTransaction).call(this, txMeta.id);
    return;
  }
  const ethQuery = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getEthQuery).call(this, txMeta.networkClientId);
  await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _publishTransaction).call(this, ethQuery, rawTx);
  const retryCount = (txMeta.retryCount ?? 0) + 1;
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransaction, updateTransaction_fn).call(this, _lodash.merge.call(void 0, {}, txMeta, { retryCount }), "PendingTransactionTracker:transaction-retry - Retry count increased");
};
_isResubmitDue = new WeakSet();
isResubmitDue_fn = function(txMeta, latestBlockNumber) {
  const txMetaWithFirstRetryBlockNumber = _lodash.cloneDeep.call(void 0, txMeta);
  if (!txMetaWithFirstRetryBlockNumber.firstRetryBlockNumber) {
    txMetaWithFirstRetryBlockNumber.firstRetryBlockNumber = latestBlockNumber;
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransaction, updateTransaction_fn).call(this, txMetaWithFirstRetryBlockNumber, "PendingTransactionTracker:#isResubmitDue - First retry block number set");
  }
  const { firstRetryBlockNumber } = txMetaWithFirstRetryBlockNumber;
  const blocksSinceFirstRetry = Number.parseInt(latestBlockNumber, 16) - Number.parseInt(firstRetryBlockNumber, 16);
  const retryCount = txMeta.retryCount || 0;
  const requiredBlocksSinceFirstRetry = Math.min(
    MAX_RETRY_BLOCK_DISTANCE,
    Math.pow(2, retryCount)
  );
  return blocksSinceFirstRetry >= requiredBlocksSinceFirstRetry;
};
_checkTransaction = new WeakSet();
checkTransaction_fn = async function(txMeta) {
  const { hash, id } = txMeta;
  if (!hash && _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _beforeCheckPendingTransaction).call(this, txMeta)) {
    const error = new Error(
      "We had an error while submitting this transaction, please try again."
    );
    error.name = "NoTxHashError";
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _failTransaction, failTransaction_fn).call(this, txMeta, error);
    return;
  }
  if (_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isNonceTaken, isNonceTaken_fn).call(this, txMeta)) {
    log("Nonce already taken", id);
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _dropTransaction, dropTransaction_fn).call(this, txMeta);
    return;
  }
  try {
    const receipt = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getTransactionReceipt, getTransactionReceipt_fn).call(this, hash);
    const isSuccess = receipt?.status === RECEIPT_STATUS_SUCCESS;
    const isFailure = receipt?.status === RECEIPT_STATUS_FAILURE;
    if (isFailure) {
      log("Transaction receipt has failed status");
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _failTransaction, failTransaction_fn).call(this, txMeta, new Error("Transaction dropped or replaced"));
      return;
    }
    const { blockNumber, blockHash } = receipt || {};
    if (isSuccess && blockNumber && blockHash) {
      await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onTransactionConfirmed, onTransactionConfirmed_fn).call(this, txMeta, {
        ...receipt,
        blockNumber,
        blockHash
      });
      return;
    }
  } catch (error) {
    log("Failed to check transaction", id, error);
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _warnTransaction, warnTransaction_fn).call(this, txMeta, error.message, "There was a problem loading this transaction.");
    return;
  }
  if (await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isTransactionDropped, isTransactionDropped_fn).call(this, txMeta)) {
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _dropTransaction, dropTransaction_fn).call(this, txMeta);
  }
};
_onTransactionConfirmed = new WeakSet();
onTransactionConfirmed_fn = async function(txMeta, receipt) {
  const { id } = txMeta;
  const { blockHash } = receipt;
  log("Transaction confirmed", id);
  const { baseFeePerGas, timestamp: blockTimestamp } = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getBlockByHash, getBlockByHash_fn).call(this, blockHash, false);
  const updatedTxMeta = _lodash.cloneDeep.call(void 0, txMeta);
  updatedTxMeta.baseFeePerGas = baseFeePerGas;
  updatedTxMeta.blockTimestamp = blockTimestamp;
  updatedTxMeta.status = "confirmed" /* confirmed */;
  updatedTxMeta.txParams = {
    ...updatedTxMeta.txParams,
    gasUsed: receipt.gasUsed
  };
  updatedTxMeta.txReceipt = receipt;
  updatedTxMeta.verifiedOnBlockchain = true;
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransaction, updateTransaction_fn).call(this, updatedTxMeta, "PendingTransactionTracker:#onTransactionConfirmed - Transaction confirmed");
  this.hub.emit("transaction-confirmed", updatedTxMeta);
};
_isTransactionDropped = new WeakSet();
isTransactionDropped_fn = async function(txMeta) {
  const {
    hash,
    id,
    txParams: { nonce, from }
  } = txMeta;
  if (!nonce || !hash) {
    return false;
  }
  const networkNextNonceHex = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getNetworkTransactionCount, getNetworkTransactionCount_fn).call(this, from);
  const networkNextNonceNumber = parseInt(networkNextNonceHex, 16);
  const nonceNumber = parseInt(nonce, 16);
  if (nonceNumber >= networkNextNonceNumber) {
    return false;
  }
  let droppedBlockCount = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _droppedBlockCountByHash).get(hash);
  if (droppedBlockCount === void 0) {
    droppedBlockCount = 0;
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _droppedBlockCountByHash).set(hash, droppedBlockCount);
  }
  if (droppedBlockCount < DROPPED_BLOCK_COUNT) {
    log("Incrementing dropped block count", { id, droppedBlockCount });
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _droppedBlockCountByHash).set(hash, droppedBlockCount + 1);
    return false;
  }
  log("Hit dropped block count", id);
  _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _droppedBlockCountByHash).delete(hash);
  return true;
};
_isNonceTaken = new WeakSet();
isNonceTaken_fn = function(txMeta) {
  const { id, txParams } = txMeta;
  return _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getCurrentChainTransactions, getCurrentChainTransactions_fn).call(this).some(
    (tx) => tx.id !== id && tx.txParams.from === txParams.from && tx.status === "confirmed" /* confirmed */ && tx.txParams.nonce === txParams.nonce && tx.type !== "incoming" /* incoming */
  );
};
_getPendingTransactions = new WeakSet();
getPendingTransactions_fn = function() {
  return _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getCurrentChainTransactions, getCurrentChainTransactions_fn).call(this).filter(
    (tx) => tx.status === "submitted" /* submitted */ && !tx.verifiedOnBlockchain && !tx.isUserOperation
  );
};
_warnTransaction = new WeakSet();
warnTransaction_fn = function(txMeta, error, message) {
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransaction, updateTransaction_fn).call(this, {
    ...txMeta,
    warning: { error, message }
  }, "PendingTransactionTracker:#warnTransaction - Warning added");
};
_failTransaction = new WeakSet();
failTransaction_fn = function(txMeta, error) {
  log("Transaction failed", txMeta.id, error);
  this.hub.emit("transaction-failed", txMeta, error);
};
_dropTransaction = new WeakSet();
dropTransaction_fn = function(txMeta) {
  log("Transaction dropped", txMeta.id);
  this.hub.emit("transaction-dropped", txMeta);
};
_updateTransaction = new WeakSet();
updateTransaction_fn = function(txMeta, note) {
  this.hub.emit("transaction-updated", txMeta, note);
};
_getTransactionReceipt = new WeakSet();
getTransactionReceipt_fn = async function(txHash) {
  return await _controllerutils.query.call(void 0, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getEthQuery).call(this), "getTransactionReceipt", [txHash]);
};
_getBlockByHash = new WeakSet();
getBlockByHash_fn = async function(blockHash, includeTransactionDetails) {
  return await _controllerutils.query.call(void 0, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getEthQuery).call(this), "getBlockByHash", [
    blockHash,
    includeTransactionDetails
  ]);
};
_getNetworkTransactionCount = new WeakSet();
getNetworkTransactionCount_fn = async function(address) {
  return await _controllerutils.query.call(void 0, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getEthQuery).call(this), "getTransactionCount", [address]);
};
_getCurrentChainTransactions = new WeakSet();
getCurrentChainTransactions_fn = function() {
  const currentChainId = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getChainId).call(this);
  return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getTransactions).call(this).filter(
    (tx) => tx.chainId === currentChainId
  );
};



exports.PendingTransactionTracker = PendingTransactionTracker;
//# sourceMappingURL=chunk-ULD4JC3Q.js.map