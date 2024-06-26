import { add0x, isValidHexAddress, isStrictHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';

type EIP712Domain = {
  verifyingContract: string;
};

type SignTypedMessageDataV3V4 = {
  types: Record<string, unknown>;
  domain: EIP712Domain;
  primaryType: string;
  message: unknown;
};

/**
 * Normalizes the messageData for the eth_signTypedData
 *
 * @param messageData - The messageData to normalize.
 * @returns The normalized messageData.
 */
export function normalizeTypedMessage(messageData: string) {
  let data;
  try {
    data = parseTypedMessage(messageData);
  } catch (e) {
    // Ignore normalization errors and pass the message as is
    return messageData;
  }

  const { verifyingContract } = data.domain ?? {};

  if (!verifyingContract) {
    return messageData;
  }

  data.domain.verifyingContract = normalizeContractAddress(verifyingContract);

  return JSON.stringify(data);
}

/**
 * Parses the messageData to obtain the data object for EIP712 normalization
 *
 * @param data - The messageData to parse.
 * @returns The data object for EIP712 normalization.
 */
function parseTypedMessage(data: string) {
  if (typeof data !== 'string') {
    return data;
  }

  return JSON.parse(data) as unknown as SignTypedMessageDataV3V4;
}

/**
 * Normalizes the address to a hexadecimal format
 *
 * @param address - The address to normalize.
 * @returns The normalized address.
 */
function normalizeContractAddress(address: string): Hex | string {
  if (isStrictHexString(address) && isValidHexAddress(address)) {
    return address;
  }

  // Check if the address is in octal format, convert to hexadecimal
  if (address.startsWith('0o')) {
    // If octal, convert to hexadecimal
    return octalToHex(address);
  }

  // Check if the address is in decimal format, convert to hexadecimal
  try {
    const decimalBN = new BN(address, 10);
    const hexString = decimalBN.toString(16);
    return add0x(hexString);
  } catch (e) {
    // Ignore errors and return the original address
  }

  // Returning the original address without normalization
  return address;
}

function octalToHex(octalAddress: string): Hex {
  const decimalAddress = parseInt(octalAddress.slice(2), 8).toString(16);
  return add0x(decimalAddress);
}
