import { ParsedMessage } from '@spruceid/siwe-parser';
import { isHexPrefixed } from 'ethereumjs-util';
import { projectLogger, createModuleLogger } from './logger';

const log = createModuleLogger(projectLogger, 'detect-siwe');

/**
 * This function strips the hex prefix from a string if it has one.
 *
 * @param str - The string to check
 * @returns The string without the hex prefix
 */
function stripHexPrefix(str: string) {
  if (typeof str !== 'string') {
    return str;
  }
  return isHexPrefixed(str) ? str.slice(2) : str;
}

/**
 * This function converts a hex string to text if it's not a 32 byte hex string.
 *
 * @param hex - The hex string to convert to text
 * @returns The text representation of the hex string
 */
function msgHexToText(hex: string): string {
  try {
    const stripped = stripHexPrefix(hex);
    const buff = Buffer.from(stripped, 'hex');
    return buff.length === 32 ? hex : buff.toString('utf8');
  } catch (e) {
    log(e);
    return hex;
  }
}

/**
 * A locally defined object used to provide data to identify a Sign-In With Ethereum (SIWE)(EIP-4361) message and provide the parsed message
 *
 * @typedef localSIWEObject
 * @param {boolean} isSIWEMessage - Does the intercepted message conform to the SIWE specification?
 * @param {ParsedMessage} parsedMessage - The data parsed out of the message
 */
export type SIWEMessage =
  | { isSIWEMessage: true; parsedMessage: ParsedMessage }
  | { isSIWEMessage: false; parsedMessage: null };

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
