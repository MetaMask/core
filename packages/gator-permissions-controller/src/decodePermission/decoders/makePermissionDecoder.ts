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
 * Creates a single {@link PermissionDecoder} with the given type, enforcer
 * sets, rule decoders, and decode/validate callback.
 *
 * @param args - The arguments to this function.
 * @param args.permissionType - The permission type identifier.
 * @param args.contractAddresses - Checksummed enforcer addresses for the chain.
 * @param args.optionalEnforcers - Enforcer addresses that may appear in addition
 * to the required ones.
 * @param args.requiredEnforcers - Map of required enforcer address to required
 * count.
 * @param args.rules - Rule decoder functions invoked to decode rules (e.g.
 * `redeemer`, `payee`, `expiry`) from the caveats. Each may emit a {@link Rule}
 * to append to the decoded permission's `rules` array. The `expiry` rule is
 * additionally hoisted onto the top-level `expiry` field of the result.
 * @param args.validateAndDecodeData - Callback to decode the permission's
 * `data` payload from the caveats; may throw on invalid input.
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
}: {
  permissionType: PermissionType;
  contractAddresses: ChecksumEnforcersByChainId;
  optionalEnforcers: Hex[];
  requiredEnforcers: Record<Hex, number>;
  rules: RuleDecoder[];
  validateAndDecodeData: (
    caveats: ChecksumCaveat[],
    contractAddresses: ChecksumEnforcersByChainId,
  ) => DecodedPermission['permission']['data'];
}): PermissionDecoder {
  const optionalEnforcersSet = new Set(optionalEnforcers);
  const requiredEnforcersMap = new Map(
    Object.entries(requiredEnforcers),
  ) as Map<Hex, number>;

  return {
    permissionType,
    requiredEnforcers: requiredEnforcersMap,
    optionalEnforcers: optionalEnforcersSet,
    caveatAddressesMatch(caveatAddresses: Hex[]): boolean {
      const { counts, enforcersSet } =
        buildEnforcerCountsAndSet(caveatAddresses);

      return enforcersMatchRule(
        counts,
        enforcersSet,
        requiredEnforcersMap,
        optionalEnforcersSet,
      );
    },
    validateAndDecodePermission(
      caveats: Caveat<Hex>[],
    ): ValidateAndDecodeResult {
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
    },
  };
}
