import { ParsedMessage } from '@spruceid/siwe-parser';
import { bytesToString, hexToBytes } from '@metamask/utils';

const msgHexToText = (hex: string): string => {
  try {
    const bytes = hexToBytes(hex);
    return bytes.length === 32 ? hex : bytesToString(bytes);
  } catch (e) {
    return hex;
  }
};

/**
 * A locally defined object used to provide data to identify a Sign-In With Ethereum (SIWE)(EIP-4361) message and provide the parsed message
 *
 * @typedef localSIWEObject
 * @param {boolean} isSIWEMessage - Does the intercepted message conform to the SIWE specification?
 * @param {ParsedMessage} parsedMessage - The data parsed out of the message
 */
export interface SIWEMessage {
  isSIWEMessage: boolean;
  parsedMessage: ParsedMessage | null;
}

/**
 * This function intercepts a sign message, detects if it's a
 * Sign-In With Ethereum (SIWE)(EIP-4361) message, and returns an object with
 * relevant SIWE data.
 *
 * {@see {@link https://eips.ethereum.org/EIPS/eip-4361}}
 *
 * @param msgParams - The params of the message to sign
 * @param msgParams.data - The data of the message to sign
 * @returns An object with the relevant SIWE data
 */
export const detectSIWE = (msgParams: { data: string }): SIWEMessage => {
  try {
    const { data } = msgParams;
    const message = msgHexToText(data);
    const parsedMessage = new ParsedMessage(message);

    return {
      isSIWEMessage: true,
      parsedMessage,
    };
  } catch (error) {
    // ignore error, it's not a valid SIWE message
    return {
      isSIWEMessage: false,
      parsedMessage: null,
    };
  }
};
