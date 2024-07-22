"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunkU7OA6TZZjs = require('./chunk-U7OA6TZZ.js');


var _chunkKQMYR73Xjs = require('./chunk-KQMYR73X.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/helpers/PendingUserOperationTracker.ts
var _controllerutils = require('@metamask/controller-utils');
var _ethquery = require('@metamask/eth-query'); var _ethquery2 = _interopRequireDefault(_ethquery);
var _pollingcontroller = require('@metamask/polling-controller');
var _utils = require('@metamask/utils');
var _events = require('events'); var _events2 = _interopRequireDefault(_events);
var log = _utils.createModuleLogger.call(void 0, _chunkKQMYR73Xjs.projectLogger, "pending-user-operations");
var _getUserOperations, _messenger, _checkUserOperations, checkUserOperations_fn, _checkUserOperation, checkUserOperation_fn, _onUserOperationConfirmed, onUserOperationConfirmed_fn, _onUserOperationFailed, onUserOperationFailed_fn, _getPendingUserOperations, getPendingUserOperations_fn, _updateUserOperation, updateUserOperation_fn, _getUserOperationReceipt, getUserOperationReceipt_fn, _normalizeGasValue, normalizeGasValue_fn;
var PendingUserOperationTracker = class extends _pollingcontroller.BlockTrackerPollingControllerOnly {
  constructor({
    getUserOperations,
    messenger
  }) {
    super();
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _checkUserOperations);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _checkUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onUserOperationConfirmed);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onUserOperationFailed);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getPendingUserOperations);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getUserOperationReceipt);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _normalizeGasValue);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getUserOperations, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _messenger, void 0);
    this.hub = new (0, _events2.default)();
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getUserOperations, getUserOperations);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _messenger, messenger);
  }
  async _executePoll(networkClientId, _options) {
    try {
      const { blockTracker, configuration, provider } = this._getNetworkClientById(networkClientId);
      log("Polling", {
        blockNumber: blockTracker.getCurrentBlock(),
        chainId: configuration.chainId
      });
      await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _checkUserOperations, checkUserOperations_fn).call(this, configuration.chainId, provider);
    } catch (error) {
      log("Failed to check user operations", error);
    }
  }
  _getNetworkClientById(networkClientId) {
    return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _messenger).call(
      "NetworkController:getNetworkClientById",
      networkClientId
    );
  }
};
_getUserOperations = new WeakMap();
_messenger = new WeakMap();
_checkUserOperations = new WeakSet();
checkUserOperations_fn = async function(chainId, provider) {
  const pendingUserOperations = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getPendingUserOperations, getPendingUserOperations_fn).call(this).filter(
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
      (userOperation) => _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _checkUserOperation, checkUserOperation_fn).call(this, userOperation, provider)
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
    const receipt = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getUserOperationReceipt, getUserOperationReceipt_fn).call(this, hash, bundlerUrl);
    const isSuccess = receipt?.success;
    if (receipt && !isSuccess) {
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onUserOperationFailed, onUserOperationFailed_fn).call(this, metadata, receipt);
      return;
    }
    if (isSuccess) {
      await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onUserOperationConfirmed, onUserOperationConfirmed_fn).call(this, metadata, receipt, provider);
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
  const { baseFeePerGas } = await _controllerutils.query.call(void 0, 
    new (0, _ethquery2.default)(provider),
    "getBlockByHash",
    [blockHash, false]
  );
  metadata.actualGasCost = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _normalizeGasValue, normalizeGasValue_fn).call(this, actualGasCost);
  metadata.actualGasUsed = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _normalizeGasValue, normalizeGasValue_fn).call(this, actualGasUsed);
  metadata.baseFeePerGas = baseFeePerGas;
  metadata.status = "confirmed" /* Confirmed */;
  metadata.transactionHash = transactionHash;
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateUserOperation, updateUserOperation_fn).call(this, metadata);
  this.hub.emit("user-operation-confirmed", metadata);
};
_onUserOperationFailed = new WeakSet();
onUserOperationFailed_fn = function(metadata, _receipt) {
  const { id } = metadata;
  log("User operation failed", id);
  metadata.status = "failed" /* Failed */;
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateUserOperation, updateUserOperation_fn).call(this, metadata);
  this.hub.emit(
    "user-operation-failed",
    metadata,
    new Error("User operation receipt has failed status")
  );
};
_getPendingUserOperations = new WeakSet();
getPendingUserOperations_fn = function() {
  return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getUserOperations).call(this).filter(
    (userOperation) => userOperation.status === "submitted" /* Submitted */
  );
};
_updateUserOperation = new WeakSet();
updateUserOperation_fn = function(metadata) {
  this.hub.emit("user-operation-updated", metadata);
};
_getUserOperationReceipt = new WeakSet();
getUserOperationReceipt_fn = async function(hash, bundlerUrl) {
  const bundler = new (0, _chunkU7OA6TZZjs.Bundler)(bundlerUrl);
  return bundler.getUserOperationReceipt(hash);
};
_normalizeGasValue = new WeakSet();
normalizeGasValue_fn = function(gasValue) {
  if (typeof gasValue === "number") {
    return _controllerutils.toHex.call(void 0, gasValue);
  }
  return gasValue;
};



exports.PendingUserOperationTracker = PendingUserOperationTracker;
//# sourceMappingURL=chunk-VPVM4BMS.js.map