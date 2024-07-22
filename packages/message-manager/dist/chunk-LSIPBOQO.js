"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkUPI6INPJjs = require('./chunk-UPI6INPJ.js');


var _chunkE3LTYZLZjs = require('./chunk-E3LTYZLZ.js');

// src/EncryptionPublicKeyManager.ts
var _uuid = require('uuid');
var EncryptionPublicKeyManager = class extends _chunkUPI6INPJjs.AbstractMessageManager {
  constructor() {
    super(...arguments);
    /**
     * Name of this controller used during composition
     */
    this.name = "EncryptionPublicKeyManager";
  }
  /**
   * Creates a new Message with an 'unapproved' status using the passed messageParams.
   * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
   *
   * @param messageParams - The params for the eth_getEncryptionPublicKey call to be made after the message is approved.
   * @param req - The original request object possibly containing the origin.
   * @returns Promise resolving to the raw data of the request.
   */
  async addUnapprovedMessageAsync(messageParams, req) {
    _chunkE3LTYZLZjs.validateEncryptionPublicKeyMessageData.call(void 0, messageParams);
    const messageId = await this.addUnapprovedMessage(messageParams, req);
    return new Promise((resolve, reject) => {
      this.hub.once(`${messageId}:finished`, (data) => {
        switch (data.status) {
          case "received":
            return resolve(data.rawSig);
          case "rejected":
            return reject(
              new Error(
                "MetaMask EncryptionPublicKey: User denied message EncryptionPublicKey."
              )
            );
          default:
            return reject(
              new Error(
                `MetaMask EncryptionPublicKey: Unknown problem: ${JSON.stringify(
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
   * @param messageParams - The params for the eth_getEncryptionPublicKey call to be made after the message
   * is approved.
   * @param req - The original request object possibly containing the origin.
   * @returns The id of the newly created message.
   */
  async addUnapprovedMessage(messageParams, req) {
    if (req) {
      messageParams.origin = req.origin;
    }
    const messageId = _uuid.v1.call(void 0, );
    const messageData = {
      id: messageId,
      messageParams,
      status: "unapproved",
      time: Date.now(),
      type: "eth_getEncryptionPublicKey"
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
    return Promise.resolve({ from: messageParams.data });
  }
};
var EncryptionPublicKeyManager_default = EncryptionPublicKeyManager;




exports.EncryptionPublicKeyManager = EncryptionPublicKeyManager; exports.EncryptionPublicKeyManager_default = EncryptionPublicKeyManager_default;
//# sourceMappingURL=chunk-LSIPBOQO.js.map