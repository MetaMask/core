import AbstractMessageManager, { AbstractMessage, AbstractMessageParams, AbstractMessageParamsMetamask, OriginalRequest } from './AbstractMessageManager';
/**
 * @type TypedMessage
 *
 * Represents and contains data about an 'eth_signTypedData' type signature request.
 * These are created when a signature for an eth_signTypedData call is requested.
 *
 * @property id - An id to track and identify the message object
 * @property error - Error corresponding to eth_signTypedData error in failure case
 * @property messageParams - The parameters to pass to the eth_signTypedData method once
 * the signature request is approved
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'TypedMessage' which always has a 'eth_signTypedData' type
 * @property rawSig - Raw data of the signature request
 */
export interface TypedMessage extends AbstractMessage {
    error?: string;
    messageParams: TypedMessageParams;
    time: number;
    status: string;
    type: string;
    rawSig?: string;
}
/**
 * @type TypedMessageParams
 *
 * Represents the parameters to pass to the eth_signTypedData method once the signature request is approved.
 *
 * @property data - A hex string conversion of the raw buffer or an object containing data of the signature
 * request depending on version
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface TypedMessageParams extends AbstractMessageParams {
    data: Record<string, unknown>[] | string;
}
/**
 * @type TypedMessageParamsMetamask
 *
 * Represents the parameters to pass to the eth_signTypedData method once the signature request is approved
 * plus data added by MetaMask.
 *
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property data - A hex string conversion of the raw buffer or an object containing data of the signature
 * request depending on version
 * @property error? - Added for message errored
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 * @property version - Compatibility version EIP712
 */
export interface TypedMessageParamsMetamask extends AbstractMessageParamsMetamask {
    data: Record<string, unknown>[] | string;
    metamaskId?: string;
    error?: string;
    version?: string;
}
/**
 * Controller in charge of managing - storing, adding, removing, updating - TypedMessages.
 */
export declare class TypedMessageManager extends AbstractMessageManager<TypedMessage, TypedMessageParams, TypedMessageParamsMetamask> {
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a new TypedMessage with an 'unapproved' status using the passed messageParams.
     * this.addMessage is called to add the new TypedMessage to this.messages, and to save the unapproved TypedMessages.
     *
     * @param messageParams - The params for the eth_signTypedData call to be made after the message is approved
     * @param version - Compatibility version EIP712
     * @param req? - The original request object possibly containing the origin
     * @returns - Promise resolving to the raw data of the signature request
     */
    addUnapprovedMessageAsync(messageParams: TypedMessageParams, version: string, req?: OriginalRequest): Promise<string>;
    /**
     * Creates a new TypedMessage with an 'unapproved' status using the passed messageParams.
     * this.addMessage is called to add the new TypedMessage to this.messages, and to save the
     * unapproved TypedMessages.
     *
     * @param messageParams - The params for the 'eth_signTypedData' call to be made after the message
     * is approved
     * @param version - Compatibility version EIP712
     * @param req? - The original request object possibly containing the origin
     * @returns - The id of the newly created TypedMessage
     */
    addUnapprovedMessage(messageParams: TypedMessageParams, version: string, req?: OriginalRequest): string;
    /**
     * Sets a TypedMessage status to 'errored' via a call to this.setMessageStatus.
     *
     * @param messageId - The id of the TypedMessage to error
     * @param error - The error to be included in TypedMessage
     */
    setMessageStatusErrored(messageId: string, error: string): void;
    /**
     * Removes the metamaskId and version properties from passed messageParams and returns a promise which
     * resolves the updated messageParams
     *
     * @param messageParams - The messageParams to modify
     * @returns - Promise resolving to the messageParams with the metamaskId and version properties removed
     */
    prepMessageForSigning(messageParams: TypedMessageParamsMetamask): Promise<TypedMessageParams>;
}
export default TypedMessageManager;
