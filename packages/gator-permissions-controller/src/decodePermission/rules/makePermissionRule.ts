import type { Caveat } from '@metamask/delegation-core';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

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
 * @param args.timestampEnforcer - Address of the TimestampEnforcer used to extract expiry.
 * @param args.permissionType - The permission type identifier.
 * @param args.requiredEnforcers - Map of required enforcer address to required count.
 * @param args.validateAndDecodeData - Callback to decode caveats into permission data; may throw.
 * @returns A permission rule with caveatAddressesMatch and validateAndDecodePermission.
 */
export function makePermissionRule({
  optionalEnforcers,
  timestampEnforcer,
  permissionType,
  requiredEnforcers,
  validateAndDecodeData,
}: {
  optionalEnforcers: Hex[];
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

        return { isValid: true, expiry, data };
      } catch (caughtError) {
        return { isValid: false, error: caughtError as Error };
      }
    },
  };
}
