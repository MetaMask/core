import { addHexPrefix, bufferToHex, stripHexPrefix } from 'ethereumjs-util';
import { TYPED_MESSAGE_SCHEMA, typedSignatureHash } from 'eth-sig-util';
import { validate } from 'jsonschema';
import { isValidHexAddress } from '@metamask/controller-utils';
import { MessageParams } from './MessageManager';
import { PersonalMessageParams } from './PersonalMessageManager';
import { TypedMessageParams } from './TypedMessageManager';

const hexRe = /^[0-9A-Fa-f]+$/gu;

/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex.
 * @returns A hex string conversion of the buffer data.
 */
export function normalizeMessageData(data: string) {
  try {
    const stripped = stripHexPrefix(data);
    if (stripped.match(hexRe)) {
      return addHexPrefix(stripped);
    }
  } catch (e) {
    /* istanbul ignore next */
  }
  return bufferToHex(Buffer.from(data, 'utf8'));
}

/**
 * Validates a PersonalMessageParams and MessageParams objects for required properties and throws in
 * the event of any validation error.
 *
 * @param messageData - PersonalMessageParams object to validate.
 */
export function validateSignMessageData(
  messageData: PersonalMessageParams | MessageParams,
) {
  const { from, data } = messageData;
  if (!from || typeof from !== 'string' || !isValidHexAddress(from)) {
    throw new Error(`Invalid "from" address: ${from} must be a valid string.`);
  }

  if (!data || typeof data !== 'string') {
    throw new Error(`Invalid message "data": ${data} must be a valid string.`);
  }
}

/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V1.
 *
 * @param messageData - TypedMessageParams object to validate.
 */
export function validateTypedSignMessageDataV1(
  messageData: TypedMessageParams,
) {
  if (
    !messageData.from ||
    typeof messageData.from !== 'string' ||
    !isValidHexAddress(messageData.from)
  ) {
    throw new Error(
      `Invalid "from" address: ${messageData.from} must be a valid string.`,
    );
  }

  if (!messageData.data || !Array.isArray(messageData.data)) {
    throw new Error(
      `Invalid message "data": ${messageData.data} must be a valid array.`,
    );
  }

  try {
    // typedSignatureHash will throw if the data is invalid.
    typedSignatureHash(messageData.data as any);
  } catch (e) {
    throw new Error(`Expected EIP712 typed data.`);
  }
}

/**
 * Validates a TypedMessageParams object for required properties and throws in
 * the event of any validation error for eth_signTypedMessage_V3.
 *
 * @param messageData - TypedMessageParams object to validate.
 */
export function validateTypedSignMessageDataV3(
  messageData: TypedMessageParams,
) {
  if (
    !messageData.from ||
    typeof messageData.from !== 'string' ||
    !isValidHexAddress(messageData.from)
  ) {
    throw new Error(
      `Invalid "from" address: ${messageData.from} must be a valid string.`,
    );
  }

  if (!messageData.data || typeof messageData.data !== 'string') {
    throw new Error(
      `Invalid message "data": ${messageData.data} must be a valid array.`,
    );
  }
  let data;
  try {
    data = JSON.parse(messageData.data);
  } catch (e) {
    throw new Error('Data must be passed as a valid JSON string.');
  }
  const validation = validate(data, TYPED_MESSAGE_SCHEMA);
  if (validation.errors.length > 0) {
    throw new Error(
      'Data must conform to EIP-712 schema. See https://git.io/fNtcx.',
    );
  }
}
