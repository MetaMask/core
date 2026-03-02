import type { Caveat } from '@metamask/delegation-core';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type {
  ChecksumCaveat,
  DecodedPermission,
  PermissionRule,
  PermissionType,
  ValidateAndDecodeResult,
  ValidateDecodedPermission,
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
 * @param args.decodeData - Callback to decode caveats into permission data; may throw.
 * @param args.validate - Optional callback to validate decoded data and expiry; throw to reject.
 * @returns A permission rule with caveatAddressesMatch and validateAndDecodePermission.
 */
export function makePermissionRule({
  optionalEnforcers,
  timestampEnforcer,
  permissionType,
  requiredEnforcers,
  decodeData,
  validate,
}: {
  optionalEnforcers: Hex[];
  timestampEnforcer: Hex;
  permissionType: PermissionType;
  requiredEnforcers: Map<Hex, number>;
  decodeData: (
    caveats: ChecksumCaveat[],
  ) => DecodedPermission['permission']['data'];
  validate?: ValidateDecodedPermission;
}): PermissionRule {
  const optionalEnforcersSet = new Set(optionalEnforcers);
  return {
    permissionType,
    requiredEnforcers,
    optionalEnforcers: optionalEnforcersSet,
    caveatAddressesMatch(caveatAddresses: Hex[]): boolean {
      const { counts, enforcersSet } =
        buildEnforcerCountsAndSet(caveatAddresses);

      return enforcersMatchRule(
        counts,
        enforcersSet,
        requiredEnforcers,
        optionalEnforcersSet,
      );
    },
    validateAndDecodePermission(caveats: Caveat<Hex>[]): ValidateAndDecodeResult {
      const checksumCaveats: ChecksumCaveat[] = caveats.map((c) => ({
        ...c,
        enforcer: getChecksumAddress(c.enforcer),
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
        const data = decodeData(checksumCaveats);
        if (validate) {
          validate(data, expiry);
        }
        return { isValid: true, expiry, data };
      } catch (err) {
        return { isValid: false, error: err as Error };
      }
    },
  };
}
