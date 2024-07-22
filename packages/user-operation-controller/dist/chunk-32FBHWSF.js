"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunkSSHRMBLIjs = require('./chunk-SSHRMBLI.js');


var _chunkREDMD67Sjs = require('./chunk-REDMD67S.js');


var _chunk6ZRFUBLCjs = require('./chunk-6ZRFUBLC.js');






var _chunkWDQ2DWENjs = require('./chunk-WDQ2DWEN.js');


var _chunkVPVM4BMSjs = require('./chunk-VPVM4BMS.js');


var _chunkU7OA6TZZjs = require('./chunk-U7OA6TZZ.js');


var _chunkKQMYR73Xjs = require('./chunk-KQMYR73X.js');


var _chunkMRVTCZLIjs = require('./chunk-MRVTCZLI.js');




var _chunkBTR56Y3Fjs = require('./chunk-BTR56Y3F.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/UserOperationController.ts
var _basecontroller = require('@metamask/base-controller');
var _controllerutils = require('@metamask/controller-utils');
var _ethquery = require('@metamask/eth-query'); var _ethquery2 = _interopRequireDefault(_ethquery);
var _rpcerrors = require('@metamask/rpc-errors');


var _transactioncontroller = require('@metamask/transaction-controller');
var _utils = require('@metamask/utils');
var _events = require('events'); var _events2 = _interopRequireDefault(_events);
var _lodash = require('lodash');
var _uuid = require('uuid');
var controllerName = "UserOperationController";
var stateMetadata = {
  userOperations: { persist: true, anonymous: false }
};
var getDefaultState = () => ({
  userOperations: {}
});
var _entrypoint, _getGasFeeEstimates, _pendingUserOperationTracker, _addUserOperation, addUserOperation_fn, _prepareAndSubmitUserOperation, prepareAndSubmitUserOperation_fn, _waitForConfirmation, waitForConfirmation_fn, _createMetadata, createMetadata_fn, _prepareUserOperation, prepareUserOperation_fn, _addPaymasterData, addPaymasterData_fn, _approveUserOperation, approveUserOperation_fn, _signUserOperation, signUserOperation_fn, _submitUserOperation, submitUserOperation_fn, _failUserOperation, failUserOperation_fn, _createEmptyUserOperation, createEmptyUserOperation_fn, _updateMetadata, updateMetadata_fn, _deleteMetadata, deleteMetadata_fn, _updateTransaction, updateTransaction_fn, _addPendingUserOperationTrackerListeners, addPendingUserOperationTrackerListeners_fn, _requestApproval, requestApproval_fn, _getTransactionType, getTransactionType_fn, _getProvider, getProvider_fn, _updateUserOperationAfterApproval, updateUserOperationAfterApproval_fn, _regenerateUserOperation, regenerateUserOperation_fn;
var UserOperationController = class extends _basecontroller.BaseController {
  /**
   * Construct a UserOperationController instance.
   *
   * @param options - Controller options.
   * @param options.entrypoint - Address of the entrypoint contract.
   * @param options.getGasFeeEstimates - Callback to get gas fee estimates.
   * @param options.messenger - Restricted controller messenger for the user operation controller.
   * @param options.state - Initial state to set on the controller.
   */
  constructor({
    entrypoint,
    getGasFeeEstimates,
    messenger,
    state
  }) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state }
    });
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _addUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _prepareAndSubmitUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _waitForConfirmation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _createMetadata);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _prepareUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _addPaymasterData);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _approveUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _signUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _submitUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _failUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _createEmptyUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateMetadata);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _deleteMetadata);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _addPendingUserOperationTrackerListeners);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _requestApproval);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getTransactionType);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getProvider);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateUserOperationAfterApproval);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _regenerateUserOperation);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _entrypoint, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getGasFeeEstimates, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _pendingUserOperationTracker, void 0);
    this.hub = new (0, _events2.default)();
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _entrypoint, entrypoint);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _getGasFeeEstimates, getGasFeeEstimates);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _pendingUserOperationTracker, new (0, _chunkVPVM4BMSjs.PendingUserOperationTracker)({
      getUserOperations: () => _lodash.cloneDeep.call(void 0, Object.values(this.state.userOperations)),
      messenger
    }));
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _addPendingUserOperationTrackerListeners, addPendingUserOperationTrackerListeners_fn).call(this);
  }
  /**
   * Create and submit a user operation.
   *
   * @param request - Information required to create a user operation.
   * @param request.data - Data to include in the resulting transaction.
   * @param request.maxFeePerGas - Maximum fee per gas to pay towards the transaction.
   * @param request.maxPriorityFeePerGas - Maximum priority fee per gas to pay towards the transaction.
   * @param request.to - Destination address of the resulting transaction.
   * @param request.value - Value to include in the resulting transaction.
   * @param options - Configuration options when creating a user operation.
   * @param options.networkClientId - ID of the network client used to query the chain.
   * @param options.origin - Origin of the user operation, such as the hostname of a dApp.
   * @param options.requireApproval - Whether to require user approval before submitting the user operation. Defaults to true.
   * @param options.smartContractAccount - Smart contract abstraction to provide the contract specific values such as call data and nonce. Defaults to the current snap account.
   * @param options.swaps - Swap metadata to record with the user operation.
   * @param options.type - Type of the transaction.
   */
  async addUserOperation(request, options) {
    _chunkWDQ2DWENjs.validateAddUserOperationRequest.call(void 0, request);
    _chunkWDQ2DWENjs.validateAddUserOperationOptions.call(void 0, options);
    return await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _addUserOperation, addUserOperation_fn).call(this, request, options);
  }
  /**
   * Create and submit a user operation equivalent to the provided transaction.
   *
   * @param transaction - Transaction to use as the basis for the user operation.
   * @param options - Configuration options when creating a user operation.
   * @param options.networkClientId - ID of the network client used to query the chain.
   * @param options.origin - Origin of the user operation, such as the hostname of a dApp.
   * @param options.requireApproval - Whether to require user approval before submitting the user operation. Defaults to true.
   * @param options.smartContractAccount - Smart contract abstraction to provide the contract specific values such as call data and nonce. Defaults to the current snap account.
   * @param options.swaps - Swap metadata to record with the user operation.
   * @param options.type - Type of the transaction.
   */
  async addUserOperationFromTransaction(transaction, options) {
    _chunkWDQ2DWENjs.validateAddUserOperationOptions.call(void 0, options);
    const { data, from, maxFeePerGas, maxPriorityFeePerGas, to, value } = transaction;
    const request = {
      data: data === "" ? void 0 : data,
      from,
      maxFeePerGas,
      maxPriorityFeePerGas,
      to,
      value
    };
    _chunkWDQ2DWENjs.validateAddUserOperationRequest.call(void 0, request);
    return await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _addUserOperation, addUserOperation_fn).call(this, request, { ...options, transaction });
  }
  startPollingByNetworkClientId(networkClientId) {
    return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _pendingUserOperationTracker).startPollingByNetworkClientId(
      networkClientId
    );
  }
};
_entrypoint = new WeakMap();
_getGasFeeEstimates = new WeakMap();
_pendingUserOperationTracker = new WeakMap();
_addUserOperation = new WeakSet();
addUserOperation_fn = async function(request, options) {
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Adding user operation", { request, options });
  const {
    networkClientId,
    origin,
    smartContractAccount: requestSmartContractAccount,
    swaps,
    transaction
  } = options;
  const { chainId, provider } = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getProvider, getProvider_fn).call(this, networkClientId);
  const metadata = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _createMetadata, createMetadata_fn).call(this, chainId, origin, transaction, swaps);
  const smartContractAccount = requestSmartContractAccount ?? new (0, _chunkMRVTCZLIjs.SnapSmartContractAccount)(this.messagingSystem);
  const cache = {
    chainId,
    metadata,
    options: { ...options, smartContractAccount },
    provider,
    request,
    transaction
  };
  const { id } = metadata;
  let throwError = false;
  const hashValue = (async () => {
    try {
      return await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _prepareAndSubmitUserOperation, prepareAndSubmitUserOperation_fn).call(this, cache);
    } catch (error) {
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _failUserOperation, failUserOperation_fn).call(this, metadata, error);
      if (throwError) {
        throw error;
      }
      return void 0;
    }
  })();
  const hash = async () => {
    throwError = true;
    return await hashValue;
  };
  const transactionHash = async () => {
    await hash();
    const { transactionHash: finalTransactionHash } = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _waitForConfirmation, waitForConfirmation_fn).call(this, metadata);
    return finalTransactionHash;
  };
  return {
    id,
    hash,
    transactionHash
  };
};
_prepareAndSubmitUserOperation = new WeakSet();
prepareAndSubmitUserOperation_fn = async function(cache) {
  const { metadata, options } = cache;
  const { requireApproval, smartContractAccount } = options;
  let resultCallbacks;
  try {
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _prepareUserOperation, prepareUserOperation_fn).call(this, cache);
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _addPaymasterData, addPaymasterData_fn).call(this, metadata, smartContractAccount);
    this.hub.emit("user-operation-added", metadata);
    if (requireApproval !== false) {
      resultCallbacks = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _approveUserOperation, approveUserOperation_fn).call(this, cache);
    }
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _signUserOperation, signUserOperation_fn).call(this, metadata, smartContractAccount);
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _submitUserOperation, submitUserOperation_fn).call(this, metadata);
    resultCallbacks?.success();
    return metadata.hash;
  } catch (error) {
    resultCallbacks?.error(error);
    throw error;
  }
};
_waitForConfirmation = new WeakSet();
waitForConfirmation_fn = async function(metadata) {
  const { id, hash } = metadata;
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Waiting for confirmation", id, hash);
  return new Promise((resolve, reject) => {
    this.hub.once(`${id}:confirmed`, (finalMetadata) => {
      resolve(finalMetadata);
    });
    this.hub.once(`${id}:failed`, (_finalMetadata, error) => {
      reject(error);
    });
  });
};
_createMetadata = new WeakSet();
createMetadata_fn = async function(chainId, origin, transaction, swaps) {
  const metadata = {
    actualGasCost: null,
    actualGasUsed: null,
    baseFeePerGas: null,
    bundlerUrl: null,
    chainId,
    error: null,
    hash: null,
    id: _uuid.v1.call(void 0, ),
    origin,
    status: "unapproved" /* Unapproved */,
    swapsMetadata: swaps ? {
      approvalTxId: swaps.approvalTxId ?? null,
      destinationTokenAddress: swaps.destinationTokenAddress ?? null,
      destinationTokenAmount: swaps.destinationTokenAmount ?? null,
      destinationTokenDecimals: swaps.destinationTokenDecimals ?? null,
      destinationTokenSymbol: swaps.destinationTokenSymbol ?? null,
      estimatedBaseFee: swaps.estimatedBaseFee ?? null,
      sourceTokenAddress: swaps.sourceTokenAddress ?? null,
      sourceTokenAmount: swaps.sourceTokenAmount ?? null,
      sourceTokenDecimals: swaps.sourceTokenDecimals ?? null,
      sourceTokenSymbol: swaps.sourceTokenSymbol ?? null,
      swapAndSendRecipient: swaps.swapAndSendRecipient ?? null,
      swapMetaData: swaps.swapMetaData ?? null,
      swapTokenValue: swaps.swapTokenValue ?? null
    } : null,
    time: Date.now(),
    transactionHash: null,
    transactionParams: transaction ?? null,
    transactionType: null,
    userFeeLevel: null,
    userOperation: _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _createEmptyUserOperation, createEmptyUserOperation_fn).call(this, transaction)
  };
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateMetadata, updateMetadata_fn).call(this, metadata);
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Added user operation", metadata.id);
  return metadata;
};
_prepareUserOperation = new WeakSet();
prepareUserOperation_fn = async function(cache) {
  const { chainId, metadata, options, provider, request, transaction } = cache;
  const { data, from, to, value } = request;
  const { id, transactionParams, userOperation } = metadata;
  const { smartContractAccount } = options;
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Preparing user operation", { id });
  const transactionType = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getTransactionType, getTransactionType_fn).call(this, transaction, provider, options);
  metadata.transactionType = transactionType ?? null;
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Determined transaction type", transactionType);
  await _chunkSSHRMBLIjs.updateGasFees.call(void 0, {
    getGasFeeEstimates: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _getGasFeeEstimates),
    metadata,
    originalRequest: request,
    provider,
    transaction: transactionParams ?? void 0
  });
  const response = await smartContractAccount.prepareUserOperation({
    chainId,
    data,
    from,
    to,
    value
  });
  _chunkWDQ2DWENjs.validatePrepareUserOperationResponse.call(void 0, response);
  const {
    bundler: bundlerUrl,
    callData,
    dummyPaymasterAndData,
    dummySignature,
    initCode,
    nonce,
    sender
  } = response;
  userOperation.callData = callData;
  userOperation.initCode = initCode ?? _chunkBTR56Y3Fjs.EMPTY_BYTES;
  userOperation.nonce = nonce;
  userOperation.paymasterAndData = dummyPaymasterAndData ?? _chunkBTR56Y3Fjs.EMPTY_BYTES;
  userOperation.sender = sender;
  userOperation.signature = dummySignature ?? _chunkBTR56Y3Fjs.EMPTY_BYTES;
  metadata.bundlerUrl = bundlerUrl;
  await _chunkREDMD67Sjs.updateGas.call(void 0, metadata, response, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _entrypoint));
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateMetadata, updateMetadata_fn).call(this, metadata);
};
_addPaymasterData = new WeakSet();
addPaymasterData_fn = async function(metadata, smartContractAccount) {
  const { id, userOperation, chainId } = metadata;
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Requesting paymaster data", { id });
  const response = await smartContractAccount.updateUserOperation({
    userOperation,
    chainId
  });
  _chunkWDQ2DWENjs.validateUpdateUserOperationResponse.call(void 0, response);
  userOperation.paymasterAndData = response.paymasterAndData ?? _chunkBTR56Y3Fjs.EMPTY_BYTES;
  if (response.callGasLimit) {
    userOperation.callGasLimit = response.callGasLimit;
  }
  if (response.preVerificationGas) {
    userOperation.preVerificationGas = response.preVerificationGas;
  }
  if (response.verificationGasLimit) {
    userOperation.verificationGasLimit = response.verificationGasLimit;
  }
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateMetadata, updateMetadata_fn).call(this, metadata);
};
_approveUserOperation = new WeakSet();
approveUserOperation_fn = async function(cache) {
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Requesting approval");
  const { metadata } = cache;
  const { resultCallbacks, value } = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _requestApproval, requestApproval_fn).call(this, metadata);
  const updatedTransaction = value?.txMeta;
  if (updatedTransaction) {
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateUserOperationAfterApproval, updateUserOperationAfterApproval_fn).call(this, cache, updatedTransaction);
  }
  metadata.status = "approved" /* Approved */;
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateMetadata, updateMetadata_fn).call(this, metadata);
  return resultCallbacks;
};
_signUserOperation = new WeakSet();
signUserOperation_fn = async function(metadata, smartContractAccount) {
  const { id, chainId, userOperation } = metadata;
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Signing user operation", id, userOperation);
  const response = await smartContractAccount.signUserOperation({
    userOperation,
    chainId
  });
  _chunkWDQ2DWENjs.validateSignUserOperationResponse.call(void 0, response);
  const { signature } = response;
  userOperation.signature = signature;
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Signed user operation", signature);
  metadata.status = "signed" /* Signed */;
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateMetadata, updateMetadata_fn).call(this, metadata);
};
_submitUserOperation = new WeakSet();
submitUserOperation_fn = async function(metadata) {
  const { userOperation } = metadata;
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Submitting user operation", userOperation);
  const bundler = new (0, _chunkU7OA6TZZjs.Bundler)(metadata.bundlerUrl);
  const hash = await bundler.sendUserOperation(
    userOperation,
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _entrypoint)
  );
  metadata.hash = hash;
  metadata.status = "submitted" /* Submitted */;
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateMetadata, updateMetadata_fn).call(this, metadata);
};
_failUserOperation = new WeakSet();
failUserOperation_fn = function(metadata, error) {
  const { id } = metadata;
  const rawError = error;
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "User operation failed", id, error);
  metadata.error = {
    name: rawError.name,
    message: rawError.message,
    stack: rawError.stack,
    code: rawError.code,
    rpc: rawError.value
  };
  metadata.status = "failed" /* Failed */;
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateMetadata, updateMetadata_fn).call(this, metadata);
  if (String(rawError.code) === String(_rpcerrors.errorCodes.provider.userRejectedRequest)) {
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _deleteMetadata, deleteMetadata_fn).call(this, id);
  }
};
_createEmptyUserOperation = new WeakSet();
createEmptyUserOperation_fn = function(transaction) {
  return {
    callData: _chunkBTR56Y3Fjs.EMPTY_BYTES,
    callGasLimit: _chunkBTR56Y3Fjs.EMPTY_BYTES,
    initCode: _chunkBTR56Y3Fjs.EMPTY_BYTES,
    maxFeePerGas: transaction?.maxFeePerGas ?? _chunkBTR56Y3Fjs.EMPTY_BYTES,
    maxPriorityFeePerGas: transaction?.maxPriorityFeePerGas ?? _chunkBTR56Y3Fjs.EMPTY_BYTES,
    nonce: _chunkBTR56Y3Fjs.EMPTY_BYTES,
    paymasterAndData: _chunkBTR56Y3Fjs.EMPTY_BYTES,
    preVerificationGas: _chunkBTR56Y3Fjs.EMPTY_BYTES,
    sender: _chunkBTR56Y3Fjs.ADDRESS_ZERO,
    signature: _chunkBTR56Y3Fjs.EMPTY_BYTES,
    verificationGasLimit: _chunkBTR56Y3Fjs.EMPTY_BYTES
  };
};
_updateMetadata = new WeakSet();
updateMetadata_fn = function(metadata) {
  const { id } = metadata;
  this.update((state) => {
    state.userOperations[id] = _lodash.cloneDeep.call(void 0, metadata);
  });
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateTransaction, updateTransaction_fn).call(this, metadata);
};
_deleteMetadata = new WeakSet();
deleteMetadata_fn = function(id) {
  this.update((state) => {
    delete state.userOperations[id];
  });
};
_updateTransaction = new WeakSet();
updateTransaction_fn = function(metadata) {
  if (!metadata.transactionParams) {
    return;
  }
  const transactionMetadata = _chunk6ZRFUBLCjs.getTransactionMetadata.call(void 0, metadata);
  this.hub.emit("transaction-updated", transactionMetadata);
};
_addPendingUserOperationTrackerListeners = new WeakSet();
addPendingUserOperationTrackerListeners_fn = function() {
  _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _pendingUserOperationTracker).hub.on(
    "user-operation-confirmed",
    (metadata) => {
      _chunkKQMYR73Xjs.projectLogger.call(void 0, "In listener...");
      this.hub.emit("user-operation-confirmed", metadata);
      this.hub.emit(`${metadata.id}:confirmed`, metadata);
    }
  );
  _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _pendingUserOperationTracker).hub.on(
    "user-operation-failed",
    (metadata, error) => {
      this.hub.emit("user-operation-failed", metadata, error);
      this.hub.emit(`${metadata.id}:failed`, metadata, error);
    }
  );
  _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _pendingUserOperationTracker).hub.on(
    "user-operation-updated",
    (metadata) => {
      _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateMetadata, updateMetadata_fn).call(this, metadata);
    }
  );
};
_requestApproval = new WeakSet();
requestApproval_fn = async function(metadata) {
  const { id, origin } = metadata;
  const type = _controllerutils.ApprovalType.Transaction;
  const requestData = { txId: id };
  return await this.messagingSystem.call(
    "ApprovalController:addRequest",
    {
      id,
      origin,
      type,
      requestData,
      expectsResult: true
    },
    true
    // Should display approval request to user
  );
};
_getTransactionType = new WeakSet();
getTransactionType_fn = async function(transaction, provider, options) {
  if (!transaction) {
    return void 0;
  }
  if (options.type) {
    return options.type;
  }
  const ethQuery = new (0, _ethquery2.default)(provider);
  const result = _transactioncontroller.determineTransactionType.call(void 0, transaction, ethQuery);
  return (await result).type;
};
_getProvider = new WeakSet();
getProvider_fn = async function(networkClientId) {
  const { provider, configuration } = this.messagingSystem.call(
    "NetworkController:getNetworkClientById",
    networkClientId
  );
  const { chainId } = configuration;
  return { provider, chainId };
};
_updateUserOperationAfterApproval = new WeakSet();
updateUserOperationAfterApproval_fn = async function(cache, updatedTransaction) {
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Found updated transaction in approval", { updatedTransaction });
  const { metadata, request } = cache;
  const { userOperation } = metadata;
  const usingPaymaster = userOperation.paymasterAndData !== _chunkBTR56Y3Fjs.EMPTY_BYTES;
  const updatedMaxFeePerGas = _utils.add0x.call(void 0, 
    updatedTransaction.txParams.maxFeePerGas
  );
  const updatedMaxPriorityFeePerGas = _utils.add0x.call(void 0, 
    updatedTransaction.txParams.maxPriorityFeePerGas
  );
  let regenerateUserOperation = false;
  const previousMaxFeePerGas = userOperation.maxFeePerGas;
  const previousMaxPriorityFeePerGas = userOperation.maxPriorityFeePerGas;
  const gasFeesUpdated = previousMaxFeePerGas !== updatedMaxFeePerGas || previousMaxPriorityFeePerGas !== updatedMaxPriorityFeePerGas;
  const areGasFeesZeroBecauseOfPaymaster = usingPaymaster && updatedMaxFeePerGas === _chunkBTR56Y3Fjs.VALUE_ZERO && updatedMaxPriorityFeePerGas === _chunkBTR56Y3Fjs.VALUE_ZERO;
  if (gasFeesUpdated && !areGasFeesZeroBecauseOfPaymaster) {
    _chunkKQMYR73Xjs.projectLogger.call(void 0, "Gas fees updated during approval", {
      previousMaxFeePerGas,
      previousMaxPriorityFeePerGas,
      updatedMaxFeePerGas,
      updatedMaxPriorityFeePerGas
    });
    userOperation.maxFeePerGas = updatedMaxFeePerGas;
    userOperation.maxPriorityFeePerGas = updatedMaxPriorityFeePerGas;
    regenerateUserOperation = usingPaymaster;
  }
  const previousData = request.data ?? _chunkBTR56Y3Fjs.EMPTY_BYTES;
  const updatedData = updatedTransaction.txParams.data ?? _chunkBTR56Y3Fjs.EMPTY_BYTES;
  if (previousData !== updatedData) {
    _chunkKQMYR73Xjs.projectLogger.call(void 0, "Data updated during approval", { previousData, updatedData });
    regenerateUserOperation = true;
  }
  const previousValue = request.value ?? _chunkBTR56Y3Fjs.VALUE_ZERO;
  const updatedValue = updatedTransaction.txParams.value ?? _chunkBTR56Y3Fjs.VALUE_ZERO;
  if (previousValue !== updatedValue) {
    _chunkKQMYR73Xjs.projectLogger.call(void 0, "Value updated during approval", { previousValue, updatedValue });
    regenerateUserOperation = true;
  }
  if (regenerateUserOperation) {
    const updatedRequest = {
      ...request,
      data: updatedData,
      maxFeePerGas: updatedMaxFeePerGas,
      maxPriorityFeePerGas: updatedMaxPriorityFeePerGas,
      value: updatedValue
    };
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _regenerateUserOperation, regenerateUserOperation_fn).call(this, {
      ...cache,
      request: updatedRequest
    });
  }
};
_regenerateUserOperation = new WeakSet();
regenerateUserOperation_fn = async function(cache) {
  _chunkKQMYR73Xjs.projectLogger.call(void 0, 
    "Regenerating user operation as parameters were updated during approval"
  );
  const {
    options: { smartContractAccount },
    metadata
  } = cache;
  await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _prepareUserOperation, prepareUserOperation_fn).call(this, cache);
  await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _addPaymasterData, addPaymasterData_fn).call(this, metadata, smartContractAccount);
  _chunkKQMYR73Xjs.projectLogger.call(void 0, "Regenerated user operation", metadata.userOperation);
};



exports.UserOperationController = UserOperationController;
//# sourceMappingURL=chunk-32FBHWSF.js.map