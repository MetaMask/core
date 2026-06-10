import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
} from '../types';
import {
  ERC20_APPROVE_SELECTOR_TERMS,
  ERC20_APPROVE_ZERO_AMOUNT_TERMS,
  getTermsByEnforcer,
  ZERO_32_BYTES,
} from '../utils';
import { expiryRule } from './expiryRule';
import type { MakePermissionDecoderConfig } from './makePermissionDecoder';
import { redeemerRule } from './redeemerRule';

/**
 * Builds the configuration for the erc20-token-revocation permission decoder.
 *
 * Revocation permissions intentionally do not support a payee rule: the
 * AllowedCalldataEnforcer is required (with count=2) to encode both the
 * `approve` selector and the zero-amount constraint, so it cannot also be
 * used to extract a payee address.
 *
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns The erc20-token-revocation permission decoder configuration.
 */
export function makeErc20TokenRevocationDecoderConfig(
  contractAddresses: ChecksumEnforcersByChainId,
): MakePermissionDecoderConfig {
  const {
    timestampEnforcer,
    allowedCalldataEnforcer,
    valueLteEnforcer,
    nonceEnforcer,
    redeemerEnforcer,
  } = contractAddresses;

  return {
    permissionType: 'erc20-token-revocation',
    contractAddresses,
    optionalEnforcers: [
      timestampEnforcer, // expiry rule
      redeemerEnforcer, // redeemer rule
    ],
    requiredEnforcers: {
      [allowedCalldataEnforcer]: 2,
      [valueLteEnforcer]: 1,
      [nonceEnforcer]: 1,
    },
    rules: [expiryRule, redeemerRule],
    validateAndDecodeData,
  };
}

/**
 * Decodes erc20-token-revocation permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param contractAddresses - Checksummed enforcer addresses for the chain.
 * @returns Empty object (revocation has no decoded data payload).
 */
function validateAndDecodeData(
  caveats: ChecksumCaveat[],
  contractAddresses: ChecksumEnforcersByChainId,
): DecodedPermission['permission']['data'] {
  const { allowedCalldataEnforcer, valueLteEnforcer } = contractAddresses;

  const allowedCalldataCaveats = caveats.filter(
    (caveat) => caveat.enforcer === allowedCalldataEnforcer,
  );
  const allowedCalldataTerms = allowedCalldataCaveats.map((caveat) =>
    caveat.terms.toLowerCase(),
  );

  const hasApproveSelector = allowedCalldataTerms.includes(
    ERC20_APPROVE_SELECTOR_TERMS,
  );

  const hasZeroAmount = allowedCalldataTerms.includes(
    ERC20_APPROVE_ZERO_AMOUNT_TERMS,
  );

  if (!hasApproveSelector || !hasZeroAmount) {
    throw new Error(
      'Invalid erc20-token-revocation terms: expected approve selector and zero amount constraints',
    );
  }

  const valueLteTerms = getTermsByEnforcer({
    caveats,
    enforcer: valueLteEnforcer,
  });

  if (valueLteTerms !== ZERO_32_BYTES) {
    throw new Error('Invalid ValueLteEnforcer terms: maxValue must be 0');
  }

  return {};
}
