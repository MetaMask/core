import {
  AbstractMessageManager
} from "./chunk-4QLWUKJP.mjs";
import {
  validateTypedSignMessageDataV1,
  validateTypedSignMessageDataV3V4
} from "./chunk-EP4PPRKM.mjs";

// src/TypedMessageManager.ts
import { v1 as random } from "uuid";
var TypedMessageManager = class extends AbstractMessageManager {
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
      validateTypedSignMessageDataV1(messageParams);
    }
    if (version === "V3" || version === "V4") {
      const currentChainId = this.getCurrentChainId?.();
      validateTypedSignMessageDataV3V4(messageParams, currentChainId);
    }
    if (typeof messageParams.data !== "string" && (version === "V3" || version === "V4")) {
      messageParams.data = JSON.stringify(messageParams.data);
    }
    const messageId = random();
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

export {
  TypedMessageManager,
  TypedMessageManager_default
};
//# sourceMappingURL=chunk-QVCINH7L.mjs.map