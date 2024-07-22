/// <reference types="node" />
import type { BaseConfig, BaseState } from '@metamask/base-controller';
import { BaseControllerV1 } from '@metamask/base-controller';
import type { Hex, Json } from '@metamask/utils';
import { EventEmitter } from 'events';
/**
 * @type OriginalRequest
 *
 * Represents the original request object for adding a message.
 * @property origin? - Is it is specified, represents the origin
 */
export interface OriginalRequest {
    origin?: string;
    securityAlertResponse?: Record<string, Json>;
}
/**
 * @type Message
 *
 * Represents and contains data about a signing type signature request.
 * @property id - An id to track and identify the message object
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'Message' which always has a signing type
 * @property rawSig - Raw data of the signature request
 * @property securityProviderResponse - Response from a security provider, whether it is malicious or not
 * @property metadata - Additional data for the message, for example external identifiers
 */
export interface AbstractMessage {
    id: string;
    time: number;
    status: string;
    type: string;
    rawSig?: string;
    securityProviderResponse?: Record<string, Json>;
    securityAlertResponse?: Record<string, Json>;
    metadata?: Json;
    error?: string;
}
/**
 * @type AbstractMessageParams
 *
 * Represents the parameters to pass to the signing method once the signature request is approved.
 * @property from - Address from which the message is processed
 * @property origin? - Added for request origin identification
 * @property deferSetAsSigned? - Whether to defer setting the message as signed immediately after the keyring is told to sign it
 */
export interface AbstractMessageParams {
    from: string;
    origin?: string;
    deferSetAsSigned?: boolean;
}
/**
 * @type MessageParamsMetamask
 *
 * Represents the parameters to pass to the signing method once the signature request is approved
 * plus data added by MetaMask.
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property from - Address from which the message is processed
 * @property origin? - Added for request origin identification
 */
export interface AbstractMessageParamsMetamask extends AbstractMessageParams {
    metamaskId?: string;
}
/**
 * @type MessageManagerState
 *
 * Message Manager state
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
 * A function for verifying a message, whether it is malicious or not
 */
