"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }


var _chunkRXIUMVA5js = require('./chunk-RXIUMVA5.js');


var _chunk2EU6346Vjs = require('./chunk-2EU6346V.js');


var _chunkRHDPOIS4js = require('./chunk-RHDPOIS4.js');


var _chunk6OLJWLKKjs = require('./chunk-6OLJWLKK.js');


var _chunk7NMV2NPMjs = require('./chunk-7NMV2NPM.js');


var _chunkULD4JC3Qjs = require('./chunk-ULD4JC3Q.js');




var _chunkV72C4MCRjs = require('./chunk-V72C4MCR.js');



var _chunkQP75SWIQjs = require('./chunk-QP75SWIQ.js');



var _chunk2XKEAKQGjs = require('./chunk-2XKEAKQG.js');



var _chunkPRUNMTRDjs = require('./chunk-PRUNMTRD.js');


var _chunkNNCUD3QFjs = require('./chunk-NNCUD3QF.js');


var _chunkSD6CWFDFjs = require('./chunk-SD6CWFDF.js');


var _chunkNYKRCWBGjs = require('./chunk-NYKRCWBG.js');


var _chunkWR5F34OWjs = require('./chunk-WR5F34OW.js');


var _chunkTJMQEH57js = require('./chunk-TJMQEH57.js');


var _chunk7LXE4KHVjs = require('./chunk-7LXE4KHV.js');


var _chunkARZHJFVGjs = require('./chunk-ARZHJFVG.js');


var _chunkQTKXIDGEjs = require('./chunk-QTKXIDGE.js');


var _chunkC3WC4OJ3js = require('./chunk-C3WC4OJ3.js');



var _chunkQH2H4W3Njs = require('./chunk-QH2H4W3N.js');











var _chunkOZ6UB42Cjs = require('./chunk-OZ6UB42C.js');


var _chunk76FONEDAjs = require('./chunk-76FONEDA.js');


var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/TransactionController.ts
var _common = require('@ethereumjs/common');
var _tx = require('@ethereumjs/tx');
var _util = require('@ethereumjs/util');
var _basecontroller = require('@metamask/base-controller');






