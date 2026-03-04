import { hexToBigInt, hexToNumber, isHexAddress } from '@metamask/utils';

import { makePermissionRule } from './makePermissionRule';
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
  ZERO_32_BYTES,
} from '../utils';

/**
 * Creates the erc20-token-periodic permission rule.
 *
 * @param enforcers - Checksummed enforcer addresses for the chain.
 * @returns The erc20-token-periodic permission rule.
 */
export function makeErc20TokenPeriodicRule(
  enforcers: ChecksumEnforcersByChainId,
): PermissionRule {
  const {
    timestampEnforcer,
    erc20PeriodicEnforcer,
    valueLteEnforcer,
    nonceEnforcer,
  } = enforcers;
  return makePermissionRule({
    permissionType: 'erc20-token-periodic',
    optionalEnforcers: [timestampEnforcer],
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
 * Decodes erc20-token-periodic permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param enforcers - Addresses of the enforcers.
 * @param enforcers.erc20PeriodicEnforcer - Address of the ERC20PeriodicEnforcer.
 * @param enforcers.valueLteEnforcer - Address of the ValueLteEnforcer.
 * @returns Decoded periodic terms.
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
    throw new Error('Invalid erc20-token-periodic terms: expected 116 bytes');
  }

  const [tokenAddress, periodAmount, periodDurationRaw, startTimeRaw] =
    splitHex(terms, [20, 32, 32, 32]);
  const periodDuration = hexToNumber(periodDurationRaw);
  const startTime = hexToNumber(startTimeRaw);

  if (!isHexAddress(tokenAddress)) {
    throw new Error(
      'Invalid erc20-token-periodic terms: tokenAddress must be a valid hex string',
    );
  }

  if (hexToBigInt(periodAmount) <= 0n) {
    throw new Error(
      'Invalid erc20-token-periodic terms: periodAmount must be a positive number',
    );
  }

  if (periodDuration <= 0) {
    throw new Error(
      'Invalid erc20-token-periodic terms: periodDuration must be a positive number',
    );
  }

  if (startTime <= 0) {
    throw new Error(
      'Invalid erc20-token-periodic terms: startTime must be a positive number',
    );
  }

  return { tokenAddress, periodAmount, periodDuration, startTime };
}
