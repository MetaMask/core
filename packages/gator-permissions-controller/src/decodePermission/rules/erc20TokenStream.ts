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
    requiredEnforcers: {
      [erc20StreamingEnforcer]: 1,
      [valueLteEnforcer]: 1,
      [nonceEnforcer]: 1,
    },
    validateAndDecodeData: (caveats) =>
      validateAndDecodeData(caveats, {
        erc20StreamingEnforcer,
        valueLteEnforcer,
      }),
  });
}

/**
 * Decodes erc20-token-stream permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param enforcers - Addresses of the enforcers.
 * @param enforcers.erc20StreamingEnforcer - Address of the ERC20StreamingEnforcer.
 * @param enforcers.valueLteEnforcer - Address of the ValueLteEnforcer.
 * @returns Decoded stream terms.
 */
function validateAndDecodeData(
  caveats: ChecksumCaveat[],
  enforcers: Pick<
    ChecksumEnforcersByChainId,
    'erc20StreamingEnforcer' | 'valueLteEnforcer'
  >,
): DecodedPermission['permission']['data'] {
  const { erc20StreamingEnforcer, valueLteEnforcer } = enforcers;
  const valueLteTerms = getTermsByEnforcer({
    caveats,
    enforcer: valueLteEnforcer,
  });

  if (valueLteTerms !== ZERO_32_BYTES) {
    throw new Error(`Invalid value-lte terms: must be ${ZERO_32_BYTES}`);
  }

  const terms = getTermsByEnforcer({
    caveats,
    enforcer: erc20StreamingEnforcer,
  });

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

  if (!isHexAddress(tokenAddress)) {
    throw new Error(
      'Invalid erc20-token-stream terms: tokenAddress must be a valid hex string',
    );
  }

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
