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
 * Creates the native-token-periodic permission rule.
 */
export function makeNativeTokenPeriodicRule(
  enforcers: ChecksumEnforcersByChainId,
): PermissionRule {
  const {
    timestampEnforcer,
    nativeTokenPeriodicEnforcer,
    exactCalldataEnforcer,
    nonceEnforcer,
  } = enforcers;
  return makePermissionRule({
    permissionType: 'native-token-periodic',
    optionalEnforcers: [timestampEnforcer],
    timestampEnforcer,
    requiredEnforcers: new Map<Hex, number>([
      [nativeTokenPeriodicEnforcer, 1],
      [exactCalldataEnforcer, 1],
      [nonceEnforcer, 1],
    ]),
    decodeData: (caveats) =>
      decodeNativePeriodic(caveats, nativeTokenPeriodicEnforcer),
  });
}

/**
 * Decodes native-token-periodic permission data from caveats; throws on invalid.
 */
export function decodeNativePeriodic(
  caveats: ChecksumCaveat[],
  enforcer: Hex,
): DecodedPermission['permission']['data'] {
  const terms = getTermsByEnforcer({ caveats, enforcer });

  const EXPECTED_TERMS_BYTELENGTH = 96; // 32 + 32 + 32

  if (getByteLength(terms) !== EXPECTED_TERMS_BYTELENGTH) {
    throw new Error(
      'Invalid native-token-periodic terms: expected 96 bytes',
    );
  }

  const [periodAmount, periodDurationRaw, startTimeRaw] = splitHex(terms, [
    32, 32, 32,
  ]);
  const periodDuration = hexToNumber(periodDurationRaw);
  const startTime = hexToNumber(startTimeRaw);

  if (periodDuration <= 0) {
    throw new Error(
      'Invalid native-token-periodic terms: periodDuration must be a positive number',
    );
  }

  if (startTime <= 0) {
    throw new Error(
      'Invalid native-token-periodic terms: startTime must be a positive number',
    );
  }

  return { periodAmount, periodDuration, startTime };
}
