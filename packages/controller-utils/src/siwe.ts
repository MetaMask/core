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
 * @type WrappedSIWERequest
 *
 * Sign-In With Ethereum (SIWE)(EIP-4361) message with request metadata
 * @property {string} from - Subject account address
 * @property {string} origin - The RFC 3986 originating authority of the signing request, including scheme
 * @property {ParsedMessage} siwe - The data parsed from the message
 */
export interface WrappedSIWERequest {
  from: string;
  origin: string;
  siwe: SIWEMessage;
}

interface HostParts extends DomainParts {
  scheme: string;
}

interface DomainParts {
  userinfo: string | null;
  host: string;
  port: number | null;
}

export const ORIGIN_REGEX =
  /^(?<scheme>[^:/]+):\/\/((?<userinfo>[^@]*)@)?(?<host>[^:@/?]+)(:(?<port>[0-9]+))?/u;
export const DOMAIN_REGEX =
  /^((?<userinfo>[^@]*)@)?(?<host>[^:@/?]+)(:(?<port>[0-9]+))?$/u;
const DEFAULT_PORTS_BY_SCHEME = {
  http: 80,
  https: 443,
} as { [key: string]: number | undefined };

/**
 * Parses parts from RFC 3986 authority from environment relevant for EIP-4361 origin validation.
 *
 * @param authority - input string
 * @returns parsed parts
 */
export const parseAuthorityParts = (authority: string): HostParts => {
  const match = authority.match(ORIGIN_REGEX);
  if (!match) {
    throw new Error(`Unrecognized origin format "${origin}".`);
  }
  const { scheme, userinfo, host, port } = match.groups as {
    scheme: string;
    userinfo: string | undefined;
    host: string;
    port: string | undefined;
  };
  return {
    scheme,
    // strip password from userinfo
    userinfo: userinfo ? userinfo.replace(/:.*$/u, '') : null,
    host,
    port: port ? parseInt(port) : DEFAULT_PORTS_BY_SCHEME[scheme] || null,
  };
};

/**
 * Parses parts from RFC 3986 authority from EIP-4361 `domain` field.
 *
 * @param domain - input string
 * @returns parsed parts
 */
export const parseDomainParts = (domain: string): DomainParts => {
  const match = domain.match(DOMAIN_REGEX);
  if (!match) {
    throw new Error(`Unrecognized domain format "${domain}".`);
  }
  const { userinfo, host, port } = match.groups as {
    userinfo: string | undefined;
    host: string;
    port: string | undefined;
  };
  return {
    // strip password from userinfo
    userinfo: userinfo ? userinfo.replace(/:.*$/u, '') : null,
    host,
    port: port ? parseInt(port) : null,
  };
};

/**
 * Validates origin of a Sign-In With Ethereum (SIWE)(EIP-4361) request.
 *
 * @param req - Signature request
 * @returns true if origin matches domain; false otherwise
 */
export const isValidSIWEOrigin = (req: WrappedSIWERequest): boolean => {
  const { origin, siwe } = req;

  // origin = scheme://[user[:password]@]domain[:port]
  // origin is supplied by environment and must match domain claim in message
  if (!origin || !siwe?.parsedMessage?.domain) {
    return false;
  }

  // TOREVIEW: Handle error and log here instead of propagating?
  const originParts = parseAuthorityParts(origin);
  const domainParts = parseDomainParts(siwe.parsedMessage.domain);

  if (domainParts.host !== originParts.host) {
    return false;
  }

  if (domainParts.port !== null && domainParts.port !== originParts.port) {
    return false;
  }

  if (
    domainParts.userinfo !== null &&
    domainParts.userinfo !== originParts.userinfo
  ) {
    return false;
  }

  return true;
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