export type SecurityProviderRequest = (requestData: AbstractMessage, messageType: string) => Promise<Json>;
type getCurrentChainId = () => Hex;
/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
export declare abstract class AbstractMessageManager<M extends AbstractMessage, P extends AbstractMessageParams, PM extends AbstractMessageParamsMetamask> extends BaseControllerV1<BaseConfig, MessageManagerState<M>> {
    protected messages: M[];
    protected getCurrentChainId: getCurrentChainId | undefined;
    private readonly securityProviderRequest;
    private readonly additionalFinishStatuses;
    /**
     * Saves the unapproved messages, and their count to state.
     *
     * @param emitUpdateBadge - Whether to emit the updateBadge event.
     */
    protected saveMessageList(emitUpdateBadge?: boolean): void;
    /**
     * Updates the status of a Message in this.messages.
     *
     * @param messageId - The id of the Message to update.
     * @param status - The new status of the Message.
     */
    protected setMessageStatus(messageId: string, status: string): void;
    /**
     * Sets a Message in this.messages to the passed Message if the ids are equal.
     * Then saves the unapprovedMessage list to storage.
     *
     * @param message - A Message that will replace an existing Message (with the id) in this.messages.
     * @param emitUpdateBadge - Whether to emit the updateBadge event.
     */
    protected updateMessage(message: M, emitUpdateBadge?: boolean): void;
    /**
     * Verifies a message is malicious or not by checking it against a security provider.
     *
     * @param message - The message to verify.
     * @returns A promise that resolves to a secured message with additional security provider response data.
     */
    private securityCheck;
    /**
     * EventEmitter instance used to listen to specific message events
     */
    hub: EventEmitter;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates an AbstractMessageManager instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     * @param securityProviderRequest - A function for verifying a message, whether it is malicious or not.
     * @param additionalFinishStatuses - Optional list of statuses that are accepted to emit a finished event.
     * @param getCurrentChainId - Optional function to get the current chainId.
     */
    constructor(config?: Partial<BaseConfig>, state?: Partial<MessageManagerState<M>>, securityProviderRequest?: SecurityProviderRequest, additionalFinishStatuses?: string[], getCurrentChainId?: getCurrentChainId);
    /**
     * A getter for the number of 'unapproved' Messages in this.messages.
     *
     * @returns The number of 'unapproved' Messages in this.messages.
     */
    getUnapprovedMessagesCount(): number;
    /**
     * A getter for the 'unapproved' Messages in state messages.
     *
     * @returns An index of Message ids to Messages, for all 'unapproved' Messages in this.messages.
     */
    getUnapprovedMessages(): {
        [key: string]: M;
    };
    /**
     * Adds a passed Message to this.messages, and calls this.saveMessageList() to save
     * the unapproved Messages from that list to this.messages.
     *
     * @param message - The Message to add to this.messages.
     */
    addMessage(message: M): Promise<void>;
    /**
     * Returns a specified Message.
     *
     * @param messageId - The id of the Message to get.
     * @returns The Message with the id that matches the passed messageId, or undefined
     * if no Message has that id.
     */
    getMessage(messageId: string): M | undefined;
    /**
     * Returns all the messages.
     *
     * @returns An array of messages.
     */
    getAllMessages(): M[];
    /**
     * Approves a Message. Sets the message status via a call to this.setMessageStatusApproved,
     * and returns a promise with any the message params modified for proper signing.
     *
     * @param messageParams - The messageParams to be used when signing method is called,
     * plus data added by MetaMask.
     * @returns Promise resolving to the messageParams with the metamaskId property removed.
     */
    approveMessage(messageParams: PM): Promise<P>;
    /**
     * Sets a Message status to 'approved' via a call to this.setMessageStatus.
     *
     * @param messageId - The id of the Message to approve.
     */
    setMessageStatusApproved(messageId: string): void;
    /**
     * Sets message status to inProgress in order to allow users to use extension
     * while waiting for a custodian signature.
     *
     * @param messageId - The id of the message to set to inProgress
     */
    setMessageStatusInProgress(messageId: string): void;
    /**
     * Sets a Message status to 'signed' via a call to this.setMessageStatus and updates
     * that Message in this.messages by adding the raw signature data of the signature
     * request to the Message.
     *
     * @param messageId - The id of the Message to sign.
     * @param rawSig - The raw data of the signature request.
     */
    setMessageStatusSigned(messageId: string, rawSig: string): void;
    /**
     * Sets the message via a call to this.setResult and updates status of the message.
     *
     * @param messageId - The id of the Message to sign.
     * @param rawSig - The data to update rawSig in the message.
     * @param status - The new message status.
     */
    setMessageStatusAndResult(messageId: string, rawSig: string, status: string): void;
    /**
     * Sets the message result.
     *
     * @param messageId - The id of the Message to sign.
     * @param result - The data to update result in the message.
     */
    setResult(messageId: string, result: string): void;
    /**
     * Sets the messsage metadata
     *
     * @param messageId - The id of the Message to update
     * @param metadata - The data with which to replace the metadata property in the message
     */
    setMetadata(messageId: string, metadata: Json): void;
    /**
     * Removes the metamaskId property from passed messageParams and returns a promise which
     * resolves the updated messageParams
     *
     * @param messageParams - The messageParams to modify
     * @returns Promise resolving to the messageParams with the metamaskId property removed
     */
    abstract prepMessageForSigning(messageParams: PM): Promise<P>;
    /**
     * Creates a new Message with an 'unapproved' status using the passed messageParams.
     * this.addMessage is called to add the new Message to this.messages, and to save the
     * unapproved Messages.
     *
     * @param messageParams - Message parameters for the message to add
     * @param req - The original request object possibly containing the origin.
     * @param version? - The version of the JSON RPC protocol the request is using.
     * @returns The id of the newly created message.
     */
    abstract addUnapprovedMessage(messageParams: PM, request: OriginalRequest, version?: string): Promise<string>;
    /**
     * Sets a Message status to 'rejected' via a call to this.setMessageStatus.
     *
     * @param messageId - The id of the Message to reject.
     */
    rejectMessage(messageId: string): void;
    /**
     * Creates a promise which will resolve or reject when the message process is finished.
     *
     * @param messageParamsWithId - The params for the personal_sign call to be made after the message is approved.
     * @param messageName - The name of the message
     * @returns Promise resolving to the raw data of the signature request.
     */
    waitForFinishStatus(messageParamsWithId: AbstractMessageParamsMetamask, messageName: string): Promise<string>;
}
export default AbstractMessageManager;
//# sourceMappingURL=AbstractMessageManager.d.ts.map