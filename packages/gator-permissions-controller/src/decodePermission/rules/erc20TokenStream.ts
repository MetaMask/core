import { hexToBigInt, hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { makePermissionRule } from './makePermissionRule';
import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
  PermissionRule,
} from '../types';
import { getByteLength, getTermsByEnforcer, splitHex } from '../utils';

/**
 * Creates the erc20-token-stream permission rule.
 *
 * @param enforcers - Checksummed enforcer addresses for the chain.
 * @returns The erc20-token-stream permission rule.
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
    decodeData: (caveats) => decodeErc20Stream(caveats, erc20StreamingEnforcer),
  });
}

/**
 * Decodes erc20-token-stream permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param enforcer - Address of the ERC20StreamingEnforcer.
 * @returns Decoded stream terms (tokenAddress, amounts, startTime).
 */
export function decodeErc20Stream(
  caveats: ChecksumCaveat[],
  enforcer: Hex,
): DecodedPermission['permission']['data'] {
  const terms = getTermsByEnforcer({ caveats, enforcer });

  const EXPECTED_TERMS_BYTELENGTH = 148;

  if (getByteLength(terms) !== EXPECTED_TERMS_BYTELENGTH) {
    throw new Error('Invalid erc20-token-stream terms: expected 148 bytes');
  }

  const [
    tokenAddress,
    initialAmount,
    maxAmount,
    amountPerSecond,
    startTimeRaw,
  ] = splitHex(terms, [20, 32, 32, 32, 32]);

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
