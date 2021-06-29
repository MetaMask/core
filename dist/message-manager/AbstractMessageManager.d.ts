/// <reference types="node" />
import { EventEmitter } from 'events';
import BaseController, { BaseConfig, BaseState } from '../BaseController';
/**
 * @type OriginalRequest
 *
 * Represents the original request object for adding a message.
 *
 * @property origin? - Is it is specified, represents the origin
 */
export interface OriginalRequest {
    origin?: string;
}
/**
 * @type Message
 *
 * Represents and contains data about a signing type signature request.
 *
 * @property id - An id to track and identify the message object
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'Message' which always has a signing type
 * @property rawSig - Raw data of the signature request
 */
export interface AbstractMessage {
    id: string;
    time: number;
    status: string;
    type: string;
    rawSig?: string;
}
/**
 * @type MessageParams
 *
 * Represents the parameters to pass to the signing method once the signature request is approved.
 *
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface AbstractMessageParams {
    from: string;
    origin?: string;
}
/**
 * @type MessageParamsMetamask
 *
 * Represents the parameters to pass to the signing method once the signature request is approved
 * plus data added by MetaMask.
 *
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface AbstractMessageParamsMetamask extends AbstractMessageParams {
    metamaskId?: string;
}
/**
 * @type MessageManagerState
 *
 * Message Manager state
 *
 * @property unapprovedMessages - A collection of all Messages in the 'unapproved' state
 * @property unapprovedMessagesCount - The count of all Messages in this.unapprovedMessages
 */
export interface MessageManagerState<M extends AbstractMessage> extends BaseState {
    unapprovedMessages: {
        [key: string]: M;
    };
    unapprovedMessagesCount: number;
}
/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
export declare abstract class AbstractMessageManager<M extends AbstractMessage, P extends AbstractMessageParams, PM extends AbstractMessageParamsMetamask> extends BaseController<BaseConfig, MessageManagerState<M>> {
    protected messages: M[];
    /**
     * Saves the unapproved messages, and their count to state
     *
     */
    protected saveMessageList(): void;
    /**
     * Updates the status of a Message in this.messages
     *
     * @param messageId - The id of the Message to update
     * @param status - The new status of the Message
     */
    protected setMessageStatus(messageId: string, status: string): void;
    /**
     * Sets a Message in this.messages to the passed Message if the ids are equal.
     * Then saves the unapprovedMessage list to storage
     *
     * @param message - A Message that will replace an existing Message (with the id) in this.messages
     */
    protected updateMessage(message: M): void;
    /**
     * EventEmitter instance used to listen to specific message events
     */
    hub: EventEmitter;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates an AbstractMessageManager instance
     *
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor(config?: Partial<BaseConfig>, state?: Partial<MessageManagerState<M>>);
    /**
     * A getter for the number of 'unapproved' Messages in this.messages
     *
     * @returns - The number of 'unapproved' Messages in this.messages
     *
     */
    getUnapprovedMessagesCount(): number;
    /**
     * A getter for the 'unapproved' Messages in state messages
     *
     * @returns - An index of Message ids to Messages, for all 'unapproved' Messages in this.messages
     *
     */
    getUnapprovedMessages(): {
        [key: string]: M;
    };
    /**
     * Adds a passed Message to this.messages, and calls this.saveMessageList() to save
     * the unapproved Messages from that list to this.messages.
     *
     * @param {Message} message The Message to add to this.messages
     *
     */
    addMessage(message: M): void;
    /**
     * Returns a specified Message.
     *
     * @param messageId - The id of the Message to get
     * @returns - The Message with the id that matches the passed messageId, or undefined
     * if no Message has that id.
     *
     */
    getMessage(messageId: string): M | undefined;
    /**
     * Approves a Message. Sets the message status via a call to this.setMessageStatusApproved,
     * and returns a promise with any the message params modified for proper signing.
     *
     * @param messageParams - The messageParams to be used when signing method is called,
     * plus data added by MetaMask
     * @returns - Promise resolving to the messageParams with the metamaskId property removed
     */
    approveMessage(messageParams: PM): Promise<P>;
    /**
     * Sets a Message status to 'approved' via a call to this.setMessageStatus.
     *
     * @param messageId - The id of the Message to approve
     */
    setMessageStatusApproved(messageId: string): void;
    /**
     * Sets a Message status to 'signed' via a call to this.setMessageStatus and updates
     * that Message in this.messages by adding the raw signature data of the signature
     * request to the Message.
     *
     * @param messageId - The id of the Message to sign
     * @param rawSig - The raw data of the signature request
     */
    setMessageStatusSigned(messageId: string, rawSig: string): void;
    /**
     * Removes the metamaskId property from passed messageParams and returns a promise which
     * resolves the updated messageParams
     *
     * @param messageParams - The messageParams to modify
     * @returns - Promise resolving to the messageParams with the metamaskId property removed
     */
    abstract prepMessageForSigning(messageParams: PM): Promise<P>;
    /**
     * Sets a Message status to 'rejected' via a call to this.setMessageStatus.
     *
     * @param messageId - The id of the Message to reject.
     */
    rejectMessage(messageId: string): void;
}
export default AbstractMessageManager;
