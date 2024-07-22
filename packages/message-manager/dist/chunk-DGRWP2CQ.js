"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkUPI6INPJjs = require('./chunk-UPI6INPJ.js');



var _chunkE3LTYZLZjs = require('./chunk-E3LTYZLZ.js');

// src/PersonalMessageManager.ts
var _controllerutils = require('@metamask/controller-utils');
var _uuid = require('uuid');
var PersonalMessageManager = class extends _chunkUPI6INPJjs.AbstractMessageManager {
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
    _chunkE3LTYZLZjs.validateSignMessageData.call(void 0, messageParams);
    if (req) {
      messageParams.origin = req.origin;
    }
    messageParams.data = _chunkE3LTYZLZjs.normalizeMessageData.call(void 0, messageParams.data);
    const ethereumSignInData = _controllerutils.detectSIWE.call(void 0, messageParams);
    const finalMsgParams = { ...messageParams, siwe: ethereumSignInData };
    const messageId = _uuid.v1.call(void 0, );
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




exports.PersonalMessageManager = PersonalMessageManager; exports.PersonalMessageManager_default = PersonalMessageManager_default;
//# sourceMappingURL=chunk-DGRWP2CQ.js.map