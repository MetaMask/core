import {
  createModuleLogger,
  projectLogger
} from "./chunk-UQQWZT6C.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/helpers/PendingTransactionTracker.ts
import { query } from "@metamask/controller-utils";
import EventEmitter from "events";
import { cloneDeep, merge } from "lodash";
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
var log = createModuleLogger(projectLogger, "pending-transactions");
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
    __privateAdd(this, _start);
    __privateAdd(this, _onLatestBlock);
    __privateAdd(this, _checkTransactions);
    __privateAdd(this, _resubmitTransactions);
    __privateAdd(this, _isKnownTransactionError);
    __privateAdd(this, _resubmitTransaction);
    __privateAdd(this, _isResubmitDue);
    __privateAdd(this, _checkTransaction);
    __privateAdd(this, _onTransactionConfirmed);
    __privateAdd(this, _isTransactionDropped);
    __privateAdd(this, _isNonceTaken);
    __privateAdd(this, _getPendingTransactions);
    __privateAdd(this, _warnTransaction);
    __privateAdd(this, _failTransaction);
    __privateAdd(this, _dropTransaction);
    __privateAdd(this, _updateTransaction);
    __privateAdd(this, _getTransactionReceipt);
    __privateAdd(this, _getBlockByHash);
    __privateAdd(this, _getNetworkTransactionCount);
    __privateAdd(this, _getCurrentChainTransactions);
    __privateAdd(this, _approveTransaction, void 0);
    __privateAdd(this, _blockTracker, void 0);
    __privateAdd(this, _droppedBlockCountByHash, void 0);
    __privateAdd(this, _getChainId, void 0);
    __privateAdd(this, _getEthQuery, void 0);
    __privateAdd(this, _getTransactions, void 0);
    __privateAdd(this, _isResubmitEnabled, void 0);
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __privateAdd(this, _listener, void 0);
    __privateAdd(this, _getGlobalLock, void 0);
    __privateAdd(this, _publishTransaction, void 0);
    __privateAdd(this, _running, void 0);
    __privateAdd(this, _beforeCheckPendingTransaction, void 0);
    __privateAdd(this, _beforePublish, void 0);
    this.startIfPendingTransactions = () => {
      const pendingTransactions = __privateMethod(this, _getPendingTransactions, getPendingTransactions_fn).call(this);
      if (pendingTransactions.length) {
        __privateMethod(this, _start, start_fn).call(this);
      } else {
        this.stop();
      }
    };
    this.hub = new EventEmitter();
    __privateSet(this, _approveTransaction, approveTransaction);
    __privateSet(this, _blockTracker, blockTracker);
    __privateSet(this, _droppedBlockCountByHash, /* @__PURE__ */ new Map());
    __privateSet(this, _getChainId, getChainId);
    __privateSet(this, _getEthQuery, getEthQuery);
    __privateSet(this, _getTransactions, getTransactions);
    __privateSet(this, _isResubmitEnabled, isResubmitEnabled ?? (() => true));
    __privateSet(this, _listener, __privateMethod(this, _onLatestBlock, onLatestBlock_fn).bind(this));
    __privateSet(this, _getGlobalLock, getGlobalLock);
    __privateSet(this, _publishTransaction, publishTransaction);
    __privateSet(this, _running, false);
    __privateSet(this, _beforePublish, hooks?.beforePublish ?? (() => true));
    __privateSet(this, _beforeCheckPendingTransaction, hooks?.beforeCheckPendingTransaction ?? (() => true));
  }
  /**
   * Force checks the network if the given transaction is confirmed and updates it's status.
   *
   * @param txMeta - The transaction to check
   */
  async forceCheckTransaction(txMeta) {
    const releaseLock = await __privateGet(this, _getGlobalLock).call(this);
    try {
      await __privateMethod(this, _checkTransaction, checkTransaction_fn).call(this, txMeta);
    } catch (error) {
      log("Failed to check transaction", error);
    } finally {
      releaseLock();
    }
  }
  stop() {
    if (!__privateGet(this, _running)) {
      return;
    }
    __privateGet(this, _blockTracker).removeListener("latest", __privateGet(this, _listener));
    __privateSet(this, _running, false);
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
  if (__privateGet(this, _running)) {
    return;
  }
  __privateGet(this, _blockTracker).on("latest", __privateGet(this, _listener));
  __privateSet(this, _running, true);
  log("Started polling");
};
_onLatestBlock = new WeakSet();
onLatestBlock_fn = async function(latestBlockNumber) {
  const releaseLock = await __privateGet(this, _getGlobalLock).call(this);
  try {
    await __privateMethod(this, _checkTransactions, checkTransactions_fn).call(this);
  } catch (error) {
    log("Failed to check transactions", error);
  } finally {
    releaseLock();
  }
  try {
    await __privateMethod(this, _resubmitTransactions, resubmitTransactions_fn).call(this, latestBlockNumber);
  } catch (error) {
    log("Failed to resubmit transactions", error);
  }
};
_checkTransactions = new WeakSet();
checkTransactions_fn = async function() {
  log("Checking transactions");
  const pendingTransactions = __privateMethod(this, _getPendingTransactions, getPendingTransactions_fn).call(this);
  if (!pendingTransactions.length) {
    log("No pending transactions to check");
    return;
  }
  log("Found pending transactions to check", {
    count: pendingTransactions.length,
    ids: pendingTransactions.map((tx) => tx.id)
  });
  await Promise.all(
    pendingTransactions.map((tx) => __privateMethod(this, _checkTransaction, checkTransaction_fn).call(this, tx))
  );
};
_resubmitTransactions = new WeakSet();
resubmitTransactions_fn = async function(latestBlockNumber) {
  if (!__privateGet(this, _isResubmitEnabled).call(this) || !__privateGet(this, _running)) {
    return;
  }
  log("Resubmitting transactions");
  const pendingTransactions = __privateMethod(this, _getPendingTransactions, getPendingTransactions_fn).call(this);
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
      await __privateMethod(this, _resubmitTransaction, resubmitTransaction_fn).call(this, txMeta, latestBlockNumber);
    } catch (error) {
      const errorMessage = error.value?.message?.toLowerCase() || error.message.toLowerCase();
      if (__privateMethod(this, _isKnownTransactionError, isKnownTransactionError_fn).call(this, errorMessage)) {
        log("Ignoring known transaction error", errorMessage);
        return;
      }
      __privateMethod(this, _warnTransaction, warnTransaction_fn).call(this, txMeta, error.message, "There was an error when resubmitting this transaction.");
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
  if (!__privateMethod(this, _isResubmitDue, isResubmitDue_fn).call(this, txMeta, latestBlockNumber)) {
    return;
  }
  const { rawTx } = txMeta;
  if (!__privateGet(this, _beforePublish).call(this, txMeta)) {
    return;
  }
  if (!rawTx?.length) {
    log("Approving transaction as no raw value");
    await __privateGet(this, _approveTransaction).call(this, txMeta.id);
    return;
  }
  const ethQuery = __privateGet(this, _getEthQuery).call(this, txMeta.networkClientId);
  await __privateGet(this, _publishTransaction).call(this, ethQuery, rawTx);
  const retryCount = (txMeta.retryCount ?? 0) + 1;
  __privateMethod(this, _updateTransaction, updateTransaction_fn).call(this, merge({}, txMeta, { retryCount }), "PendingTransactionTracker:transaction-retry - Retry count increased");
};
_isResubmitDue = new WeakSet();
isResubmitDue_fn = function(txMeta, latestBlockNumber) {
  const txMetaWithFirstRetryBlockNumber = cloneDeep(txMeta);
  if (!txMetaWithFirstRetryBlockNumber.firstRetryBlockNumber) {
    txMetaWithFirstRetryBlockNumber.firstRetryBlockNumber = latestBlockNumber;
    __privateMethod(this, _updateTransaction, updateTransaction_fn).call(this, txMetaWithFirstRetryBlockNumber, "PendingTransactionTracker:#isResubmitDue - First retry block number set");
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
  if (!hash && __privateGet(this, _beforeCheckPendingTransaction).call(this, txMeta)) {
    const error = new Error(
      "We had an error while submitting this transaction, please try again."
    );
    error.name = "NoTxHashError";
    __privateMethod(this, _failTransaction, failTransaction_fn).call(this, txMeta, error);
    return;
  }
  if (__privateMethod(this, _isNonceTaken, isNonceTaken_fn).call(this, txMeta)) {
    log("Nonce already taken", id);
    __privateMethod(this, _dropTransaction, dropTransaction_fn).call(this, txMeta);
    return;
  }
  try {
    const receipt = await __privateMethod(this, _getTransactionReceipt, getTransactionReceipt_fn).call(this, hash);
    const isSuccess = receipt?.status === RECEIPT_STATUS_SUCCESS;
    const isFailure = receipt?.status === RECEIPT_STATUS_FAILURE;
    if (isFailure) {
      log("Transaction receipt has failed status");
      __privateMethod(this, _failTransaction, failTransaction_fn).call(this, txMeta, new Error("Transaction dropped or replaced"));
      return;
    }
    const { blockNumber, blockHash } = receipt || {};
    if (isSuccess && blockNumber && blockHash) {
      await __privateMethod(this, _onTransactionConfirmed, onTransactionConfirmed_fn).call(this, txMeta, {
        ...receipt,
        blockNumber,
        blockHash
      });
      return;
    }
  } catch (error) {
    log("Failed to check transaction", id, error);
    __privateMethod(this, _warnTransaction, warnTransaction_fn).call(this, txMeta, error.message, "There was a problem loading this transaction.");
    return;
  }
  if (await __privateMethod(this, _isTransactionDropped, isTransactionDropped_fn).call(this, txMeta)) {
    __privateMethod(this, _dropTransaction, dropTransaction_fn).call(this, txMeta);
  }
};
_onTransactionConfirmed = new WeakSet();
onTransactionConfirmed_fn = async function(txMeta, receipt) {
  const { id } = txMeta;
  const { blockHash } = receipt;
  log("Transaction confirmed", id);
  const { baseFeePerGas, timestamp: blockTimestamp } = await __privateMethod(this, _getBlockByHash, getBlockByHash_fn).call(this, blockHash, false);
  const updatedTxMeta = cloneDeep(txMeta);
  updatedTxMeta.baseFeePerGas = baseFeePerGas;
  updatedTxMeta.blockTimestamp = blockTimestamp;
  updatedTxMeta.status = "confirmed" /* confirmed */;
  updatedTxMeta.txParams = {
    ...updatedTxMeta.txParams,
    gasUsed: receipt.gasUsed
  };
  updatedTxMeta.txReceipt = receipt;
  updatedTxMeta.verifiedOnBlockchain = true;
  __privateMethod(this, _updateTransaction, updateTransaction_fn).call(this, updatedTxMeta, "PendingTransactionTracker:#onTransactionConfirmed - Transaction confirmed");
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
  const networkNextNonceHex = await __privateMethod(this, _getNetworkTransactionCount, getNetworkTransactionCount_fn).call(this, from);
  const networkNextNonceNumber = parseInt(networkNextNonceHex, 16);
  const nonceNumber = parseInt(nonce, 16);
  if (nonceNumber >= networkNextNonceNumber) {
    return false;
  }
  let droppedBlockCount = __privateGet(this, _droppedBlockCountByHash).get(hash);
  if (droppedBlockCount === void 0) {
    droppedBlockCount = 0;
    __privateGet(this, _droppedBlockCountByHash).set(hash, droppedBlockCount);
  }
  if (droppedBlockCount < DROPPED_BLOCK_COUNT) {
    log("Incrementing dropped block count", { id, droppedBlockCount });
    __privateGet(this, _droppedBlockCountByHash).set(hash, droppedBlockCount + 1);
    return false;
  }
  log("Hit dropped block count", id);
  __privateGet(this, _droppedBlockCountByHash).delete(hash);
  return true;
};
_isNonceTaken = new WeakSet();
isNonceTaken_fn = function(txMeta) {
  const { id, txParams } = txMeta;
  return __privateMethod(this, _getCurrentChainTransactions, getCurrentChainTransactions_fn).call(this).some(
    (tx) => tx.id !== id && tx.txParams.from === txParams.from && tx.status === "confirmed" /* confirmed */ && tx.txParams.nonce === txParams.nonce && tx.type !== "incoming" /* incoming */
  );
};
_getPendingTransactions = new WeakSet();
getPendingTransactions_fn = function() {
  return __privateMethod(this, _getCurrentChainTransactions, getCurrentChainTransactions_fn).call(this).filter(
    (tx) => tx.status === "submitted" /* submitted */ && !tx.verifiedOnBlockchain && !tx.isUserOperation
  );
};
_warnTransaction = new WeakSet();
warnTransaction_fn = function(txMeta, error, message) {
  __privateMethod(this, _updateTransaction, updateTransaction_fn).call(this, {
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
  return await query(__privateGet(this, _getEthQuery).call(this), "getTransactionReceipt", [txHash]);
};
_getBlockByHash = new WeakSet();
getBlockByHash_fn = async function(blockHash, includeTransactionDetails) {
  return await query(__privateGet(this, _getEthQuery).call(this), "getBlockByHash", [
    blockHash,
    includeTransactionDetails
  ]);
};
_getNetworkTransactionCount = new WeakSet();
getNetworkTransactionCount_fn = async function(address) {
  return await query(__privateGet(this, _getEthQuery).call(this), "getTransactionCount", [address]);
};
_getCurrentChainTransactions = new WeakSet();
getCurrentChainTransactions_fn = function() {
  const currentChainId = __privateGet(this, _getChainId).call(this);
  return __privateGet(this, _getTransactions).call(this).filter(
    (tx) => tx.chainId === currentChainId
  );
};

export {
  PendingTransactionTracker
};
//# sourceMappingURL=chunk-6B5BEO3R.mjs.map