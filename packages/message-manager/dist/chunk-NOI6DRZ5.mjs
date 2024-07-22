import {
  AbstractMessageManager
} from "./chunk-4QLWUKJP.mjs";
import {
  normalizeMessageData,
  validateSignMessageData
} from "./chunk-EP4PPRKM.mjs";

// src/PersonalMessageManager.ts
import { detectSIWE } from "@metamask/controller-utils";
import { v1 as random } from "uuid";
var PersonalMessageManager = class extends AbstractMessageManager {
  constructor() {
    super(...arguments);
    /**
     * Name of this controller used during composition
     */
    this.name = "PersonalMessageManager";
  }
  /**
   * Creates a new Message with an 'unapproved' status using the passed messageParams.
   * this.addMessage is called to add the new Message to this.messages, and to save the
   * unapproved Messages.
   *
   * @param messageParams - The params for the personal_sign call to be made after the message
   * is approved.
   * @param req - The original request object possibly containing the origin.
   * @returns The id of the newly created message.
   */
  async addUnapprovedMessage(messageParams, req) {
    validateSignMessageData(messageParams);
    if (req) {
      messageParams.origin = req.origin;
    }
    messageParams.data = normalizeMessageData(messageParams.data);
    const ethereumSignInData = detectSIWE(messageParams);
    const finalMsgParams = { ...messageParams, siwe: ethereumSignInData };
    const messageId = random();
    const messageData = {
      id: messageId,
      messageParams: finalMsgParams,
      securityAlertResponse: req?.securityAlertResponse,
      status: "unapproved",
      time: Date.now(),
      type: "personal_sign"
    };
    await this.addMessage(messageData);
    this.hub.emit(`unapprovedMessage`, {
      ...finalMsgParams,
      ...{ metamaskId: messageId }
    });
    return messageId;
  }
  /**
   * Removes the metamaskId property from passed messageParams and returns a promise which
   * resolves the updated messageParams.
   *
   * @param messageParams - The messageParams to modify.
   * @returns Promise resolving to the messageParams with the metamaskId property removed.
   */
  prepMessageForSigning(messageParams) {
    const { metamaskId: _metamaskId, ...messageParamsWithoutId } = messageParams;
    return Promise.resolve(messageParamsWithoutId);
  }
};
var PersonalMessageManager_default = PersonalMessageManager;

export {
  PersonalMessageManager,
  PersonalMessageManager_default
};
//# sourceMappingURL=chunk-NOI6DRZ5.mjs.map