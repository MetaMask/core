import { hexToBigInt, hexToNumber } from '@metamask/utils';
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
 * Creates the native-token-stream permission rule.
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
    requiredEnforcers: new Map<Hex, number>([
      [nativeTokenStreamingEnforcer, 1],
      [exactCalldataEnforcer, 1],
      [nonceEnforcer, 1],
    ]),
    decodeData: (caveats) =>
      decodeNativeStream(caveats, nativeTokenStreamingEnforcer),
  });
}

/**
 * Decodes native-token-stream permission data from caveats; throws on invalid.
 */
export function decodeNativeStream(
  caveats: ChecksumCaveat[],
  enforcer: Hex,
): DecodedPermission['permission']['data'] {
  const terms = getTermsByEnforcer({ caveats, enforcer });

  const EXPECTED_TERMS_BYTELENGTH = 128; // 32 + 32 + 32 + 32

  if (getByteLength(terms) !== EXPECTED_TERMS_BYTELENGTH) {
    throw new Error(
      'Invalid native-token-stream terms: expected 128 bytes',
    );
  }

  const [initialAmount, maxAmount, amountPerSecond, startTimeRaw] = splitHex(
    terms,
    [32, 32, 32, 32],
  );
  const initialAmountBigInt = hexToBigInt(initialAmount);
  const maxAmountBigInt = hexToBigInt(maxAmount);
  const amountPerSecondBigInt = hexToBigInt(amountPerSecond);
  const startTime = hexToNumber(startTimeRaw);

  if (initialAmountBigInt <= 0n) {
    throw new Error(
      'Invalid native-token-stream terms: initialAmount must be a positive number',
    );
  }

  if (maxAmountBigInt <= 0n) {
    throw new Error(
      'Invalid native-token-stream terms: maxAmount must be a positive number',
    );
  }

  if (amountPerSecondBigInt <= 0n) {
    throw new Error(
      'Invalid native-token-stream terms: amountPerSecond must be a positive number',
    );
  }

  if (startTime <= 0) {
    throw new Error(
      'Invalid native-token-stream terms: startTime must be a positive number',
    );
  }

  return { initialAmount, maxAmount, amountPerSecond, startTime };
}
