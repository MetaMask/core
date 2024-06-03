import { isValidHexAddress } from '@metamask/controller-utils';
import {
  TYPED_MESSAGE_SCHEMA,
  typedSignatureHash,
} from '@metamask/eth-sig-util';
import type { Hex } from '@metamask/utils';
import { add0x, bytesToHex, remove0x } from '@metamask/utils';
import { validate } from 'jsonschema';

import type { DecryptMessageParams } from './DecryptMessageManager';
import type { EncryptionPublicKeyParams } from './EncryptionPublicKeyManager';
import type { PersonalMessageParams } from './PersonalMessageManager';
import type { TypedMessageParams } from './TypedMessageManager';

const hexRe = /^[0-9A-Fa-f]+$/gu;
/**
 * Validates an address string and throws in the event of any validation error.
 *
 * @param address - The address to validate.
 * @param propertyName - The name of the property source to use in the error message.
 */
function validateAddress(address: string, propertyName: string) {
  if (!address || typeof address !== 'string' || !isValidHexAddress(address)) {
    throw new Error(
      `Invalid "${propertyName}" address: ${address} must be a valid string.`,
    );
  }
}

/**
 * A helper function that converts rawmessageData buffer data to a hex, or just returns the data if
 * it is already formatted as a hex.
 *
 * @param data - The buffer data to convert to a hex.
 * @returns A hex string conversion of the buffer data.
 */
export function normalizeMessageData(data: string) {
  try {
    const stripped = remove0x(data);
    if (stripped.match(hexRe)) {
      return add0x(stripped);
    }
  } catch (e) {
    /* istanbul ignore next */
  }
  return bytesToHex(Buffer.from(data, 'utf8'));
}

/**
 * Validates a PersonalMessageParams objects for required properties and throws in
 * the event of any validation error.
 *
 * @param messageData - PersonalMessageParams object to validate.
 */
export function validateSignMessageData(messageData: PersonalMessageParams) {
  const { from, data } = messageData;
  validateAddress(from, 'from');

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
  validateAddress(messageData.from, 'from');

  if (!messageData.data || !Array.isArray(messageData.data)) {
    throw new Error(
      `Invalid message "data": ${messageData.data} must be a valid array.`,
    );
  }

  try {
    // typedSignatureHash will throw if the data is invalid.
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * @param currentChainId - The current chainId.
 */
export function validateTypedSignMessageDataV3V4(
  messageData: TypedMessageParams,
  currentChainId: Hex | undefined,
) {
  validateAddress(messageData.from, 'from');

  if (
    !messageData.data ||
    Array.isArray(messageData.data) ||
    (typeof messageData.data !== 'object' &&
      typeof messageData.data !== 'string')
  ) {
    throw new Error(
      `Invalid message "data": Must be a valid string or object.`,
    );
  }

  let data;
  if (typeof messageData.data === 'object') {
    data = messageData.data;
  } else {
    try {
      data = JSON.parse(messageData.data);
    } catch (e) {
      throw new Error('Data must be passed as a valid JSON string.');
    }
  }

  const validation = validate(data, TYPED_MESSAGE_SCHEMA);
  if (validation.errors.length > 0) {
    throw new Error(
      'Data must conform to EIP-712 schema. See https://git.io/fNtcx.',
    );
  }

  if (!currentChainId) {
    throw new Error('Current chainId cannot be null or undefined.');
  }

  let { chainId } = data.domain;
  if (chainId) {
    if (typeof chainId === 'string') {
      chainId = parseInt(chainId, chainId.startsWith('0x') ? 16 : 10);
    }

    const activeChainId = parseInt(currentChainId, 16);
    if (Number.isNaN(activeChainId)) {
      throw new Error(
        `Cannot sign messages for chainId "${chainId}", because MetaMask is switching networks.`,
      );
    }

    if (chainId !== activeChainId) {
      throw new Error(
        `Provided chainId "${chainId}" must match the active chainId "${activeChainId}"`,
      );
    }
  }
}

/**
 * Validates messageData for the eth_getEncryptionPublicKey message and throws in
 * the event of any validation error.
 *
 * @param messageData - address string to validate.
 */
export function validateEncryptionPublicKeyMessageData(
  messageData: EncryptionPublicKeyParams,
) {
  const { from } = messageData;
  validateAddress(from, 'from');
}

/**
 * Validates messageData for the eth_decrypt message and throws in
 * the event of any validation error.
 *
 * @param messageData - address string to validate.
 */
export function validateDecryptedMessageData(
  messageData: DecryptMessageParams,
) {
  const { from } = messageData;
  validateAddress(from, 'from');
}