var _controllerutils = require('@metamask/controller-utils');
var _ethquery = require('@metamask/eth-query'); var _ethquery2 = _interopRequireDefault(_ethquery);
var _networkcontroller = require('@metamask/network-controller');
var _noncetracker = require('@metamask/nonce-tracker');
var _rpcerrors = require('@metamask/rpc-errors');
var _utils = require('@metamask/utils');
var _asyncmutex = require('async-mutex');
var _ethmethodregistry = require('eth-method-registry');
var _events = require('events');
var _lodash = require('lodash');
var _uuid = require('uuid');
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
var HARDFORK = _common.Hardfork.London;
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
var TransactionController = class extends _basecontroller.BaseController {
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
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _createNonceTracker);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _createIncomingTransactionHelper);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _createPendingTransactionTracker);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _stopAllTracking);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _removeIncomingTransactionHelperListeners);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _addIncomingTransactionHelperListeners);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _removePendingTransactionTrackerListeners);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _addPendingTransactionTrackerListeners);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getNonceTrackerPendingTransactions);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getGasFeeFlows);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getLayer1GasFeeFlows);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateTransactionInternal);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _checkIfTransactionParamsUpdated);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onTransactionParamsUpdated);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateSimulationData);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _onGasFeePollerTransactionUpdate);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getNetworkClientId);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getGlobalNetworkClientId);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getGlobalChainId);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isCustomNetwork);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getSelectedAccount);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _internalEvents, new (0, _events.EventEmitter)());
    this.approvingTransactionIds = /* @__PURE__ */ new Set();
    this.mutex = new (0, _asyncmutex.Mutex)();
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _incomingTransactionOptions, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _pendingTransactionOptions, void 0);
    this.signAbortCallbacks = /* @__PURE__ */ new Map();
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _transactionHistoryLimit, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isSimulationEnabled, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _testGasFeeFlows, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _multichainTrackingHelper, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _checkForPendingTransactionAndStartPolling, () => {
      this.pendingTransactionTracker.startIfPendingTransactions();
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).checkForPendingTransactionAndStartPolling();
    });
    this.messagingSystem = messenger;
    this.getNetworkState = getNetworkState;
    this.isSendFlowHistoryDisabled = disableSendFlowHistory ?? false;
    this.isHistoryDisabled = disableHistory ?? false;
    this.isSwapsDisabled = disableSwaps ?? false;
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isSimulationEnabled, isSimulationEnabled ?? (() => true));
    this.registry = new (0, _ethmethodregistry.MethodRegistry)({ provider });
    this.getSavedGasFees = getSavedGasFees ?? ((_chainId) => void 0);
    this.getCurrentAccountEIP1559Compatibility = getCurrentAccountEIP1559Compatibility ?? (() => Promise.resolve(true));
    this.getCurrentNetworkEIP1559Compatibility = getCurrentNetworkEIP1559Compatibility;
    this.getGasFeeEstimates = getGasFeeEstimates || (() => Promise.resolve({}));
    this.getPermittedAccounts = getPermittedAccounts;
    this.getExternalPendingTransactions = getExternalPendingTransactions ?? (() => []);
    this.securityProviderRequest = securityProviderRequest;
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _incomingTransactionOptions, incomingTransactions);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _pendingTransactionOptions, pendingTransactions);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _transactionHistoryLimit, transactionHistoryLimit);
    this.sign = sign;
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _testGasFeeFlows, testGasFeeFlows === true);
    this.afterSign = hooks?.afterSign ?? (() => true);
    this.beforeApproveOnInit = hooks?.beforeApproveOnInit ?? (() => true);
    this.beforeCheckPendingTransaction = hooks?.beforeCheckPendingTransaction ?? /* istanbul ignore next */
    (() => true);
    this.beforePublish = hooks?.beforePublish ?? (() => true);
    this.getAdditionalSignArguments = hooks?.getAdditionalSignArguments ?? (() => []);
    this.publish = hooks?.publish ?? (() => Promise.resolve({ transactionHash: void 0 }));
    this.nonceTracker = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _createNonceTracker, createNonceTracker_fn).call(this, {
      provider,
      blockTracker
    });
    const findNetworkClientIdByChainId = (chainId) => {
      return this.messagingSystem.call(
        `NetworkController:findNetworkClientIdByChainId`,
        chainId
      );
    };
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _multichainTrackingHelper, new (0, _chunk6OLJWLKKjs.MultichainTrackingHelper)({
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
      removeIncomingTransactionHelperListeners: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _removeIncomingTransactionHelperListeners, removeIncomingTransactionHelperListeners_fn).bind(this),
      removePendingTransactionTrackerListeners: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _removePendingTransactionTrackerListeners, removePendingTransactionTrackerListeners_fn).bind(this),
      createNonceTracker: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _createNonceTracker, createNonceTracker_fn).bind(this),
      createIncomingTransactionHelper: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _createIncomingTransactionHelper, createIncomingTransactionHelper_fn).bind(this),
      createPendingTransactionTracker: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _createPendingTransactionTracker, createPendingTransactionTracker_fn).bind(this),
      onNetworkStateChange: (listener) => {
        this.messagingSystem.subscribe(
          "NetworkController:stateChange",
          listener
        );
      }
    }));
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).initialize();
    const etherscanRemoteTransactionSource = new (0, _chunk7NMV2NPMjs.EtherscanRemoteTransactionSource)({
      includeTokenTransfers: incomingTransactions.includeTokenTransfers
    });
    this.incomingTransactionHelper = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _createIncomingTransactionHelper, createIncomingTransactionHelper_fn).call(this, {
      blockTracker,
      etherscanRemoteTransactionSource
    });
    this.pendingTransactionTracker = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _createPendingTransactionTracker, createPendingTransactionTracker_fn).call(this, {
      provider,
      blockTracker
    });
    this.gasFeeFlows = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getGasFeeFlows, getGasFeeFlows_fn).call(this);
    this.layer1GasFeeFlows = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getLayer1GasFeeFlows, getLayer1GasFeeFlows_fn).call(this);
    const gasFeePoller = new (0, _chunk2EU6346Vjs.GasFeePoller)({
      findNetworkClientIdByChainId,
      gasFeeFlows: this.gasFeeFlows,
      getGasFeeControllerEstimates: this.getGasFeeEstimates,
      getProvider: (chainId, networkClientId) => _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getProvider({
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
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onGasFeePollerTransactionUpdate, onGasFeePollerTransactionUpdate_fn).bind(this)
    );
    this.messagingSystem.subscribe(
      "TransactionController:stateChange",
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _checkForPendingTransactionAndStartPolling)
    );
    onNetworkStateChange(() => {
      _chunkS6VGOPUYjs.projectLogger.call(void 0, "Detected network change", this.getChainId());
      this.pendingTransactionTracker.startIfPendingTransactions();
      this.onBootCleanup();
    });
    this.onBootCleanup();
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _checkForPendingTransactionAndStartPolling).call(this);
  }
  failTransaction(transactionMeta, error, actionId) {
    const newTransactionMeta = _lodash.merge.call(void 0, {}, transactionMeta, {
      error: _chunkOZ6UB42Cjs.normalizeTxError.call(void 0, error),
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
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _internalEvents).emit(
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
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _stopAllTracking, stopAllTracking_fn).call(this);
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
    _chunkS6VGOPUYjs.projectLogger.call(void 0, "Adding transaction", txParams);
    txParams = _chunkOZ6UB42Cjs.normalizeTransactionParams.call(void 0, txParams);
    if (requestNetworkClientId && !_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).has(requestNetworkClientId)) {
      throw new Error(
        "The networkClientId for this transaction could not be found"
      );
    }
    const networkClientId = requestNetworkClientId ?? _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getGlobalNetworkClientId, getGlobalNetworkClientId_fn).call(this);
    const isEIP1559Compatible = await this.getEIP1559Compatibility(
      networkClientId
    );
    _chunkRXIUMVA5js.validateTxParams.call(void 0, txParams, isEIP1559Compatible);
    if (origin) {
      await _chunkRXIUMVA5js.validateTransactionOrigin.call(void 0, 
        await this.getPermittedAccounts(origin),
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAccount, getSelectedAccount_fn).call(this).address,
        txParams.from,
        origin
      );
    }
    const dappSuggestedGasFees = this.generateDappSuggestedGasFees(
      txParams,
      origin
    );
    const chainId = this.getChainId(networkClientId);
    const ethQuery = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getEthQuery({
      networkClientId,
      chainId
    });
    const transactionType = type ?? (await _chunkSD6CWFDFjs.determineTransactionType.call(void 0, txParams, ethQuery)).type;
    const existingTransactionMeta = this.getTransactionWithActionId(actionId);
    let addedTransactionMeta = existingTransactionMeta ? _lodash.cloneDeep.call(void 0, existingTransactionMeta) : {
      // Add actionId to txMeta to check if same actionId is seen again
      actionId,
      chainId,
      dappSuggestedGasFees,
      deviceConfirmedOn,
      id: _uuid.v1.call(void 0, ),
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
        addedTransactionMeta = _chunkQP75SWIQjs.addInitialHistorySnapshot.call(void 0, addedTransactionMeta);
      }
      addedTransactionMeta = _chunkQH2H4W3Njs.updateSwapsTransaction.call(void 0, 
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
        _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateSimulationData, updateSimulationData_fn).call(this, addedTransactionMeta);
      } else {
        _chunkS6VGOPUYjs.projectLogger.call(void 0, "Skipping simulation as approval not required");
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
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).startIncomingTransactionPolling(
      networkClientIds
    );
  }
  stopIncomingTransactionPolling(networkClientIds = []) {
    if (networkClientIds.length === 0) {
      this.incomingTransactionHelper.stop();
      return;
    }
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).stopIncomingTransactionPolling(
      networkClientIds
    );
  }
  stopAllIncomingTransactionPolling() {
    this.incomingTransactionHelper.stop();
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).stopAllIncomingTransactionPolling();
  }
  async updateIncomingTransactions(networkClientIds = []) {
    if (networkClientIds.length === 0) {
      await this.incomingTransactionHelper.update();
      return;
    }
    await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).updateIncomingTransactions(
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
      gasValues = _chunkOZ6UB42Cjs.normalizeGasFeeValues.call(void 0, gasValues);
      _chunkOZ6UB42Cjs.validateGasValues.call(void 0, gasValues);
    }
    _chunkS6VGOPUYjs.projectLogger.call(void 0, "Creating cancel transaction", transactionId, gasValues);
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      return;
    }
    if (!this.sign) {
      throw new Error("No sign method defined.");
    }
    const minGasPrice = _chunkOZ6UB42Cjs.getIncreasedPriceFromExisting.call(void 0, 
      transactionMeta.txParams.gasPrice,
      CANCEL_RATE
    );
    const gasPriceFromValues = _chunkOZ6UB42Cjs.isGasPriceValue.call(void 0, gasValues) && gasValues.gasPrice;
    const newGasPrice = gasPriceFromValues && _chunkOZ6UB42Cjs.validateMinimumIncrease.call(void 0, gasPriceFromValues, minGasPrice) || minGasPrice;
    const existingMaxFeePerGas = transactionMeta.txParams?.maxFeePerGas;
    const minMaxFeePerGas = _chunkOZ6UB42Cjs.getIncreasedPriceFromExisting.call(void 0, 
      existingMaxFeePerGas,
      CANCEL_RATE
    );
    const maxFeePerGasValues = _chunkOZ6UB42Cjs.isFeeMarketEIP1559Values.call(void 0, gasValues) && gasValues.maxFeePerGas;
    const newMaxFeePerGas = maxFeePerGasValues && _chunkOZ6UB42Cjs.validateMinimumIncrease.call(void 0, maxFeePerGasValues, minMaxFeePerGas) || existingMaxFeePerGas && minMaxFeePerGas;
    const existingMaxPriorityFeePerGas = transactionMeta.txParams?.maxPriorityFeePerGas;
    const minMaxPriorityFeePerGas = _chunkOZ6UB42Cjs.getIncreasedPriceFromExisting.call(void 0, 
      existingMaxPriorityFeePerGas,
      CANCEL_RATE
    );
    const maxPriorityFeePerGasValues = _chunkOZ6UB42Cjs.isFeeMarketEIP1559Values.call(void 0, gasValues) && gasValues.maxPriorityFeePerGas;
    const newMaxPriorityFeePerGas = maxPriorityFeePerGasValues && _chunkOZ6UB42Cjs.validateMinimumIncrease.call(void 0, 
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
    const rawTx = _util.bufferToHex.call(void 0, signedTx.serialize());
    const newFee = newTxParams.maxFeePerGas ?? newTxParams.gasPrice;
    const oldFee = newTxParams.maxFeePerGas ? transactionMeta.txParams.maxFeePerGas : transactionMeta.txParams.gasPrice;
    _chunkS6VGOPUYjs.projectLogger.call(void 0, "Submitting cancel transaction", {
      oldFee,
      newFee,
      txParams: newTxParams
    });
    const ethQuery = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getEthQuery({
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
      id: _uuid.v1.call(void 0, ),
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
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _internalEvents).emit(
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
      gasValues = _chunkOZ6UB42Cjs.normalizeGasFeeValues.call(void 0, gasValues);
      _chunkOZ6UB42Cjs.validateGasValues.call(void 0, gasValues);
    }
    _chunkS6VGOPUYjs.projectLogger.call(void 0, "Creating speed up transaction", transactionId, gasValues);
    const transactionMeta = this.getTransaction(transactionId);
    if (!transactionMeta) {
      return;
    }
    if (!this.sign) {
      throw new Error("No sign method defined.");
    }
    const minGasPrice = _chunkOZ6UB42Cjs.getIncreasedPriceFromExisting.call(void 0, 
      transactionMeta.txParams.gasPrice,
      SPEED_UP_RATE
    );
    const gasPriceFromValues = _chunkOZ6UB42Cjs.isGasPriceValue.call(void 0, gasValues) && gasValues.gasPrice;
    const newGasPrice = gasPriceFromValues && _chunkOZ6UB42Cjs.validateMinimumIncrease.call(void 0, gasPriceFromValues, minGasPrice) || minGasPrice;
    const existingMaxFeePerGas = transactionMeta.txParams?.maxFeePerGas;
    const minMaxFeePerGas = _chunkOZ6UB42Cjs.getIncreasedPriceFromExisting.call(void 0, 
      existingMaxFeePerGas,
      SPEED_UP_RATE
    );
    const maxFeePerGasValues = _chunkOZ6UB42Cjs.isFeeMarketEIP1559Values.call(void 0, gasValues) && gasValues.maxFeePerGas;
    const newMaxFeePerGas = maxFeePerGasValues && _chunkOZ6UB42Cjs.validateMinimumIncrease.call(void 0, maxFeePerGasValues, minMaxFeePerGas) || existingMaxFeePerGas && minMaxFeePerGas;
    const existingMaxPriorityFeePerGas = transactionMeta.txParams?.maxPriorityFeePerGas;
    const minMaxPriorityFeePerGas = _chunkOZ6UB42Cjs.getIncreasedPriceFromExisting.call(void 0, 
      existingMaxPriorityFeePerGas,
      SPEED_UP_RATE
    );
    const maxPriorityFeePerGasValues = _chunkOZ6UB42Cjs.isFeeMarketEIP1559Values.call(void 0, gasValues) && gasValues.maxPriorityFeePerGas;
    const newMaxPriorityFeePerGas = maxPriorityFeePerGasValues && _chunkOZ6UB42Cjs.validateMinimumIncrease.call(void 0, 
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
    const rawTx = _util.bufferToHex.call(void 0, signedTx.serialize());
    const newFee = txParams.maxFeePerGas ?? txParams.gasPrice;
    const oldFee = txParams.maxFeePerGas ? transactionMetaWithRsv.txParams.maxFeePerGas : transactionMetaWithRsv.txParams.gasPrice;
    _chunkS6VGOPUYjs.projectLogger.call(void 0, "Submitting speed up transaction", { oldFee, newFee, txParams });
    const ethQuery = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getEthQuery({
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
      id: _uuid.v1.call(void 0, ),
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
    const ethQuery = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getEthQuery({
      networkClientId
    });
    const { estimatedGas, simulationFails } = await _chunkV72C4MCRjs.estimateGas.call(void 0, 
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
    const ethQuery = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getEthQuery({
      networkClientId
    });
    const { blockGasLimit, estimatedGas, simulationFails } = await _chunkV72C4MCRjs.estimateGas.call(void 0, 
      transaction,
      ethQuery
    );
    const gas = _chunkV72C4MCRjs.addGasBuffer.call(void 0, estimatedGas, blockGasLimit, multiplier);
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
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, { transactionId, note }, () => ({
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
    _chunkOZ6UB42Cjs.validateIfTransactionUnapproved.call(void 0, 
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
    _chunkOZ6UB42Cjs.validateIfTransactionUnapproved.call(void 0, 
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
    transactionGasFees.txParams = _lodash.pickBy.call(void 0, transactionGasFees.txParams);
    transactionGasFees = _lodash.pickBy.call(void 0, transactionGasFees);
    const updatedMeta = _lodash.merge.call(void 0, {}, transactionMeta, transactionGasFees);
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
    _chunkOZ6UB42Cjs.validateIfTransactionUnapproved.call(void 0, transactionMeta, "updatePreviousGasParams");
    const transactionPreviousGas = {
      previousGas: {
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas
      }
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    };
    transactionPreviousGas.previousGas = _lodash.pickBy.call(void 0, 
      transactionPreviousGas.previousGas
    );
    const updatedMeta = _lodash.merge.call(void 0, {}, transactionMeta, transactionPreviousGas);
    this.updateTransaction(
      updatedMeta,
      `${controllerName}:updatePreviousGasParams - Previous gas values updated`
    );
    return this.getTransaction(transactionId);
  }
  async getNonceLock(address, networkClientId) {
    return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getNonceLock(
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
    _chunkOZ6UB42Cjs.validateIfTransactionUnapproved.call(void 0, transactionMeta, "updateEditableParams");
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
    editableParams.txParams = _lodash.pickBy.call(void 0, 
      editableParams.txParams
    );
    const updatedTransaction = _lodash.merge.call(void 0, {}, transactionMeta, editableParams);
    const provider = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getProvider({
      chainId: transactionMeta.chainId,
      networkClientId: transactionMeta.networkClientId
    });
    const ethQuery = new (0, _ethquery2.default)(provider);
    const { type } = await _chunkSD6CWFDFjs.determineTransactionType.call(void 0, 
      updatedTransaction.txParams,
      ethQuery
    );
    updatedTransaction.type = type;
    await _chunk2XKEAKQGjs.updateTransactionLayer1GasFee.call(void 0, {
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
    _chunkS6VGOPUYjs.projectLogger.call(void 0, "Approving transactions with same nonce", {
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
      _chunkS6VGOPUYjs.projectLogger.call(void 0, "failed to find networkClientId from chainId", err);
    }
    const initialTxAsEthTx = _tx.TransactionFactory.fromTxData(initialTx, {
      common
    });
    const initialTxAsSerializedHex = _util.bufferToHex.call(void 0, initialTxAsEthTx.serialize());
    if (this.approvingTransactionIds.has(initialTxAsSerializedHex)) {
      return "";
    }
    this.approvingTransactionIds.add(initialTxAsSerializedHex);
    let rawTransactions, nonceLock;
    try {
      const fromAddress = initialTx.from;
      const requiresNonce = hasNonce !== true;
      nonceLock = requiresNonce ? await this.getNonceLock(fromAddress, networkClientId) : void 0;
      const nonce = nonceLock ? _utils.add0x.call(void 0, nonceLock.nextNonce.toString(16)) : initialTx.nonce;
      if (nonceLock) {
        _chunkS6VGOPUYjs.projectLogger.call(void 0, "Using nonce from nonce tracker", nonce, nonceLock.nonceDetails);
      }
      rawTransactions = await Promise.all(
        listOfTxParams.map((txParams) => {
          txParams.nonce = nonce;
          return this.signExternalTransaction(txParams.chainId, txParams);
        })
      );
    } catch (err) {
      _chunkS6VGOPUYjs.projectLogger.call(void 0, "Error while signing transactions with same nonce", err);
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
    const updatedTransactionMeta = _lodash.merge.call(void 0, 
      {},
      transactionMeta,
      _lodash.pickBy.call(void 0, { hash, status })
    );
    if (updatedTransactionMeta.status === "submitted" /* submitted */) {
      updatedTransactionMeta.submittedTime = (/* @__PURE__ */ new Date()).getTime();
    }
    if (updatedTransactionMeta.status === "failed" /* failed */) {
      updatedTransactionMeta.error = _chunkOZ6UB42Cjs.normalizeTxError.call(void 0, new Error(errorMessage));
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
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _internalEvents).emit(
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
        if (error?.code === _rpcerrors.errorCodes.provider.userRejectedRequest) {
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
    const predicateMethods = _lodash.mapValues.call(void 0, searchCriteria, (predicate) => {
      return typeof predicate === "function" ? predicate : (
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v) => v === predicate
      );
    });
    const transactionsToFilter = initialList ?? this.state.transactions;
    const filteredTransactions = _lodash.sortBy.call(void 0, 
      _lodash.pickBy.call(void 0, transactionsToFilter, (transaction) => {
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
    const networkClientId = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getNetworkClientId, getNetworkClientId_fn).call(this, {
      networkClientId: requestNetworkClientId,
      chainId
    });
    const transactionMeta = {
      txParams: transactionParams,
      chainId,
      networkClientId
    };
    const gasFeeFlow = _chunk76FONEDAjs.getGasFeeFlow.call(void 0, 
      transactionMeta,
      this.gasFeeFlows
    );
    const ethQuery = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getEthQuery({
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
    const provider = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getProvider({
      networkClientId,
      chainId
    });
    return await _chunk2XKEAKQGjs.getTransactionLayer1GasFee.call(void 0, {
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
    const normalizedTransactionParams = _chunkOZ6UB42Cjs.normalizeTransactionParams.call(void 0, transactionParams);
    const type = _chunkOZ6UB42Cjs.isEIP1559Transaction.call(void 0, normalizedTransactionParams) ? "0x2" /* feeMarket */ : "0x0" /* legacy */;
    const updatedTransactionParams = {
      ...normalizedTransactionParams,
      type,
      gasLimit: normalizedTransactionParams.gas,
      chainId
    };
    const { from } = updatedTransactionParams;
    const common = this.getCommonConfiguration(chainId);
    const unsignedTransaction = _tx.TransactionFactory.fromTxData(
      updatedTransactionParams,
      { common }
    );
    const signedTransaction = await this.sign(unsignedTransaction, from);
    const rawTransaction = _util.bufferToHex.call(void 0, signedTransaction.serialize());
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
    const isCustomNetwork = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isCustomNetwork, isCustomNetwork_fn).call(this, networkClientId);
    const ethQuery = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getEthQuery({
      networkClientId,
      chainId
    });
    const provider = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getProvider({
      networkClientId,
      chainId
    });
    await _chunkV72C4MCRjs.updateGas.call(void 0, {
      ethQuery,
      chainId,
      isCustomNetwork,
      txMeta: transactionMeta
    });
    await _chunkC3WC4OJ3js.updateGasFees.call(void 0, {
      eip1559: isEIP1559Compatible,
      ethQuery,
      gasFeeFlows: this.gasFeeFlows,
      getGasFeeEstimates: this.getGasFeeEstimates,
      getSavedGasFees: this.getSavedGasFees.bind(this),
      txMeta: transactionMeta
    });
    await _chunk2XKEAKQGjs.updateTransactionLayer1GasFee.call(void 0, {
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
            _chunkS6VGOPUYjs.projectLogger.call(void 0, "Updating transaction with approval data", {
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
          if (error?.code === _rpcerrors.errorCodes.provider.userRejectedRequest) {
            this.cancelTransaction(transactionId, actionId);
            throw _rpcerrors.providerErrors.userRejectedRequest(
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
        throw _rpcerrors.rpcErrors.internal(finalMeta.error.message);
      case "submitted" /* submitted */:
        resultCallbacks?.success();
        return finalMeta.hash;
      default:
        const internalError = _rpcerrors.rpcErrors.internal(
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
        _chunkS6VGOPUYjs.projectLogger.call(void 0, "Skipping approval as signing in progress", transactionId);
        return "not-approved" /* NotApproved */;
      }
      this.approvingTransactionIds.add(transactionId);
      cleanupTasks.push(
        () => this.approvingTransactionIds.delete(transactionId)
      );
      const [nonce, releaseNonce] = await _chunkPRUNMTRDjs.getNextNonce.call(void 0, 
        transactionMeta,
        (address) => _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getNonceLock(
          address,
          transactionMeta.networkClientId
        )
      );
      releaseNonce && cleanupTasks.push(releaseNonce);
      transactionMeta = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, {
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
          ..._chunkOZ6UB42Cjs.isEIP1559Transaction.call(void 0, txParams) && {
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
        _chunkS6VGOPUYjs.projectLogger.call(void 0, "Skipping publishing transaction based on hook");
        this.messagingSystem.publish(
          `${controllerName}:transactionPublishingSkipped`,
          transactionMeta
        );
        return "skipped-via-before-publish-hook" /* SkippedViaBeforePublishHook */;
      }
      if (!rawTx) {
        return "not-approved" /* NotApproved */;
      }
      const ethQuery = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getEthQuery({
        networkClientId: transactionMeta.networkClientId,
        chainId: transactionMeta.chainId
      });
      let preTxBalance;
      const shouldUpdatePreTxBalance = transactionMeta.type === "swap" /* swap */;
      if (shouldUpdatePreTxBalance) {
        _chunkS6VGOPUYjs.projectLogger.call(void 0, "Determining pre-transaction balance");
        preTxBalance = await _controllerutils.query.call(void 0, ethQuery, "getBalance", [
          transactionMeta.txParams.from
        ]);
      }
      _chunkS6VGOPUYjs.projectLogger.call(void 0, "Publishing transaction", transactionMeta.txParams);
      let { transactionHash: hash } = await this.publish(
        transactionMeta,
        rawTx
      );
      if (hash === void 0) {
        hash = await this.publishTransaction(ethQuery, rawTx);
      }
      _chunkS6VGOPUYjs.projectLogger.call(void 0, "Publish successful", hash);
      transactionMeta = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, {
        transactionId,
        note: "TransactionController#approveTransaction - Transaction submitted"
      }, (draftTxMeta) => {
        draftTxMeta.hash = hash;
        draftTxMeta.status = "submitted" /* submitted */;
        draftTxMeta.submittedTime = (/* @__PURE__ */ new Date()).getTime();
        if (shouldUpdatePreTxBalance) {
          draftTxMeta.preTxBalance = preTxBalance;
          _chunkS6VGOPUYjs.projectLogger.call(void 0, "Updated pre-transaction balance", preTxBalance);
        }
      });
      this.messagingSystem.publish(`${controllerName}:transactionSubmitted`, {
        transactionMeta
      });
      this.messagingSystem.publish(
        `${controllerName}:transactionFinished`,
        transactionMeta
      );
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _internalEvents).emit(`${transactionId}:finished`, transactionMeta);
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
    return await _controllerutils.query.call(void 0, ethQuery, "sendRawTransaction", [rawTransaction]);
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
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _internalEvents).emit(
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
        const key = `${String(txParams.nonce)}-${_controllerutils.convertHexToDecimal.call(void 0, 
          chainId
        )}-${new Date(time).toDateString()}`;
        if (nonceNetworkSet.has(key)) {
          return true;
        } else if (nonceNetworkSet.size < _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _transactionHistoryLimit) || !this.isFinalState(status)) {
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
    const type = _controllerutils.ApprovalType.Transaction;
    const requestData = { txId: txMeta.id };
    return await this.messagingSystem.call(
      "ApprovalController:addRequest",
      {
        id,
        origin: origin || _controllerutils.ORIGIN_METAMASK,
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
    const globalChainId = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getGlobalChainId, getGlobalChainId_fn).call(this);
    const globalNetworkClientId = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getGlobalNetworkClientId, getGlobalNetworkClientId_fn).call(this);
    if (!networkClientId || networkClientId === globalNetworkClientId) {
      return globalChainId;
    }
    return this.messagingSystem.call(
      `NetworkController:getNetworkClientById`,
      networkClientId
    ).configuration.chainId;
  }
  prepareUnsignedEthTx(chainId, txParams) {
    return _tx.TransactionFactory.fromTxData(txParams, {
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
    return _common.Common.custom(customChainParams);
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
    if (!origin || origin === _controllerutils.ORIGIN_METAMASK) {
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
    _chunk7LXE4KHVjs.validateConfirmedExternalTransaction.call(void 0, 
      transactionMeta,
      confirmedTxs,
      pendingTxs
    );
    const newTransactionMeta = (transactionMeta.history ?? []).length === 0 && !this.isHistoryDisabled ? _chunkQP75SWIQjs.addInitialHistorySnapshot.call(void 0, transactionMeta) : transactionMeta;
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
      _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _internalEvents).once(`${transactionId}:finished`, (txMeta) => {
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
    const transactionMetaWithRsv = _lodash.cloneDeep.call(void 0, transactionMeta);
    for (const key of ["r", "s", "v"]) {
      const value = signedTx[key];
      if (value === void 0 || value === null) {
        continue;
      }
      transactionMetaWithRsv[key] = _utils.add0x.call(void 0, value.toString(16));
    }
    return transactionMetaWithRsv;
  }
  async getEIP1559Compatibility(networkClientId) {
    const currentNetworkIsEIP1559Compatible = await this.getCurrentNetworkEIP1559Compatibility(networkClientId);
    const currentAccountIsEIP1559Compatible = await this.getCurrentAccountEIP1559Compatibility();
    return currentNetworkIsEIP1559Compatible && currentAccountIsEIP1559Compatible;
  }
  async signTransaction(transactionMeta, txParams) {
    _chunkS6VGOPUYjs.projectLogger.call(void 0, "Signing transaction", txParams);
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
      _chunkS6VGOPUYjs.projectLogger.call(void 0, "Skipping signed status as no signed transaction");
      return void 0;
    }
    const transactionMetaFromHook = _lodash.cloneDeep.call(void 0, transactionMeta);
    if (!this.afterSign(transactionMetaFromHook, signedTx)) {
      this.updateTransaction(
        transactionMetaFromHook,
        "TransactionController#signTransaction - Update after sign"
      );
      _chunkS6VGOPUYjs.projectLogger.call(void 0, "Skipping signed status based on hook");
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
    const rawTx = _util.bufferToHex.call(void 0, signedTx.serialize());
    const transactionMetaWithRawTx = _lodash.merge.call(void 0, {}, transactionMetaWithRsv, {
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
    return _chunkPRUNMTRDjs.getAndFormatTransactionsForNonceTracker.call(void 0, 
      chainId,
      address,
      status,
      this.state.transactions
    );
  }
  onConfirmedTransaction(transactionMeta) {
    _chunkS6VGOPUYjs.projectLogger.call(void 0, "Processing confirmed transaction", transactionMeta.id);
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
      const ethQuery = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).getEthQuery({
        networkClientId: transactionMeta.networkClientId,
        chainId: transactionMeta.chainId
      });
      const { updatedTransactionMeta, approvalTransactionMeta } = await _chunkQH2H4W3Njs.updatePostTransactionBalance.call(void 0, transactionMeta, {
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
      _chunkS6VGOPUYjs.projectLogger.call(void 0, "Error while updating post transaction balance", error);
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
  return new (0, _noncetracker.NonceTracker)({
    // TODO: Fix types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider,
    // @ts-expect-error TODO: Fix types
    blockTracker,
    getPendingTransactions: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getNonceTrackerPendingTransactions, getNonceTrackerPendingTransactions_fn).bind(
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
  const incomingTransactionHelper = new (0, _chunkRHDPOIS4js.IncomingTransactionHelper)({
    blockTracker,
    getCurrentAccount: () => _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getSelectedAccount, getSelectedAccount_fn).call(this),
    getLastFetchedBlockNumbers: () => this.state.lastFetchedBlockNumbers,
    getChainId: chainId ? () => chainId : this.getChainId.bind(this),
    isEnabled: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _incomingTransactionOptions).isEnabled,
    queryEntireHistory: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _incomingTransactionOptions).queryEntireHistory,
    remoteTransactionSource: etherscanRemoteTransactionSource,
    transactionLimit: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _transactionHistoryLimit),
    updateTransactions: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _incomingTransactionOptions).updateTransactions
  });
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _addIncomingTransactionHelperListeners, addIncomingTransactionHelperListeners_fn).call(this, incomingTransactionHelper);
  return incomingTransactionHelper;
};
_createPendingTransactionTracker = new WeakSet();
createPendingTransactionTracker_fn = function({
  provider,
  blockTracker,
  chainId
}) {
  const ethQuery = new (0, _ethquery2.default)(provider);
  const getChainId = chainId ? () => chainId : this.getChainId.bind(this);
  const pendingTransactionTracker = new (0, _chunkULD4JC3Qjs.PendingTransactionTracker)({
    approveTransaction: async (transactionId) => {
      await this.approveTransaction(transactionId);
    },
    blockTracker,
    getChainId,
    getEthQuery: () => ethQuery,
    getTransactions: () => this.state.transactions,
    isResubmitEnabled: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _pendingTransactionOptions).isResubmitEnabled,
    getGlobalLock: () => _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).acquireNonceLockForChainIdKey({
      chainId: getChainId()
    }),
    publishTransaction: this.publishTransaction.bind(this),
    hooks: {
      beforeCheckPendingTransaction: this.beforeCheckPendingTransaction.bind(this),
      beforePublish: this.beforePublish.bind(this)
    }
  });
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _addPendingTransactionTrackerListeners, addPendingTransactionTrackerListeners_fn).call(this, pendingTransactionTracker);
  return pendingTransactionTracker;
};
_checkForPendingTransactionAndStartPolling = new WeakMap();
_stopAllTracking = new WeakSet();
stopAllTracking_fn = function() {
  this.pendingTransactionTracker.stop();
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _removePendingTransactionTrackerListeners, removePendingTransactionTrackerListeners_fn).call(this, this.pendingTransactionTracker);
  this.incomingTransactionHelper.stop();
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _removeIncomingTransactionHelperListeners, removeIncomingTransactionHelperListeners_fn).call(this, this.incomingTransactionHelper);
  _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _multichainTrackingHelper).stopAllTracking();
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
  if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _testGasFeeFlows)) {
    return [new (0, _chunkTJMQEH57js.TestGasFeeFlow)()];
  }
  return [new (0, _chunkARZHJFVGjs.LineaGasFeeFlow)(), new (0, _chunkQTKXIDGEjs.DefaultGasFeeFlow)()];
};
_getLayer1GasFeeFlows = new WeakSet();
getLayer1GasFeeFlows_fn = function() {
  return [new (0, _chunkNYKRCWBGjs.OptimismLayer1GasFeeFlow)(), new (0, _chunkWR5F34OWjs.ScrollLayer1GasFeeFlow)()];
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
    transactionMeta2.txParams = _chunkOZ6UB42Cjs.normalizeTransactionParams.call(void 0, 
      transactionMeta2.txParams
    );
    _chunkRXIUMVA5js.validateTxParams.call(void 0, transactionMeta2.txParams);
    updatedTransactionParams = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _checkIfTransactionParamsUpdated, checkIfTransactionParamsUpdated_fn).call(this, transactionMeta2);
    const shouldSkipHistory = this.isHistoryDisabled || skipHistory;
    if (!shouldSkipHistory) {
      transactionMeta2 = _chunkQP75SWIQjs.updateTransactionHistory.call(void 0, 
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
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _onTransactionParamsUpdated, onTransactionParamsUpdated_fn).call(this, transactionMeta, updatedTransactionParams);
  }
  return transactionMeta;
};
_checkIfTransactionParamsUpdated = new WeakSet();
checkIfTransactionParamsUpdated_fn = function(newTransactionMeta) {
  const { id: transactionId, txParams: newParams } = newTransactionMeta;
  const originalParams = this.getTransaction(transactionId)?.txParams;
  if (!originalParams || _lodash.isEqual.call(void 0, originalParams, newParams)) {
    return [];
  }
  const params = Object.keys(newParams);
  const updatedProperties = params.filter(
    (param) => newParams[param] !== originalParams[param]
  );
  _chunkS6VGOPUYjs.projectLogger.call(void 0, 
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
    _chunkS6VGOPUYjs.projectLogger.call(void 0, "Updating simulation data due to transaction parameter update");
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateSimulationData, updateSimulationData_fn).call(this, transactionMeta);
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
  if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isSimulationEnabled).call(this)) {
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, { transactionId, skipHistory: true }, (txMeta) => {
      txMeta.simulationData = void 0;
    });
    simulationData = await _chunkNNCUD3QFjs.getSimulationData.call(void 0, {
      chainId,
      from,
      to,
      value,
      data
    });
  }
  const finalTransactionMeta = this.getTransaction(transactionId);
  if (!finalTransactionMeta) {
    _chunkS6VGOPUYjs.projectLogger.call(void 0, 
      "Cannot update simulation data as transaction not found",
      transactionId,
      simulationData
    );
    return;
  }
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, {
    transactionId,
    note: "TransactionController#updateSimulationData - Update simulation data"
  }, (txMeta) => {
    txMeta.simulationData = simulationData;
  });
  _chunkS6VGOPUYjs.projectLogger.call(void 0, "Updated simulation data", transactionId, simulationData);
};
_onGasFeePollerTransactionUpdate = new WeakSet();
onGasFeePollerTransactionUpdate_fn = function({
  transactionId,
  gasFeeEstimates,
  gasFeeEstimatesLoaded,
  layer1GasFee
}) {
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransactionInternal, updateTransactionInternal_fn).call(this, { transactionId, skipHistory: true }, (txMeta) => {
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
  const globalChainId = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getGlobalChainId, getGlobalChainId_fn).call(this);
  const globalNetworkClientId = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getGlobalNetworkClientId, getGlobalNetworkClientId_fn).call(this);
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
  const globalNetworkClientId = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getGlobalNetworkClientId, getGlobalNetworkClientId_fn).call(this);
  if (!networkClientId || networkClientId === globalNetworkClientId) {
    return !_controllerutils.isInfuraNetworkType.call(void 0, 
      this.getNetworkState().selectedNetworkClientId
    );
  }
  return this.messagingSystem.call(
    `NetworkController:getNetworkClientById`,
    networkClientId
  ).configuration.type === _networkcontroller.NetworkClientType.Custom;
};
_getSelectedAccount = new WeakSet();
getSelectedAccount_fn = function() {
  return this.messagingSystem.call("AccountsController:getSelectedAccount");
};







exports.HARDFORK = HARDFORK; exports.CANCEL_RATE = CANCEL_RATE; exports.SPEED_UP_RATE = SPEED_UP_RATE; exports.ApprovalState = ApprovalState; exports.TransactionController = TransactionController;
//# sourceMappingURL=chunk-QPK7CIE2.js.map