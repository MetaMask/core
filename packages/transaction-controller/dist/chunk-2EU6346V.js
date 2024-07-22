"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunk2XKEAKQGjs = require('./chunk-2XKEAKQG.js');


var _chunk76FONEDAjs = require('./chunk-76FONEDA.js');


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/helpers/GasFeePoller.ts
var _ethquery = require('@metamask/eth-query'); var _ethquery2 = _interopRequireDefault(_ethquery);
var _utils = require('@metamask/utils');
var _events = require('events'); var _events2 = _interopRequireDefault(_events);
var log = _utils.createModuleLogger.call(void 0, _chunkS6VGOPUYjs.projectLogger, "gas-fee-poller");
var INTERVAL_MILLISECONDS = 1e4;
var _findNetworkClientIdByChainId, _gasFeeFlows, _getGasFeeControllerEstimates, _getProvider, _getTransactions, _layer1GasFeeFlows, _timeout, _running, _start, start_fn, _stop, stop_fn, _onTimeout, onTimeout_fn, _updateUnapprovedTransactions, updateUnapprovedTransactions_fn, _updateUnapprovedTransaction, updateUnapprovedTransaction_fn, _updateTransactionGasFeeEstimates, updateTransactionGasFeeEstimates_fn, _updateTransactionLayer1GasFee, updateTransactionLayer1GasFee_fn, _getUnapprovedTransactions, getUnapprovedTransactions_fn, _getGasFeeControllerData, getGasFeeControllerData_fn;
var GasFeePoller = class {
  /**
   * Constructs a new instance of the GasFeePoller.
   * @param options - The options for this instance.
   * @param options.findNetworkClientIdByChainId - Callback to find the network client ID by chain ID.
   * @param options.gasFeeFlows - The gas fee flows to use to obtain suitable gas fees.
   * @param options.getGasFeeControllerEstimates - Callback to obtain the default fee estimates.
   * @param options.getProvider - Callback to obtain a provider instance.
   * @param options.getTransactions - Callback to obtain the transaction data.
   * @param options.layer1GasFeeFlows - The layer 1 gas fee flows to use to obtain suitable layer 1 gas fees.
   * @param options.onStateChange - Callback to register a listener for controller state changes.
   */
  constructor({
    findNetworkClientIdByChainId,
    gasFeeFlows,
    getGasFeeControllerEstimates,
    getProvider,
    getTransactions,
    layer1GasFeeFlows,
    onStateChange
  }) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _start);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _stop);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onTimeout);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateUnapprovedTransactions);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateUnapprovedTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateTransactionGasFeeEstimates);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateTransactionLayer1GasFee);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getUnapprovedTransactions);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getGasFeeControllerData);
    this.hub = new (0, _events2.default)();
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _findNetworkClientIdByChainId, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _gasFeeFlows, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getGasFeeControllerEstimates, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getProvider, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getTransactions, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _layer1GasFeeFlows, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _timeout, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _running, false);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _findNetworkClientIdByChainId, findNetworkClientIdByChainId);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _gasFeeFlows, gasFeeFlows);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _layer1GasFeeFlows, layer1GasFeeFlows);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getGasFeeControllerEstimates, getGasFeeControllerEstimates);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getProvider, getProvider);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getTransactions, getTransactions);
    onStateChange(() => {
      const unapprovedTransactions = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getUnapprovedTransactions, getUnapprovedTransactions_fn).call(this);
      if (unapprovedTransactions.length) {
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _start, start_fn).call(this);
      } else {
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _stop, stop_fn).call(this);
      }
    });
  }
};
_findNetworkClientIdByChainId = new WeakMap();
_gasFeeFlows = new WeakMap();
_getGasFeeControllerEstimates = new WeakMap();
_getProvider = new WeakMap();
_getTransactions = new WeakMap();
_layer1GasFeeFlows = new WeakMap();
_timeout = new WeakMap();
_running = new WeakMap();
_start = new WeakSet();
start_fn = function() {
  if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _running)) {
    return;
  }
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onTimeout, onTimeout_fn).call(this);
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _running, true);
  log("Started polling");
};
_stop = new WeakSet();
stop_fn = function() {
  if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _running)) {
    return;
  }
  clearTimeout(_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _timeout));
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _timeout, void 0);
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _running, false);
  log("Stopped polling");
};
_onTimeout = new WeakSet();
onTimeout_fn = async function() {
  await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateUnapprovedTransactions, updateUnapprovedTransactions_fn).call(this);
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _timeout, setTimeout(() => _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onTimeout, onTimeout_fn).call(this), INTERVAL_MILLISECONDS));
};
_updateUnapprovedTransactions = new WeakSet();
updateUnapprovedTransactions_fn = async function() {
  const unapprovedTransactions = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getUnapprovedTransactions, getUnapprovedTransactions_fn).call(this);
  if (!unapprovedTransactions.length) {
    return;
  }
  log("Found unapproved transactions", unapprovedTransactions.length);
  const gasFeeControllerDataByChainId = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getGasFeeControllerData, getGasFeeControllerData_fn).call(this, unapprovedTransactions);
  log("Retrieved gas fee controller data", gasFeeControllerDataByChainId);
  await Promise.all(
    unapprovedTransactions.flatMap((tx) => {
      const { chainId } = tx;
      const gasFeeControllerData = gasFeeControllerDataByChainId.get(
        chainId
      );
      return _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateUnapprovedTransaction, updateUnapprovedTransaction_fn).call(this, tx, gasFeeControllerData);
    })
  );
};
_updateUnapprovedTransaction = new WeakSet();
updateUnapprovedTransaction_fn = async function(transactionMeta, gasFeeControllerData) {
  const { id } = transactionMeta;
  const [gasFeeEstimatesResponse, layer1GasFee] = await Promise.all([
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransactionGasFeeEstimates, updateTransactionGasFeeEstimates_fn).call(this, transactionMeta, gasFeeControllerData),
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransactionLayer1GasFee, updateTransactionLayer1GasFee_fn).call(this, transactionMeta)
  ]);
  if (!gasFeeEstimatesResponse && !layer1GasFee) {
    return;
  }
  this.hub.emit("transaction-updated", {
    transactionId: id,
    gasFeeEstimates: gasFeeEstimatesResponse?.gasFeeEstimates,
    gasFeeEstimatesLoaded: gasFeeEstimatesResponse?.gasFeeEstimatesLoaded,
    layer1GasFee
  });
};
_updateTransactionGasFeeEstimates = new WeakSet();
updateTransactionGasFeeEstimates_fn = async function(transactionMeta, gasFeeControllerData) {
  const { chainId, networkClientId } = transactionMeta;
  const ethQuery = new (0, _ethquery2.default)(_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getProvider).call(this, chainId, networkClientId));
  const gasFeeFlow = _chunk76FONEDAjs.getGasFeeFlow.call(void 0, transactionMeta, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _gasFeeFlows));
  if (gasFeeFlow) {
    log(
      "Found gas fee flow",
      gasFeeFlow.constructor.name,
      transactionMeta.id
    );
  }
  const request = {
    ethQuery,
    gasFeeControllerData,
    transactionMeta
  };
  let gasFeeEstimates;
  if (gasFeeFlow) {
    try {
      const response = await gasFeeFlow.getGasFees(request);
      gasFeeEstimates = response.estimates;
    } catch (error) {
      log("Failed to get suggested gas fees", transactionMeta.id, error);
    }
  }
  if (!gasFeeEstimates && transactionMeta.gasFeeEstimatesLoaded) {
    return void 0;
  }
  log("Updated gas fee estimates", {
    gasFeeEstimates,
    transaction: transactionMeta.id
  });
  return { gasFeeEstimates, gasFeeEstimatesLoaded: true };
};
_updateTransactionLayer1GasFee = new WeakSet();
updateTransactionLayer1GasFee_fn = async function(transactionMeta) {
  const { chainId, networkClientId } = transactionMeta;
  const provider = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getProvider).call(this, chainId, networkClientId);
  const layer1GasFee = await _chunk2XKEAKQGjs.getTransactionLayer1GasFee.call(void 0, {
    layer1GasFeeFlows: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _layer1GasFeeFlows),
    provider,
    transactionMeta
  });
  if (layer1GasFee) {
    log("Updated layer 1 gas fee", layer1GasFee, transactionMeta.id);
  }
  return layer1GasFee;
};
_getUnapprovedTransactions = new WeakSet();
getUnapprovedTransactions_fn = function() {
  return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getTransactions).call(this).filter(
    (tx) => tx.status === "unapproved" /* unapproved */
  );
};
_getGasFeeControllerData = new WeakSet();
getGasFeeControllerData_fn = async function(transactions) {
  const networkClientIdsByChainId = /* @__PURE__ */ new Map();
  for (const transaction of transactions) {
    const { chainId, networkClientId: transactionNetworkClientId } = transaction;
    if (networkClientIdsByChainId.has(chainId)) {
      continue;
    }
    const networkClientId = transactionNetworkClientId ?? _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _findNetworkClientIdByChainId).call(this, chainId);
    networkClientIdsByChainId.set(chainId, networkClientId);
  }
  log("Extracted network client IDs by chain ID", networkClientIdsByChainId);
  const entryPromises = Array.from(networkClientIdsByChainId.entries()).map(
    async ([chainId, networkClientId]) => {
      return [
        chainId,
        await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getGasFeeControllerEstimates).call(this, { networkClientId })
      ];
    }
  );
  return new Map(await Promise.all(entryPromises));
};



exports.GasFeePoller = GasFeePoller;
//# sourceMappingURL=chunk-2EU6346V.js.map