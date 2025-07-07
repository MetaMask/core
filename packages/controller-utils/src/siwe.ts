import { remove0x } from '@metamask/utils';
import { ParsedMessage } from '@spruceid/siwe-parser';

import { projectLogger, createModuleLogger } from './logger';

const log = createModuleLogger(projectLogger, 'detect-siwe');

/**
 * This function strips the hex prefix from a string if it has one.
 * If the input is not a string, return it unmodified.
 *
 * @param str - The string to check
 * @returns The string without the hex prefix
 */
function safeStripHexPrefix(str: string) {
  if (typeof str !== 'string') {
    return str;
  }
  return remove0x(str);
}

/**
 * This function converts a hex string to text if it's not a 32 byte hex string.
 *
 * @param hex - The hex string to convert to text
 * @returns The text representation of the hex string
 */
function msgHexToText(hex: string): string {
  try {
    const stripped = safeStripHexPrefix(hex);
    const buff = Buffer.from(stripped, 'hex');
    return buff.length === 32 ? hex : buff.toString('utf8');
  } catch (e) {
    log(e);
    return hex;
  }
}

/**
 * @type WrappedSIWERequest
 *
 * Sign-In With Ethereum (SIWE)(EIP-4361) message with request metadata
 * @property {string} from - Subject account address
 * @property {string} origin - The RFC 3986 originating authority of the signing request, including scheme
 * @property {ParsedMessage} siwe - The data parsed from the message
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface WrappedSIWERequest {
  from: string;
  origin: string;
  siwe: SIWEMessage;
}

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface DomainParts {
  username?: string;
  hostname: string;
  port?: string;
}

const DEFAULT_PORTS_BY_PROTOCOL = {
  'http:': '80',
  'https:': '443',
} as Record<string, string>;

/**
 * Parses parts from RFC 3986 authority from EIP-4361 `domain` field.
 *
 * @param domain - input string
 * @param originProtocol - implied protocol from origin
 * @returns parsed parts
 */
export const parseDomainParts = (
  domain: string,
  originProtocol: string,
): DomainParts => {
  if (domain.match(/^[^/:]*:\/\//u)) {
    return new URL(domain);
  }
  return new URL(`${originProtocol}//${domain}`);
};

/**
 * Validates origin of a Sign-In With Ethereum (SIWE)(EIP-4361) request.
 * As per spec:
 * hostname must match.
 * port and username must match iff specified.
 * Protocol binding and full same-origin are currently not performed.
 *
 * @param req - Signature request
 * @returns true if origin matches domain; false otherwise
 */
export const isValidSIWEOrigin = (req: WrappedSIWERequest): boolean => {
  try {
    const { origin, siwe } = req;

    // origin = scheme://[user[:password]@]domain[:port]
    // origin is supplied by environment and must match domain claim in message
    if (!origin || !siwe?.parsedMessage?.domain) {
      return false;
    }

    const originParts = new URL(origin);
    const domainParts = parseDomainParts(
      siwe.parsedMessage.domain,
      originParts.protocol,
    );

    if (
      domainParts.hostname.localeCompare(originParts.hostname, undefined, {
        sensitivity: 'accent',
      }) !== 0
    ) {
      return false;
    }

    if (domainParts.port !== '' && domainParts.port !== originParts.port) {
      // If origin port is not specified, protocol default is implied
      return (
        originParts.port === '' &&
        domainParts.port === DEFAULT_PORTS_BY_PROTOCOL[originParts.protocol]
      );
    }

    if (
      domainParts.username !== '' &&
      domainParts.username !== originParts.username
    ) {
      return false;
    }

    return true;
  } catch (e) {
    log(e);
    return false;
  }
};

/**
 * A locally defined object used to provide data to identify a Sign-In With Ethereum (SIWE)(EIP-4361) message and provide the parsed message
 *
 * @typedef SIWEMessage
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
