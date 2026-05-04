import type { Rule } from '@metamask/7715-permission-types';
import type { Caveat } from '@metamask/delegation-core';
import {
  decodeAllowedCalldataTerms,
  decodeAllowedTargetsTerms,
  decodeLogicalOrWrapperTerms,
  decodeRedeemerTerms,
} from '@metamask/delegation-core';
import { getChecksumAddress, isStrictHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import {
  EXECUTION_PERMISSION_PAYEE_RULE_TYPE,
  EXECUTION_PERMISSION_REDEEMER_RULE_TYPE,
} from '../../constants';
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
 * @param args.payeeEnforcers - Addresses of enforcers used to extract payee rules.
 * @param args.payeeEnforcers.allowedCalldataEnforcer - AllowedCalldataEnforcer address (ERC20 payee).
 * @param args.payeeEnforcers.allowedTargetsEnforcer - AllowedTargetsEnforcer address (native payee).
 * @param args.payeeEnforcers.singlePayeeEnforcer - The specific enforcer used for single-payee in this permission type.
 * @param args.payeeEnforcers.logicalOrWrapperEnforcer - The LogicalOrWrapperEnforcer for multi-payee.
 * @param args.timestampEnforcer - Address of the TimestampEnforcer used to extract expiry.
 * @param args.permissionType - The permission type identifier.
 * @param args.requiredEnforcers - Map of required enforcer address to required count.
 * @param args.validateAndDecodeData - Callback to decode caveats into permission data; may throw.
 * @returns A permission rule with caveatAddressesMatch and validateAndDecodePermission.
 */
export function makePermissionRule({
  optionalEnforcers,
  redeemerEnforcer,
  payeeEnforcers,
  timestampEnforcer,
  permissionType,
  requiredEnforcers,
  validateAndDecodeData,
}: {
  optionalEnforcers: Hex[];
  redeemerEnforcer: Hex;
  payeeEnforcers: {
    allowedCalldataEnforcer: Hex;
    allowedTargetsEnforcer: Hex;
    singlePayeeEnforcer: Hex;
    logicalOrWrapperEnforcer: Hex;
  };
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

        const rules: Rule[] = [];
        if (redeemerTerms) {
          rules.push({
            type: EXECUTION_PERMISSION_REDEEMER_RULE_TYPE,
            data: {
              addresses: decodeRedeemerTerms(redeemerTerms).redeemers,
            },
          });
        }

        const payeeAddresses = extractPayeeAddresses(
          checksumCaveats,
          payeeEnforcers,
        );
        if (payeeAddresses) {
          rules.push({
            type: EXECUTION_PERMISSION_PAYEE_RULE_TYPE,
            data: { addresses: payeeAddresses },
          });
        }

        return {
          isValid: true,
          expiry,
          data,
          rules: rules.length > 0 ? rules : undefined,
        };
      } catch (caughtError) {
        return { isValid: false, error: caughtError as Error };
      }
    },
  };
}

/**
 * Extracts a payee address from a single-payee enforcer caveat.
 *
 * @param terms - Hex-encoded caveat terms.
 * @param enforcerAddress - The enforcer address to determine decoding strategy.
 * @param payeeEnforcerAddresses - Known payee enforcer addresses for comparison.
 * @param payeeEnforcerAddresses.allowedCalldataEnforcer - AllowedCalldataEnforcer address.
 * @param payeeEnforcerAddresses.allowedTargetsEnforcer - AllowedTargetsEnforcer address.
 * @returns The checksummed payee address, or null if the enforcer is unrecognised.
 */
function extractPayeeAddressFromCaveat(
  terms: Hex,
  enforcerAddress: Hex,
  payeeEnforcerAddresses: {
    allowedCalldataEnforcer: Hex;
    allowedTargetsEnforcer: Hex;
  },
): Hex | null {
  const checksumEnforcer = getChecksumAddress(enforcerAddress);

  if (checksumEnforcer === payeeEnforcerAddresses.allowedCalldataEnforcer) {
    const decoded = decodeAllowedCalldataTerms(terms);
    const address = `0x${decoded.value.slice(-40)}`;
    return getChecksumAddress(address);
  }

  if (checksumEnforcer === payeeEnforcerAddresses.allowedTargetsEnforcer) {
    const decoded = decodeAllowedTargetsTerms(terms);
    return getChecksumAddress(decoded.targets[0]);
  }

  return null;
}

/**
 * Extracts payee addresses from caveats, handling both single-payee
 * (direct enforcer) and multi-payee (LogicalOrWrapperEnforcer) cases.
 *
 * @param caveats - Checksummed caveats from the delegation.
 * @param enforcers - Payee enforcer addresses.
 * @param enforcers.allowedCalldataEnforcer - AllowedCalldataEnforcer address.
 * @param enforcers.allowedTargetsEnforcer - AllowedTargetsEnforcer address.
 * @param enforcers.singlePayeeEnforcer - The specific enforcer for single-payee in this permission type.
 * @param enforcers.logicalOrWrapperEnforcer - The LogicalOrWrapperEnforcer address.
 * @returns Array of checksummed payee addresses, or null if no payee caveat is found.
 */
function extractPayeeAddresses(
  caveats: ChecksumCaveat[],
  enforcers: {
    allowedCalldataEnforcer: Hex;
    allowedTargetsEnforcer: Hex;
    singlePayeeEnforcer: Hex;
    logicalOrWrapperEnforcer: Hex;
  },
): Hex[] | null {
  const knownEnforcers = {
    allowedCalldataEnforcer: enforcers.allowedCalldataEnforcer,
    allowedTargetsEnforcer: enforcers.allowedTargetsEnforcer,
  };

  const logicalOrTerms = getTermsByEnforcer({
    caveats,
    enforcer: enforcers.logicalOrWrapperEnforcer,
    throwIfNotFound: false,
  });

  if (logicalOrTerms) {
    const decoded = decodeLogicalOrWrapperTerms(logicalOrTerms);
    const addresses: Hex[] = [];
    for (const group of decoded.caveatGroups) {
      for (const innerCaveat of group) {
        const address = extractPayeeAddressFromCaveat(
          innerCaveat.terms,
          innerCaveat.enforcer,
          knownEnforcers,
        );
        if (address) {
          addresses.push(address);
        }
      }
    }
    return addresses.length > 0 ? addresses : null;
  }

  try {
    const singlePayeeTerms = getTermsByEnforcer({
      caveats,
      enforcer: enforcers.singlePayeeEnforcer,
      throwIfNotFound: false,
    });

    if (singlePayeeTerms) {
      const address = extractPayeeAddressFromCaveat(
        singlePayeeTerms,
        enforcers.singlePayeeEnforcer,
        knownEnforcers,
      );
      return address ? [address] : null;
    }
  } catch {
    // Multiple caveats for the single-payee enforcer (e.g. allowedCalldataEnforcer
    // used as required in erc20-token-revocation). Not a payee caveat.
  }

  return null;
}
