import { hexToNumber } from '@metamask/utils';

import { makePermissionRule } from './makePermissionRule';
import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
  PermissionRule,
} from '../types';
import { getByteLength, getTermsByEnforcer, splitHex } from '../utils';

/**
 * Creates the native-token-periodic permission rule.
 *
 * @param enforcers - Checksummed enforcer addresses for the chain.
 * @returns The native-token-periodic permission rule.
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
    requiredEnforcers: {
      [nativeTokenPeriodicEnforcer]: 1,
      [exactCalldataEnforcer]: 1,
      [nonceEnforcer]: 1,
    },
    validateAndDecodeData: (caveats) =>
      validateAndDecodeData(caveats, {
        nativeTokenPeriodicEnforcer,
        exactCalldataEnforcer,
      }),
  });
}

/**
 * Decodes native-token-periodic permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param enforcers - Addresses of the enforcers.
 * @param enforcers.nativeTokenPeriodicEnforcer - Address of the NativeTokenPeriodicEnforcer.
 * @param enforcers.exactCalldataEnforcer - Address of the ExactCalldataEnforcer.
 * @returns Decoded periodic terms.
 */
function validateAndDecodeData(
  caveats: ChecksumCaveat[],
  enforcers: Pick<
    ChecksumEnforcersByChainId,
    'nativeTokenPeriodicEnforcer' | 'exactCalldataEnforcer'
  >,
): DecodedPermission['permission']['data'] {
  const { nativeTokenPeriodicEnforcer, exactCalldataEnforcer } = enforcers;

  const exactCalldataTerms = getTermsByEnforcer({
    caveats,
    enforcer: exactCalldataEnforcer,
  });

  if (exactCalldataTerms !== '0x') {
    throw new Error('Invalid exact-calldata terms: must be 0x');
  }

  const terms = getTermsByEnforcer({
    caveats,
    enforcer: nativeTokenPeriodicEnforcer,
  });

  const EXPECTED_TERMS_BYTELENGTH = 96; // 32 + 32 + 32

  if (getByteLength(terms) !== EXPECTED_TERMS_BYTELENGTH) {
    throw new Error('Invalid native-token-periodic terms: expected 96 bytes');
  }

  const [periodAmount, periodDurationRaw, startTimeRaw] = splitHex(
    terms,
    [32, 32, 32],
  );
  const periodDuration = hexToNumber(periodDurationRaw);
  const startTime = hexToNumber(startTimeRaw);

  if (hexToNumber(periodAmount) <= 0) {
    throw new Error(
      'Invalid native-token-periodic terms: periodAmount must be a positive number',
    );
  }

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
