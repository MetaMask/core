import { hexToBigInt, hexToNumber } from '@metamask/utils';

import { makePermissionRule } from './makePermissionRule';
import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
  PermissionRule,
} from '../types';
import { getByteLength, getTermsByEnforcer, splitHex } from '../utils';

/**
 * Creates the native-token-stream permission rule.
 *
 * @param enforcers - Checksummed enforcer addresses for the chain.
 * @returns The native-token-stream permission rule.
 */
export function makeNativeTokenStreamRule(
  enforcers: ChecksumEnforcersByChainId,
): PermissionRule {
  const {
    timestampEnforcer,
    nativeTokenStreamingEnforcer,
    exactCalldataEnforcer,
    nonceEnforcer,
  } = enforcers;
  return makePermissionRule({
    permissionType: 'native-token-stream',
    optionalEnforcers: [timestampEnforcer],
    timestampEnforcer,
    requiredEnforcers: {
      [nativeTokenStreamingEnforcer]: 1,
      [exactCalldataEnforcer]: 1,
      [nonceEnforcer]: 1,
    },
    validateAndDecodeData: (caveats) =>
      validateAndDecodeData(caveats, {
        nativeTokenStreamingEnforcer,
        exactCalldataEnforcer,
      }),
  });
}

/**
 * Decodes native-token-stream permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param enforcers - Addresses of the enforcers.
 * @param enforcers.nativeTokenStreamingEnforcer - Address of the NativeTokenStreamingEnforcer.
 * @param enforcers.exactCalldataEnforcer - Address of the ExactCalldataEnforcer.
 * @returns Decoded stream terms.
 */
function validateAndDecodeData(
  caveats: ChecksumCaveat[],
  enforcers: Pick<
    ChecksumEnforcersByChainId,
    'nativeTokenStreamingEnforcer' | 'exactCalldataEnforcer'
  >,
): DecodedPermission['permission']['data'] {
  const { nativeTokenStreamingEnforcer, exactCalldataEnforcer } = enforcers;

  const exactCalldataTerms = getTermsByEnforcer({
    caveats,
    enforcer: exactCalldataEnforcer,
  });

  if (exactCalldataTerms !== '0x') {
    throw new Error('Invalid exact-calldata terms: must be 0x');
  }

  const terms = getTermsByEnforcer({
    caveats,
    enforcer: nativeTokenStreamingEnforcer,
  });

  const EXPECTED_TERMS_BYTELENGTH = 128; // 32 + 32 + 32 + 32

  if (getByteLength(terms) !== EXPECTED_TERMS_BYTELENGTH) {
    throw new Error('Invalid native-token-stream terms: expected 128 bytes');
  }

  const [initialAmount, maxAmount, amountPerSecond, startTimeRaw] = splitHex(
    terms,
    [32, 32, 32, 32],
  );
  const initialAmountBigInt = hexToBigInt(initialAmount);
  const maxAmountBigInt = hexToBigInt(maxAmount);
  const amountPerSecondBigInt = hexToBigInt(amountPerSecond);
  const startTime = hexToNumber(startTimeRaw);

  if (maxAmountBigInt <= initialAmountBigInt) {
    throw new Error(
      'Invalid native-token-stream terms: maxAmount must be greater than initialAmount',
    );
  }

  if (amountPerSecondBigInt === 0n) {
    throw new Error(
      'Invalid native-token-stream terms: amountPerSecond must be a positive number',
    );
  }

  if (startTime === 0) {
    throw new Error(
      'Invalid native-token-stream terms: startTime must be a positive number',
    );
  }

  return { initialAmount, maxAmount, amountPerSecond, startTime };
}
