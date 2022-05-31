import { v1 as random } from 'uuid';
import { validateSignMessageData, normalizeMessageData } from '../util';
import {
  AbstractMessageManager,
  AbstractMessage,
  AbstractMessageParams,
  AbstractMessageParamsMetamask,
  OriginalRequest,
} from './AbstractMessageManager';

/**
 * @type Message
 *
 * Represents and contains data about a 'eth_sign' type signature request.
 * These are created when a signature for an eth_sign call is requested.
 * @property id - An id to track and identify the message object
 * @property messageParams - The parameters to pass to the eth_sign method once the signature request is approved
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'Message' which always has a 'eth_sign' type
 * @property rawSig - Raw data of the signature request
 */
export interface Message extends AbstractMessage {
  messageParams: MessageParams;
}

/**
 * @type PersonalMessageParams
 *
 * Represents the parameters to pass to the eth_sign method once the signature request is approved.
 * @property data - A hex string conversion of the raw buffer data of the signature request
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface MessageParams extends AbstractMessageParams {
  data: string;
}

/**
 * @type MessageParamsMetamask
 *
 * Represents the parameters to pass to the eth_sign method once the signature request is approved
 * plus data added by MetaMask.
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property data - A hex string conversion of the raw buffer data of the signature request
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface MessageParamsMetamask extends AbstractMessageParamsMetamask {
  data: string;
}

/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
export class MessageManager extends AbstractMessageManager<
  Message,
  MessageParams,
  MessageParamsMetamask
> {
  /**
   * Name of this controller used during composition
   */
  override name = 'MessageManager';

  /**
   * Creates a new Message with an 'unapproved' status using the passed messageParams.
   * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
   *
   * @param messageParams - The params for the eth_sign call to be made after the message is approved.
   * @param req - The original request object possibly containing the origin.
   * @returns Promise resolving to the raw data of the signature request.
   */
  addUnapprovedMessageAsync(
    messageParams: MessageParams,
    req?: OriginalRequest,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      validateSignMessageData(messageParams);
      const messageId = this.addUnapprovedMessage(messageParams, req);
      this.hub.once(`${messageId}:finished`, (data: Message) => {
        switch (data.status) {
          case 'signed':
            return resolve(data.rawSig as string);
          case 'rejected':
            return reject(
              new Error(
                'MetaMask Message Signature: User denied message signature.',
              ),
            );
          default:
            return reject(
              new Error(
                `MetaMask Message Signature: Unknown problem: ${JSON.stringify(
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
   * @param messageParams - The params for the eth_sign call to be made after the message
   * is approved.
   * @param req - The original request object possibly containing the origin.
   * @returns The id of the newly created message.
   */
  addUnapprovedMessage(messageParams: MessageParams, req?: OriginalRequest) {
    if (req?.origin) {
      messageParams.origin = req.origin;
    }
    messageParams.data = normalizeMessageData(messageParams.data);
    const messageId = random();
    const messageData: Message = {
      id: messageId,
      messageParams,
      status: 'unapproved',
      time: Date.now(),
      type: 'eth_sign',
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
    messageParams: MessageParamsMetamask,
  ): Promise<MessageParams> {
    delete messageParams.metamaskId;
    return Promise.resolve(messageParams);
  }
}

export default MessageManager;
