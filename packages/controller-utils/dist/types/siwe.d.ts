import { ParsedMessage } from '@spruceid/siwe-parser';
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
interface DomainParts {
    username?: string;
    hostname: string;
    port?: string;
}
/**
 * Parses parts from RFC 3986 authority from EIP-4361 `domain` field.
 *
 * @param domain - input string
 * @param originProtocol - implied protocol from origin
 * @returns parsed parts
 */
export declare const parseDomainParts: (domain: string, originProtocol: string) => DomainParts;
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
export declare const isValidSIWEOrigin: (req: WrappedSIWERequest) => boolean;
/**
 * A locally defined object used to provide data to identify a Sign-In With Ethereum (SIWE)(EIP-4361) message and provide the parsed message
 *
 * @typedef SIWEMessage
 * @param {boolean} isSIWEMessage - Does the intercepted message conform to the SIWE specification?
 * @param {ParsedMessage} parsedMessage - The data parsed out of the message
 */
export type SIWEMessage = {
    isSIWEMessage: true;
    parsedMessage: ParsedMessage;
} | {
    isSIWEMessage: false;
    parsedMessage: null;
};
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
export declare const detectSIWE: (msgParams: {
    data: string;
}) => SIWEMessage;
export {};
//# sourceMappingURL=siwe.d.ts.map