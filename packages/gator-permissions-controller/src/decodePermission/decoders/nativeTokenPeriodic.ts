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
} from '../utils';
import { expiryRule } from './expiryRule';
import type { MakePermissionDecoderConfig } from './makePermissionDecoder';
import { nativePayeeRule } from './nativePayeeRule';
import { redeemerRule } from './redeemerRule';

/**
 * Builds the configuration for the native-token-periodic permission decoder.
 *
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns The native-token-periodic permission decoder configuration.
 */
export function makeNativeTokenPeriodicDecoderConfig(
  contractAddresses: ChecksumEnforcersByChainId,
): MakePermissionDecoderConfig {
  const {
    timestampEnforcer,
    nativeTokenPeriodicEnforcer,
    exactCalldataEnforcer,
    nonceEnforcer,
    allowedTargetsEnforcer,
    redeemerEnforcer,
  } = contractAddresses;

  return {
    permissionType: 'native-token-periodic',
    contractAddresses,
    optionalEnforcers: [
      timestampEnforcer, // expiry rule
      redeemerEnforcer, // redeemer rule
      allowedTargetsEnforcer, // payee rule
    ],
    requiredEnforcers: {
      [nativeTokenPeriodicEnforcer]: 1,
      [exactCalldataEnforcer]: 1,
      [nonceEnforcer]: 1,
    },
    rules: [expiryRule, redeemerRule, nativePayeeRule],
    validateAndDecodeData,
  };
}

/**
 * Decodes native-token-periodic permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns Decoded periodic terms.
 */
function validateAndDecodeData(
  caveats: ChecksumCaveat[],
  contractAddresses: ChecksumEnforcersByChainId,
): DecodedPermission['permission']['data'] {
  const { nativeTokenPeriodicEnforcer, exactCalldataEnforcer } =
    contractAddresses;

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
  const periodAmountBigInt = hexToBigInt(periodAmount);

  if (periodAmountBigInt === 0n) {
    throw new Error(
      'Invalid native-token-periodic terms: periodAmount must be a positive number',
    );
  }

  if (periodDuration === 0) {
    throw new Error(
      'Invalid native-token-periodic terms: periodDuration must be a positive number',
    );
  }

  if (periodDuration > MAX_PERIOD_DURATION) {
    throw new Error(
      'Invalid native-token-periodic terms: periodDuration must be less than or equal to MAX_PERIOD_DURATION',
    );
  }

  if (startTime === 0) {
    throw new Error(
      'Invalid native-token-periodic terms: startTime must be a positive number',
    );
  }

  return { periodAmount, periodDuration, startTime };
}
