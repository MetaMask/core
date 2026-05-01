import type { Rule } from '@metamask/7715-permission-types';
import type { Caveat } from '@metamask/delegation-core';
import { decodeRedeemerTerms } from '@metamask/delegation-core';
import { getChecksumAddress, isStrictHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { EXECUTION_PERMISSION_REDEEMER_RULE_TYPE } from '../../constants';
import type {
  ChecksumCaveat,
  DecodedPermission,
  PermissionRule,
  PermissionType,
  ValidateAndDecodeResult,
} from '../types';
import {
  buildEnforcerCountsAndSet,
  enforcersMatchRule,
  extractExpiryFromCaveatTerms,
  getTermsByEnforcer,
} from '../utils';

/**
 * Creates a single permission rule with the given type, enforcer sets, and
 * decode/validate callbacks.
 *
 * @param args - The arguments to this function.
 * @param args.optionalEnforcers - Enforcer addresses that may appear in addition to required.
 * @param args.redeemerEnforcer - Address of the RedeemerEnforcer used to extract redeemer rules.
 * @param args.timestampEnforcer - Address of the TimestampEnforcer used to extract expiry.
 * @param args.permissionType - The permission type identifier.
 * @param args.requiredEnforcers - Map of required enforcer address to required count.
 * @param args.validateAndDecodeData - Callback to decode caveats into permission data; may throw.
 * @returns A permission rule with caveatAddressesMatch and validateAndDecodePermission.
 */
export function makePermissionRule({
  optionalEnforcers,
  redeemerEnforcer,
  timestampEnforcer,
  permissionType,
  requiredEnforcers,
  validateAndDecodeData,
}: {
  optionalEnforcers: Hex[];
  redeemerEnforcer: Hex;
  timestampEnforcer: Hex;
  permissionType: PermissionType;
  requiredEnforcers: Record<Hex, number>;
  validateAndDecodeData: (
    caveats: ChecksumCaveat[],
  ) => DecodedPermission['permission']['data'];
}): PermissionRule {
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

        const expiryTerms = getTermsByEnforcer({
          caveats: checksumCaveats,
          enforcer: timestampEnforcer,
          throwIfNotFound: false,
        });

        if (expiryTerms) {
          expiry = extractExpiryFromCaveatTerms(expiryTerms);
        }

        const data = validateAndDecodeData(checksumCaveats);

        const redeemerTerms = getTermsByEnforcer({
          caveats: checksumCaveats,
          enforcer: redeemerEnforcer,
          throwIfNotFound: false,
        });

        let rules: Rule[] | undefined;
        if (redeemerTerms) {
          rules = [
            {
              type: EXECUTION_PERMISSION_REDEEMER_RULE_TYPE,
              data: {
                addresses: decodeRedeemerTerms(redeemerTerms).redeemers,
              },
            },
          ];
        }

        return { isValid: true, expiry, data, rules };
      } catch (caughtError) {
        return { isValid: false, error: caughtError as Error };
      }
    },
  };
}
