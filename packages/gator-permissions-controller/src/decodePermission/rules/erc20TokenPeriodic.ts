import { hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
  PermissionRule,
} from '../types';
import { getByteLength, getTermsByEnforcer, splitHex } from '../utils';
import { makePermissionRule } from './makePermissionRule';

/**
 * Creates the erc20-token-periodic permission rule.
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
    requiredEnforcers: new Map<Hex, number>([
      [erc20PeriodicEnforcer, 1],
      [valueLteEnforcer, 1],
      [nonceEnforcer, 1],
    ]),
    decodeData: (caveats) =>
      decodeErc20Periodic(caveats, erc20PeriodicEnforcer),
  });
}

/**
 * Decodes erc20-token-periodic permission data from caveats; throws on invalid.
 */
export function decodeErc20Periodic(
  caveats: ChecksumCaveat[],
  enforcer: Hex,
): DecodedPermission['permission']['data'] {
  const terms = getTermsByEnforcer({ caveats, enforcer });

  const EXPECTED_TERMS_BYTELENGTH = 116; // 20 + 32 + 32 + 32

  if (getByteLength(terms) !== EXPECTED_TERMS_BYTELENGTH) {
    throw new Error(
      'Invalid erc20-token-periodic terms: expected 116 bytes',
    );
  }

  const [tokenAddress, periodAmount, periodDurationRaw, startTimeRaw] =
    splitHex(terms, [20, 32, 32, 32]);
  const periodDuration = hexToNumber(periodDurationRaw);
  const startTime = hexToNumber(startTimeRaw);

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
