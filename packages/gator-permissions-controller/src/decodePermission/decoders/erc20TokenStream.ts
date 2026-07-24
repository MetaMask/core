import { hexToBigInt, hexToNumber } from '@metamask/utils';

import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
} from '../types.js';
import {
  getByteLength,
  getTermsByEnforcer,
  splitHex,
  ZERO_32_BYTES,
} from '../utils.js';
import { erc20PayeeRule } from './erc20PayeeRule.js';
import { expiryRule } from './expiryRule.js';
import type { MakePermissionDecoderConfig } from './makePermissionDecoder.js';
import { redeemerRule } from './redeemerRule.js';

/**
 * Builds the configuration for the erc20-token-stream permission decoder.
 *
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns The erc20-token-stream permission decoder configuration.
 */
export function makeErc20TokenStreamDecoderConfig(
  contractAddresses: ChecksumEnforcersByChainId,
): MakePermissionDecoderConfig {
  const {
    timestampEnforcer,
    erc20StreamingEnforcer,
    valueLteEnforcer,
    nonceEnforcer,
    allowedCalldataEnforcer,
    redeemerEnforcer,
  } = contractAddresses;

  return {
    permissionType: 'erc20-token-stream',
    contractAddresses,
    optionalEnforcers: [
      timestampEnforcer, // expiry rule
      redeemerEnforcer, // redeemer rule
      allowedCalldataEnforcer, // payee rule
    ],
    requiredEnforcers: {
      [erc20StreamingEnforcer]: 1,
      [valueLteEnforcer]: 1,
      [nonceEnforcer]: 1,
    },
    rules: [expiryRule, redeemerRule, erc20PayeeRule],
    validateAndDecodeData,
  };
}

/**
 * Decodes erc20-token-stream permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns Decoded stream terms.
 */
function validateAndDecodeData(
  caveats: ChecksumCaveat[],
  contractAddresses: ChecksumEnforcersByChainId,
): DecodedPermission['permission']['data'] {
  const { erc20StreamingEnforcer, valueLteEnforcer } = contractAddresses;
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
  const amountPerSecondBigInt = hexToBigInt(amountPerSecond);

  if (maxAmountBigInt <= initialAmountBigInt) {
    throw new Error(
      'Invalid erc20-token-stream terms: maxAmount must be greater than initialAmount',
    );
  }

  if (amountPerSecondBigInt === 0n) {
    throw new Error(
      'Invalid erc20-token-stream terms: amountPerSecond must be a positive number',
    );
  }

  if (startTime === 0) {
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
