import { hexToNumber } from '@metamask/utils';

import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
  PermissionRule,
} from '../types';
import {
  getByteLength,
  getTermsByEnforcer,
  splitHex,
  UINT256_MAX,
  ZERO_32_BYTES,
} from '../utils';
import { makePermissionRule } from './makePermissionRule';

/**
 * Creates the erc20-token-allowance permission rule.
 *
 * This permission shares the same enforcer set as `erc20-token-periodic` but
 * is distinguished by a `periodDuration` of `UINT256_MAX`, which effectively
 * disables the periodic reset and turns the caveat into a one-off allowance.
 *
 * @param enforcers - Checksummed enforcer addresses for the chain.
 * @returns The erc20-token-allowance permission rule.
 */
export function makeErc20TokenAllowanceRule(
  enforcers: ChecksumEnforcersByChainId,
): PermissionRule {
  const {
    timestampEnforcer,
    erc20PeriodicEnforcer,
    valueLteEnforcer,
    nonceEnforcer,
    redeemerEnforcer,
  } = enforcers;
  return makePermissionRule({
    permissionType: 'erc20-token-allowance',
    optionalEnforcers: [timestampEnforcer, redeemerEnforcer],
    redeemerEnforcer,
    timestampEnforcer,
    requiredEnforcers: {
      [erc20PeriodicEnforcer]: 1,
      [valueLteEnforcer]: 1,
      [nonceEnforcer]: 1,
    },
    validateAndDecodeData: (caveats) =>
      validateAndDecodeData(caveats, {
        erc20PeriodicEnforcer,
        valueLteEnforcer,
      }),
  });
}

/**
 * Decodes erc20-token-allowance permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param enforcers - Addresses of the enforcers.
 * @param enforcers.erc20PeriodicEnforcer - Address of the ERC20PeriodicEnforcer.
 * @param enforcers.valueLteEnforcer - Address of the ValueLteEnforcer.
 * @returns Decoded allowance terms.
 */
function validateAndDecodeData(
  caveats: ChecksumCaveat[],
  enforcers: Pick<
    ChecksumEnforcersByChainId,
    'erc20PeriodicEnforcer' | 'valueLteEnforcer'
  >,
): DecodedPermission['permission']['data'] {
  const { erc20PeriodicEnforcer, valueLteEnforcer } = enforcers;

  const valueLteTerms = getTermsByEnforcer({
    caveats,
    enforcer: valueLteEnforcer,
  });
  if (valueLteTerms !== ZERO_32_BYTES) {
    throw new Error(`Invalid value-lte terms: must be ${ZERO_32_BYTES}`);
  }

  const terms = getTermsByEnforcer({
    caveats,
    enforcer: erc20PeriodicEnforcer,
  });

  const EXPECTED_TERMS_BYTELENGTH = 116; // 20 + 32 + 32 + 32

  if (getByteLength(terms) !== EXPECTED_TERMS_BYTELENGTH) {
    throw new Error('Invalid erc20-token-allowance terms: expected 116 bytes');
  }

  const [tokenAddress, allowanceAmount, periodDurationRaw, startTimeRaw] =
    splitHex(terms, [20, 32, 32, 32]);

  if (periodDurationRaw.toLowerCase() !== UINT256_MAX) {
    throw new Error(
      'Invalid erc20-token-allowance terms: periodDuration must be UINT256_MAX',
    );
  }

  const startTime = hexToNumber(startTimeRaw);

  if (startTime === 0) {
    throw new Error(
      'Invalid erc20-token-allowance terms: startTime must be a positive number',
    );
  }

  if (allowanceAmount === ZERO_32_BYTES) {
    throw new Error(
      'Invalid erc20-token-allowance terms: allowanceAmount must be a positive number',
    );
  }

  return { tokenAddress, allowanceAmount, startTime };
}
