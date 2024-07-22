import type { AbstractMessage, AbstractMessageParams, AbstractMessageParamsMetamask, OriginalRequest } from './AbstractMessageManager';
import { AbstractMessageManager } from './AbstractMessageManager';
/**
 * @type EncryptionPublicKey
 *
 * Represents and contains data about a 'eth_getEncryptionPublicKey' type request.
 * These are created when an encryption public key is requested.
 * @property id - An id to track and identify the message object
 * @property messageParams - The parameters to pass to the eth_getEncryptionPublicKey method once the request is approved
 * @property type - The json-prc method for which an encryption public key request has been made.
 * A 'Message' which always has a 'eth_getEncryptionPublicKey' type
 * @property rawSig - Encryption public key
 */
export interface EncryptionPublicKey extends AbstractMessage {
    messageParams: EncryptionPublicKeyParams;
}
/**
 * @type EncryptionPublicKeyParams
 *
 * Represents the parameters to pass to the method once the request is approved.
 * @property from - Address from which to extract the encryption public key
 * @property origin? - Added for request origin identification
 */
export type EncryptionPublicKeyParams = AbstractMessageParams;
/**
 * @type MessageParamsMetamask
 *
 * Represents the parameters to pass to the eth_getEncryptionPublicKey method once the request is approved
 * plus data added by MetaMask.
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property data - Encryption public key
 * @property from - Address from which to extract the encryption public key
 * @property origin? - Added for request origin identification
 */
export interface EncryptionPublicKeyParamsMetamask extends AbstractMessageParamsMetamask {
    data: string;
}
/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
export declare class EncryptionPublicKeyManager extends AbstractMessageManager<EncryptionPublicKey, EncryptionPublicKeyParams, EncryptionPublicKeyParamsMetamask> {
    /**
     * Name of this controller used during composition
     */
    name: "EncryptionPublicKeyManager";
    /**
     * Creates a new Message with an 'unapproved' status using the passed messageParams.
     * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
     *
     * @param messageParams - The params for the eth_getEncryptionPublicKey call to be made after the message is approved.
     * @param req - The original request object possibly containing the origin.
     * @returns Promise resolving to the raw data of the request.
     */
    addUnapprovedMessageAsync(messageParams: EncryptionPublicKeyParams, req?: OriginalRequest): Promise<string>;
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
    addUnapprovedMessage(messageParams: EncryptionPublicKeyParams, req?: OriginalRequest): Promise<string>;
    /**
     * Removes the metamaskId property from passed messageParams and returns a promise which
     * resolves the updated messageParams.
     *
     * @param messageParams - The messageParams to modify.
     * @returns Promise resolving to the messageParams with the metamaskId property removed.
     */
    prepMessageForSigning(messageParams: EncryptionPublicKeyParamsMetamask): Promise<EncryptionPublicKeyParams>;
}
export default EncryptionPublicKeyManager;
//# sourceMappingURL=EncryptionPublicKeyManager.d.ts.map