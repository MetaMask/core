import type { Hex } from '@metamask/utils';

import { makePermissionRule } from './makePermissionRule';
import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
  PermissionRule,
} from '../types';
import { getByteLength, getTermsByEnforcer } from '../utils';

/**
 * Creates the erc20-token-revocation permission rule.
 *
 * @param enforcers - Checksummed enforcer addresses for the chain.
 * @returns The erc20-token-revocation permission rule.
 */
export function makeErc20TokenRevocationRule(
  enforcers: ChecksumEnforcersByChainId,
): PermissionRule {
  const {
    timestampEnforcer,
    allowedCalldataEnforcer,
    valueLteEnforcer,
    nonceEnforcer,
  } = enforcers;
  return makePermissionRule({
    permissionType: 'erc20-token-revocation',
    optionalEnforcers: [timestampEnforcer],
    timestampEnforcer,
    requiredEnforcers: new Map<Hex, number>([
      [allowedCalldataEnforcer, 2],
      [valueLteEnforcer, 1],
      [nonceEnforcer, 1],
    ]),
    decodeData: (caveats) =>
      decodeErc20Revocation(caveats, allowedCalldataEnforcer, valueLteEnforcer),
  });
}

const ZERO_32_BYTES =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
const ERC20_APPROVE_SELECTOR_TERMS =
  '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as const;
const ERC20_APPROVE_ZERO_AMOUNT_TERMS =
  '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as const;

/**
 * Decodes erc20-token-revocation permission data from caveats; throws on invalid.
 *
 * @param caveats - Caveats from the permission context (checksummed).
 * @param allowedCalldataEnforcer - Address of the AllowedCalldataEnforcer.
 * @param valueLteEnforcer - Address of the ValueLteEnforcer.
 * @returns Empty object (revocation has no decoded data payload).
 */
export function decodeErc20Revocation(
  caveats: ChecksumCaveat[],
  allowedCalldataEnforcer: Hex,
  valueLteEnforcer: Hex,
): DecodedPermission['permission']['data'] {
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

  const EXPECTED_VALUE_LTE_TERMS_BYTELENGTH = 32;

  if (getByteLength(valueLteTerms) !== EXPECTED_VALUE_LTE_TERMS_BYTELENGTH) {
    throw new Error(
      'Invalid erc20-token-revocation terms: ValueLteEnforcer terms must be 32 bytes',
    );
  }

  if (valueLteTerms !== ZERO_32_BYTES) {
    throw new Error('Invalid ValueLteEnforcer terms: maxValue must be 0');
  }

  return {};
}
