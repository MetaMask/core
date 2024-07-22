import {
  validateTransactionOrigin,
  validateTxParams
} from "./chunk-5ZEJT5SN.mjs";
import {
  GasFeePoller
} from "./chunk-SFFTNB2X.mjs";
import {
  IncomingTransactionHelper
} from "./chunk-3ZV5YEUV.mjs";
import {
  MultichainTrackingHelper
} from "./chunk-4V4XIPCI.mjs";
import {
  EtherscanRemoteTransactionSource
} from "./chunk-EKJXGERC.mjs";
import {
  PendingTransactionTracker
} from "./chunk-6B5BEO3R.mjs";
import {
  addGasBuffer,
  estimateGas,
  updateGas
} from "./chunk-5G6OHAXI.mjs";
import {
  addInitialHistorySnapshot,
  updateTransactionHistory
} from "./chunk-XGRAHX6T.mjs";
import {
  getTransactionLayer1GasFee,
  updateTransactionLayer1GasFee
} from "./chunk-NOHEXQ7Y.mjs";
import {
  getAndFormatTransactionsForNonceTracker,
  getNextNonce
} from "./chunk-6DDVVUJC.mjs";
import {
  getSimulationData
} from "./chunk-3AVRGHUO.mjs";
import {
  determineTransactionType
} from "./chunk-KG4UW4K4.mjs";
import {
  OptimismLayer1GasFeeFlow
} from "./chunk-VEVVBHP3.mjs";
import {
  ScrollLayer1GasFeeFlow
} from "./chunk-Z4GV3YQQ.mjs";
import {
  TestGasFeeFlow
} from "./chunk-FMRLPVFZ.mjs";
import {
  validateConfirmedExternalTransaction
} from "./chunk-FRKQ3Z2L.mjs";
import {
  LineaGasFeeFlow
} from "./chunk-UHG2LLVV.mjs";
import {
  DefaultGasFeeFlow
} from "./chunk-H2KZOK3J.mjs";
import {
  updateGasFees
} from "./chunk-VXNPVIYL.mjs";
import {
  updatePostTransactionBalance,
  updateSwapsTransaction
} from "./chunk-GNAL5HC2.mjs";
import {
  getIncreasedPriceFromExisting,
  isEIP1559Transaction,
  isFeeMarketEIP1559Values,
  isGasPriceValue,
  normalizeGasFeeValues,
  normalizeTransactionParams,
  normalizeTxError,
  validateGasValues,
  validateIfTransactionUnapproved,
  validateMinimumIncrease
} from "./chunk-Q56I5ONX.mjs";
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

