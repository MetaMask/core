import {
  AbstractMessageManager
} from "./chunk-4QLWUKJP.mjs";
import {
  validateEncryptionPublicKeyMessageData
} from "./chunk-EP4PPRKM.mjs";

// src/EncryptionPublicKeyManager.ts
import { v1 as random } from "uuid";
var EncryptionPublicKeyManager = class extends AbstractMessageManager {
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
    validateEncryptionPublicKeyMessageData(messageParams);
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
    const messageId = random();
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

export {
  EncryptionPublicKeyManager,
  EncryptionPublicKeyManager_default
};
//# sourceMappingURL=chunk-Y7YMVBHF.mjs.map