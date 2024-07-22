import {
  getTransactionLayer1GasFee
} from "./chunk-NOHEXQ7Y.mjs";
import {
  getGasFeeFlow
} from "./chunk-JXXTNVU4.mjs";
import {
  projectLogger
} from "./chunk-UQQWZT6C.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/helpers/GasFeePoller.ts
import EthQuery from "@metamask/eth-query";
import { createModuleLogger } from "@metamask/utils";
import EventEmitter from "events";
var log = createModuleLogger(projectLogger, "gas-fee-poller");
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
    __privateAdd(this, _start);
    __privateAdd(this, _stop);
    __privateAdd(this, _onTimeout);
    __privateAdd(this, _updateUnapprovedTransactions);
    __privateAdd(this, _updateUnapprovedTransaction);
    __privateAdd(this, _updateTransactionGasFeeEstimates);
    __privateAdd(this, _updateTransactionLayer1GasFee);
    __privateAdd(this, _getUnapprovedTransactions);
    __privateAdd(this, _getGasFeeControllerData);
    this.hub = new EventEmitter();
    __privateAdd(this, _findNetworkClientIdByChainId, void 0);
    __privateAdd(this, _gasFeeFlows, void 0);
    __privateAdd(this, _getGasFeeControllerEstimates, void 0);
    __privateAdd(this, _getProvider, void 0);
    __privateAdd(this, _getTransactions, void 0);
    __privateAdd(this, _layer1GasFeeFlows, void 0);
    __privateAdd(this, _timeout, void 0);
    __privateAdd(this, _running, false);
    __privateSet(this, _findNetworkClientIdByChainId, findNetworkClientIdByChainId);
    __privateSet(this, _gasFeeFlows, gasFeeFlows);
    __privateSet(this, _layer1GasFeeFlows, layer1GasFeeFlows);
    __privateSet(this, _getGasFeeControllerEstimates, getGasFeeControllerEstimates);
    __privateSet(this, _getProvider, getProvider);
    __privateSet(this, _getTransactions, getTransactions);
    onStateChange(() => {
      const unapprovedTransactions = __privateMethod(this, _getUnapprovedTransactions, getUnapprovedTransactions_fn).call(this);
      if (unapprovedTransactions.length) {
        __privateMethod(this, _start, start_fn).call(this);
      } else {
        __privateMethod(this, _stop, stop_fn).call(this);
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
  if (__privateGet(this, _running)) {
    return;
  }
  __privateMethod(this, _onTimeout, onTimeout_fn).call(this);
  __privateSet(this, _running, true);
  log("Started polling");
};
_stop = new WeakSet();
stop_fn = function() {
  if (!__privateGet(this, _running)) {
    return;
  }
  clearTimeout(__privateGet(this, _timeout));
  __privateSet(this, _timeout, void 0);
  __privateSet(this, _running, false);
  log("Stopped polling");
};
_onTimeout = new WeakSet();
onTimeout_fn = async function() {
  await __privateMethod(this, _updateUnapprovedTransactions, updateUnapprovedTransactions_fn).call(this);
  __privateSet(this, _timeout, setTimeout(() => __privateMethod(this, _onTimeout, onTimeout_fn).call(this), INTERVAL_MILLISECONDS));
};
_updateUnapprovedTransactions = new WeakSet();
updateUnapprovedTransactions_fn = async function() {
  const unapprovedTransactions = __privateMethod(this, _getUnapprovedTransactions, getUnapprovedTransactions_fn).call(this);
  if (!unapprovedTransactions.length) {
    return;
  }
  log("Found unapproved transactions", unapprovedTransactions.length);
  const gasFeeControllerDataByChainId = await __privateMethod(this, _getGasFeeControllerData, getGasFeeControllerData_fn).call(this, unapprovedTransactions);
  log("Retrieved gas fee controller data", gasFeeControllerDataByChainId);
  await Promise.all(
    unapprovedTransactions.flatMap((tx) => {
      const { chainId } = tx;
      const gasFeeControllerData = gasFeeControllerDataByChainId.get(
        chainId
      );
      return __privateMethod(this, _updateUnapprovedTransaction, updateUnapprovedTransaction_fn).call(this, tx, gasFeeControllerData);
    })
  );
};
_updateUnapprovedTransaction = new WeakSet();
updateUnapprovedTransaction_fn = async function(transactionMeta, gasFeeControllerData) {
  const { id } = transactionMeta;
  const [gasFeeEstimatesResponse, layer1GasFee] = await Promise.all([
    __privateMethod(this, _updateTransactionGasFeeEstimates, updateTransactionGasFeeEstimates_fn).call(this, transactionMeta, gasFeeControllerData),
    __privateMethod(this, _updateTransactionLayer1GasFee, updateTransactionLayer1GasFee_fn).call(this, transactionMeta)
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
  const ethQuery = new EthQuery(__privateGet(this, _getProvider).call(this, chainId, networkClientId));
  const gasFeeFlow = getGasFeeFlow(transactionMeta, __privateGet(this, _gasFeeFlows));
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
  const provider = __privateGet(this, _getProvider).call(this, chainId, networkClientId);
  const layer1GasFee = await getTransactionLayer1GasFee({
    layer1GasFeeFlows: __privateGet(this, _layer1GasFeeFlows),
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
  return __privateGet(this, _getTransactions).call(this).filter(
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
    const networkClientId = transactionNetworkClientId ?? __privateGet(this, _findNetworkClientIdByChainId).call(this, chainId);
    networkClientIdsByChainId.set(chainId, networkClientId);
  }
  log("Extracted network client IDs by chain ID", networkClientIdsByChainId);
  const entryPromises = Array.from(networkClientIdsByChainId.entries()).map(
    async ([chainId, networkClientId]) => {
      return [
        chainId,
        await __privateGet(this, _getGasFeeControllerEstimates).call(this, { networkClientId })
      ];
    }
  );
  return new Map(await Promise.all(entryPromises));
};

export {
  GasFeePoller
};
//# sourceMappingURL=chunk-SFFTNB2X.mjs.map