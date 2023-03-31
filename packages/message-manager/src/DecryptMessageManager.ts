import { v1 as random } from 'uuid';
import { normalizeMessageData } from './utils';
import {
  AbstractMessageManager,
  AbstractMessage,
  AbstractMessageParams,
  AbstractMessageParamsMetamask,
  OriginalRequest,
} from './AbstractMessageManager';

/**
 * @type DecryptMessage
 *
 * Represents and contains data about a 'eth_decrypt' type signature request.
 * These are created when a signature for an eth_decrypt call is requested.
 * @property id - An id to track and identify the message object
 * @property messageParams - The parameters to pass to the eth_decrypt method once the request is approved
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'DecryptMessage' which always has a 'eth_decrypt' type
 * @property rawData - Raw data of the signature request
 */
export interface DecryptMessage extends AbstractMessage {
  messageParams: DecryptMessageParams;
  rawData?: string;
  error?: string;
}

/**
 * @type DecryptMessageParams
 *
 * Represents the parameters to pass to the eth_decrypt method once the request is approved.
 * @property data - A hex string conversion of the raw buffer data of the signature request
 */
export interface DecryptMessageParams extends AbstractMessageParams {
  data: string;
}

/**
 * @type DecryptMessageParamsMetamask
 *
 * Represents the parameters to pass to the eth_decrypt method once the request is approved
 * plus data added by MetaMask.
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property data - A hex string conversion of the raw buffer data of the signature request
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface DecryptMessageParamsMetamask
  extends AbstractMessageParamsMetamask {
  data: string;
}

/**
 * Controller in charge of managing - storing, adding, removing, updating - DecryptMessages.
 */
export class DecryptMessageManager extends AbstractMessageManager<
  DecryptMessage,
  DecryptMessageParams,
  DecryptMessageParamsMetamask
> {
  /**
   * Name of this controller used during composition
   */
  override name = 'DecryptMessageManager';

  /**
   * Creates a new Message with an 'unapproved' status using the passed messageParams.
   * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
   *
   * @param messageParams - The params for the personal_sign call to be made after the message is approved.
   * @param req - The original request object possibly containing the origin.
   * @returns Promise resolving to the raw data of the signature request.
   */
  addUnapprovedMessageAsync(
    messageParams: DecryptMessageParams,
    req?: OriginalRequest,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!messageParams.from) {
        reject(new Error('MetaMask Decryption: from field is required.'));
        return;
      }
      const messageId = this.addUnapprovedMessage(messageParams, req);

      this.hub.once(`${messageId}:finished`, (data: DecryptMessage) => {
        switch (data.status) {
          case 'decrypted':
            return resolve(data.rawSig as string);
          case 'rejected':
            return reject(
              new Error('MetaMask Decryption: User denied message decryption.'),
            );
          case 'errored':
            return reject(
              new Error(
                'MetaMask Decryption: This message cannot be decrypted.',
              ),
            );
          default:
            return reject(
              new Error(
                `MetaMask Decryption: Unknown problem: ${JSON.stringify(
                  messageParams,
                )}`,
              ),
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
  addUnapprovedMessage(
    messageParams: DecryptMessageParams,
    req?: OriginalRequest,
  ) {
    if (req) {
      messageParams.origin = req.origin;
    }
    messageParams.data = normalizeMessageData(messageParams.data);
    const messageId = random();
    const messageData: DecryptMessage = {
      id: messageId,
      messageParams,
      status: 'unapproved',
      time: Date.now(),
      type: 'eth_decrypt',
    };
    this.addMessage(messageData);
    this.hub.emit(`unapprovedMessage`, {
      ...messageParams,
      ...{ metamaskId: messageId },
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
  prepMessageForSigning(
    messageParams: DecryptMessageParamsMetamask,
  ): Promise<DecryptMessageParams> {
    delete messageParams.metamaskId;
    return Promise.resolve(messageParams);
  }
}
