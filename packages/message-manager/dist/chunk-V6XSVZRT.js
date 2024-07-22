"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkUPI6INPJjs = require('./chunk-UPI6INPJ.js');



var _chunkE3LTYZLZjs = require('./chunk-E3LTYZLZ.js');

// src/TypedMessageManager.ts
var _uuid = require('uuid');
var TypedMessageManager = class extends _chunkUPI6INPJjs.AbstractMessageManager {
  constructor() {
    super(...arguments);
    /**
     * Name of this controller used during composition
     */
    this.name = "TypedMessageManager";
  }
  /**
   * Creates a new TypedMessage with an 'unapproved' status using the passed messageParams.
   * this.addMessage is called to add the new TypedMessage to this.messages, and to save the
   * unapproved TypedMessages.
   *
   * @param messageParams - The params for the 'eth_signTypedData' call to be made after the message
   * is approved.
   * @param req - The original request object possibly containing the origin.
   * @param version - Compatibility version EIP712.
   * @returns The id of the newly created TypedMessage.
   */
  async addUnapprovedMessage(messageParams, req, version) {
    if (version === "V1") {
      _chunkE3LTYZLZjs.validateTypedSignMessageDataV1.call(void 0, messageParams);
    }
    if (version === "V3" || version === "V4") {
      const currentChainId = this.getCurrentChainId?.();
      _chunkE3LTYZLZjs.validateTypedSignMessageDataV3V4.call(void 0, messageParams, currentChainId);
    }
    if (typeof messageParams.data !== "string" && (version === "V3" || version === "V4")) {
      messageParams.data = JSON.stringify(messageParams.data);
    }
    const messageId = _uuid.v1.call(void 0, );
    const messageParamsMetamask = {
      ...messageParams,
      metamaskId: messageId,
      version
    };
    if (req) {
      messageParams.origin = req.origin;
    }
    const messageData = {
      id: messageId,
      messageParams,
      securityAlertResponse: req?.securityAlertResponse,
      status: "unapproved",
      time: Date.now(),
      type: "eth_signTypedData"
    };
    await this.addMessage(messageData);
    this.hub.emit(`unapprovedMessage`, messageParamsMetamask);
    return messageId;
  }
  /**
   * Sets a TypedMessage status to 'errored' via a call to this.setMessageStatus.
   *
   * @param messageId - The id of the TypedMessage to error.
   * @param error - The error to be included in TypedMessage.
   */
  setMessageStatusErrored(messageId, error) {
    const message = this.getMessage(messageId);
    if (!message) {
      return;
    }
    message.error = error;
    this.updateMessage(message);
    this.setMessageStatus(messageId, "errored");
  }
  /**
   * Removes the metamaskId and version properties from passed messageParams and returns a promise which
   * resolves the updated messageParams.
   *
   * @param messageParams - The messageParams to modify.
   * @returns Promise resolving to the messageParams with the metamaskId and version properties removed.
   */
  prepMessageForSigning(messageParams) {
    const {
      metamaskId: _metamaskId,
      version: _version,
      ...messageParamsWithoutId
    } = messageParams;
    return Promise.resolve(messageParamsWithoutId);
  }
};
var TypedMessageManager_default = TypedMessageManager;




exports.TypedMessageManager = TypedMessageManager; exports.TypedMessageManager_default = TypedMessageManager_default;
//# sourceMappingURL=chunk-V6XSVZRT.js.map