// src/TransactionController.ts
import { Hardfork, Common } from "@ethereumjs/common";
import { TransactionFactory } from "@ethereumjs/tx";
import { bufferToHex } from "@ethereumjs/util";
import { BaseController } from "@metamask/base-controller";
import {
  query,
  ApprovalType,
  ORIGIN_METAMASK,
  convertHexToDecimal,
  isInfuraNetworkType
} from "@metamask/controller-utils";
import EthQuery from "@metamask/eth-query";
import { NetworkClientType } from "@metamask/network-controller";
import { NonceTracker } from "@metamask/nonce-tracker";
import { errorCodes, rpcErrors, providerErrors } from "@metamask/rpc-errors";
import { add0x } from "@metamask/utils";
import { Mutex } from "async-mutex";
import { MethodRegistry } from "eth-method-registry";
import { EventEmitter } from "events";
import { cloneDeep, mapValues, merge, pickBy, sortBy, isEqual } from "lodash";
import { v1 as random } from "uuid";
var metadata = {
  transactions: {
    persist: true,
    anonymous: false
  },
  methodData: {
    persist: true,
    anonymous: false
  },
  lastFetchedBlockNumbers: {
    persist: true,
    anonymous: false
  }
};
var HARDFORK = Hardfork.London;
var CANCEL_RATE = 1.1;
var SPEED_UP_RATE = 1.1;
var controllerName = "TransactionController";
var ApprovalState = /* @__PURE__ */ ((ApprovalState2) => {
  ApprovalState2["Approved"] = "approved";
  ApprovalState2["NotApproved"] = "not-approved";
  ApprovalState2["SkippedViaBeforePublishHook"] = "skipped-via-before-publish-hook";
  return ApprovalState2;
})(ApprovalState || {});
function getDefaultTransactionControllerState() {
  return {
    methodData: {},
    transactions: [],
    lastFetchedBlockNumbers: {}
  };
}
var _internalEvents, _incomingTransactionOptions, _pendingTransactionOptions, _transactionHistoryLimit, _isSimulationEnabled, _testGasFeeFlows, _multichainTrackingHelper, _createNonceTracker, createNonceTracker_fn, _createIncomingTransactionHelper, createIncomingTransactionHelper_fn, _createPendingTransactionTracker, createPendingTransactionTracker_fn, _checkForPendingTransactionAndStartPolling, _stopAllTracking, stopAllTracking_fn, _removeIncomingTransactionHelperListeners, removeIncomingTransactionHelperListeners_fn, _addIncomingTransactionHelperListeners, addIncomingTransactionHelperListeners_fn, _removePendingTransactionTrackerListeners, removePendingTransactionTrackerListeners_fn, _addPendingTransactionTrackerListeners, addPendingTransactionTrackerListeners_fn, _getNonceTrackerPendingTransactions, getNonceTrackerPendingTransactions_fn, _getGasFeeFlows, getGasFeeFlows_fn, _getLayer1GasFeeFlows, getLayer1GasFeeFlows_fn, _updateTransactionInternal, updateTransactionInternal_fn, _checkIfTransactionParamsUpdated, checkIfTransactionParamsUpdated_fn, _onTransactionParamsUpdated, onTransactionParamsUpdated_fn, _updateSimulationData, updateSimulationData_fn, _onGasFeePollerTransactionUpdate, onGasFeePollerTransactionUpdate_fn, _getNetworkClientId, getNetworkClientId_fn, _getGlobalNetworkClientId, getGlobalNetworkClientId_fn, _getGlobalChainId, getGlobalChainId_fn, _isCustomNetwork, isCustomNetwork_fn, _getSelectedAccount, getSelectedAccount_fn;
var TransactionController = class extends BaseController {
  /**
   * Constructs a TransactionController.
   *
   * @param options - The controller options.
   * @param options.blockTracker - The block tracker used to poll for new blocks data.
   * @param options.disableHistory - Whether to disable storing history in transaction metadata.
   * @param options.disableSendFlowHistory - Explicitly disable transaction metadata history.
   * @param options.disableSwaps - Whether to disable additional processing on swaps transactions.
   * @param options.getCurrentAccountEIP1559Compatibility - Whether or not the account supports EIP-1559.
   * @param options.getCurrentNetworkEIP1559Compatibility - Whether or not the network supports EIP-1559.
   * @param options.getExternalPendingTransactions - Callback to retrieve pending transactions from external sources.
   * @param options.getGasFeeEstimates - Callback to retrieve gas fee estimates.
   * @param options.getNetworkClientRegistry - Gets the network client registry.
   * @param options.getNetworkState - Gets the state of the network controller.
   * @param options.getPermittedAccounts - Get accounts that a given origin has permissions for.
   * @param options.getSavedGasFees - Gets the saved gas fee config.
   * @param options.incomingTransactions - Configuration options for incoming transaction support.
   * @param options.isMultichainEnabled - Enable multichain support.
   * @param options.isSimulationEnabled - Whether new transactions will be automatically simulated.
   * @param options.messenger - The controller messenger.
   * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
   * @param options.pendingTransactions - Configuration options for pending transaction support.
   * @param options.provider - The provider used to create the underlying EthQuery instance.
   * @param options.securityProviderRequest - A function for verifying a transaction, whether it is malicious or not.
   * @param options.sign - Function used to sign transactions.
   * @param options.state - Initial state to set on this controller.
   * @param options.testGasFeeFlows - Whether to use the test gas fee flow.
   * @param options.transactionHistoryLimit - Transaction history limit.
   * @param options.hooks - The controller hooks.
   */
  constructor({
    blockTracker,
    disableHistory,
    disableSendFlowHistory,
    disableSwaps,
    getCurrentAccountEIP1559Compatibility,
    getCurrentNetworkEIP1559Compatibility,
    getExternalPendingTransactions,
    getGasFeeEstimates,
    getNetworkClientRegistry,
    getNetworkState,
    getPermittedAccounts,
    getSavedGasFees,
    incomingTransactions = {},
    isMultichainEnabled = false,
    isSimulationEnabled,
    messenger,
    onNetworkStateChange,
    pendingTransactions = {},
    provider,
    securityProviderRequest,
    sign,
    state,
    testGasFeeFlows,
    transactionHistoryLimit = 40,
    hooks
  }) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultTransactionControllerState(),
        ...state
      }
    });
    __privateAdd(this, _createNonceTracker);
    __privateAdd(this, _createIncomingTransactionHelper);
    __privateAdd(this, _createPendingTransactionTracker);
    __privateAdd(this, _stopAllTracking);
    __privateAdd(this, _removeIncomingTransactionHelperListeners);
    __privateAdd(this, _addIncomingTransactionHelperListeners);
    __privateAdd(this, _removePendingTransactionTrackerListeners);
    __privateAdd(this, _addPendingTransactionTrackerListeners);
    __privateAdd(this, _getNonceTrackerPendingTransactions);
    __privateAdd(this, _getGasFeeFlows);
    __privateAdd(this, _getLayer1GasFeeFlows);
    __privateAdd(this, _updateTransactionInternal);
    __privateAdd(this, _checkIfTransactionParamsUpdated);
    __privateAdd(this, _onTransactionParamsUpdated);
    __privateAdd(this, _updateSimulationData);
    __privateAdd(this, _onGasFeePollerTransactionUpdate);
    __privateAdd(this, _getNetworkClientId);
    __privateAdd(this, _getGlobalNetworkClientId);
    __privateAdd(this, _getGlobalChainId);
    __privateAdd(this, _isCustomNetwork);
    __privateAdd(this, _getSelectedAccount);
    __privateAdd(this, _internalEvents, new EventEmitter());
    this.approvingTransactionIds = /* @__PURE__ */ new Set();
    this.mutex = new Mutex();
    __privateAdd(this, _incomingTransactionOptions, void 0);
    __privateAdd(this, _pendingTransactionOptions, void 0);
    this.signAbortCallbacks = /* @__PURE__ */ new Map();
    __privateAdd(this, _transactionHistoryLimit, void 0);
    __privateAdd(this, _isSimulationEnabled, void 0);
    __privateAdd(this, _testGasFeeFlows, void 0);
    __privateAdd(this, _multichainTrackingHelper, void 0);
    __privateAdd(this, _checkForPendingTransactionAndStartPolling, () => {
      this.pendingTransactionTracker.startIfPendingTransactions();
      __privateGet(this, _multichainTrackingHelper).checkForPendingTransactionAndStartPolling();
    });
    this.messagingSystem = messenger;
    this.getNetworkState = getNetworkState;
    this.isSendFlowHistoryDisabled = disableSendFlowHistory ?? false;
    this.isHistoryDisabled = disableHistory ?? false;
    this.isSwapsDisabled = disableSwaps ?? false;
    __privateSet(this, _isSimulationEnabled, isSimulationEnabled ?? (() => true));
    this.registry = new MethodRegistry({ provider });
    this.getSavedGasFees = getSavedGasFees ?? ((_chainId) => void 0);
    this.getCurrentAccountEIP1559Compatibility = getCurrentAccountEIP1559Compatibility ?? (() => Promise.resolve(true));
    this.getCurrentNetworkEIP1559Compatibility = getCurrentNetworkEIP1559Compatibility;
    this.getGasFeeEstimates = getGasFeeEstimates || (() => Promise.resolve({}));
    this.getPermittedAccounts = getPermittedAccounts;
    this.getExternalPendingTransactions = getExternalPendingTransactions ?? (() => []);
    this.securityProviderRequest = securityProviderRequest;
    __privateSet(this, _incomingTransactionOptions, incomingTransactions);
    __privateSet(this, _pendingTransactionOptions, pendingTransactions);
    __privateSet(this, _transactionHistoryLimit, transactionHistoryLimit);
    this.sign = sign;
    __privateSet(this, _testGasFeeFlows, testGasFeeFlows === true);
    this.afterSign = hooks?.afterSign ?? (() => true);
    this.beforeApproveOnInit = hooks?.beforeApproveOnInit ?? (() => true);
    this.beforeCheckPendingTransaction = hooks?.beforeCheckPendingTransaction ?? /* istanbul ignore next */
    (() => true);
    this.beforePublish = hooks?.beforePublish ?? (() => true);
    this.getAdditionalSignArguments = hooks?.getAdditionalSignArguments ?? (() => []);
    this.publish = hooks?.publish ?? (() => Promise.resolve({ transactionHash: void 0 }));
    this.nonceTracker = __privateMethod(this, _createNonceTracker, createNonceTracker_fn).call(this, {
      provider,
      blockTracker
    });
    const findNetworkClientIdByChainId = (chainId) => {
      return this.messagingSystem.call(
        `NetworkController:findNetworkClientIdByChainId`,
        chainId
      );
    };
    __privateSet(this, _multichainTrackingHelper, new MultichainTrackingHelper({
      isMultichainEnabled,
      provider,
      nonceTracker: this.nonceTracker,
      incomingTransactionOptions: incomingTransactions,
      findNetworkClientIdByChainId,
      getNetworkClientById: (networkClientId) => {
        return this.messagingSystem.call(
          `NetworkController:getNetworkClientById`,
          networkClientId
        );
      },
      getNetworkClientRegistry,
      removeIncomingTransactionHelperListeners: __privateMethod(this, _removeIncomingTransactionHelperListeners, removeIncomingTransactionHelperListeners_fn).bind(this),
      removePendingTransactionTrackerListeners: __privateMethod(this, _removePendingTransactionTrackerListeners, removePendingTransactionTrackerListeners_fn).bind(this),
      createNonceTracker: __privateMethod(this, _createNonceTracker, createNonceTracker_fn).bind(this),
      createIncomingTransactionHelper: __privateMethod(this, _createIncomingTransactionHelper, createIncomingTransactionHelper_fn).bind(this),
      createPendingTransactionTracker: __privateMethod(this, _createPendingTransactionTracker, createPendingTransactionTracker_fn).bind(this),
      onNetworkStateChange: (listener) => {
        this.messagingSystem.subscribe(
          "NetworkController:stateChange",
          listener
        );
      }
    }));
    __privateGet(this, _multichainTrackingHelper).initialize();
    const etherscanRemoteTransactionSource = new EtherscanRemoteTransactionSource({
      includeTokenTransfers: incomingTransactions.includeTokenTransfers
    });
    this.incomingTransactionHelper = __privateMethod(this, _createIncomingTransactionHelper, createIncomingTransactionHelper_fn).call(this, {
      blockTracker,
      etherscanRemoteTransactionSource
    });
    this.pendingTransactionTracker = __privateMethod(this, _createPendingTransactionTracker, createPendingTransactionTracker_fn).call(this, {
      provider,
      blockTracker
    });
    this.gasFeeFlows = __privateMethod(this, _getGasFeeFlows, getGasFeeFlows_fn).call(this);
    this.layer1GasFeeFlows = __privateMethod(this, _getLayer1GasFeeFlows, getLayer1GasFeeFlows_fn).call(this);
    const gasFeePoller = new GasFeePoller({
      findNetworkClientIdByChainId,
      gasFeeFlows: this.gasFeeFlows,
      getGasFeeControllerEstimates: this.getGasFeeEstimates,
      getProvider: (chainId, networkClientId) => __privateGet(this, _multichainTrackingHelper).getProvider({
        networkClientId,
        chainId
      }),
      getTransactions: () => this.state.transactions,
      layer1GasFeeFlows: this.layer1GasFeeFlows,
      onStateChange: (listener) => {
        this.messagingSystem.subscribe(
          "TransactionController:stateChange",
          listener
        );
      }
    });
    gasFeePoller.hub.on(
      "transaction-updated",
      __privateMethod(this, _onGasFeePollerTransactionUpdate, onGasFeePollerTransactionUpdate_fn).bind(this)
    );
    this.messagingSystem.subscribe(
      "TransactionController:stateChange",
      __privateGet(this, _checkForPendingTransactionAndStartPolling)
    );
    onNetworkStateChange(() => {
      projectLogger("Detected network change", this.getChainId());
      this.pendingTransactionTracker.startIfPendingTransactions();
      this.onBootCleanup();
    });
    this.onBootCleanup();
    __privateGet(this, _checkForPendingTransactionAndStartPolling).call(this);
  }
  failTransaction(transactionMeta, error, actionId) {
    const newTransactionMeta = merge({}, transactionMeta, {
      error: normalizeTxError(error),
      status: "failed" /* failed */
    });
    this.messagingSystem.publish(`${controllerName}:transactionFailed`, {
      actionId,
      error: error.message,
      transactionMeta: newTransactionMeta
    });
    this.updateTransaction(
      newTransactionMeta,
      "TransactionController#failTransaction - Add error message and set status to failed"
    );
    this.onTransactionStatusChange(newTransactionMeta);
    this.messagingSystem.publish(
      `${controllerName}:transactionFinished`,
      newTransactionMeta
    );
    __privateGet(this, _internalEvents).emit(
      `${transactionMeta.id}:finished`,
      newTransactionMeta
    );
  }
  async registryLookup(fourBytePrefix) {
    const registryMethod = await this.registry.lookup(fourBytePrefix);
    if (!registryMethod) {
      return {
        registryMethod: "",
        parsedRegistryMethod: { name: void 0, args: void 0 }
      };
    }
    const parsedRegistryMethod = this.registry.parse(registryMethod);
    return { registryMethod, parsedRegistryMethod };
  }
  /**
   * Stops polling and removes listeners to prepare the controller for garbage collection.
   */
  destroy() {
    __privateMethod(this, _stopAllTracking, stopAllTracking_fn).call(this);
  }
  /**
   * Handle new method data request.
   *
   * @param fourBytePrefix - The method prefix.
   * @returns The method data object corresponding to the given signature prefix.
   */
  async handleMethodData(fourBytePrefix) {
    const releaseLock = await this.mutex.acquire();
    try {
      const { methodData } = this.state;
      const knownMethod = Object.keys(methodData).find(
        (knownFourBytePrefix) => fourBytePrefix === knownFourBytePrefix
      );
      if (knownMethod) {
        return methodData[fourBytePrefix];
      }
      const registry = await this.registryLookup(fourBytePrefix);
      this.update((state) => {
        state.methodData[fourBytePrefix] = registry;
      });
      return registry;
    } finally {
      releaseLock();
    }
  }
  /**
   * Add a new unapproved transaction to state. Parameters will be validated, a
   * unique transaction id will be generated, and gas and gasPrice will be calculated
   * if not provided. If A `<tx.id>:unapproved` hub event will be emitted once added.
   *
   * @param txParams - Standard parameters for an Ethereum transaction.
   * @param opts - Additional options to control how the transaction is added.
   * @param opts.actionId - Unique ID to prevent duplicate requests.
   * @param opts.deviceConfirmedOn - An enum to indicate what device confirmed the transaction.
   * @param opts.method - RPC method that requested the transaction.
   * @param opts.origin - The origin of the transaction request, such as a dApp hostname.
   * @param opts.requireApproval - Whether the transaction requires approval by the user, defaults to true unless explicitly disabled.
   * @param opts.securityAlertResponse - Response from security validator.
   * @param opts.sendFlowHistory - The sendFlowHistory entries to add.
   * @param opts.type - Type of transaction to add, such as 'cancel' or 'swap'.
   * @param opts.swaps - Options for swaps transactions.
   * @param opts.swaps.hasApproveTx - Whether the transaction has an approval transaction.
   * @param opts.swaps.meta - Metadata for swap transaction.
   * @param opts.networkClientId - The id of the network client for this transaction.
   * @returns Object containing a promise resolving to the transaction hash if approved.
   */
  async addTransaction(txParams, {
    actionId,
    deviceConfirmedOn,
    method,
    origin,
    requireApproval,
    securityAlertResponse,
    sendFlowHistory,
    swaps = {},
    type,
    networkClientId: requestNetworkClientId
  } = {}) {
    projectLogger("Adding transaction", txParams);
    txParams = normalizeTransactionParams(txParams);
    if (requestNetworkClientId && !__privateGet(this, _multichainTrackingHelper).has(requestNetworkClientId)) {
      throw new Error(
        "The networkClientId for this transaction could not be found"
      );
    }
    const networkClientId = requestNetworkClientId ?? __privateMethod(this, _getGlobalNetworkClientId, getGlobalNetworkClientId_fn).call(this);
    const isEIP1559Compatible = await this.getEIP1559Compatibility(
      networkClientId
    );
    validateTxParams(txParams, isEIP1559Compatible);
    if (origin) {
      await validateTransactionOrigin(
        await this.getPermittedAccounts(origin),
        __privateMethod(this, _getSelectedAccount, getSelectedAccount_fn).call(this).address,
        txParams.from,
        origin
      );
    }
    const dappSuggestedGasFees = this.generateDappSuggestedGasFees(
      txParams,
      origin
    );
    const chainId = this.getChainId(networkClientId);
    const ethQuery = __privateGet(this, _multichainTrackingHelper).getEthQuery({
      networkClientId,
      chainId
    });
    const transactionType = type ?? (await determineTransactionType(txParams, ethQuery)).type;
    const existingTransactionMeta = this.getTransactionWithActionId(actionId);
    let addedTransactionMeta = existingTransactionMeta ? cloneDeep(existingTransactionMeta) : {
      // Add actionId to txMeta to check if same actionId is seen again
      actionId,
      chainId,
      dappSuggestedGasFees,
      deviceConfirmedOn,
      id: random(),
      origin,
      securityAlertResponse,
      status: "unapproved" /* unapproved */,
      time: Date.now(),
      txParams,
      userEditedGasLimit: false,
      verifiedOnBlockchain: false,
      type: transactionType,
      networkClientId
    };
    await this.updateGasProperties(addedTransactionMeta);
    if (!existingTransactionMeta) {
      if (method && this.securityProviderRequest) {
        const securityProviderResponse = await this.securityProviderRequest(
          addedTransactionMeta,
          method
        );
        addedTransactionMeta.securityProviderResponse = securityProviderResponse;
      }
      if (!this.isSendFlowHistoryDisabled) {
        addedTransactionMeta.sendFlowHistory = sendFlowHistory ?? [];
      }
      if (!this.isHistoryDisabled) {
        addedTransactionMeta = addInitialHistorySnapshot(addedTransactionMeta);
      }
      addedTransactionMeta = updateSwapsTransaction(
        addedTransactionMeta,
        transactionType,
        swaps,
        {
          isSwapsDisabled: this.isSwapsDisabled,
          cancelTransaction: this.cancelTransaction.bind(this),
          messenger: this.messagingSystem
        }
      );
      this.addMetadata(addedTransactionMeta);
      if (requireApproval !== false) {
        __privateMethod(this, _updateSimulationData, updateSimulationData_fn).call(this, addedTransactionMeta);
      } else {
        projectLogger("Skipping simulation as approval not required");
      }
      this.messagingSystem.publish(
        `${controllerName}:unapprovedTransactionAdded`,
        addedTransactionMeta
      );
    }
    return {
      result: this.processApproval(addedTransactionMeta, {
        isExisting: Boolean(existingTransactionMeta),
        requireApproval,
        actionId
      }),
      transactionMeta: addedTransactionMeta
    };
  }
  startIncomingTransactionPolling(networkClientIds = []) {
    if (networkClientIds.length === 0) {
      this.incomingTransactionHelper.start();
      return;
    }
    __privateGet(this, _multichainTrackingHelper).startIncomingTransactionPolling(
      networkClientIds
    );
  }
  stopIncomingTransactionPolling(networkClientIds = []) {
    if (networkClientIds.length === 0) {
      this.incomingTransactionHelper.stop();
      return;
    }
    __privateGet(this, _multichainTrackingHelper).stopIncomingTransactionPolling(
      networkClientIds
    );
  }
  stopAllIncomingTransactionPolling() {
    this.incomingTransactionHelper.stop();
    __privateGet(this, _multichainTrackingHelper).stopAllIncomingTransactionPolling();
  }
  async updateIncomingTransactions(networkClientIds = []) {
    if (networkClientIds.length === 0) {
      await this.incomingTransactionHelper.update();
      return;
    }
    await __privateGet(this, _multichainTrackingHelper).updateIncomingTransactions(
      networkClientIds
    );
  }
  /**
   * Attempts to cancel a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionId - The ID of the transaction to cancel.
   * @param gasValues - The gas values to use for the cancellation transaction.
   * @param options - The options for the cancellation transaction.
   * @param options.actionId - Unique ID to prevent duplicate requests.
   * @param options.estimatedBaseFee - The estimated base fee of the transaction.
   */
  async stopTransaction(transactionId, gasValues, {
    estimatedBaseFee,
    actionId
  } = {}) {
    if (this.getTransactionWithActionId(actionId)) {
      return;
    }
    if (gasValues) {
      gasValues = normalizeGasFeeValues(gasValues);
      validateGasValues(gasValues);
    }
    projectLogger("Creating cancel transaction", transactionId, gasValues);
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      return;
    }
    if (!this.sign) {
      throw new Error("No sign method defined.");
    }
    const minGasPrice = getIncreasedPriceFromExisting(
      transactionMeta.txParams.gasPrice,
      CANCEL_RATE
    );
    const gasPriceFromValues = isGasPriceValue(gasValues) && gasValues.gasPrice;
    const newGasPrice = gasPriceFromValues && validateMinimumIncrease(gasPriceFromValues, minGasPrice) || minGasPrice;
    const existingMaxFeePerGas = transactionMeta.txParams?.maxFeePerGas;
    const minMaxFeePerGas = getIncreasedPriceFromExisting(
      existingMaxFeePerGas,
      CANCEL_RATE
    );
    const maxFeePerGasValues = isFeeMarketEIP1559Values(gasValues) && gasValues.maxFeePerGas;
    const newMaxFeePerGas = maxFeePerGasValues && validateMinimumIncrease(maxFeePerGasValues, minMaxFeePerGas) || existingMaxFeePerGas && minMaxFeePerGas;
    const existingMaxPriorityFeePerGas = transactionMeta.txParams?.maxPriorityFeePerGas;
    const minMaxPriorityFeePerGas = getIncreasedPriceFromExisting(
      existingMaxPriorityFeePerGas,
      CANCEL_RATE
    );
    const maxPriorityFeePerGasValues = isFeeMarketEIP1559Values(gasValues) && gasValues.maxPriorityFeePerGas;
    const newMaxPriorityFeePerGas = maxPriorityFeePerGasValues && validateMinimumIncrease(
      maxPriorityFeePerGasValues,
      minMaxPriorityFeePerGas
    ) || existingMaxPriorityFeePerGas && minMaxPriorityFeePerGas;
    const newTxParams = newMaxFeePerGas && newMaxPriorityFeePerGas ? {
      from: transactionMeta.txParams.from,
      gasLimit: transactionMeta.txParams.gas,
      maxFeePerGas: newMaxFeePerGas,
      maxPriorityFeePerGas: newMaxPriorityFeePerGas,
      type: "0x2" /* feeMarket */,
      nonce: transactionMeta.txParams.nonce,
      to: transactionMeta.txParams.from,
      value: "0x0"
    } : {
      from: transactionMeta.txParams.from,
      gasLimit: transactionMeta.txParams.gas,
      gasPrice: newGasPrice,
      nonce: transactionMeta.txParams.nonce,
      to: transactionMeta.txParams.from,
      value: "0x0"
    };
    const unsignedEthTx = this.prepareUnsignedEthTx(
      transactionMeta.chainId,
      newTxParams
    );
    const signedTx = await this.sign(
      unsignedEthTx,
      transactionMeta.txParams.from
    );
    const rawTx = bufferToHex(signedTx.serialize());
    const newFee = newTxParams.maxFeePerGas ?? newTxParams.gasPrice;
    const oldFee = newTxParams.maxFeePerGas ? transactionMeta.txParams.maxFeePerGas : transactionMeta.txParams.gasPrice;
    projectLogger("Submitting cancel transaction", {
      oldFee,
      newFee,
      txParams: newTxParams
    });
    const ethQuery = __privateGet(this, _multichainTrackingHelper).getEthQuery({
      networkClientId: transactionMeta.networkClientId,
      chainId: transactionMeta.chainId
    });
    const hash = await this.publishTransactionForRetry(
      ethQuery,
      rawTx,
      transactionMeta
    );
    const cancelTransactionMeta = {
      actionId,
      chainId: transactionMeta.chainId,
      networkClientId: transactionMeta.networkClientId,
      estimatedBaseFee,
      hash,
      id: random(),
      originalGasEstimate: transactionMeta.txParams.gas,
      status: "submitted" /* submitted */,
      time: Date.now(),
      type: "cancel" /* cancel */,
      txParams: newTxParams
    };
    this.addMetadata(cancelTransactionMeta);
    this.messagingSystem.publish(`${controllerName}:transactionApproved`, {
      transactionMeta: cancelTransactionMeta,
      actionId
    });
    this.messagingSystem.publish(`${controllerName}:transactionSubmitted`, {
      transactionMeta: cancelTransactionMeta,
      actionId
    });
    this.messagingSystem.publish(
      `${controllerName}:transactionFinished`,
      cancelTransactionMeta
    );
    __privateGet(this, _internalEvents).emit(
      `${transactionMeta.id}:finished`,
      cancelTransactionMeta
    );
  }
  /**
   * Attempts to speed up a transaction increasing transaction gasPrice by ten percent.
   *
   * @param transactionId - The ID of the transaction to speed up.
   * @param gasValues - The gas values to use for the speed up transaction.
   * @param options - The options for the speed up transaction.
   * @param options.actionId - Unique ID to prevent duplicate requests
   * @param options.estimatedBaseFee - The estimated base fee of the transaction.
   */
  async speedUpTransaction(transactionId, gasValues, {
    actionId,
    estimatedBaseFee
  } = {}) {
    if (this.getTransactionWithActionId(actionId)) {
      return;
    }
    if (gasValues) {
      gasValues = normalizeGasFeeValues(gasValues);
      validateGasValues(gasValues);
    }
    projectLogger("Creating speed up transaction", transactionId, gasValues);
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      return;
    }
    if (!this.sign) {
      throw new Error("No sign method defined.");
    }
    const minGasPrice = getIncreasedPriceFromExisting(
      transactionMeta.txParams.gasPrice,
      SPEED_UP_RATE
    );
    const gasPriceFromValues = isGasPriceValue(gasValues) && gasValues.gasPrice;
    const newGasPrice = gasPriceFromValues && validateMinimumIncrease(gasPriceFromValues, minGasPrice) || minGasPrice;
    const existingMaxFeePerGas = transactionMeta.txParams?.maxFeePerGas;
    const minMaxFeePerGas = getIncreasedPriceFromExisting(
      existingMaxFeePerGas,
      SPEED_UP_RATE
    );
    const maxFeePerGasValues = isFeeMarketEIP1559Values(gasValues) && gasValues.maxFeePerGas;
    const newMaxFeePerGas = maxFeePerGasValues && validateMinimumIncrease(maxFeePerGasValues, minMaxFeePerGas) || existingMaxFeePerGas && minMaxFeePerGas;
    const existingMaxPriorityFeePerGas = transactionMeta.txParams?.maxPriorityFeePerGas;
    const minMaxPriorityFeePerGas = getIncreasedPriceFromExisting(
      existingMaxPriorityFeePerGas,
      SPEED_UP_RATE
    );
    const maxPriorityFeePerGasValues = isFeeMarketEIP1559Values(gasValues) && gasValues.maxPriorityFeePerGas;
    const newMaxPriorityFeePerGas = maxPriorityFeePerGasValues && validateMinimumIncrease(
      maxPriorityFeePerGasValues,
      minMaxPriorityFeePerGas
    ) || existingMaxPriorityFeePerGas && minMaxPriorityFeePerGas;
    const txParams = newMaxFeePerGas && newMaxPriorityFeePerGas ? {
      ...transactionMeta.txParams,
      gasLimit: transactionMeta.txParams.gas,
      maxFeePerGas: newMaxFeePerGas,
      maxPriorityFeePerGas: newMaxPriorityFeePerGas,
      type: "0x2" /* feeMarket */
    } : {
      ...transactionMeta.txParams,
      gasLimit: transactionMeta.txParams.gas,
      gasPrice: newGasPrice
    };
    const unsignedEthTx = this.prepareUnsignedEthTx(
      transactionMeta.chainId,
      txParams
    );
    const signedTx = await this.sign(
      unsignedEthTx,
      transactionMeta.txParams.from
    );
    const transactionMetaWithRsv = this.updateTransactionMetaRSV(
      transactionMeta,
      signedTx
    );
    const rawTx = bufferToHex(signedTx.serialize());
    const newFee = txParams.maxFeePerGas ?? txParams.gasPrice;
    const oldFee = txParams.maxFeePerGas ? transactionMetaWithRsv.txParams.maxFeePerGas : transactionMetaWithRsv.txParams.gasPrice;
    projectLogger("Submitting speed up transaction", { oldFee, newFee, txParams });
    const ethQuery = __privateGet(this, _multichainTrackingHelper).getEthQuery({
      networkClientId: transactionMeta.networkClientId,
      chainId: transactionMeta.chainId
    });
    const hash = await this.publishTransactionForRetry(
      ethQuery,
      rawTx,
      transactionMeta
    );
    const baseTransactionMeta = {
      ...transactionMetaWithRsv,
      estimatedBaseFee,
      id: random(),
      time: Date.now(),
      hash,
      actionId,
      originalGasEstimate: transactionMeta.txParams.gas,
      type: "retry" /* retry */,
      originalType: transactionMeta.type
    };
    const newTransactionMeta = newMaxFeePerGas && newMaxPriorityFeePerGas ? {
      ...baseTransactionMeta,
      txParams: {
        ...transactionMeta.txParams,
        maxFeePerGas: newMaxFeePerGas,
        maxPriorityFeePerGas: newMaxPriorityFeePerGas
      }
    } : {
      ...baseTransactionMeta,
      txParams: {
        ...transactionMeta.txParams,
        gasPrice: newGasPrice
      }
    };
    this.addMetadata(newTransactionMeta);
    this.messagingSystem.publish(`${controllerName}:transactionApproved`, {
      transactionMeta: newTransactionMeta,
      actionId
    });
    this.messagingSystem.publish(`${controllerName}:transactionSubmitted`, {
      transactionMeta: newTransactionMeta,
      actionId
    });
    this.messagingSystem.publish(
      `${controllerName}:speedupTransactionAdded`,
      newTransactionMeta
    );
  }
  /**
   * Estimates required gas for a given transaction.
   *
   * @param transaction - The transaction to estimate gas for.
   * @param networkClientId - The network client id to use for the estimate.
   * @returns The gas and gas price.
   */
  async estimateGas(transaction, networkClientId) {
    const ethQuery = __privateGet(this, _multichainTrackingHelper).getEthQuery({
      networkClientId
    });
    const { estimatedGas, simulationFails } = await estimateGas(
      transaction,
      ethQuery
    );
    return { gas: estimatedGas, simulationFails };
  }
  /**
   * Estimates required gas for a given transaction and add additional gas buffer with the given multiplier.
   *
   * @param transaction - The transaction params to estimate gas for.
   * @param multiplier - The multiplier to use for the gas buffer.
   * @param networkClientId - The network client id to use for the estimate.
   */
  async estimateGasBuffered(transaction, multiplier, networkClientId) {
    const ethQuery = __privateGet(this, _multichainTrackingHelper).getEthQuery({
      networkClientId
    });
    const { blockGasLimit, estimatedGas, simulationFails } = await estimateGas(
      transaction,
      ethQuery
    );
    const gas = addGasBuffer(estimatedGas, blockGasLimit, multiplier);
    return {
      gas,
      simulationFails
    };
  }
  /**
   * Updates an existing transaction in state.
   *
   * @param transactionMeta - The new transaction to store in state.
   * @param note - A note or update reason to include in the transaction history.
   */
  updateTransaction(transactionMeta, note) {
    const { id: transactionId } = transactionMeta;
    __privateMethod(this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, { transactionId, note }, () => ({
      ...transactionMeta
    }));
  }
  /**
   * Update the security alert response for a transaction.
   *
   * @param transactionId - ID of the transaction.
   * @param securityAlertResponse - The new security alert response for the transaction.
   */
  updateSecurityAlertResponse(transactionId, securityAlertResponse) {
    if (!securityAlertResponse) {
      throw new Error(
        "updateSecurityAlertResponse: securityAlertResponse should not be null"
      );
    }
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      throw new Error(
        `Cannot update security alert response as no transaction metadata found`
      );
    }
    const updatedTransactionMeta = {
      ...transactionMeta,
      securityAlertResponse
    };
    this.updateTransaction(
      updatedTransactionMeta,
      `${controllerName}:updatesecurityAlertResponse - securityAlertResponse updated`
    );
  }
  /**
   * Removes all transactions from state, optionally based on the current network.
   *
   * @param ignoreNetwork - Determines whether to wipe all transactions, or just those on the
   * current network. If `true`, all transactions are wiped.
   * @param address - If specified, only transactions originating from this address will be
   * wiped on current network.
   */
  wipeTransactions(ignoreNetwork, address) {
    if (ignoreNetwork && !address) {
      this.update((state) => {
        state.transactions = [];
      });
      return;
    }
    const currentChainId = this.getChainId();
    const newTransactions = this.state.transactions.filter(
      ({ chainId, txParams }) => {
        const isMatchingNetwork = ignoreNetwork || chainId === currentChainId;
        if (!isMatchingNetwork) {
          return true;
        }
        const isMatchingAddress = !address || txParams.from?.toLowerCase() === address.toLowerCase();
        return !isMatchingAddress;
      }
    );
    this.update((state) => {
      state.transactions = this.trimTransactionsForState(newTransactions);
    });
  }
  /**
   * Adds external provided transaction to state as confirmed transaction.
   *
   * @param transactionMeta - TransactionMeta to add transactions.
   * @param transactionReceipt - TransactionReceipt of the external transaction.
   * @param baseFeePerGas - Base fee per gas of the external transaction.
   */
  async confirmExternalTransaction(transactionMeta, transactionReceipt, baseFeePerGas) {
    const newTransactionMeta = this.addExternalTransaction(transactionMeta);
    try {
      const transactionId = newTransactionMeta.id;
      const updatedTransactionMeta = {
        ...newTransactionMeta,
        status: "confirmed" /* confirmed */,
        txReceipt: transactionReceipt
      };
      if (baseFeePerGas) {
        updatedTransactionMeta.baseFeePerGas = baseFeePerGas;
      }
      this.markNonceDuplicatesDropped(transactionId);
      this.updateTransaction(
        updatedTransactionMeta,
        `${controllerName}:confirmExternalTransaction - Add external transaction`
      );
      this.onTransactionStatusChange(updatedTransactionMeta);
      this.updatePostBalance(updatedTransactionMeta);
      this.messagingSystem.publish(
        `${controllerName}:transactionConfirmed`,
        updatedTransactionMeta
      );
    } catch (error) {
      console.error("Failed to confirm external transaction", error);
    }
  }
  /**
   * Append new send flow history to a transaction.
   *
   * @param transactionID - The ID of the transaction to update.
   * @param currentSendFlowHistoryLength - The length of the current sendFlowHistory array.
   * @param sendFlowHistoryToAdd - The sendFlowHistory entries to add.
   * @returns The updated transactionMeta.
   */
  updateTransactionSendFlowHistory(transactionID, currentSendFlowHistoryLength, sendFlowHistoryToAdd) {
    if (this.isSendFlowHistoryDisabled) {
      throw new Error(
        "Send flow history is disabled for the current transaction controller"
      );
    }
    const transactionMeta = this.getTransaction(transactionID);
    if (!transactionMeta) {
      throw new Error(
        `Cannot update send flow history as no transaction metadata found`
      );
    }
    validateIfTransactionUnapproved(
      transactionMeta,
      "updateTransactionSendFlowHistory"
    );
    const sendFlowHistory = transactionMeta.sendFlowHistory ?? [];
    if (currentSendFlowHistoryLength === sendFlowHistory.length) {
      const updatedTransactionMeta = {
        ...transactionMeta,
        sendFlowHistory: [...sendFlowHistory, ...sendFlowHistoryToAdd]
      };
      this.updateTransaction(
        updatedTransactionMeta,
        `${controllerName}:updateTransactionSendFlowHistory - sendFlowHistory updated`
      );
    }
    return this.getTransaction(transactionID);
  }
  /**
   * Update the gas values of a transaction.
   *
   * @param transactionId - The ID of the transaction to update.
   * @param gasValues - Gas values to update.
   * @param gasValues.gas - Same as transaction.gasLimit.
   * @param gasValues.gasLimit - Maxmimum number of units of gas to use for this transaction.
   * @param gasValues.gasPrice - Price per gas for legacy transactions.
   * @param gasValues.maxPriorityFeePerGas - Maximum amount per gas to give to validator as incentive.
   * @param gasValues.maxFeePerGas - Maximum amount per gas to pay for the transaction, including the priority fee.
   * @param gasValues.estimateUsed - Which estimate level was used.
   * @param gasValues.estimateSuggested - Which estimate level that the API suggested.
   * @param gasValues.defaultGasEstimates - The default estimate for gas.
   * @param gasValues.originalGasEstimate - Original estimate for gas.
   * @param gasValues.userEditedGasLimit - The gas limit supplied by user.
   * @param gasValues.userFeeLevel - Estimate level user selected.
   * @returns The updated transactionMeta.
   */
  updateTransactionGasFees(transactionId, {
    defaultGasEstimates,
    estimateUsed,
    estimateSuggested,
    gas,
    gasLimit,
    gasPrice,
    maxPriorityFeePerGas,
    maxFeePerGas,
    originalGasEstimate,
    userEditedGasLimit,
    userFeeLevel
  }) {
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      throw new Error(
        `Cannot update transaction as no transaction metadata found`
      );
    }
    validateIfTransactionUnapproved(
      transactionMeta,
      "updateTransactionGasFees"
    );
    let transactionGasFees = {
      txParams: {
        gas,
        gasLimit,
        gasPrice,
        maxPriorityFeePerGas,
        maxFeePerGas
      },
      defaultGasEstimates,
      estimateUsed,
      estimateSuggested,
      originalGasEstimate,
      userEditedGasLimit,
      userFeeLevel
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    };
    transactionGasFees.txParams = pickBy(transactionGasFees.txParams);
    transactionGasFees = pickBy(transactionGasFees);
    const updatedMeta = merge({}, transactionMeta, transactionGasFees);
    this.updateTransaction(
      updatedMeta,
      `${controllerName}:updateTransactionGasFees - gas values updated`
    );
    return this.getTransaction(transactionId);
  }
  /**
   * Update the previous gas values of a transaction.
   *
   * @param transactionId - The ID of the transaction to update.
   * @param previousGas - Previous gas values to update.
   * @param previousGas.gasLimit - Maxmimum number of units of gas to use for this transaction.
   * @param previousGas.maxFeePerGas - Maximum amount per gas to pay for the transaction, including the priority fee.
   * @param previousGas.maxPriorityFeePerGas - Maximum amount per gas to give to validator as incentive.
   * @returns The updated transactionMeta.
   */
  updatePreviousGasParams(transactionId, {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas
  }) {
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      throw new Error(
        `Cannot update transaction as no transaction metadata found`
      );
    }
    validateIfTransactionUnapproved(transactionMeta, "updatePreviousGasParams");
    const transactionPreviousGas = {
      previousGas: {
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas
      }
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    };
    transactionPreviousGas.previousGas = pickBy(
      transactionPreviousGas.previousGas
    );
    const updatedMeta = merge({}, transactionMeta, transactionPreviousGas);
    this.updateTransaction(
      updatedMeta,
      `${controllerName}:updatePreviousGasParams - Previous gas values updated`
    );
    return this.getTransaction(transactionId);
  }
  async getNonceLock(address, networkClientId) {
    return __privateGet(this, _multichainTrackingHelper).getNonceLock(
      address,
      networkClientId
    );
  }
  /**
   * Updates the editable parameters of a transaction.
   *
   * @param txId - The ID of the transaction to update.
   * @param params - The editable parameters to update.
   * @param params.data - Data to pass with the transaction.
   * @param params.gas - Maximum number of units of gas to use for the transaction.
   * @param params.gasPrice - Price per gas for legacy transactions.
   * @param params.from - Address to send the transaction from.
   * @param params.to - Address to send the transaction to.
   * @param params.value - Value associated with the transaction.
   * @returns The updated transaction metadata.
   */
  async updateEditableParams(txId, {
    data,
    gas,
    gasPrice,
    from,
    to,
    value
  }) {
    const transactionMeta = this.getTransaction(txId);
    if (!transactionMeta) {
      throw new Error(
        `Cannot update editable params as no transaction metadata found`
      );
    }
    validateIfTransactionUnapproved(transactionMeta, "updateEditableParams");
    const editableParams = {
      txParams: {
        data,
        from,
        to,
        value,
        gas,
        gasPrice
      }
    };
    editableParams.txParams = pickBy(
      editableParams.txParams
    );
    const updatedTransaction = merge({}, transactionMeta, editableParams);
    const provider = __privateGet(this, _multichainTrackingHelper).getProvider({
      chainId: transactionMeta.chainId,
      networkClientId: transactionMeta.networkClientId
    });
    const ethQuery = new EthQuery(provider);
    const { type } = await determineTransactionType(
      updatedTransaction.txParams,
      ethQuery
    );
    updatedTransaction.type = type;
    await updateTransactionLayer1GasFee({
      layer1GasFeeFlows: this.layer1GasFeeFlows,
      provider,
      transactionMeta: updatedTransaction
    });
    this.updateTransaction(
      updatedTransaction,
      `Update Editable Params for ${txId}`
    );
    return this.getTransaction(txId);
  }
  /**
   * Signs and returns the raw transaction data for provided transaction params list.
   *
   * @param listOfTxParams - The list of transaction params to approve.
   * @param opts - Options bag.
   * @param opts.hasNonce - Whether the transactions already have a nonce.
   * @returns The raw transactions.
   */
  async approveTransactionsWithSameNonce(listOfTxParams = [], { hasNonce } = {}) {
    projectLogger("Approving transactions with same nonce", {
      transactions: listOfTxParams
    });
    if (listOfTxParams.length === 0) {
      return "";
    }
    const initialTx = listOfTxParams[0];
    const common = this.getCommonConfiguration(initialTx.chainId);
    let networkClientId;
    try {
      networkClientId = this.messagingSystem.call(
        `NetworkController:findNetworkClientIdByChainId`,
        initialTx.chainId
      );
    } catch (err) {
      projectLogger("failed to find networkClientId from chainId", err);
    }
    const initialTxAsEthTx = TransactionFactory.fromTxData(initialTx, {
      common
    });
    const initialTxAsSerializedHex = bufferToHex(initialTxAsEthTx.serialize());
    if (this.approvingTransactionIds.has(initialTxAsSerializedHex)) {
      return "";
    }
    this.approvingTransactionIds.add(initialTxAsSerializedHex);
    let rawTransactions, nonceLock;
    try {
      const fromAddress = initialTx.from;
      const requiresNonce = hasNonce !== true;
      nonceLock = requiresNonce ? await this.getNonceLock(fromAddress, networkClientId) : void 0;
      const nonce = nonceLock ? add0x(nonceLock.nextNonce.toString(16)) : initialTx.nonce;
      if (nonceLock) {
        projectLogger("Using nonce from nonce tracker", nonce, nonceLock.nonceDetails);
      }
      rawTransactions = await Promise.all(
        listOfTxParams.map((txParams) => {
          txParams.nonce = nonce;
          return this.signExternalTransaction(txParams.chainId, txParams);
        })
      );
    } catch (err) {
      projectLogger("Error while signing transactions with same nonce", err);
      throw err;
    } finally {
      nonceLock?.releaseLock();
      this.approvingTransactionIds.delete(initialTxAsSerializedHex);
    }
    return rawTransactions;
  }
  /**
   * Update a custodial transaction.
   *
   * @param transactionId - The ID of the transaction to update.
   * @param options - The custodial transaction options to update.
   * @param options.errorMessage - The error message to be assigned in case transaction status update to failed.
   * @param options.hash - The new hash value to be assigned.
   * @param options.status - The new status value to be assigned.
   */
  updateCustodialTransaction(transactionId, {
    errorMessage,
    hash,
    status
  }) {
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      throw new Error(
        `Cannot update custodial transaction as no transaction metadata found`
      );
    }
    if (!transactionMeta.custodyId) {
      throw new Error("Transaction must be a custodian transaction");
    }
    if (status && ![
      "submitted" /* submitted */,
      "signed" /* signed */,
      "failed" /* failed */
    ].includes(status)) {
      throw new Error(
        `Cannot update custodial transaction with status: ${status}`
      );
    }
    const updatedTransactionMeta = merge(
      {},
      transactionMeta,
      pickBy({ hash, status })
    );
    if (updatedTransactionMeta.status === "submitted" /* submitted */) {
      updatedTransactionMeta.submittedTime = (/* @__PURE__ */ new Date()).getTime();
    }
    if (updatedTransactionMeta.status === "failed" /* failed */) {
      updatedTransactionMeta.error = normalizeTxError(new Error(errorMessage));
    }
    this.updateTransaction(
      updatedTransactionMeta,
      `${controllerName}:updateCustodialTransaction - Custodial transaction updated`
    );
    if (["submitted" /* submitted */, "failed" /* failed */].includes(
      status
    )) {
      this.messagingSystem.publish(
        `${controllerName}:transactionFinished`,
        updatedTransactionMeta
      );
      __privateGet(this, _internalEvents).emit(
        `${updatedTransactionMeta.id}:finished`,
        updatedTransactionMeta
      );
    }
  }
  /**
   * Creates approvals for all unapproved transactions persisted.
   */
  initApprovals() {
    const chainId = this.getChainId();
    const unapprovedTxs = this.state.transactions.filter(
      (transaction) => transaction.status === "unapproved" /* unapproved */ && transaction.chainId === chainId && !transaction.isUserOperation
    );
    for (const txMeta of unapprovedTxs) {
      this.processApproval(txMeta, {
        shouldShowRequest: false
      }).catch((error) => {
        if (error?.code === errorCodes.provider.userRejectedRequest) {
          return;
        }
        console.error("Error during persisted transaction approval", error);
      });
    }
  }
  /**
   * Search transaction metadata for matching entries.
   *
   * @param opts - Options bag.
   * @param opts.searchCriteria - An object containing values or functions for transaction properties to filter transactions with.
   * @param opts.initialList - The transactions to search. Defaults to the current state.
   * @param opts.filterToCurrentNetwork - Whether to filter the results to the current network. Defaults to true.
   * @param opts.limit - The maximum number of transactions to return. No limit by default.
   * @returns An array of transactions matching the provided options.
   */
  getTransactions({
    searchCriteria = {},
    initialList,
    filterToCurrentNetwork = true,
    limit
  } = {}) {
    const chainId = this.getChainId();
    const predicateMethods = mapValues(searchCriteria, (predicate) => {
      return typeof predicate === "function" ? predicate : (
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v) => v === predicate
      );
    });
    const transactionsToFilter = initialList ?? this.state.transactions;
    const filteredTransactions = sortBy(
      pickBy(transactionsToFilter, (transaction) => {
        if (filterToCurrentNetwork && transaction.chainId !== chainId) {
          return false;
        }
        for (const [key, predicate] of Object.entries(predicateMethods)) {
          if (key in transaction.txParams) {
            if (predicate(transaction.txParams[key]) === false) {
              return false;
            }
          } else if (predicate(transaction[key]) === false) {
            return false;
          }
        }
        return true;
      }),
      "time"
    );
    if (limit !== void 0) {
      const nonces = /* @__PURE__ */ new Set();
      const txs = [];
      for (let i = filteredTransactions.length - 1; i > -1; i--) {
        const txMeta = filteredTransactions[i];
        const { nonce } = txMeta.txParams;
        if (!nonces.has(nonce)) {
          if (nonces.size < limit) {
            nonces.add(nonce);
          } else {
            continue;
          }
        }
        txs.unshift(txMeta);
      }
      return txs;
    }
    return filteredTransactions;
  }
  async estimateGasFee({
    transactionParams,
    chainId,
    networkClientId: requestNetworkClientId
  }) {
    const networkClientId = __privateMethod(this, _getNetworkClientId, getNetworkClientId_fn).call(this, {
      networkClientId: requestNetworkClientId,
      chainId
    });
    const transactionMeta = {
      txParams: transactionParams,
      chainId,
      networkClientId
    };
    const gasFeeFlow = getGasFeeFlow(
      transactionMeta,
      this.gasFeeFlows
    );
    const ethQuery = __privateGet(this, _multichainTrackingHelper).getEthQuery({
      networkClientId,
      chainId
    });
    const gasFeeControllerData = await this.getGasFeeEstimates({
      networkClientId
    });
    return gasFeeFlow.getGasFees({
      ethQuery,
      gasFeeControllerData,
      transactionMeta
    });
  }
  /**
   * Determine the layer 1 gas fee for the given transaction parameters.
   *
   * @param request - The request object.
   * @param request.transactionParams - The transaction parameters to estimate the layer 1 gas fee for.
   * @param request.chainId - The ID of the chain where the transaction will be executed.
   * @param request.networkClientId - The ID of a specific network client to process the transaction.
   */
  async getLayer1GasFee({
    transactionParams,
    chainId,
    networkClientId
  }) {
    const provider = __privateGet(this, _multichainTrackingHelper).getProvider({
      networkClientId,
      chainId
    });
    return await getTransactionLayer1GasFee({
      layer1GasFeeFlows: this.layer1GasFeeFlows,
      provider,
      transactionMeta: {
        txParams: transactionParams,
        chainId
      }
    });
  }
  async signExternalTransaction(chainId, transactionParams) {
    if (!this.sign) {
      throw new Error("No sign method defined.");
    }
    const normalizedTransactionParams = normalizeTransactionParams(transactionParams);
    const type = isEIP1559Transaction(normalizedTransactionParams) ? "0x2" /* feeMarket */ : "0x0" /* legacy */;
    const updatedTransactionParams = {
      ...normalizedTransactionParams,
      type,
      gasLimit: normalizedTransactionParams.gas,
      chainId
    };
    const { from } = updatedTransactionParams;
    const common = this.getCommonConfiguration(chainId);
    const unsignedTransaction = TransactionFactory.fromTxData(
      updatedTransactionParams,
      { common }
    );
    const signedTransaction = await this.sign(unsignedTransaction, from);
    const rawTransaction = bufferToHex(signedTransaction.serialize());
    return rawTransaction;
  }
  /**
   * Removes unapproved transactions from state.
   */
  clearUnapprovedTransactions() {
    const transactions = this.state.transactions.filter(
      ({ status }) => status !== "unapproved" /* unapproved */
    );
    this.update((state) => {
      state.transactions = this.trimTransactionsForState(transactions);
    });
  }
  /**
   * Stop the signing process for a specific transaction.
   * Throws an error causing the transaction status to be set to failed.
   * @param transactionId - The ID of the transaction to stop signing.
   */
  abortTransactionSigning(transactionId) {
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      throw new Error(`Cannot abort signing as no transaction metadata found`);
    }
    const abortCallback = this.signAbortCallbacks.get(transactionId);
    if (!abortCallback) {
      throw new Error(
        `Cannot abort signing as transaction is not waiting for signing`
      );
    }
    abortCallback();
    this.signAbortCallbacks.delete(transactionId);
  }
  addMetadata(transactionMeta) {
    this.update((state) => {
      state.transactions = this.trimTransactionsForState([
        ...state.transactions,
        transactionMeta
      ]);
    });
  }
  async updateGasProperties(transactionMeta) {
    const isEIP1559Compatible = await this.getEIP1559Compatibility(transactionMeta.networkClientId) && transactionMeta.txParams.type !== "0x0" /* legacy */;
    const { networkClientId, chainId } = transactionMeta;
    const isCustomNetwork = __privateMethod(this, _isCustomNetwork, isCustomNetwork_fn).call(this, networkClientId);
    const ethQuery = __privateGet(this, _multichainTrackingHelper).getEthQuery({
      networkClientId,
      chainId
    });
    const provider = __privateGet(this, _multichainTrackingHelper).getProvider({
      networkClientId,
      chainId
    });
    await updateGas({
      ethQuery,
      chainId,
      isCustomNetwork,
      txMeta: transactionMeta
    });
    await updateGasFees({
      eip1559: isEIP1559Compatible,
      ethQuery,
      gasFeeFlows: this.gasFeeFlows,
      getGasFeeEstimates: this.getGasFeeEstimates,
      getSavedGasFees: this.getSavedGasFees.bind(this),
      txMeta: transactionMeta
    });
    await updateTransactionLayer1GasFee({
      layer1GasFeeFlows: this.layer1GasFeeFlows,
      provider,
      transactionMeta
    });
  }
  onBootCleanup() {
    this.submitApprovedTransactions();
  }
  /**
   * Force submit approved transactions for all chains.
   */
  submitApprovedTransactions() {
    const approvedTransactions = this.state.transactions.filter(
      (transaction) => transaction.status === "approved" /* approved */
    );
    for (const transactionMeta of approvedTransactions) {
      if (this.beforeApproveOnInit(transactionMeta)) {
        this.approveTransaction(transactionMeta.id).catch((error) => {
          console.error("Error while submitting persisted transaction", error);
        });
      }
    }
  }
  async processApproval(transactionMeta, {
    isExisting = false,
    requireApproval,
    shouldShowRequest = true,
    actionId
  }) {
    const transactionId = transactionMeta.id;
    let resultCallbacks;
    const { meta, isCompleted } = this.isTransactionCompleted(transactionId);
    const finishedPromise = isCompleted ? Promise.resolve(meta) : this.waitForTransactionFinished(transactionId);
    if (meta && !isExisting && !isCompleted) {
      try {
        if (requireApproval !== false) {
          const acceptResult = await this.requestApproval(transactionMeta, {
            shouldShowRequest
          });
          resultCallbacks = acceptResult.resultCallbacks;
          const approvalValue = acceptResult.value;
          const updatedTransaction = approvalValue?.txMeta;
          if (updatedTransaction) {
            projectLogger("Updating transaction with approval data", {
              customNonce: updatedTransaction.customNonceValue,
              params: updatedTransaction.txParams
            });
            this.updateTransaction(
              updatedTransaction,
              "TransactionController#processApproval - Updated with approval data"
            );
          }
        }
        const { isCompleted: isTxCompleted } = this.isTransactionCompleted(transactionId);
        if (!isTxCompleted) {
          const approvalResult = await this.approveTransaction(transactionId);
          if (approvalResult === "skipped-via-before-publish-hook" /* SkippedViaBeforePublishHook */ && resultCallbacks) {
            resultCallbacks.success();
          }
          const updatedTransactionMeta = this.getTransaction(
            transactionId
          );
          this.messagingSystem.publish(
            `${controllerName}:transactionApproved`,
            {
              transactionMeta: updatedTransactionMeta,
              actionId
            }
          );
        }
      } catch (error) {
        const { isCompleted: isTxCompleted } = this.isTransactionCompleted(transactionId);
        if (!isTxCompleted) {
          if (error?.code === errorCodes.provider.userRejectedRequest) {
            this.cancelTransaction(transactionId, actionId);
            throw providerErrors.userRejectedRequest(
              "MetaMask Tx Signature: User denied transaction signature."
            );
          } else {
            this.failTransaction(meta, error, actionId);
          }
        }
      }
    }
    const finalMeta = await finishedPromise;
    switch (finalMeta?.status) {
      case "failed" /* failed */:
        resultCallbacks?.error(finalMeta.error);
        throw rpcErrors.internal(finalMeta.error.message);
      case "submitted" /* submitted */:
        resultCallbacks?.success();
        return finalMeta.hash;
      default:
        const internalError = rpcErrors.internal(
          `MetaMask Tx Signature: Unknown problem: ${JSON.stringify(
            finalMeta || transactionId
          )}`
        );
        resultCallbacks?.error(internalError);
        throw internalError;
    }
  }
  /**
   * Approves a transaction and updates it's status in state. If this is not a
   * retry transaction, a nonce will be generated. The transaction is signed
   * using the sign configuration property, then published to the blockchain.
   * A `<tx.id>:finished` hub event is fired after success or failure.
   *
   * @param transactionId - The ID of the transaction to approve.
   */
  async approveTransaction(transactionId) {
    const cleanupTasks = new Array();
    cleanupTasks.push(await this.mutex.acquire());
    let transactionMeta = this.getTransactionOrThrow(transactionId);
    try {
      if (!this.sign) {
        this.failTransaction(
          transactionMeta,
          new Error("No sign method defined.")
        );
        return "not-approved" /* NotApproved */;
      } else if (!transactionMeta.chainId) {
        this.failTransaction(transactionMeta, new Error("No chainId defined."));
        return "not-approved" /* NotApproved */;
      }
      if (this.approvingTransactionIds.has(transactionId)) {
        projectLogger("Skipping approval as signing in progress", transactionId);
        return "not-approved" /* NotApproved */;
      }
      this.approvingTransactionIds.add(transactionId);
      cleanupTasks.push(
        () => this.approvingTransactionIds.delete(transactionId)
      );
      const [nonce, releaseNonce] = await getNextNonce(
        transactionMeta,
        (address) => __privateGet(this, _multichainTrackingHelper).getNonceLock(
          address,
          transactionMeta.networkClientId
        )
      );
      releaseNonce && cleanupTasks.push(releaseNonce);
      transactionMeta = __privateMethod(this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, {
        transactionId,
        note: "TransactionController#approveTransaction - Transaction approved"
      }, (draftTxMeta) => {
        const { txParams, chainId } = draftTxMeta;
        draftTxMeta.status = "approved" /* approved */;
        draftTxMeta.txParams = {
          ...txParams,
          nonce,
          chainId,
          gasLimit: txParams.gas,
          ...isEIP1559Transaction(txParams) && {
            type: "0x2" /* feeMarket */
          }
        };
      });
      this.onTransactionStatusChange(transactionMeta);
      const rawTx = await this.signTransaction(
        transactionMeta,
        transactionMeta.txParams
      );
      if (!this.beforePublish(transactionMeta)) {
        projectLogger("Skipping publishing transaction based on hook");
        this.messagingSystem.publish(
          `${controllerName}:transactionPublishingSkipped`,
          transactionMeta
        );
        return "skipped-via-before-publish-hook" /* SkippedViaBeforePublishHook */;
      }
      if (!rawTx) {
        return "not-approved" /* NotApproved */;
      }
      const ethQuery = __privateGet(this, _multichainTrackingHelper).getEthQuery({
        networkClientId: transactionMeta.networkClientId,
        chainId: transactionMeta.chainId
      });
      let preTxBalance;
      const shouldUpdatePreTxBalance = transactionMeta.type === "swap" /* swap */;
      if (shouldUpdatePreTxBalance) {
        projectLogger("Determining pre-transaction balance");
        preTxBalance = await query(ethQuery, "getBalance", [
          transactionMeta.txParams.from
        ]);
      }
      projectLogger("Publishing transaction", transactionMeta.txParams);
      let { transactionHash: hash } = await this.publish(
        transactionMeta,
        rawTx
      );
      if (hash === void 0) {
        hash = await this.publishTransaction(ethQuery, rawTx);
      }
      projectLogger("Publish successful", hash);
      transactionMeta = __privateMethod(this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, {
        transactionId,
        note: "TransactionController#approveTransaction - Transaction submitted"
      }, (draftTxMeta) => {
        draftTxMeta.hash = hash;
        draftTxMeta.status = "submitted" /* submitted */;
        draftTxMeta.submittedTime = (/* @__PURE__ */ new Date()).getTime();
        if (shouldUpdatePreTxBalance) {
          draftTxMeta.preTxBalance = preTxBalance;
          projectLogger("Updated pre-transaction balance", preTxBalance);
        }
      });
      this.messagingSystem.publish(`${controllerName}:transactionSubmitted`, {
        transactionMeta
      });
      this.messagingSystem.publish(
        `${controllerName}:transactionFinished`,
        transactionMeta
      );
      __privateGet(this, _internalEvents).emit(`${transactionId}:finished`, transactionMeta);
      this.onTransactionStatusChange(transactionMeta);
      return "approved" /* Approved */;
    } catch (error) {
      this.failTransaction(transactionMeta, error);
      return "not-approved" /* NotApproved */;
    } finally {
      cleanupTasks.forEach((task) => task());
    }
  }
  async publishTransaction(ethQuery, rawTransaction) {
    return await query(ethQuery, "sendRawTransaction", [rawTransaction]);
  }
  /**
   * Cancels a transaction based on its ID by setting its status to "rejected"
   * and emitting a `<tx.id>:finished` hub event.
   *
   * @param transactionId - The ID of the transaction to cancel.
   * @param actionId - The actionId passed from UI
   */
  cancelTransaction(transactionId, actionId) {
    const transactionMeta = this.state.transactions.find(
      ({ id }) => id === transactionId
    );
    if (!transactionMeta) {
      return;
    }
    this.update((state) => {
      const transactions = state.transactions.filter(
        ({ id }) => id !== transactionId
      );
      state.transactions = this.trimTransactionsForState(transactions);
    });
    const updatedTransactionMeta = {
      ...transactionMeta,
      status: "rejected" /* rejected */
    };
    this.messagingSystem.publish(
      `${controllerName}:transactionFinished`,
      updatedTransactionMeta
    );
    __privateGet(this, _internalEvents).emit(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${transactionMeta.id}:finished`,
      updatedTransactionMeta
    );
    this.messagingSystem.publish(`${controllerName}:transactionRejected`, {
      transactionMeta: updatedTransactionMeta,
      actionId
    });
    this.onTransactionStatusChange(updatedTransactionMeta);
  }
  /**
   * Trim the amount of transactions that are set on the state. Checks
   * if the length of the tx history is longer then desired persistence
   * limit and then if it is removes the oldest confirmed or rejected tx.
   * Pending or unapproved transactions will not be removed by this
   * operation. For safety of presenting a fully functional transaction UI
   * representation, this function will not break apart transactions with the
   * same nonce, created on the same day, per network. Not accounting for
   * transactions of the same nonce, same day and network combo can result in
   * confusing or broken experiences in the UI.
   *
   * @param transactions - The transactions to be applied to the state.
   * @returns The trimmed list of transactions.
   */
  trimTransactionsForState(transactions) {
    const nonceNetworkSet = /* @__PURE__ */ new Set();
    const txsToKeep = [...transactions].sort((a, b) => a.time > b.time ? -1 : 1).filter((tx) => {
      const { chainId, status, txParams, time } = tx;
      if (txParams) {
        const key = `${String(txParams.nonce)}-${convertHexToDecimal(
          chainId
        )}-${new Date(time).toDateString()}`;
        if (nonceNetworkSet.has(key)) {
          return true;
        } else if (nonceNetworkSet.size < __privateGet(this, _transactionHistoryLimit) || !this.isFinalState(status)) {
          nonceNetworkSet.add(key);
          return true;
        }
      }
      return false;
    });
    txsToKeep.reverse();
    return txsToKeep;
  }
  /**
   * Determines if the transaction is in a final state.
   *
   * @param status - The transaction status.
   * @returns Whether the transaction is in a final state.
   */
  isFinalState(status) {
    return status === "rejected" /* rejected */ || status === "confirmed" /* confirmed */ || status === "failed" /* failed */;
  }
  /**
   * Whether the transaction has at least completed all local processing.
   *
   * @param status - The transaction status.
   * @returns Whether the transaction is in a final state.
   */
  isLocalFinalState(status) {
    return [
      "confirmed" /* confirmed */,
      "failed" /* failed */,
      "rejected" /* rejected */,
      "submitted" /* submitted */
    ].includes(status);
  }
  async requestApproval(txMeta, { shouldShowRequest }) {
    const id = this.getApprovalId(txMeta);
    const { origin } = txMeta;
    const type = ApprovalType.Transaction;
    const requestData = { txId: txMeta.id };
    return await this.messagingSystem.call(
      "ApprovalController:addRequest",
      {
        id,
        origin: origin || ORIGIN_METAMASK,
        type,
        requestData,
        expectsResult: true
      },
      shouldShowRequest
    );
  }
  getTransaction(transactionId) {
    const { transactions } = this.state;
    return transactions.find(({ id }) => id === transactionId);
  }
  getTransactionOrThrow(transactionId, errorMessagePrefix = "TransactionController") {
    const txMeta = this.getTransaction(transactionId);
    if (!txMeta) {
      throw new Error(
        `${errorMessagePrefix}: No transaction found with id ${transactionId}`
      );
    }
    return txMeta;
  }
  getApprovalId(txMeta) {
    return String(txMeta.id);
  }
  isTransactionCompleted(transactionId) {
    const transaction = this.getTransaction(transactionId);
    if (!transaction) {
      return { meta: void 0, isCompleted: false };
    }
    const isCompleted = this.isLocalFinalState(transaction.status);
    return { meta: transaction, isCompleted };
  }
  getChainId(networkClientId) {
    const globalChainId = __privateMethod(this, _getGlobalChainId, getGlobalChainId_fn).call(this);
    const globalNetworkClientId = __privateMethod(this, _getGlobalNetworkClientId, getGlobalNetworkClientId_fn).call(this);
    if (!networkClientId || networkClientId === globalNetworkClientId) {
      return globalChainId;
    }
    return this.messagingSystem.call(
      `NetworkController:getNetworkClientById`,
      networkClientId
    ).configuration.chainId;
  }
  prepareUnsignedEthTx(chainId, txParams) {
    return TransactionFactory.fromTxData(txParams, {
      freeze: false,
      common: this.getCommonConfiguration(chainId)
    });
  }
  /**
   * `@ethereumjs/tx` uses `@ethereumjs/common` as a configuration tool for
   * specifying which chain, network, hardfork and EIPs to support for
   * a transaction. By referencing this configuration, and analyzing the fields
   * specified in txParams, @ethereumjs/tx is able to determine which EIP-2718
   * transaction type to use.
   *
   * @param chainId - The chainId to use for the configuration.
   * @returns common configuration object
   */
  getCommonConfiguration(chainId) {
    const customChainParams = {
      chainId: parseInt(chainId, 16),
      defaultHardfork: HARDFORK
    };
    return Common.custom(customChainParams);
  }
  onIncomingTransactions({
    added,
    updated
  }) {
    this.update((state) => {
      const { transactions: currentTransactions } = state;
      const updatedTransactions = [
        ...added,
        ...currentTransactions.map((originalTransaction) => {
          const updatedTransaction = updated.find(
            ({ hash }) => hash === originalTransaction.hash
          );
          return updatedTransaction ?? originalTransaction;
        })
      ];
      state.transactions = this.trimTransactionsForState(updatedTransactions);
    });
  }
  onUpdatedLastFetchedBlockNumbers({
    lastFetchedBlockNumbers,
    blockNumber
  }) {
    this.update((state) => {
      state.lastFetchedBlockNumbers = lastFetchedBlockNumbers;
    });
    this.messagingSystem.publish(
      `${controllerName}:incomingTransactionBlockReceived`,
      blockNumber
    );
  }
  generateDappSuggestedGasFees(txParams, origin) {
    if (!origin || origin === ORIGIN_METAMASK) {
      return void 0;
    }
    const { gasPrice, maxFeePerGas, maxPriorityFeePerGas, gas } = txParams;
    if (gasPrice === void 0 && maxFeePerGas === void 0 && maxPriorityFeePerGas === void 0 && gas === void 0) {
      return void 0;
    }
    const dappSuggestedGasFees = {};
    if (gasPrice !== void 0) {
      dappSuggestedGasFees.gasPrice = gasPrice;
    } else if (maxFeePerGas !== void 0 || maxPriorityFeePerGas !== void 0) {
      dappSuggestedGasFees.maxFeePerGas = maxFeePerGas;
      dappSuggestedGasFees.maxPriorityFeePerGas = maxPriorityFeePerGas;
    }
    if (gas !== void 0) {
      dappSuggestedGasFees.gas = gas;
    }
    return dappSuggestedGasFees;
  }
  /**
   * Validates and adds external provided transaction to state.
   *
   * @param transactionMeta - Nominated external transaction to be added to state.
   * @returns The new transaction.
   */
  addExternalTransaction(transactionMeta) {
    const { chainId } = transactionMeta;
    const { transactions } = this.state;
    const fromAddress = transactionMeta?.txParams?.from;
    const sameFromAndNetworkTransactions = transactions.filter(
      (transaction) => transaction.txParams.from === fromAddress && transaction.chainId === chainId
    );
    const confirmedTxs = sameFromAndNetworkTransactions.filter(
      (transaction) => transaction.status === "confirmed" /* confirmed */
    );
    const pendingTxs = sameFromAndNetworkTransactions.filter(
      (transaction) => transaction.status === "submitted" /* submitted */
    );
    validateConfirmedExternalTransaction(
      transactionMeta,
      confirmedTxs,
      pendingTxs
    );
    const newTransactionMeta = (transactionMeta.history ?? []).length === 0 && !this.isHistoryDisabled ? addInitialHistorySnapshot(transactionMeta) : transactionMeta;
    this.update((state) => {
      state.transactions = this.trimTransactionsForState([
        ...state.transactions,
        newTransactionMeta
      ]);
    });
    return newTransactionMeta;
  }
  /**
   * Sets other txMeta statuses to dropped if the txMeta that has been confirmed has other transactions
   * in the transactions have the same nonce.
   *
   * @param transactionId - Used to identify original transaction.
   */
  markNonceDuplicatesDropped(transactionId) {
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      return;
    }
    const nonce = transactionMeta.txParams?.nonce;
    const from = transactionMeta.txParams?.from;
    const { chainId } = transactionMeta;
    const sameNonceTransactions = this.state.transactions.filter(
      (transaction) => transaction.id !== transactionId && transaction.txParams.from === from && transaction.txParams.nonce === nonce && transaction.chainId === chainId && transaction.type !== "incoming" /* incoming */
    );
    const sameNonceTransactionIds = sameNonceTransactions.map(
      (transaction) => transaction.id
    );
    if (sameNonceTransactions.length === 0) {
      return;
    }
    this.update((state) => {
      for (const transaction of state.transactions) {
        if (sameNonceTransactionIds.includes(transaction.id)) {
          transaction.replacedBy = transactionMeta?.hash;
          transaction.replacedById = transactionMeta?.id;
        }
      }
    });
    for (const transaction of this.state.transactions) {
      if (sameNonceTransactionIds.includes(transaction.id) && transaction.status !== "failed" /* failed */) {
        this.setTransactionStatusDropped(transaction);
      }
    }
  }
  /**
   * Method to set transaction status to dropped.
   *
   * @param transactionMeta - TransactionMeta of transaction to be marked as dropped.
   */
  setTransactionStatusDropped(transactionMeta) {
    const updatedTransactionMeta = {
      ...transactionMeta,
      status: "dropped" /* dropped */
    };
    this.messagingSystem.publish(`${controllerName}:transactionDropped`, {
      transactionMeta: updatedTransactionMeta
    });
    this.updateTransaction(
      updatedTransactionMeta,
      "TransactionController#setTransactionStatusDropped - Transaction dropped"
    );
    this.onTransactionStatusChange(updatedTransactionMeta);
  }
  /**
   * Get transaction with provided actionId.
   *
   * @param actionId - Unique ID to prevent duplicate requests
   * @returns the filtered transaction
   */
  getTransactionWithActionId(actionId) {
    return this.state.transactions.find(
      (transaction) => actionId && transaction.actionId === actionId
    );
  }
  async waitForTransactionFinished(transactionId) {
    return new Promise((resolve) => {
      __privateGet(this, _internalEvents).once(`${transactionId}:finished`, (txMeta) => {
        resolve(txMeta);
      });
    });
  }
  /**
   * Updates the r, s, and v properties of a TransactionMeta object
   * with values from a signed transaction.
   *
   * @param transactionMeta - The TransactionMeta object to update.
   * @param signedTx - The encompassing type for all transaction types containing r, s, and v values.
   * @returns The updated TransactionMeta object.
   */
  updateTransactionMetaRSV(transactionMeta, signedTx) {
    const transactionMetaWithRsv = cloneDeep(transactionMeta);
    for (const key of ["r", "s", "v"]) {
      const value = signedTx[key];
      if (value === void 0 || value === null) {
        continue;
      }
      transactionMetaWithRsv[key] = add0x(value.toString(16));
    }
    return transactionMetaWithRsv;
  }
  async getEIP1559Compatibility(networkClientId) {
    const currentNetworkIsEIP1559Compatible = await this.getCurrentNetworkEIP1559Compatibility(networkClientId);
    const currentAccountIsEIP1559Compatible = await this.getCurrentAccountEIP1559Compatibility();
    return currentNetworkIsEIP1559Compatible && currentAccountIsEIP1559Compatible;
  }
  async signTransaction(transactionMeta, txParams) {
    projectLogger("Signing transaction", txParams);
    const unsignedEthTx = this.prepareUnsignedEthTx(
      transactionMeta.chainId,
      txParams
    );
    this.approvingTransactionIds.add(transactionMeta.id);
    const signedTx = await new Promise((resolve, reject) => {
      this.sign?.(
        unsignedEthTx,
        txParams.from,
        ...this.getAdditionalSignArguments(transactionMeta)
      ).then(resolve, reject);
      this.signAbortCallbacks.set(
        transactionMeta.id,
        () => reject(new Error("Signing aborted by user"))
      );
    });
    this.signAbortCallbacks.delete(transactionMeta.id);
    if (!signedTx) {
      projectLogger("Skipping signed status as no signed transaction");
      return void 0;
    }
    const transactionMetaFromHook = cloneDeep(transactionMeta);
    if (!this.afterSign(transactionMetaFromHook, signedTx)) {
      this.updateTransaction(
        transactionMetaFromHook,
        "TransactionController#signTransaction - Update after sign"
      );
      projectLogger("Skipping signed status based on hook");
      return void 0;
    }
    const transactionMetaWithRsv = {
      ...this.updateTransactionMetaRSV(transactionMetaFromHook, signedTx),
      status: "signed" /* signed */
    };
    this.updateTransaction(
      transactionMetaWithRsv,
      "TransactionController#approveTransaction - Transaction signed"
    );
    this.onTransactionStatusChange(transactionMetaWithRsv);
    const rawTx = bufferToHex(signedTx.serialize());
    const transactionMetaWithRawTx = merge({}, transactionMetaWithRsv, {
      rawTx
    });
    this.updateTransaction(
      transactionMetaWithRawTx,
      "TransactionController#approveTransaction - RawTransaction added"
    );
    return rawTx;
  }
  onTransactionStatusChange(transactionMeta) {
    this.messagingSystem.publish(`${controllerName}:transactionStatusUpdated`, {
      transactionMeta
    });
  }
  getNonceTrackerTransactions(status, address, chainId = this.getChainId()) {
    return getAndFormatTransactionsForNonceTracker(
      chainId,
      address,
      status,
      this.state.transactions
    );
  }
  onConfirmedTransaction(transactionMeta) {
    projectLogger("Processing confirmed transaction", transactionMeta.id);
    this.markNonceDuplicatesDropped(transactionMeta.id);
    this.messagingSystem.publish(
      `${controllerName}:transactionConfirmed`,
      transactionMeta
    );
    this.onTransactionStatusChange(transactionMeta);
    this.updatePostBalance(transactionMeta);
  }
  async updatePostBalance(transactionMeta) {
    try {
      if (transactionMeta.type !== "swap" /* swap */) {
        return;
      }
      const ethQuery = __privateGet(this, _multichainTrackingHelper).getEthQuery({
        networkClientId: transactionMeta.networkClientId,
        chainId: transactionMeta.chainId
      });
      const { updatedTransactionMeta, approvalTransactionMeta } = await updatePostTransactionBalance(transactionMeta, {
        ethQuery,
        getTransaction: this.getTransaction.bind(this),
        updateTransaction: this.updateTransaction.bind(this)
      });
      this.messagingSystem.publish(
        `${controllerName}:postTransactionBalanceUpdated`,
        {
          transactionMeta: updatedTransactionMeta,
          approvalTransactionMeta
        }
      );
    } catch (error) {
      projectLogger("Error while updating post transaction balance", error);
    }
  }
  async publishTransactionForRetry(ethQuery, rawTx, transactionMeta) {
    try {
      const hash = await this.publishTransaction(ethQuery, rawTx);
      return hash;
    } catch (error) {
      if (this.isTransactionAlreadyConfirmedError(error)) {
        await this.pendingTransactionTracker.forceCheckTransaction(
          transactionMeta
        );
        throw new Error("Previous transaction is already confirmed");
      }
      throw error;
    }
  }
  /**
   * Ensures that error is a nonce issue
   *
   * @param error - The error to check
   * @returns Whether or not the error is a nonce issue
   */
  // TODO: Replace `any` with type
  // Some networks are returning original error in the data field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isTransactionAlreadyConfirmedError(error) {
    return error?.message?.includes("nonce too low") || error?.data?.message?.includes("nonce too low");
  }
};
_internalEvents = new WeakMap();
_incomingTransactionOptions = new WeakMap();
_pendingTransactionOptions = new WeakMap();
_transactionHistoryLimit = new WeakMap();
_isSimulationEnabled = new WeakMap();
_testGasFeeFlows = new WeakMap();
_multichainTrackingHelper = new WeakMap();
_createNonceTracker = new WeakSet();
createNonceTracker_fn = function({
  provider,
  blockTracker,
  chainId
}) {
  return new NonceTracker({
    // TODO: Fix types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider,
    // @ts-expect-error TODO: Fix types
    blockTracker,
    getPendingTransactions: __privateMethod(this, _getNonceTrackerPendingTransactions, getNonceTrackerPendingTransactions_fn).bind(
      this,
      chainId
    ),
    getConfirmedTransactions: this.getNonceTrackerTransactions.bind(
      this,
      "confirmed" /* confirmed */
    )
  });
};
_createIncomingTransactionHelper = new WeakSet();
createIncomingTransactionHelper_fn = function({
  blockTracker,
  etherscanRemoteTransactionSource,
  chainId
}) {
  const incomingTransactionHelper = new IncomingTransactionHelper({
    blockTracker,
    getCurrentAccount: () => __privateMethod(this, _getSelectedAccount, getSelectedAccount_fn).call(this),
    getLastFetchedBlockNumbers: () => this.state.lastFetchedBlockNumbers,
    getChainId: chainId ? () => chainId : this.getChainId.bind(this),
    isEnabled: __privateGet(this, _incomingTransactionOptions).isEnabled,
    queryEntireHistory: __privateGet(this, _incomingTransactionOptions).queryEntireHistory,
    remoteTransactionSource: etherscanRemoteTransactionSource,
    transactionLimit: __privateGet(this, _transactionHistoryLimit),
    updateTransactions: __privateGet(this, _incomingTransactionOptions).updateTransactions
  });
  __privateMethod(this, _addIncomingTransactionHelperListeners, addIncomingTransactionHelperListeners_fn).call(this, incomingTransactionHelper);
  return incomingTransactionHelper;
};
_createPendingTransactionTracker = new WeakSet();
createPendingTransactionTracker_fn = function({
  provider,
  blockTracker,
  chainId
}) {
  const ethQuery = new EthQuery(provider);
  const getChainId = chainId ? () => chainId : this.getChainId.bind(this);
  const pendingTransactionTracker = new PendingTransactionTracker({
    approveTransaction: async (transactionId) => {
      await this.approveTransaction(transactionId);
    },
    blockTracker,
    getChainId,
    getEthQuery: () => ethQuery,
    getTransactions: () => this.state.transactions,
    isResubmitEnabled: __privateGet(this, _pendingTransactionOptions).isResubmitEnabled,
    getGlobalLock: () => __privateGet(this, _multichainTrackingHelper).acquireNonceLockForChainIdKey({
      chainId: getChainId()
    }),
    publishTransaction: this.publishTransaction.bind(this),
    hooks: {
      beforeCheckPendingTransaction: this.beforeCheckPendingTransaction.bind(this),
      beforePublish: this.beforePublish.bind(this)
    }
  });
  __privateMethod(this, _addPendingTransactionTrackerListeners, addPendingTransactionTrackerListeners_fn).call(this, pendingTransactionTracker);
  return pendingTransactionTracker;
};
_checkForPendingTransactionAndStartPolling = new WeakMap();
_stopAllTracking = new WeakSet();
stopAllTracking_fn = function() {
  this.pendingTransactionTracker.stop();
  __privateMethod(this, _removePendingTransactionTrackerListeners, removePendingTransactionTrackerListeners_fn).call(this, this.pendingTransactionTracker);
  this.incomingTransactionHelper.stop();
  __privateMethod(this, _removeIncomingTransactionHelperListeners, removeIncomingTransactionHelperListeners_fn).call(this, this.incomingTransactionHelper);
  __privateGet(this, _multichainTrackingHelper).stopAllTracking();
};
_removeIncomingTransactionHelperListeners = new WeakSet();
removeIncomingTransactionHelperListeners_fn = function(incomingTransactionHelper) {
  incomingTransactionHelper.hub.removeAllListeners("transactions");
  incomingTransactionHelper.hub.removeAllListeners(
    "updatedLastFetchedBlockNumbers"
  );
};
_addIncomingTransactionHelperListeners = new WeakSet();
addIncomingTransactionHelperListeners_fn = function(incomingTransactionHelper) {
  incomingTransactionHelper.hub.on(
    "transactions",
    this.onIncomingTransactions.bind(this)
  );
  incomingTransactionHelper.hub.on(
    "updatedLastFetchedBlockNumbers",
    this.onUpdatedLastFetchedBlockNumbers.bind(this)
  );
};
_removePendingTransactionTrackerListeners = new WeakSet();
removePendingTransactionTrackerListeners_fn = function(pendingTransactionTracker) {
  pendingTransactionTracker.hub.removeAllListeners("transaction-confirmed");
  pendingTransactionTracker.hub.removeAllListeners("transaction-dropped");
  pendingTransactionTracker.hub.removeAllListeners("transaction-failed");
  pendingTransactionTracker.hub.removeAllListeners("transaction-updated");
};
_addPendingTransactionTrackerListeners = new WeakSet();
addPendingTransactionTrackerListeners_fn = function(pendingTransactionTracker) {
  pendingTransactionTracker.hub.on(
    "transaction-confirmed",
    this.onConfirmedTransaction.bind(this)
  );
  pendingTransactionTracker.hub.on(
    "transaction-dropped",
    this.setTransactionStatusDropped.bind(this)
  );
  pendingTransactionTracker.hub.on(
    "transaction-failed",
    this.failTransaction.bind(this)
  );
  pendingTransactionTracker.hub.on(
    "transaction-updated",
    this.updateTransaction.bind(this)
  );
};
_getNonceTrackerPendingTransactions = new WeakSet();
getNonceTrackerPendingTransactions_fn = function(chainId, address) {
  const standardPendingTransactions = this.getNonceTrackerTransactions(
    "submitted" /* submitted */,
    address,
    chainId
  );
  const externalPendingTransactions = this.getExternalPendingTransactions(
    address,
    chainId
  );
  return [...standardPendingTransactions, ...externalPendingTransactions];
};
_getGasFeeFlows = new WeakSet();
getGasFeeFlows_fn = function() {
  if (__privateGet(this, _testGasFeeFlows)) {
    return [new TestGasFeeFlow()];
  }
  return [new LineaGasFeeFlow(), new DefaultGasFeeFlow()];
};
_getLayer1GasFeeFlows = new WeakSet();
getLayer1GasFeeFlows_fn = function() {
  return [new OptimismLayer1GasFeeFlow(), new ScrollLayer1GasFeeFlow()];
};
_updateTransactionInternal = new WeakSet();
updateTransactionInternal_fn = function({
  transactionId,
  note,
  skipHistory
}, callback) {
  let updatedTransactionParams = [];
  this.update((state) => {
    const index = state.transactions.findIndex(
      ({ id }) => id === transactionId
    );
    let transactionMeta2 = state.transactions[index];
    transactionMeta2 = callback(transactionMeta2) ?? transactionMeta2;
    transactionMeta2.txParams = normalizeTransactionParams(
      transactionMeta2.txParams
    );
    validateTxParams(transactionMeta2.txParams);
    updatedTransactionParams = __privateMethod(this, _checkIfTransactionParamsUpdated, checkIfTransactionParamsUpdated_fn).call(this, transactionMeta2);
    const shouldSkipHistory = this.isHistoryDisabled || skipHistory;
    if (!shouldSkipHistory) {
      transactionMeta2 = updateTransactionHistory(
        transactionMeta2,
        note ?? "Transaction updated"
      );
    }
    state.transactions[index] = transactionMeta2;
  });
  const transactionMeta = this.getTransaction(
    transactionId
  );
  if (updatedTransactionParams.length > 0) {
    __privateMethod(this, _onTransactionParamsUpdated, onTransactionParamsUpdated_fn).call(this, transactionMeta, updatedTransactionParams);
  }
  return transactionMeta;
};
_checkIfTransactionParamsUpdated = new WeakSet();
checkIfTransactionParamsUpdated_fn = function(newTransactionMeta) {
  const { id: transactionId, txParams: newParams } = newTransactionMeta;
  const originalParams = this.getTransaction(transactionId)?.txParams;
  if (!originalParams || isEqual(originalParams, newParams)) {
    return [];
  }
  const params = Object.keys(newParams);
  const updatedProperties = params.filter(
    (param) => newParams[param] !== originalParams[param]
  );
  projectLogger(
    "Transaction parameters have been updated",
    transactionId,
    updatedProperties,
    originalParams,
    newParams
  );
  return updatedProperties;
};
_onTransactionParamsUpdated = new WeakSet();
onTransactionParamsUpdated_fn = function(transactionMeta, updatedParams) {
  if (["to", "value", "data"].some(
    (param) => updatedParams.includes(param)
  )) {
    projectLogger("Updating simulation data due to transaction parameter update");
    __privateMethod(this, _updateSimulationData, updateSimulationData_fn).call(this, transactionMeta);
  }
};
_updateSimulationData = new WeakSet();
updateSimulationData_fn = async function(transactionMeta) {
  const { id: transactionId, chainId, txParams } = transactionMeta;
  const { from, to, value, data } = txParams;
  let simulationData = {
    error: {
      code: "disabled" /* Disabled */,
      message: "Simulation disabled"
    },
    tokenBalanceChanges: []
  };
  if (__privateGet(this, _isSimulationEnabled).call(this)) {
    __privateMethod(this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, { transactionId, skipHistory: true }, (txMeta) => {
      txMeta.simulationData = void 0;
    });
    simulationData = await getSimulationData({
      chainId,
      from,
      to,
      value,
      data
    });
  }
  const finalTransactionMeta = this.getTransaction(transactionId);
  if (!finalTransactionMeta) {
    projectLogger(
      "Cannot update simulation data as transaction not found",
      transactionId,
      simulationData
    );
    return;
  }
  __privateMethod(this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, {
    transactionId,
    note: "TransactionController#updateSimulationData - Update simulation data"
  }, (txMeta) => {
    txMeta.simulationData = simulationData;
  });
  projectLogger("Updated simulation data", transactionId, simulationData);
};
_onGasFeePollerTransactionUpdate = new WeakSet();
onGasFeePollerTransactionUpdate_fn = function({
  transactionId,
  gasFeeEstimates,
  gasFeeEstimatesLoaded,
  layer1GasFee
}) {
  __privateMethod(this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, { transactionId, skipHistory: true }, (txMeta) => {
    if (gasFeeEstimates) {
      txMeta.gasFeeEstimates = gasFeeEstimates;
    }
    if (gasFeeEstimatesLoaded !== void 0) {
      txMeta.gasFeeEstimatesLoaded = gasFeeEstimatesLoaded;
    }
    if (layer1GasFee) {
      txMeta.layer1GasFee = layer1GasFee;
    }
  });
};
_getNetworkClientId = new WeakSet();
getNetworkClientId_fn = function({
  networkClientId: requestNetworkClientId,
  chainId
}) {
  const globalChainId = __privateMethod(this, _getGlobalChainId, getGlobalChainId_fn).call(this);
  const globalNetworkClientId = __privateMethod(this, _getGlobalNetworkClientId, getGlobalNetworkClientId_fn).call(this);
  if (requestNetworkClientId) {
    return requestNetworkClientId;
  }
  if (!chainId || chainId === globalChainId) {
    return globalNetworkClientId;
  }
  return this.messagingSystem.call(
    `NetworkController:findNetworkClientIdByChainId`,
    chainId
  );
};
_getGlobalNetworkClientId = new WeakSet();
getGlobalNetworkClientId_fn = function() {
  return this.getNetworkState().selectedNetworkClientId;
};
_getGlobalChainId = new WeakSet();
getGlobalChainId_fn = function() {
  return this.messagingSystem.call(
    `NetworkController:getNetworkClientById`,
    this.getNetworkState().selectedNetworkClientId
  ).configuration.chainId;
};
_isCustomNetwork = new WeakSet();
isCustomNetwork_fn = function(networkClientId) {
  const globalNetworkClientId = __privateMethod(this, _getGlobalNetworkClientId, getGlobalNetworkClientId_fn).call(this);
  if (!networkClientId || networkClientId === globalNetworkClientId) {
    return !isInfuraNetworkType(
      this.getNetworkState().selectedNetworkClientId
    );
  }
  return this.messagingSystem.call(
    `NetworkController:getNetworkClientById`,
    networkClientId
  ).configuration.type === NetworkClientType.Custom;
};
_getSelectedAccount = new WeakSet();
getSelectedAccount_fn = function() {
  return this.messagingSystem.call("AccountsController:getSelectedAccount");
};

export {
  HARDFORK,
  CANCEL_RATE,
  SPEED_UP_RATE,
  ApprovalState,
  TransactionController
};
//# sourceMappingURL=chunk-YIYKHF4T.mjs.map