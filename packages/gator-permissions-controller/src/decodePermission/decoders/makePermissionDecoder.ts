import type { Rule } from '@metamask/7715-permission-types';
import type { Caveat } from '@metamask/delegation-core';
import { getChecksumAddress, isStrictHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { EXECUTION_PERMISSION_EXPIRY_RULE_TYPE } from '../../constants';
import type {
  ChecksumCaveat,
  ChecksumEnforcersByChainId,
  DecodedPermission,
  PermissionDecoder,
  PermissionType,
  RuleDecoder,
  ValidateAndDecodeResult,
} from '../types';
import { buildEnforcerCountsAndSet, enforcersMatchRule } from '../utils';

/**
 * Configuration object describing how to decode a single permission type.
 *
 * Returned by each `make<PermissionType>DecoderConfig` factory and consumed by
 * {@link makePermissionDecoder} to produce a {@link PermissionDecoder}.
 */
export type MakePermissionDecoderConfig = {
  permissionType: PermissionType;
  contractAddresses: ChecksumEnforcersByChainId;
  optionalEnforcers: Hex[];
  requiredEnforcers: Record<Hex, number>;
  rules: RuleDecoder[];
  validateAndDecodeData: (
    caveats: ChecksumCaveat[],
    contractAddresses: ChecksumEnforcersByChainId,
  ) => DecodedPermission['permission']['data'];
};

/**
 * Creates a single {@link PermissionDecoder} with the given type, enforcer
 * sets, rule decoders, and decode/validate callback.
 *
 * @param config - The configuration describing the permission type's
 * enforcers, rule decoders, and data decoder. See
 * {@link MakePermissionDecoderConfig} for field documentation.
 * @param config.permissionType - The type of permission to decode.
 * @param config.contractAddresses - Checksummed enforcer addresses for the chain.
 * @param config.optionalEnforcers - Optional enforcers for the permission.
 * @param config.requiredEnforcers - Required enforcers for the permission.
 * @param config.rules - Rule decoders for the permission.
 * @param config.validateAndDecodeData - Data decoder for the permission.
 * @returns A {@link PermissionDecoder} with `caveatAddressesMatch` and
 * `validateAndDecodePermission`.
 */
export function makePermissionDecoder({
  permissionType,
  contractAddresses,
  optionalEnforcers,
  requiredEnforcers,
  rules,
  validateAndDecodeData,
}: MakePermissionDecoderConfig): PermissionDecoder {
  const optionalEnforcersSet = new Set(optionalEnforcers);
  const requiredEnforcersMap = new Map(
    Object.entries(requiredEnforcers),
  ) as Map<Hex, number>;

  const caveatAddressesMatch = (caveatAddresses: Hex[]): boolean => {
    const { counts, enforcersSet } = buildEnforcerCountsAndSet(caveatAddresses);

    return enforcersMatchRule(
      counts,
      enforcersSet,
      requiredEnforcersMap,
      optionalEnforcersSet,
    );
  };

  const validateAndDecodePermission = (
    caveats: Caveat<Hex>[],
  ): ValidateAndDecodeResult => {
    const checksumCaveats: ChecksumCaveat[] = caveats.map((caveat) => ({
      ...caveat,
      enforcer: getChecksumAddress(caveat.enforcer),
    }));
    try {
      const invalidTerms = checksumCaveats.filter(
        // isStrictHexString rejects '0x' which is a valid terms value
        ({ terms }) => terms !== '0x' && !isStrictHexString(terms),
      );

      if (invalidTerms.length > 0) {
        throw new Error('Invalid terms: must be a hex string');
      }

      let expiry: number | null = null;
      const decodedRules: Rule[] = [];

      for (const decode of rules) {
        const rule = decode({
          contractAddresses,
          caveats: checksumCaveats,
          requiredEnforcers: requiredEnforcersMap,
        });

        if (rule === null) {
          continue;
        }

        decodedRules.push(rule);

        if (rule.type === EXECUTION_PERMISSION_EXPIRY_RULE_TYPE) {
          expiry = rule.data.timestamp as number;
        }
      }

      const data = validateAndDecodeData(checksumCaveats, contractAddresses);

      return {
        isValid: true,
        expiry,
        data,
        rules: decodedRules.length > 0 ? decodedRules : undefined,
      };
    } catch (caughtError) {
      return { isValid: false, error: caughtError as Error };
    }
  };

  return {
    permissionType,
    caveatAddressesMatch,
    validateAndDecodePermission,
    optionalEnforcers: optionalEnforcersSet,
    requiredEnforcers: requiredEnforcersMap,
  };
}
