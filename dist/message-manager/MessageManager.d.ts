import AbstractMessageManager, { AbstractMessage, AbstractMessageParams, AbstractMessageParamsMetamask, OriginalRequest } from './AbstractMessageManager';
/**
 * @type Message
 *
 * Represents and contains data about a 'eth_sign' type signature request.
 * These are created when a signature for an eth_sign call is requested.
 *
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
 *
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
 *
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
export declare class MessageManager extends AbstractMessageManager<Message, MessageParams, MessageParamsMetamask> {
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a new Message with an 'unapproved' status using the passed messageParams.
     * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
     *
     * @param messageParams - The params for the eth_sign call to be made after the message is approved
     * @param req? - The original request object possibly containing the origin
     * @returns - Promise resolving to the raw data of the signature request
     */
    addUnapprovedMessageAsync(messageParams: MessageParams, req?: OriginalRequest): Promise<string>;
    /**
     * Creates a new Message with an 'unapproved' status using the passed messageParams.
     * this.addMessage is called to add the new Message to this.messages, and to save the
     * unapproved Messages.
     *
     * @param messageParams - The params for the eth_sign call to be made after the message
     * is approved
     * @param req? - The original request object possibly containing the origin
     * @returns - The id of the newly created message
     */
    addUnapprovedMessage(messageParams: MessageParams, req?: OriginalRequest): string;
    /**
     * Removes the metamaskId property from passed messageParams and returns a promise which
     * resolves the updated messageParams
     *
     * @param messageParams - The messageParams to modify
     * @returns - Promise resolving to the messageParams with the metamaskId property removed
     */
    prepMessageForSigning(messageParams: MessageParamsMetamask): Promise<MessageParams>;
}
export default MessageManager;
