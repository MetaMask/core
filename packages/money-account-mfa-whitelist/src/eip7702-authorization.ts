import { hexToNumber } from '@metamask/utils';

import type { MfaRequirement, MfaWhitelistConfig } from './types.js';
import { isAddress, isSameHex, requireMfa, whitelisted } from './utils.js';

/**
 * Determines whether an EIP-7702 authorization requires MFA.
 *
 * An authorization to the pinned `EIP7702StatelessDeleGatorImpl` on the Money
 * Account chain is whitelisted: it grants nobody else any authority, because
 * the account still only acts on signatures from the Money Account key. An
 * authorization to any other contract could hand over the account, and one
 * for chain `0` is valid on every chain.
 *
 * @param authorization - The `[chainId, contractAddress, nonce]` tuple.
 * @param config - The whitelist config.
 * @returns Whether MFA is required.
 */
export function getEip7702AuthorizationMfaRequirement(
  authorization: unknown,
  config: MfaWhitelistConfig,
): MfaRequirement {
  if (!Array.isArray(authorization) || authorization.length !== 3) {
    return requireMfa('Authorization is not a [chainId, address, nonce] tuple');
  }

  const [chainId, contractAddress, nonce] = authorization as unknown[];

  if (chainId === 0 || chainId !== hexToNumber(config.chainId)) {
    return requireMfa('Authorization is not for the Money Account chain');
  }
  if (
    !isAddress(contractAddress) ||
    !isSameHex(contractAddress, config.contracts.EIP7702StatelessDeleGatorImpl)
  ) {
    return requireMfa(
      'Authorization does not delegate to the pinned DeleGator',
    );
  }
  if (!Number.isSafeInteger(nonce) || (nonce as number) < 0) {
    return requireMfa('Authorization nonce is not a non-negative integer');
  }

  return whitelisted('eip7702-authorization');
}
