import {
  Bundler
} from "./chunk-GURRJAHH.mjs";
import {
  projectLogger
} from "./chunk-DKF5XCNY.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/helpers/PendingUserOperationTracker.ts
import { query, toHex } from "@metamask/controller-utils";
import EthQuery from "@metamask/eth-query";
import { BlockTrackerPollingControllerOnly } from "@metamask/polling-controller";
import { createModuleLogger } from "@metamask/utils";
import EventEmitter from "events";
var log = createModuleLogger(projectLogger, "pending-user-operations");
var _getUserOperations, _messenger, _checkUserOperations, checkUserOperations_fn, _checkUserOperation, checkUserOperation_fn, _onUserOperationConfirmed, onUserOperationConfirmed_fn, _onUserOperationFailed, onUserOperationFailed_fn, _getPendingUserOperations, getPendingUserOperations_fn, _updateUserOperation, updateUserOperation_fn, _getUserOperationReceipt, getUserOperationReceipt_fn, _normalizeGasValue, normalizeGasValue_fn;
var PendingUserOperationTracker = class extends BlockTrackerPollingControllerOnly {
  constructor({
    getUserOperations,
    messenger
  }) {
    super();
    __privateAdd(this, _checkUserOperations);
    __privateAdd(this, _checkUserOperation);
    __privateAdd(this, _onUserOperationConfirmed);
    __privateAdd(this, _onUserOperationFailed);
    __privateAdd(this, _getPendingUserOperations);
    __privateAdd(this, _updateUserOperation);
    __privateAdd(this, _getUserOperationReceipt);
    __privateAdd(this, _normalizeGasValue);
    __privateAdd(this, _getUserOperations, void 0);
    __privateAdd(this, _messenger, void 0);
    this.hub = new EventEmitter();
    __privateSet(this, _getUserOperations, getUserOperations);
    __privateSet(this, _messenger, messenger);
  }
  async _executePoll(networkClientId, _options) {
    try {
      const { blockTracker, configuration, provider } = this._getNetworkClientById(networkClientId);
      log("Polling", {
        blockNumber: blockTracker.getCurrentBlock(),
        chainId: configuration.chainId
      });
      await __privateMethod(this, _checkUserOperations, checkUserOperations_fn).call(this, configuration.chainId, provider);
    } catch (error) {
      log("Failed to check user operations", error);
    }
  }
  _getNetworkClientById(networkClientId) {
    return __privateGet(this, _messenger).call(
      "NetworkController:getNetworkClientById",
      networkClientId
    );
  }
};
_getUserOperations = new WeakMap();
_messenger = new WeakMap();
_checkUserOperations = new WeakSet();
checkUserOperations_fn = async function(chainId, provider) {
  const pendingUserOperations = __privateMethod(this, _getPendingUserOperations, getPendingUserOperations_fn).call(this).filter(
    (metadata) => metadata.chainId === chainId
  );
  if (!pendingUserOperations.length) {
    log("No pending user operations to check");
    return;
  }
  log("Found pending user operations to check", {
    count: pendingUserOperations.length,
    ids: pendingUserOperations.map((userOperation) => userOperation.id)
  });
  await Promise.all(
    pendingUserOperations.map(
      (userOperation) => __privateMethod(this, _checkUserOperation, checkUserOperation_fn).call(this, userOperation, provider)
    )
  );
};
_checkUserOperation = new WeakSet();
checkUserOperation_fn = async function(metadata, provider) {
  const { bundlerUrl, hash, id } = metadata;
  if (!hash || !bundlerUrl) {
    log("Skipping user operation as missing hash or bundler", id);
    return;
  }
  try {
    const receipt = await __privateMethod(this, _getUserOperationReceipt, getUserOperationReceipt_fn).call(this, hash, bundlerUrl);
    const isSuccess = receipt?.success;
    if (receipt && !isSuccess) {
      __privateMethod(this, _onUserOperationFailed, onUserOperationFailed_fn).call(this, metadata, receipt);
      return;
    }
    if (isSuccess) {
      await __privateMethod(this, _onUserOperationConfirmed, onUserOperationConfirmed_fn).call(this, metadata, receipt, provider);
      return;
    }
    log("No receipt found for user operation", { id, hash });
  } catch (error) {
    log("Failed to check user operation", id, error);
  }
};
_onUserOperationConfirmed = new WeakSet();
onUserOperationConfirmed_fn = async function(metadata, receipt, provider) {
  const { id } = metadata;
  const {
    actualGasCost,
    actualGasUsed,
    receipt: { blockHash, transactionHash }
  } = receipt;
  log("User operation confirmed", id, transactionHash);
  const { baseFeePerGas } = await query(
    new EthQuery(provider),
    "getBlockByHash",
    [blockHash, false]
  );
  metadata.actualGasCost = __privateMethod(this, _normalizeGasValue, normalizeGasValue_fn).call(this, actualGasCost);
  metadata.actualGasUsed = __privateMethod(this, _normalizeGasValue, normalizeGasValue_fn).call(this, actualGasUsed);
  metadata.baseFeePerGas = baseFeePerGas;
  metadata.status = "confirmed" /* Confirmed */;
  metadata.transactionHash = transactionHash;
  __privateMethod(this, _updateUserOperation, updateUserOperation_fn).call(this, metadata);
  this.hub.emit("user-operation-confirmed", metadata);
};
_onUserOperationFailed = new WeakSet();
onUserOperationFailed_fn = function(metadata, _receipt) {
  const { id } = metadata;
  log("User operation failed", id);
  metadata.status = "failed" /* Failed */;
  __privateMethod(this, _updateUserOperation, updateUserOperation_fn).call(this, metadata);
  this.hub.emit(
    "user-operation-failed",
    metadata,
    new Error("User operation receipt has failed status")
  );
};
_getPendingUserOperations = new WeakSet();
getPendingUserOperations_fn = function() {
  return __privateGet(this, _getUserOperations).call(this).filter(
    (userOperation) => userOperation.status === "submitted" /* Submitted */
  );
};
_updateUserOperation = new WeakSet();
updateUserOperation_fn = function(metadata) {
  this.hub.emit("user-operation-updated", metadata);
};
_getUserOperationReceipt = new WeakSet();
getUserOperationReceipt_fn = async function(hash, bundlerUrl) {
  const bundler = new Bundler(bundlerUrl);
  return bundler.getUserOperationReceipt(hash);
};
_normalizeGasValue = new WeakSet();
normalizeGasValue_fn = function(gasValue) {
  if (typeof gasValue === "number") {
    return toHex(gasValue);
  }
  return gasValue;
};

export {
  PendingUserOperationTracker
};
//# sourceMappingURL=chunk-IWFF455L.mjs.map