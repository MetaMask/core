import {
  AbstractMessageManager
} from "./chunk-4QLWUKJP.mjs";
import {
  normalizeMessageData,
  validateDecryptedMessageData
} from "./chunk-EP4PPRKM.mjs";

// src/DecryptMessageManager.ts
import { v1 as random } from "uuid";
var DecryptMessageManager = class extends AbstractMessageManager {
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
    validateDecryptedMessageData(messageParams);
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
    messageParams.data = normalizeMessageData(messageParams.data);
    const messageId = random();
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

export {
  DecryptMessageManager
};
//# sourceMappingURL=chunk-OAMD5OVE.mjs.map