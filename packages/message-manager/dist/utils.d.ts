import { MessageParams } from './MessageManager';
import { PersonalMessageParams } from './PersonalMessageManager';
import { TypedMessageParams } from './TypedMessageManager';
/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex.
 * @returns A hex string conversion of the buffer data.
 */
export declare function normalizeMessageData(data: string): string;
/**
 * Validates a PersonalMessageParams and MessageParams objects for required properties and throws in
 * the event of any validation error.
 *
 * @param messageData - PersonalMessageParams object to validate.
 */
export declare function validateSignMessageData(messageData: PersonalMessageParams | MessageParams): void;
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
 */
export declare function validateTypedSignMessageDataV3(messageData: TypedMessageParams): void;
