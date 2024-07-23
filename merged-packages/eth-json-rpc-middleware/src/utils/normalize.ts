import type { Hex } from '@metamask/utils';

type EIP712Domain = {
  verifyingContract: Hex;
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
export function parseTypedMessage(data: string) {
  if (typeof data !== 'string') {
    return data;
  }

  return JSON.parse(data) as unknown as SignTypedMessageDataV3V4;
}

/**
 * Normalizes the address to standard hexadecimal format
 *
 * @param address - The address to normalize.
 * @returns The normalized address.
 */
function normalizeContractAddress(address: Hex): Hex {
  if (address.startsWith('0X')) {
    return `0x${address.slice(2)}`;
  }
  return address;
}
