import { DEFAULT_MAX_MESSAGE_AGE } from './constants.js';
import {
  getDelegationMfaRequirement,
  parseDelegationTypedData,
} from './delegation.js';
import { getEip7702AuthorizationMfaRequirement } from './eip7702-authorization.js';
import {
  hashDelegationTypedData,
  hashEip7702Authorization,
  hashPersonalMessage,
} from './hashes.js';
import { getPersonalMessageMfaRequirement } from './personal-message.js';
import type {
  GetMfaRequirementOptions,
  MfaRequirement,
  MfaWhitelistConfig,
  MoneyAccountSigningRequest,
} from './types.js';
import { isAddress, isSameHex, requireMfa } from './utils.js';

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/u;

/**
 * Requires a whitelisted request to hash to the hash being signed, so that a
 * whitelisted request can't be used to get a different hash signed.
 *
 * @param requirement - The requirement of the request.
 * @param hash - The hash being signed.
 * @param getRequestHash - Computes the hash of the request.
 * @returns The requirement, or one requiring MFA if the hashes differ.
 */
function bindToHash(
  requirement: MfaRequirement,
  hash: string,
  getRequestHash: () => string,
): MfaRequirement {
  if (requirement.mfaRequired || isSameHex(getRequestHash(), hash)) {
    return requirement;
  }
  return requireMfa('Hash does not match the request');
}

/**
 * Determines whether signing a hash for the Money Account requires MFA, or
 * whether the request it was computed from matches a whitelisted payload
 * that may be signed without it.
 *
 * The backend uses this to decide whether to require an MFA token, and
 * clients use it to decide whether to prompt for MFA before requesting the
 * signature. A request is only whitelisted if it hashes to `hash`, so the
 * backend can sign `hash` after inspecting the request. Every request that
 * doesn't match a whitelist rule requires MFA, including malformed ones; the
 * function never throws.
 *
 * The backend must also check that `request.address` is the account whose
 * key signs the hash.
 *
 * Clients should still handle the backend requiring MFA for a request they
 * expected to be whitelisted, e.g. when their clock or config differs.
 *
 * @param signingRequest - The signing request.
 * @param signingRequest.hash - The 32-byte hash to sign.
 * @param signingRequest.request - The signature request the hash was
 * computed from.
 * @param config - The pinned whitelist config.
 * @param options - Options.
 * @param options.now - The current time in milliseconds. Defaults to
 * `Date.now()`.
 * @returns Whether MFA is required, and the matched rule or the reason.
 */
export function getMfaRequirement(
  signingRequest: MoneyAccountSigningRequest,
  config: MfaWhitelistConfig,
  { now = Date.now() }: GetMfaRequirementOptions = {},
): MfaRequirement {
  try {
    const { hash, request } = signingRequest;
    if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) {
      return requireMfa('Hash is not 32 bytes');
    }

    const { address } = request;
    if (!isAddress(address)) {
      return requireMfa('Request address is not an address');
    }

    switch (request.method) {
      case 'signPersonalMessage':
        return bindToHash(
          getPersonalMessageMfaRequirement(request.message, {
            address,
            config,
            maxMessageAge: config.maxMessageAge ?? DEFAULT_MAX_MESSAGE_AGE,
            now,
          }),
          hash,
          () => hashPersonalMessage(request.message),
        );
      case 'signTypedData': {
        if (request.version !== 'V4') {
          return requireMfa('Only typed data V4 can be whitelisted');
        }
        const delegation = parseDelegationTypedData(request.data, config);
        if (typeof delegation === 'string') {
          return requireMfa(delegation);
        }
        return bindToHash(
          getDelegationMfaRequirement(delegation, { address, config }),
          hash,
          () => hashDelegationTypedData(delegation, config),
        );
      }
      case 'signEip7702Authorization':
        return bindToHash(
          getEip7702AuthorizationMfaRequirement(request.authorization, config),
          hash,
          () => hashEip7702Authorization(request.authorization),
        );
      default:
        return requireMfa('Request method is not supported');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return requireMfa(`Request is malformed: ${message}`);
  }
}
