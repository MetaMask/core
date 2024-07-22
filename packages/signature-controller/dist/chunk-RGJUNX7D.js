"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/SignatureController.ts
var _basecontroller = require('@metamask/base-controller');
var _controllerutils = require('@metamask/controller-utils');




var _loggingcontroller = require('@metamask/logging-controller');



var _messagemanager = require('@metamask/message-manager');
var _rpcerrors = require('@metamask/rpc-errors');
var _events = require('events'); var _events2 = _interopRequireDefault(_events);
var _lodash = require('lodash');
var controllerName = "SignatureController";
var stateMetadata = {
  unapprovedPersonalMsgs: { persist: false, anonymous: false },
  unapprovedTypedMessages: { persist: false, anonymous: false },
  unapprovedPersonalMsgCount: { persist: false, anonymous: false },
  unapprovedTypedMessagesCount: { persist: false, anonymous: false }
};
var getDefaultState = () => ({
  unapprovedPersonalMsgs: {},
  unapprovedTypedMessages: {},
  unapprovedPersonalMsgCount: 0,
  unapprovedTypedMessagesCount: 0
});
var _getAllState, _personalMessageManager, _typedMessageManager, _newUnsignedAbstractMessage, newUnsignedAbstractMessage_fn, _signPersonalMessage, signPersonalMessage_fn, _signTypedMessage, signTypedMessage_fn, _tryForEachMessageManager, tryForEachMessageManager_fn, _trySetDeferredSignSuccess, trySetDeferredSignSuccess_fn, _trySetMessageMetadata, trySetMessageMetadata_fn, _trySetDeferredSignError, trySetDeferredSignError_fn, _rejectUnapproved, rejectUnapproved_fn, _clearUnapproved, clearUnapproved_fn, _signAbstractMessage, signAbstractMessage_fn, _errorMessage, errorMessage_fn, _cancelAbstractMessage, cancelAbstractMessage_fn, _handleMessageManagerEvents, handleMessageManagerEvents_fn, _subscribeToMessageState, subscribeToMessageState_fn, _migrateMessages, migrateMessages_fn, _migrateMessage, migrateMessage_fn, _getMessage, getMessage_fn, _requestApproval, requestApproval_fn, _removeJsonData, removeJsonData_fn, _addLog, addLog_fn, _getSignTypeForLogger, getSignTypeForLogger_fn;
var SignatureController = class extends _basecontroller.BaseController {
  /**
   * Construct a Sign controller.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the sign controller.
   * @param options.getAllState - Callback to retrieve all user state.
   * @param options.securityProviderRequest - A function for verifying a message, whether it is malicious or not.
   * @param options.getCurrentChainId - A function for retrieving the current chainId.
   */
  constructor({
    messenger,
    getAllState,
    securityProviderRequest,
    getCurrentChainId
  }) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: getDefaultState()
    });
    __privateAdd(this, _newUnsignedAbstractMessage);
    /**
     * Signifies a user's approval to sign a personal_sign message in queue.
     * Triggers signing, and the callback function from newUnsignedPersonalMessage.
     *
     * @param msgParams - The params of the message to sign & return to the Dapp.
     * @returns Signature result from signing.
     */
    __privateAdd(this, _signPersonalMessage);
    /**
     * The method for a user approving a call to eth_signTypedData, per EIP 712.
     * Triggers the callback in newUnsignedTypedMessage.
     *
     * @param msgParams - The params passed to eth_signTypedData.
     * @param opts - The options for the method.
     * @param opts.parseJsonData - Whether to parse JSON data before calling the KeyringController.
     * @returns Signature result from signing.
     */
    __privateAdd(this, _signTypedMessage);
    __privateAdd(this, _tryForEachMessageManager);
    __privateAdd(this, _trySetDeferredSignSuccess);
    __privateAdd(this, _trySetMessageMetadata);
    __privateAdd(this, _trySetDeferredSignError);
    __privateAdd(this, _rejectUnapproved);
    __privateAdd(this, _clearUnapproved);
    __privateAdd(this, _signAbstractMessage);
    __privateAdd(this, _errorMessage);
    __privateAdd(this, _cancelAbstractMessage);
    __privateAdd(this, _handleMessageManagerEvents);
    __privateAdd(this, _subscribeToMessageState);
    __privateAdd(this, _migrateMessages);
    __privateAdd(this, _migrateMessage);
    __privateAdd(this, _getMessage);
    __privateAdd(this, _requestApproval);
    __privateAdd(this, _removeJsonData);
    __privateAdd(this, _addLog);
    __privateAdd(this, _getSignTypeForLogger);
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __privateAdd(this, _getAllState, void 0);
    __privateAdd(this, _personalMessageManager, void 0);
    __privateAdd(this, _typedMessageManager, void 0);
    __privateSet(this, _getAllState, getAllState);
    this.hub = new (0, _events2.default)();
    __privateSet(this, _personalMessageManager, new (0, _messagemanager.PersonalMessageManager)(
      void 0,
      void 0,
      securityProviderRequest
    ));
    __privateSet(this, _typedMessageManager, new (0, _messagemanager.TypedMessageManager)(
      void 0,
      void 0,
      securityProviderRequest,
      void 0,
      getCurrentChainId
    ));
    __privateMethod(this, _handleMessageManagerEvents, handleMessageManagerEvents_fn).call(this, __privateGet(this, _personalMessageManager), "unapprovedPersonalMessage");
    __privateMethod(this, _handleMessageManagerEvents, handleMessageManagerEvents_fn).call(this, __privateGet(this, _typedMessageManager), "unapprovedTypedMessage");
    __privateMethod(this, _subscribeToMessageState, subscribeToMessageState_fn).call(this, __privateGet(this, _personalMessageManager), (state, newMessages, messageCount) => {
      state.unapprovedPersonalMsgs = newMessages;
      state.unapprovedPersonalMsgCount = messageCount;
    });
    __privateMethod(this, _subscribeToMessageState, subscribeToMessageState_fn).call(this, __privateGet(this, _typedMessageManager), (state, newMessages, messageCount) => {
      state.unapprovedTypedMessages = newMessages;
      state.unapprovedTypedMessagesCount = messageCount;
    });
  }
  /**
   * A getter for the number of 'unapproved' PersonalMessages in this.messages.
   *
   * @returns The number of 'unapproved' PersonalMessages in this.messages
   */
  get unapprovedPersonalMessagesCount() {
    return __privateGet(this, _personalMessageManager).getUnapprovedMessagesCount();
  }
  /**
   * A getter for the number of 'unapproved' TypedMessages in this.messages.
   *
   * @returns The number of 'unapproved' TypedMessages in this.messages
   */
  get unapprovedTypedMessagesCount() {
    return __privateGet(this, _typedMessageManager).getUnapprovedMessagesCount();
  }
  /**
   * A getter for returning all messages.
   *
   * @returns The object containing all messages.
   */
  get messages() {
    const messages = [
      ...__privateGet(this, _typedMessageManager).getAllMessages(),
      ...__privateGet(this, _personalMessageManager).getAllMessages()
    ];
    const messagesObject = messages.reduce((acc, message) => {
      acc[message.id] = message;
      return acc;
    }, {});
    return messagesObject;
  }
  /**
   * Reset the controller state to the initial state.
   */
  resetState() {
    this.update(() => getDefaultState());
  }
  /**
   * Reject all unapproved messages of any type.
   *
   * @param reason - A message to indicate why.
   */
  rejectUnapproved(reason) {
    __privateMethod(this, _rejectUnapproved, rejectUnapproved_fn).call(this, __privateGet(this, _personalMessageManager), reason);
    __privateMethod(this, _rejectUnapproved, rejectUnapproved_fn).call(this, __privateGet(this, _typedMessageManager), reason);
  }
  /**
   * Clears all unapproved messages from memory.
   */
  clearUnapproved() {
    __privateMethod(this, _clearUnapproved, clearUnapproved_fn).call(this, __privateGet(this, _personalMessageManager));
    __privateMethod(this, _clearUnapproved, clearUnapproved_fn).call(this, __privateGet(this, _typedMessageManager));
  }
  /**
   * Called when a dapp uses the personal_sign method.
   *
   * We currently define personal_sign mostly for legacy Dapps.
   *
   * @param messageParams - The params of the message to sign & return to the Dapp.
   * @param req - The original request, containing the origin.
   * @returns Promise resolving to the raw data of the signature request.
   */
  async newUnsignedPersonalMessage(messageParams, req) {
    return __privateMethod(this, _newUnsignedAbstractMessage, newUnsignedAbstractMessage_fn).call(
      this,
      __privateGet(this, _personalMessageManager),
      _controllerutils.ApprovalType.PersonalSign,
      _loggingcontroller.SigningMethod.PersonalSign,
      "Personal Message",
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      __privateMethod(this, _signPersonalMessage, signPersonalMessage_fn).bind(this),
      messageParams,
      req
    );
  }
  /**
   * Called when a dapp uses the eth_signTypedData method, per EIP 712.
   *
   * @param messageParams - The params passed to eth_signTypedData.
   * @param req - The original request, containing the origin.
   * @param version - The version indicating the format of the typed data.
   * @param signingOpts - An options bag for signing.
   * @param signingOpts.parseJsonData - Whether to parse the JSON before signing.
   * @returns Promise resolving to the raw data of the signature request.
   */
  async newUnsignedTypedMessage(messageParams, req, version, signingOpts) {
    const signTypeForLogger = __privateMethod(this, _getSignTypeForLogger, getSignTypeForLogger_fn).call(this, version);
    return __privateMethod(this, _newUnsignedAbstractMessage, newUnsignedAbstractMessage_fn).call(
      this,
      __privateGet(this, _typedMessageManager),
      _controllerutils.ApprovalType.EthSignTypedData,
      signTypeForLogger,
      "Typed Message",
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      __privateMethod(this, _signTypedMessage, signTypedMessage_fn).bind(this),
      messageParams,
      req,
      version,
      signingOpts
    );
  }
  /**
   * Called to update the message status as signed.
   *
   * @param messageId - The id of the Message to update.
   * @param signature - The data to update the message with.
   */
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDeferredSignSuccess(messageId, signature) {
    __privateMethod(this, _tryForEachMessageManager, tryForEachMessageManager_fn).call(this, __privateMethod(this, _trySetDeferredSignSuccess, trySetDeferredSignSuccess_fn), messageId, signature);
  }
  /**
   * Called when the message metadata needs to be updated.
   *
   * @param messageId - The id of the message to update.
   * @param metadata - The data to update the metadata property in the message.
   */
  setMessageMetadata(messageId, metadata) {
    __privateMethod(this, _tryForEachMessageManager, tryForEachMessageManager_fn).call(this, __privateMethod(this, _trySetMessageMetadata, trySetMessageMetadata_fn), messageId, metadata);
  }
  /**
   * Called to cancel a signing message.
   *
   * @param messageId - The id of the Message to update.
   */
  setDeferredSignError(messageId) {
    __privateMethod(this, _tryForEachMessageManager, tryForEachMessageManager_fn).call(this, __privateMethod(this, _trySetDeferredSignError, trySetDeferredSignError_fn), messageId);
  }
  setTypedMessageInProgress(messageId) {
    __privateGet(this, _typedMessageManager).setMessageStatusInProgress(messageId);
  }
  setPersonalMessageInProgress(messageId) {
    __privateGet(this, _personalMessageManager).setMessageStatusInProgress(messageId);
  }
};
_getAllState = new WeakMap();
_personalMessageManager = new WeakMap();
_typedMessageManager = new WeakMap();
_newUnsignedAbstractMessage = new WeakSet();
newUnsignedAbstractMessage_fn = async function(messageManager, approvalType, signTypeForLogger, messageName, signMessage, messageParams, req, version, signingOpts) {
  let resultCallbacks;
  try {
    const messageId = await messageManager.addUnapprovedMessage(
      messageParams,
      req,
      version
    );
    const messageParamsWithId = {
      ...messageParams,
      metamaskId: messageId,
      ...version && { version }
    };
    const signaturePromise = messageManager.waitForFinishStatus(
      messageParamsWithId,
      messageName
    );
    try {
      __privateMethod(this, _addLog, addLog_fn).call(this, signTypeForLogger, _loggingcontroller.SigningStage.Proposed, messageParamsWithId);
      const acceptResult = await __privateMethod(this, _requestApproval, requestApproval_fn).call(this, messageParamsWithId, approvalType);
      resultCallbacks = acceptResult.resultCallbacks;
    } catch {
      __privateMethod(this, _addLog, addLog_fn).call(this, signTypeForLogger, _loggingcontroller.SigningStage.Rejected, messageParamsWithId);
      __privateMethod(this, _cancelAbstractMessage, cancelAbstractMessage_fn).call(this, messageManager, messageId);
      throw _rpcerrors.providerErrors.userRejectedRequest("User rejected the request.");
    }
    await signMessage(messageParamsWithId, signingOpts);
    const signatureResult = await signaturePromise;
    __privateMethod(this, _addLog, addLog_fn).call(this, signTypeForLogger, _loggingcontroller.SigningStage.Signed, messageParamsWithId);
    resultCallbacks?.success(signatureResult);
    return signatureResult;
  } catch (error) {
    resultCallbacks?.error(error);
    throw error;
  }
};
_signPersonalMessage = new WeakSet();
signPersonalMessage_fn = async function(msgParams) {
  return await __privateMethod(this, _signAbstractMessage, signAbstractMessage_fn).call(this, __privateGet(this, _personalMessageManager), _controllerutils.ApprovalType.PersonalSign, msgParams, async (cleanMsgParams) => await this.messagingSystem.call(
    "KeyringController:signPersonalMessage",
    cleanMsgParams
  ));
};
_signTypedMessage = new WeakSet();
signTypedMessage_fn = async function(msgParams, opts = { parseJsonData: true }) {
  const { version } = msgParams;
  return await __privateMethod(this, _signAbstractMessage, signAbstractMessage_fn).call(this, __privateGet(this, _typedMessageManager), _controllerutils.ApprovalType.EthSignTypedData, msgParams, async (cleanMsgParams) => {
    const finalMessageParams = opts.parseJsonData ? __privateMethod(this, _removeJsonData, removeJsonData_fn).call(this, cleanMsgParams, version) : cleanMsgParams;
    return await this.messagingSystem.call(
      "KeyringController:signTypedMessage",
      finalMessageParams,
      version
    );
  });
};
_tryForEachMessageManager = new WeakSet();
tryForEachMessageManager_fn = function(callbackFn, ...args) {
  const messageManagers = [
    __privateGet(this, _personalMessageManager),
    __privateGet(this, _typedMessageManager)
  ];
  for (const manager of messageManagers) {
    if (callbackFn(manager, ...args)) {
      return true;
    }
  }
  throw new Error("Message not found");
};
_trySetDeferredSignSuccess = new WeakSet();
trySetDeferredSignSuccess_fn = function(messageManager, messageId, signature) {
  try {
    messageManager.setMessageStatusSigned(messageId, signature);
    return true;
  } catch (error) {
    return false;
  }
};
_trySetMessageMetadata = new WeakSet();
trySetMessageMetadata_fn = function(messageManager, messageId, metadata) {
  try {
    messageManager.setMetadata(messageId, metadata);
    return true;
  } catch (error) {
    return false;
  }
};
_trySetDeferredSignError = new WeakSet();
trySetDeferredSignError_fn = function(messageManager, messageId) {
  try {
    messageManager.rejectMessage(messageId);
    return true;
  } catch (error) {
    return false;
  }
};
_rejectUnapproved = new WeakSet();
rejectUnapproved_fn = function(messageManager, reason) {
  Object.keys(messageManager.getUnapprovedMessages()).forEach((messageId) => {
    __privateMethod(this, _cancelAbstractMessage, cancelAbstractMessage_fn).call(this, messageManager, messageId, reason);
  });
};
_clearUnapproved = new WeakSet();
clearUnapproved_fn = function(messageManager) {
  messageManager.update({
    unapprovedMessages: {},
    unapprovedMessagesCount: 0
  });
};
_signAbstractMessage = new WeakSet();
signAbstractMessage_fn = async function(messageManager, methodName, msgParams, getSignature) {
  console.info(`MetaMaskController - ${methodName}`);
  const messageId = msgParams.metamaskId;
  try {
    const cleanMessageParams = await messageManager.approveMessage(msgParams);
    try {
      const signature = await getSignature(cleanMessageParams);
      this.hub.emit(`${methodName}:signed`, { signature, messageId });
      if (!cleanMessageParams.deferSetAsSigned) {
        messageManager.setMessageStatusSigned(messageId, signature);
      }
      return signature;
    } catch (error) {
      this.hub.emit(`${messageId}:signError`, { error });
      throw error;
    }
  } catch (error) {
    console.info(`MetaMaskController - ${methodName} failed.`, error);
    __privateMethod(this, _errorMessage, errorMessage_fn).call(this, messageManager, messageId, error.message);
    throw error;
  }
};
_errorMessage = new WeakSet();
errorMessage_fn = function(messageManager, messageId, error) {
  if (messageManager instanceof _messagemanager.TypedMessageManager) {
    messageManager.setMessageStatusErrored(messageId, error);
  } else {
    __privateMethod(this, _cancelAbstractMessage, cancelAbstractMessage_fn).call(this, messageManager, messageId);
  }
};
_cancelAbstractMessage = new WeakSet();
cancelAbstractMessage_fn = function(messageManager, messageId, reason) {
  if (reason) {
    const message = __privateMethod(this, _getMessage, getMessage_fn).call(this, messageId);
    this.hub.emit("cancelWithReason", { message, reason });
  }
  messageManager.rejectMessage(messageId);
};
_handleMessageManagerEvents = new WeakSet();
handleMessageManagerEvents_fn = function(messageManager, eventName) {
  messageManager.hub.on("updateBadge", () => {
    this.hub.emit("updateBadge");
  });
  messageManager.hub.on(
    "unapprovedMessage",
    (msgParams) => {
      this.hub.emit(eventName, msgParams);
    }
  );
};
_subscribeToMessageState = new WeakSet();
subscribeToMessageState_fn = function(messageManager, updateState) {
  messageManager.subscribe((state) => {
    const newMessages = __privateMethod(this, _migrateMessages, migrateMessages_fn).call(
      this,
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state.unapprovedMessages
    );
    this.update(() => {
      const newState = { ...this.state };
      updateState(newState, newMessages, state.unapprovedMessagesCount);
      return newState;
    });
  });
};
_migrateMessages = new WeakSet();
migrateMessages_fn = function(coreMessages) {
  const stateMessages = {};
  for (const messageId of Object.keys(coreMessages)) {
    const coreMessage = coreMessages[messageId];
    const stateMessage = __privateMethod(this, _migrateMessage, migrateMessage_fn).call(this, coreMessage);
    stateMessages[messageId] = stateMessage;
  }
  return stateMessages;
};
_migrateMessage = new WeakSet();
migrateMessage_fn = function(coreMessage) {
  const { messageParams, ...coreMessageData } = coreMessage;
  const stateMessage = {
    ...coreMessageData,
    msgParams: messageParams
  };
  return stateMessage;
};
_getMessage = new WeakSet();
getMessage_fn = function(messageId) {
  return {
    ...this.state.unapprovedPersonalMsgs,
    ...this.state.unapprovedTypedMessages
  }[messageId];
};
_requestApproval = new WeakSet();
requestApproval_fn = async function(msgParams, type) {
  const id = msgParams.metamaskId;
  const origin = msgParams.origin || _controllerutils.ORIGIN_METAMASK;
  const clonedMsgParams = _lodash.cloneDeep.call(void 0, msgParams);
  return await this.messagingSystem.call(
    "ApprovalController:addRequest",
    {
      id,
      origin,
      type,
      requestData: clonedMsgParams,
      expectsResult: true
    },
    true
  );
};
_removeJsonData = new WeakSet();
removeJsonData_fn = function(messageParams, version) {
  if (version === "V1" || typeof messageParams.data !== "string") {
    return messageParams;
  }
  return {
    ...messageParams,
    data: JSON.parse(messageParams.data)
  };
};
_addLog = new WeakSet();
addLog_fn = function(signingMethod, stage, signingData) {
  this.messagingSystem.call("LoggingController:add", {
    type: _loggingcontroller.LogType.EthSignLog,
    data: {
      signingMethod,
      stage,
      signingData
    }
  });
};
_getSignTypeForLogger = new WeakSet();
getSignTypeForLogger_fn = function(version) {
  let signTypeForLogger = _loggingcontroller.SigningMethod.EthSignTypedData;
  if (version === "V3") {
    signTypeForLogger = _loggingcontroller.SigningMethod.EthSignTypedDataV3;
  } else if (version === "V4") {
    signTypeForLogger = _loggingcontroller.SigningMethod.EthSignTypedDataV4;
  }
  return signTypeForLogger;
};



exports.SignatureController = SignatureController;
//# sourceMappingURL=chunk-RGJUNX7D.js.map