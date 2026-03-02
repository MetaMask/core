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
 * Creates the erc20-token-stream permission rule.
 */
export function makeErc20TokenStreamRule(
  enforcers: ChecksumEnforcersByChainId,
): PermissionRule {
  const {
    timestampEnforcer,
    erc20StreamingEnforcer,
    valueLteEnforcer,
    nonceEnforcer,
  } = enforcers;
  return makePermissionRule({
    permissionType: 'erc20-token-stream',
    optionalEnforcers: [timestampEnforcer],
    timestampEnforcer,
    requiredEnforcers: new Map<Hex, number>([
      [erc20StreamingEnforcer, 1],
      [valueLteEnforcer, 1],
      [nonceEnforcer, 1],
    ]),
    decodeData: (caveats) =>
      decodeErc20Stream(caveats, erc20StreamingEnforcer),
  });
}

/**
 * Decodes erc20-token-stream permission data from caveats; throws on invalid.
 */
export function decodeErc20Stream(
  caveats: ChecksumCaveat[],
  enforcer: Hex,
): DecodedPermission['permission']['data'] {
  const terms = getTermsByEnforcer({ caveats, enforcer });

  const EXPECTED_TERMS_BYTELENGTH = 148;

  if (getByteLength(terms) !== EXPECTED_TERMS_BYTELENGTH) {
    throw new Error(
      'Invalid erc20-token-stream terms: expected 148 bytes',
    );
  }

  const [tokenAddress, initialAmount, maxAmount, amountPerSecond, startTimeRaw] =
    splitHex(terms, [20, 32, 32, 32, 32]);
  
    const startTime = hexToNumber(startTimeRaw);
  const initialAmountBigInt = hexToBigInt(initialAmount);
  const maxAmountBigInt = hexToBigInt(maxAmount);

  if (maxAmountBigInt < initialAmountBigInt) {
    throw new Error(
      'Invalid erc20-token-stream terms: maxAmount must be greater than initialAmount',
    );
  }

  if (startTime <= 0) {
    throw new Error(
      'Invalid erc20-token-stream terms: startTime must be a positive number',
    );
  }

  return {
    tokenAddress,
    initialAmount,
    maxAmount,
    amountPerSecond,
    startTime,
  };
}
