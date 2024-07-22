import {
  updateGasFees
} from "./chunk-DOOXEL47.mjs";
import {
  updateGas
} from "./chunk-CFYJ4HQ7.mjs";
import {
  getTransactionMetadata
} from "./chunk-E5EHMTQL.mjs";
import {
  validateAddUserOperationOptions,
  validateAddUserOperationRequest,
  validatePrepareUserOperationResponse,
  validateSignUserOperationResponse,
  validateUpdateUserOperationResponse
} from "./chunk-5HNJQVCS.mjs";
import {
  PendingUserOperationTracker
} from "./chunk-IWFF455L.mjs";
import {
  Bundler
} from "./chunk-GURRJAHH.mjs";
import {
  projectLogger
} from "./chunk-DKF5XCNY.mjs";
import {
  SnapSmartContractAccount
} from "./chunk-QIBVC2WF.mjs";
import {
  ADDRESS_ZERO,
  EMPTY_BYTES,
  VALUE_ZERO
} from "./chunk-TPPISKNS.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/UserOperationController.ts
import { BaseController } from "@metamask/base-controller";
import { ApprovalType } from "@metamask/controller-utils";
import EthQuery from "@metamask/eth-query";
import { errorCodes } from "@metamask/rpc-errors";
import {
  determineTransactionType
} from "@metamask/transaction-controller";
import { add0x } from "@metamask/utils";
import EventEmitter from "events";
import { cloneDeep } from "lodash";
import { v1 as random } from "uuid";
var controllerName = "UserOperationController";
var stateMetadata = {
  userOperations: { persist: true, anonymous: false }
};
var getDefaultState = () => ({
  userOperations: {}
});
var _entrypoint, _getGasFeeEstimates, _pendingUserOperationTracker, _addUserOperation, addUserOperation_fn, _prepareAndSubmitUserOperation, prepareAndSubmitUserOperation_fn, _waitForConfirmation, waitForConfirmation_fn, _createMetadata, createMetadata_fn, _prepareUserOperation, prepareUserOperation_fn, _addPaymasterData, addPaymasterData_fn, _approveUserOperation, approveUserOperation_fn, _signUserOperation, signUserOperation_fn, _submitUserOperation, submitUserOperation_fn, _failUserOperation, failUserOperation_fn, _createEmptyUserOperation, createEmptyUserOperation_fn, _updateMetadata, updateMetadata_fn, _deleteMetadata, deleteMetadata_fn, _updateTransaction, updateTransaction_fn, _addPendingUserOperationTrackerListeners, addPendingUserOperationTrackerListeners_fn, _requestApproval, requestApproval_fn, _getTransactionType, getTransactionType_fn, _getProvider, getProvider_fn, _updateUserOperationAfterApproval, updateUserOperationAfterApproval_fn, _regenerateUserOperation, regenerateUserOperation_fn;
var UserOperationController = class extends BaseController {
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
    __privateAdd(this, _addUserOperation);
    __privateAdd(this, _prepareAndSubmitUserOperation);
    __privateAdd(this, _waitForConfirmation);
    __privateAdd(this, _createMetadata);
    __privateAdd(this, _prepareUserOperation);
    __privateAdd(this, _addPaymasterData);
    __privateAdd(this, _approveUserOperation);
    __privateAdd(this, _signUserOperation);
    __privateAdd(this, _submitUserOperation);
    __privateAdd(this, _failUserOperation);
    __privateAdd(this, _createEmptyUserOperation);
    __privateAdd(this, _updateMetadata);
    __privateAdd(this, _deleteMetadata);
    __privateAdd(this, _updateTransaction);
    __privateAdd(this, _addPendingUserOperationTrackerListeners);
    __privateAdd(this, _requestApproval);
    __privateAdd(this, _getTransactionType);
    __privateAdd(this, _getProvider);
    __privateAdd(this, _updateUserOperationAfterApproval);
    __privateAdd(this, _regenerateUserOperation);
    __privateAdd(this, _entrypoint, void 0);
    __privateAdd(this, _getGasFeeEstimates, void 0);
    __privateAdd(this, _pendingUserOperationTracker, void 0);
    this.hub = new EventEmitter();
    __privateSet(this, _entrypoint, entrypoint);
    __privateSet(this, _getGasFeeEstimates, getGasFeeEstimates);
    __privateSet(this, _pendingUserOperationTracker, new PendingUserOperationTracker({
      getUserOperations: () => cloneDeep(Object.values(this.state.userOperations)),
      messenger
    }));
    __privateMethod(this, _addPendingUserOperationTrackerListeners, addPendingUserOperationTrackerListeners_fn).call(this);
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
    validateAddUserOperationRequest(request);
    validateAddUserOperationOptions(options);
    return await __privateMethod(this, _addUserOperation, addUserOperation_fn).call(this, request, options);
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
    validateAddUserOperationOptions(options);
    const { data, from, maxFeePerGas, maxPriorityFeePerGas, to, value } = transaction;
    const request = {
      data: data === "" ? void 0 : data,
      from,
      maxFeePerGas,
      maxPriorityFeePerGas,
      to,
      value
    };
    validateAddUserOperationRequest(request);
    return await __privateMethod(this, _addUserOperation, addUserOperation_fn).call(this, request, { ...options, transaction });
  }
  startPollingByNetworkClientId(networkClientId) {
    return __privateGet(this, _pendingUserOperationTracker).startPollingByNetworkClientId(
      networkClientId
    );
  }
};
_entrypoint = new WeakMap();
_getGasFeeEstimates = new WeakMap();
_pendingUserOperationTracker = new WeakMap();
_addUserOperation = new WeakSet();
addUserOperation_fn = async function(request, options) {
  projectLogger("Adding user operation", { request, options });
  const {
    networkClientId,
    origin,
    smartContractAccount: requestSmartContractAccount,
    swaps,
    transaction
  } = options;
  const { chainId, provider } = await __privateMethod(this, _getProvider, getProvider_fn).call(this, networkClientId);
  const metadata = await __privateMethod(this, _createMetadata, createMetadata_fn).call(this, chainId, origin, transaction, swaps);
  const smartContractAccount = requestSmartContractAccount ?? new SnapSmartContractAccount(this.messagingSystem);
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
      return await __privateMethod(this, _prepareAndSubmitUserOperation, prepareAndSubmitUserOperation_fn).call(this, cache);
    } catch (error) {
      __privateMethod(this, _failUserOperation, failUserOperation_fn).call(this, metadata, error);
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
    const { transactionHash: finalTransactionHash } = await __privateMethod(this, _waitForConfirmation, waitForConfirmation_fn).call(this, metadata);
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
    await __privateMethod(this, _prepareUserOperation, prepareUserOperation_fn).call(this, cache);
    await __privateMethod(this, _addPaymasterData, addPaymasterData_fn).call(this, metadata, smartContractAccount);
    this.hub.emit("user-operation-added", metadata);
    if (requireApproval !== false) {
      resultCallbacks = await __privateMethod(this, _approveUserOperation, approveUserOperation_fn).call(this, cache);
    }
    await __privateMethod(this, _signUserOperation, signUserOperation_fn).call(this, metadata, smartContractAccount);
    await __privateMethod(this, _submitUserOperation, submitUserOperation_fn).call(this, metadata);
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
  projectLogger("Waiting for confirmation", id, hash);
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
    id: random(),
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
    userOperation: __privateMethod(this, _createEmptyUserOperation, createEmptyUserOperation_fn).call(this, transaction)
  };
  __privateMethod(this, _updateMetadata, updateMetadata_fn).call(this, metadata);
  projectLogger("Added user operation", metadata.id);
  return metadata;
};
_prepareUserOperation = new WeakSet();
prepareUserOperation_fn = async function(cache) {
  const { chainId, metadata, options, provider, request, transaction } = cache;
  const { data, from, to, value } = request;
  const { id, transactionParams, userOperation } = metadata;
  const { smartContractAccount } = options;
  projectLogger("Preparing user operation", { id });
  const transactionType = await __privateMethod(this, _getTransactionType, getTransactionType_fn).call(this, transaction, provider, options);
  metadata.transactionType = transactionType ?? null;
  projectLogger("Determined transaction type", transactionType);
  await updateGasFees({
    getGasFeeEstimates: __privateGet(this, _getGasFeeEstimates),
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
  validatePrepareUserOperationResponse(response);
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
  userOperation.initCode = initCode ?? EMPTY_BYTES;
  userOperation.nonce = nonce;
  userOperation.paymasterAndData = dummyPaymasterAndData ?? EMPTY_BYTES;
  userOperation.sender = sender;
  userOperation.signature = dummySignature ?? EMPTY_BYTES;
  metadata.bundlerUrl = bundlerUrl;
  await updateGas(metadata, response, __privateGet(this, _entrypoint));
  __privateMethod(this, _updateMetadata, updateMetadata_fn).call(this, metadata);
};
_addPaymasterData = new WeakSet();
addPaymasterData_fn = async function(metadata, smartContractAccount) {
  const { id, userOperation, chainId } = metadata;
  projectLogger("Requesting paymaster data", { id });
  const response = await smartContractAccount.updateUserOperation({
    userOperation,
    chainId
  });
  validateUpdateUserOperationResponse(response);
  userOperation.paymasterAndData = response.paymasterAndData ?? EMPTY_BYTES;
  if (response.callGasLimit) {
    userOperation.callGasLimit = response.callGasLimit;
  }
  if (response.preVerificationGas) {
    userOperation.preVerificationGas = response.preVerificationGas;
  }
  if (response.verificationGasLimit) {
    userOperation.verificationGasLimit = response.verificationGasLimit;
  }
  __privateMethod(this, _updateMetadata, updateMetadata_fn).call(this, metadata);
};
_approveUserOperation = new WeakSet();
approveUserOperation_fn = async function(cache) {
  projectLogger("Requesting approval");
  const { metadata } = cache;
  const { resultCallbacks, value } = await __privateMethod(this, _requestApproval, requestApproval_fn).call(this, metadata);
  const updatedTransaction = value?.txMeta;
  if (updatedTransaction) {
    await __privateMethod(this, _updateUserOperationAfterApproval, updateUserOperationAfterApproval_fn).call(this, cache, updatedTransaction);
  }
  metadata.status = "approved" /* Approved */;
  __privateMethod(this, _updateMetadata, updateMetadata_fn).call(this, metadata);
  return resultCallbacks;
};
_signUserOperation = new WeakSet();
signUserOperation_fn = async function(metadata, smartContractAccount) {
  const { id, chainId, userOperation } = metadata;
  projectLogger("Signing user operation", id, userOperation);
  const response = await smartContractAccount.signUserOperation({
    userOperation,
    chainId
  });
  validateSignUserOperationResponse(response);
  const { signature } = response;
  userOperation.signature = signature;
  projectLogger("Signed user operation", signature);
  metadata.status = "signed" /* Signed */;
  __privateMethod(this, _updateMetadata, updateMetadata_fn).call(this, metadata);
};
_submitUserOperation = new WeakSet();
submitUserOperation_fn = async function(metadata) {
  const { userOperation } = metadata;
  projectLogger("Submitting user operation", userOperation);
  const bundler = new Bundler(metadata.bundlerUrl);
  const hash = await bundler.sendUserOperation(
    userOperation,
    __privateGet(this, _entrypoint)
  );
  metadata.hash = hash;
  metadata.status = "submitted" /* Submitted */;
  __privateMethod(this, _updateMetadata, updateMetadata_fn).call(this, metadata);
};
_failUserOperation = new WeakSet();
failUserOperation_fn = function(metadata, error) {
  const { id } = metadata;
  const rawError = error;
  projectLogger("User operation failed", id, error);
  metadata.error = {
    name: rawError.name,
    message: rawError.message,
    stack: rawError.stack,
    code: rawError.code,
    rpc: rawError.value
  };
  metadata.status = "failed" /* Failed */;
  __privateMethod(this, _updateMetadata, updateMetadata_fn).call(this, metadata);
  if (String(rawError.code) === String(errorCodes.provider.userRejectedRequest)) {
    __privateMethod(this, _deleteMetadata, deleteMetadata_fn).call(this, id);
  }
};
_createEmptyUserOperation = new WeakSet();
createEmptyUserOperation_fn = function(transaction) {
  return {
    callData: EMPTY_BYTES,
    callGasLimit: EMPTY_BYTES,
    initCode: EMPTY_BYTES,
    maxFeePerGas: transaction?.maxFeePerGas ?? EMPTY_BYTES,
    maxPriorityFeePerGas: transaction?.maxPriorityFeePerGas ?? EMPTY_BYTES,
    nonce: EMPTY_BYTES,
    paymasterAndData: EMPTY_BYTES,
    preVerificationGas: EMPTY_BYTES,
    sender: ADDRESS_ZERO,
    signature: EMPTY_BYTES,
    verificationGasLimit: EMPTY_BYTES
  };
};
_updateMetadata = new WeakSet();
updateMetadata_fn = function(metadata) {
  const { id } = metadata;
  this.update((state) => {
    state.userOperations[id] = cloneDeep(metadata);
  });
  __privateMethod(this, _updateTransaction, updateTransaction_fn).call(this, metadata);
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
  const transactionMetadata = getTransactionMetadata(metadata);
  this.hub.emit("transaction-updated", transactionMetadata);
};
_addPendingUserOperationTrackerListeners = new WeakSet();
addPendingUserOperationTrackerListeners_fn = function() {
  __privateGet(this, _pendingUserOperationTracker).hub.on(
    "user-operation-confirmed",
    (metadata) => {
      projectLogger("In listener...");
      this.hub.emit("user-operation-confirmed", metadata);
      this.hub.emit(`${metadata.id}:confirmed`, metadata);
    }
  );
  __privateGet(this, _pendingUserOperationTracker).hub.on(
    "user-operation-failed",
    (metadata, error) => {
      this.hub.emit("user-operation-failed", metadata, error);
      this.hub.emit(`${metadata.id}:failed`, metadata, error);
    }
  );
  __privateGet(this, _pendingUserOperationTracker).hub.on(
    "user-operation-updated",
    (metadata) => {
      __privateMethod(this, _updateMetadata, updateMetadata_fn).call(this, metadata);
    }
  );
};
_requestApproval = new WeakSet();
requestApproval_fn = async function(metadata) {
  const { id, origin } = metadata;
  const type = ApprovalType.Transaction;
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
  const ethQuery = new EthQuery(provider);
  const result = determineTransactionType(transaction, ethQuery);
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
  projectLogger("Found updated transaction in approval", { updatedTransaction });
  const { metadata, request } = cache;
  const { userOperation } = metadata;
  const usingPaymaster = userOperation.paymasterAndData !== EMPTY_BYTES;
  const updatedMaxFeePerGas = add0x(
    updatedTransaction.txParams.maxFeePerGas
  );
  const updatedMaxPriorityFeePerGas = add0x(
    updatedTransaction.txParams.maxPriorityFeePerGas
  );
  let regenerateUserOperation = false;
  const previousMaxFeePerGas = userOperation.maxFeePerGas;
  const previousMaxPriorityFeePerGas = userOperation.maxPriorityFeePerGas;
  const gasFeesUpdated = previousMaxFeePerGas !== updatedMaxFeePerGas || previousMaxPriorityFeePerGas !== updatedMaxPriorityFeePerGas;
  const areGasFeesZeroBecauseOfPaymaster = usingPaymaster && updatedMaxFeePerGas === VALUE_ZERO && updatedMaxPriorityFeePerGas === VALUE_ZERO;
  if (gasFeesUpdated && !areGasFeesZeroBecauseOfPaymaster) {
    projectLogger("Gas fees updated during approval", {
      previousMaxFeePerGas,
      previousMaxPriorityFeePerGas,
      updatedMaxFeePerGas,
      updatedMaxPriorityFeePerGas
    });
    userOperation.maxFeePerGas = updatedMaxFeePerGas;
    userOperation.maxPriorityFeePerGas = updatedMaxPriorityFeePerGas;
    regenerateUserOperation = usingPaymaster;
  }
  const previousData = request.data ?? EMPTY_BYTES;
  const updatedData = updatedTransaction.txParams.data ?? EMPTY_BYTES;
  if (previousData !== updatedData) {
    projectLogger("Data updated during approval", { previousData, updatedData });
    regenerateUserOperation = true;
  }
  const previousValue = request.value ?? VALUE_ZERO;
  const updatedValue = updatedTransaction.txParams.value ?? VALUE_ZERO;
  if (previousValue !== updatedValue) {
    projectLogger("Value updated during approval", { previousValue, updatedValue });
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
    await __privateMethod(this, _regenerateUserOperation, regenerateUserOperation_fn).call(this, {
      ...cache,
      request: updatedRequest
    });
  }
};
_regenerateUserOperation = new WeakSet();
regenerateUserOperation_fn = async function(cache) {
  projectLogger(
    "Regenerating user operation as parameters were updated during approval"
  );
  const {
    options: { smartContractAccount },
    metadata
  } = cache;
  await __privateMethod(this, _prepareUserOperation, prepareUserOperation_fn).call(this, cache);
  await __privateMethod(this, _addPaymasterData, addPaymasterData_fn).call(this, metadata, smartContractAccount);
  projectLogger("Regenerated user operation", metadata.userOperation);
};

export {
  UserOperationController
};
//# sourceMappingURL=chunk-DJNSR4JA.mjs.map