"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkUPI6INPJjs = require('./chunk-UPI6INPJ.js');



var _chunkE3LTYZLZjs = require('./chunk-E3LTYZLZ.js');

// src/DecryptMessageManager.ts
var _uuid = require('uuid');
var DecryptMessageManager = class extends _chunkUPI6INPJjs.AbstractMessageManager {
  constructor() {
    super(...arguments);
    /**
     * Name of this controller used during composition
     */
    this.name = "DecryptMessageManager";
  }
  /**
   * Creates a new Message with an 'unapproved' status using the passed messageParams.
   * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
   *
   * @param messageParams - The params for the personal_sign call to be made after the message is approved.
   * @param req - The original request object possibly containing the origin.
   * @returns Promise resolving to the raw data of the signature request.
   */
  async addUnapprovedMessageAsync(messageParams, req) {
    _chunkE3LTYZLZjs.validateDecryptedMessageData.call(void 0, messageParams);
    const messageId = await this.addUnapprovedMessage(messageParams, req);
    return new Promise((resolve, reject) => {
      this.hub.once(`${messageId}:finished`, (data) => {
        switch (data.status) {
          case "decrypted":
            return resolve(data.rawSig);
          case "rejected":
            return reject(
              new Error(
                "MetaMask DecryptMessage: User denied message decryption."
              )
            );
          case "errored":
            return reject(
              new Error(
                "MetaMask DecryptMessage: This message cannot be decrypted."
              )
            );
          default:
            return reject(
              new Error(
                `MetaMask DecryptMessage: Unknown problem: ${JSON.stringify(
                  messageParams
                )}`
              )
            );
        }
      });
    });
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
    if (req) {
      messageParams.origin = req.origin;
    }
    messageParams.data = _chunkE3LTYZLZjs.normalizeMessageData.call(void 0, messageParams.data);
    const messageId = _uuid.v1.call(void 0, );
    const messageData = {
      id: messageId,
      messageParams,
      status: "unapproved",
      time: Date.now(),
      type: "eth_decrypt"
    };
    await this.addMessage(messageData);
    this.hub.emit(`unapprovedMessage`, {
      ...messageParams,
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
    delete messageParams.metamaskId;
    return Promise.resolve(messageParams);
  }
};



exports.DecryptMessageManager = DecryptMessageManager;
//# sourceMappingURL=chunk-JMVSJZAC.js.map