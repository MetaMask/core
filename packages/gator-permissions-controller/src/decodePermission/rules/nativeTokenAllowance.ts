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
 * Creates the native-token-allowance permission rule.
 *
 * This permission shares the same enforcer set as `native-token-periodic` but
 * is distinguished by a `periodDuration` of `UINT256_MAX`, which effectively
 * disables the periodic reset and turns the caveat into a one-off allowance.
 *
 * @param enforcers - Checksummed enforcer addresses for the chain.
 * @returns The native-token-allowance permission rule.
 */
export function makeNativeTokenAllowanceRule(
  enforcers: ChecksumEnforcersByChainId,
): PermissionRule {
  const {
    timestampEnforcer,
    nativeTokenPeriodicEnforcer,
    exactCalldataEnforcer,
    nonceEnforcer,
    redeemerEnforcer,
  } = enforcers;
  return makePermissionRule({
    permissionType: 'native-token-allowance',
    optionalEnforcers: [timestampEnforcer, redeemerEnforcer],
    redeemerEnforcer,
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
 * Decodes native-token-allowance permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param enforcers - Addresses of the enforcers.
 * @param enforcers.nativeTokenPeriodicEnforcer - Address of the NativeTokenPeriodicEnforcer.
 * @param enforcers.exactCalldataEnforcer - Address of the ExactCalldataEnforcer.
 * @returns Decoded allowance terms.
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
    throw new Error('Invalid native-token-allowance terms: expected 96 bytes');
  }

  const [allowanceAmount, periodDurationRaw, startTimeRaw] = splitHex(
    terms,
    [32, 32, 32],
  );

  if (periodDurationRaw.toLowerCase() !== UINT256_MAX) {
    throw new Error(
      'Invalid native-token-allowance terms: periodDuration must be UINT256_MAX',
    );
  }

  const startTime = hexToNumber(startTimeRaw);

  if (startTime === 0) {
    throw new Error(
      'Invalid native-token-allowance terms: startTime must be a positive number',
    );
  }

  if (allowanceAmount === ZERO_32_BYTES) {
    throw new Error(
      'Invalid native-token-allowance terms: allowanceAmount must be a positive number',
    );
  }

  return { allowanceAmount, startTime };
}
