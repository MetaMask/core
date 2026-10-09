import { DEFAULT_MAX_MESSAGE_AGE } from './constants.js';
import { getDelegationMfaRequirement } from './delegation.js';
import { getEip7702AuthorizationMfaRequirement } from './eip7702-authorization.js';
import { getPersonalMessageMfaRequirement } from './personal-message.js';
import type {
  GetMfaRequirementOptions,
  MfaRequirement,
  MfaWhitelistConfig,
  MoneyAccountSignatureRequest,
} from './types.js';
import { isAddress, requireMfa } from './utils.js';

/**
 * Determines whether a Money Account signature request requires MFA, or
 * matches a whitelisted payload that may be signed without it.
 *
 * The backend uses this to decide whether to require an MFA token, and
 * clients use it to decide whether to prompt for MFA before requesting the
 * signature. Every request that doesn't match a whitelist rule requires MFA,
 * including malformed ones; the function never throws.
 *
 * Clients should still handle the backend requiring MFA for a request they
 * expected to be whitelisted, e.g. when their clock or config differs.
 *
 * @param request - The signature request.
 * @param config - The pinned whitelist config.
 * @param options - Options.
 * @param options.now - The current time in milliseconds. Defaults to
 * `Date.now()`.
 * @returns Whether MFA is required, and the matched rule or the reason.
 */
export function getMfaRequirement(
  request: MoneyAccountSignatureRequest,
  config: MfaWhitelistConfig,
  { now = Date.now() }: GetMfaRequirementOptions = {},
): MfaRequirement {
  try {
    const { address } = request;
    if (!isAddress(address)) {
      return requireMfa('Request address is not an address');
    }

    switch (request.method) {
      case 'signPersonalMessage':
        return getPersonalMessageMfaRequirement(request.message, {
          address,
          config,
          maxMessageAge: config.maxMessageAge ?? DEFAULT_MAX_MESSAGE_AGE,
          now,
        });
      case 'signTypedData':
        return request.version === 'V4'
          ? getDelegationMfaRequirement(request.data, { address, config })
          : requireMfa('Only typed data V4 can be whitelisted');
      case 'signEip7702Authorization':
        return getEip7702AuthorizationMfaRequirement(
          request.authorization,
          config,
        );
      default:
        return requireMfa('Request method is not supported');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return requireMfa(`Request is malformed: ${message}`);
  }
}
