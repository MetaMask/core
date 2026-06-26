import { isValidHexAddress } from '@metamask/controller-utils';
import { add0x, bytesToHex, remove0x } from '@metamask/utils';

import type { DecryptMessageParams } from './DecryptMessageManager';
import type { EncryptionPublicKeyParams } from './EncryptionPublicKeyManager';

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
