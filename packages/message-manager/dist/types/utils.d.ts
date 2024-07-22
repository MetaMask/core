import type { Hex } from '@metamask/utils';
import type { DecryptMessageParams } from './DecryptMessageManager';
import type { EncryptionPublicKeyParams } from './EncryptionPublicKeyManager';
import type { PersonalMessageParams } from './PersonalMessageManager';
import type { TypedMessageParams } from './TypedMessageManager';
/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex.
 * @returns A hex string conversion of the buffer data.
 */
export declare function normalizeMessageData(data: string): `0x${string}`;
/**
 * Validates a PersonalMessageParams objects for required properties and throws in
 * the event of any validation error.
 *
 * @param messageData - PersonalMessageParams object to validate.
 */
export declare function validateSignMessageData(messageData: PersonalMessageParams): void;
/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V1.
 *
 * @param messageData - TypedMessageParams object to validate.
 */
export declare function validateTypedSignMessageDataV1(messageData: TypedMessageParams): void;
/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V3.
 *
 * @param messageData - TypedMessageParams object to validate.
 * @param currentChainId - The current chainId.
 */
export declare function validateTypedSignMessageDataV3V4(messageData: TypedMessageParams, currentChainId: Hex | undefined): void;
/**
 * Validates messageData for the eth_getEncryptionPublicKey message and throws in
 * the event of any validation error.
 *
 * @param messageData - address string to validate.
 */
export declare function validateEncryptionPublicKeyMessageData(messageData: EncryptionPublicKeyParams): void;
/**
 * Validates messageData for the eth_decrypt message and throws in
 * the event of any validation error.
 *
 * @param messageData - address string to validate.
 */
export declare function validateDecryptedMessageData(messageData: DecryptMessageParams): void;
//# sourceMappingURL=utils.d.ts.map