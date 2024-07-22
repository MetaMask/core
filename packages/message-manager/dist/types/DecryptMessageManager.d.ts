import type { AbstractMessage, AbstractMessageParams, AbstractMessageParamsMetamask, OriginalRequest } from './AbstractMessageManager';
import { AbstractMessageManager } from './AbstractMessageManager';
/**
 * @type DecryptMessage
 *
 * Represents and contains data about a 'eth_decrypt' type signature request.
 * These are created when a signature for an eth_decrypt call is requested.
 * @property id - An id to track and identify the message object
 * @property messageParams - The parameters to pass to the eth_decrypt method once the request is approved
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'DecryptMessage' which always has a 'eth_decrypt' type
 */
export interface DecryptMessage extends AbstractMessage {
    messageParams: DecryptMessageParams;
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
export interface DecryptMessageParamsMetamask extends AbstractMessageParamsMetamask {
    data: string;
}
/**
 * Controller in charge of managing - storing, adding, removing, updating - DecryptMessages.
 */
export declare class DecryptMessageManager extends AbstractMessageManager<DecryptMessage, DecryptMessageParams, DecryptMessageParamsMetamask> {
    /**
     * Name of this controller used during composition
     */
    name: "DecryptMessageManager";
    /**
     * Creates a new Message with an 'unapproved' status using the passed messageParams.
     * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
     *
     * @param messageParams - The params for the personal_sign call to be made after the message is approved.
     * @param req - The original request object possibly containing the origin.
     * @returns Promise resolving to the raw data of the signature request.
     */
    addUnapprovedMessageAsync(messageParams: DecryptMessageParams, req?: OriginalRequest): Promise<string>;
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
    addUnapprovedMessage(messageParams: DecryptMessageParams, req?: OriginalRequest): Promise<string>;
    /**
     * Removes the metamaskId property from passed messageParams and returns a promise which
     * resolves the updated messageParams.
     *
     * @param messageParams - The messageParams to modify.
     * @returns Promise resolving to the messageParams with the metamaskId property removed.
     */
    prepMessageForSigning(messageParams: DecryptMessageParamsMetamask): Promise<DecryptMessageParams>;
}
//# sourceMappingURL=DecryptMessageManager.d.ts.map