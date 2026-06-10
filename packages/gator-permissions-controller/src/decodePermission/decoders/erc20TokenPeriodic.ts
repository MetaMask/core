import { hexToBigInt, hexToNumber } from '@metamask/utils';

import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
} from '../types';
import {
  getByteLength,
  getTermsByEnforcer,
  MAX_PERIOD_DURATION,
  splitHex,
  ZERO_32_BYTES,
} from '../utils';
import { erc20PayeeRule } from './erc20PayeeRule';
import { expiryRule } from './expiryRule';
import type { MakePermissionDecoderConfig } from './makePermissionDecoder';
import { redeemerRule } from './redeemerRule';

/**
 * Builds the configuration for the erc20-token-periodic permission decoder.
 *
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns The erc20-token-periodic permission decoder configuration.
 */
export function makeErc20TokenPeriodicDecoderConfig(
  contractAddresses: ChecksumEnforcersByChainId,
): MakePermissionDecoderConfig {
  const {
    timestampEnforcer,
    erc20PeriodicEnforcer,
    valueLteEnforcer,
    nonceEnforcer,
    allowedCalldataEnforcer,
    redeemerEnforcer,
  } = contractAddresses;

  return {
    permissionType: 'erc20-token-periodic',
    contractAddresses,
    optionalEnforcers: [
      timestampEnforcer, // expiry rule
      redeemerEnforcer, // redeemer rule
      allowedCalldataEnforcer, // payee rule
    ],
    requiredEnforcers: {
      [erc20PeriodicEnforcer]: 1,
      [valueLteEnforcer]: 1,
      [nonceEnforcer]: 1,
    },
    rules: [expiryRule, redeemerRule, erc20PayeeRule],
    validateAndDecodeData,
  };
}

/**
 * Decodes erc20-token-periodic permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns Decoded periodic terms.
 */
function validateAndDecodeData(
  caveats: ChecksumCaveat[],
  contractAddresses: ChecksumEnforcersByChainId,
): DecodedPermission['permission']['data'] {
  const { erc20PeriodicEnforcer, valueLteEnforcer } = contractAddresses;

  const valueLteTerms = getTermsByEnforcer({
    caveats,
    enforcer: valueLteEnforcer,
  });
  if (valueLteTerms !== ZERO_32_BYTES) {
    throw new Error(`Invalid value-lte terms: must be ${ZERO_32_BYTES}`);
  }

  const terms = getTermsByEnforcer({
    caveats,
    enforcer: erc20PeriodicEnforcer,
  });

  const EXPECTED_TERMS_BYTELENGTH = 116; // 20 + 32 + 32 + 32

  if (getByteLength(terms) !== EXPECTED_TERMS_BYTELENGTH) {
    throw new Error('Invalid erc20-token-periodic terms: expected 116 bytes');
  }

  const [tokenAddress, periodAmount, periodDurationRaw, startTimeRaw] =
    splitHex(terms, [20, 32, 32, 32]);

  const periodDuration = hexToNumber(periodDurationRaw);
  const periodAmountBigInt = hexToBigInt(periodAmount);
  const startTime = hexToNumber(startTimeRaw);

  if (periodAmountBigInt === 0n) {
    throw new Error(
      'Invalid erc20-token-periodic terms: periodAmount must be a positive number',
    );
  }

  if (periodDuration === 0) {
    throw new Error(
      'Invalid erc20-token-periodic terms: periodDuration must be a positive number',
    );
  }

  if (periodDuration > MAX_PERIOD_DURATION) {
    throw new Error(
      'Invalid erc20-token-periodic terms: periodDuration must be less than or equal to MAX_PERIOD_DURATION',
    );
  }

  if (startTime === 0) {
    throw new Error(
      'Invalid erc20-token-periodic terms: startTime must be a positive number',
    );
  }

  return { tokenAddress, periodAmount, periodDuration, startTime };
}
