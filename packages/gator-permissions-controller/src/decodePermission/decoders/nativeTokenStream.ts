import { hexToBigInt, hexToNumber } from '@metamask/utils';

import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
} from '../types';
import { getByteLength, getTermsByEnforcer, splitHex } from '../utils';
import { expiryRule } from './expiryRule';
import type { MakePermissionDecoderConfig } from './makePermissionDecoder';
import { nativePayeeRule } from './nativePayeeRule';
import { redeemerRule } from './redeemerRule';

/**
 * Builds the configuration for the native-token-stream permission decoder.
 *
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns The native-token-stream permission decoder configuration.
 */
export function makeNativeTokenStreamDecoderConfig(
  contractAddresses: ChecksumEnforcersByChainId,
): MakePermissionDecoderConfig {
  const {
    timestampEnforcer,
    nativeTokenStreamingEnforcer,
    exactCalldataEnforcer,
    nonceEnforcer,
    allowedTargetsEnforcer,
    redeemerEnforcer,
  } = contractAddresses;

  return {
    permissionType: 'native-token-stream',
    contractAddresses,
    optionalEnforcers: [
      timestampEnforcer, // expiry rule
      redeemerEnforcer, // redeemer rule
      allowedTargetsEnforcer, // payee rule
    ],
    requiredEnforcers: {
      [nativeTokenStreamingEnforcer]: 1,
      [exactCalldataEnforcer]: 1,
      [nonceEnforcer]: 1,
    },
    rules: [expiryRule, redeemerRule, nativePayeeRule],
    validateAndDecodeData,
  };
}

/**
 * Decodes native-token-stream permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns Decoded stream terms.
 */
function validateAndDecodeData(
  caveats: ChecksumCaveat[],
  contractAddresses: ChecksumEnforcersByChainId,
): DecodedPermission['permission']['data'] {
  const { nativeTokenStreamingEnforcer, exactCalldataEnforcer } =
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
