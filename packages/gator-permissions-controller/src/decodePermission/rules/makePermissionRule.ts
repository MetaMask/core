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
  getByteLength,
  getTermsByEnforcer,
} from '../utils';

const ERC20_TRANSFER_PAYEE_START_INDEX = 4;
const ERC20_PAYEE_VALUE_BYTE_LENGTH = 32;
const PAYEE_CAVEAT_ARGS = '0x' as const;
const LOGICAL_OR_WRAPPER_CAVEAT_ARGS = '0x' as const;

type PayeeEnforcerAddresses = {
  allowedCalldataEnforcer: Hex;
  allowedTargetsEnforcer: Hex;
  singlePayeeEnforcer: Hex;
  logicalOrWrapperEnforcer: Hex;
};

/**
 * Creates a single permission rule with the given type, enforcer sets, and
 * decode/validate callbacks.
 *
 * @param args - The arguments to this function.
 * @param args.optionalEnforcers - Enforcer addresses that may appear in addition to required.
 * @param args.redeemerEnforcer - Address of the RedeemerEnforcer used to extract redeemer rules.
 * @param args.payeeEnforcers - Addresses of enforcers used to extract payee rules.
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
  payeeEnforcers: PayeeEnforcerAddresses;
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

        const payeeAddresses = tryExtractPayeeAddresses(
          checksumCaveats,
          payeeEnforcers,
          requiredEnforcersMap,
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
 * Attempts to extract payee addresses from a payee enforcer caveat.
 *
 * @param caveat - The payee caveat to decode.
 * @param payeeEnforcerAddresses - Known payee enforcer addresses for comparison.
 * @param payeeEnforcerAddresses.allowedCalldataEnforcer - AllowedCalldataEnforcer address.
 * @param payeeEnforcerAddresses.allowedTargetsEnforcer - AllowedTargetsEnforcer address.
 * @returns The checksummed payee addresses, or null if the enforcer is unrecognised.
 */
function tryExtractPayeeAddressesFromCaveat(
  caveat: Caveat<Hex>,
  payeeEnforcerAddresses: {
    allowedCalldataEnforcer: Hex;
    allowedTargetsEnforcer: Hex;
  },
): Hex[] | null {
  const checksumEnforcer = getChecksumAddress(caveat.enforcer);

  if (checksumEnforcer === payeeEnforcerAddresses.allowedCalldataEnforcer) {
    assertPayeeCaveatArgs(caveat.args);

    const decoded = decodeAllowedCalldataTerms(caveat.terms);
    if (decoded.startIndex !== ERC20_TRANSFER_PAYEE_START_INDEX) {
      throw new Error(
        `Invalid AllowedCalldataEnforcer payee terms: startIndex must be ${ERC20_TRANSFER_PAYEE_START_INDEX}`,
      );
    }

    if (getByteLength(decoded.value) !== ERC20_PAYEE_VALUE_BYTE_LENGTH) {
      throw new Error(
        `Invalid AllowedCalldataEnforcer payee terms: value must be ${ERC20_PAYEE_VALUE_BYTE_LENGTH} bytes`,
      );
    }

    const address: Hex = `0x${decoded.value.slice(-40)}`;
    return [getChecksumAddress(address)];
  }

  if (checksumEnforcer === payeeEnforcerAddresses.allowedTargetsEnforcer) {
    assertPayeeCaveatArgs(caveat.args);

    const decoded = decodeAllowedTargetsTerms(caveat.terms);
    return decoded.targets.map((target) => getChecksumAddress(target));
  }

  return null;
}

/**
 * Asserts that payee caveat args match the expected empty value.
 *
 * @param args - The caveat args to validate.
 */
function assertPayeeCaveatArgs(args: Hex): void {
  if (args !== PAYEE_CAVEAT_ARGS) {
    throw new Error(`Invalid payee caveat args: must be ${PAYEE_CAVEAT_ARGS}`);
  }
}

/**
 * Extracts payee addresses from the specified payee caveat.
 *
 * @param caveat - The caveat to decode.
 * @param enforcers - Payee enforcer addresses.
 * @returns The checksummed payee addresses.
 */
function extractPayeeAddressesFromExpectedCaveat(
  caveat: Caveat<Hex>,
  enforcers: PayeeEnforcerAddresses,
): Hex[] {
  if (getChecksumAddress(caveat.enforcer) !== enforcers.singlePayeeEnforcer) {
    throw new Error(
      'Invalid payee caveat: must use the configured single-payee enforcer',
    );
  }

  const addresses = tryExtractPayeeAddressesFromCaveat(caveat, enforcers);
  if (!addresses) {
    throw new Error('Invalid payee caveat: unable to decode payee address');
  }

  return addresses;
}

/**
 * Attempts to extract payee addresses from caveats, handling both single-payee
 * (direct enforcer) and multi-payee (LogicalOrWrapperEnforcer) cases.
 *
 * @param caveats - Checksummed caveats from the delegation.
 * @param enforcers - Payee enforcer addresses.
 * @param enforcers.allowedCalldataEnforcer - AllowedCalldataEnforcer address.
 * @param enforcers.allowedTargetsEnforcer - AllowedTargetsEnforcer address.
 * @param enforcers.singlePayeeEnforcer - The specific enforcer for single-payee in this permission type.
 * @param enforcers.logicalOrWrapperEnforcer - The LogicalOrWrapperEnforcer address.
 * @param requiredEnforcers - Required enforcer counts for the permission rule.
 * @returns Array of checksummed payee addresses, or null if no payee caveat is found.
 */
function tryExtractPayeeAddresses(
  caveats: ChecksumCaveat[],
  enforcers: PayeeEnforcerAddresses,
  requiredEnforcers: Map<Hex, number>,
): Hex[] | null {
  const logicalOrCaveats = caveats.filter(
    (caveat) => caveat.enforcer === enforcers.logicalOrWrapperEnforcer,
  );

  if (logicalOrCaveats.length > 1) {
    throw new Error('Invalid caveats');
  }

  const requiredSinglePayeeCount =
    requiredEnforcers.get(enforcers.singlePayeeEnforcer) ?? 0;
  const singlePayeeCaveats = caveats.filter(
    (caveat) => caveat.enforcer === enforcers.singlePayeeEnforcer,
  );

  if (singlePayeeCaveats.length > requiredSinglePayeeCount + 1) {
    throw new Error('Invalid caveats');
  }

  const singlePayeeCaveat =
    singlePayeeCaveats[requiredSinglePayeeCount] ?? null;

  if (logicalOrCaveats.length === 1 && singlePayeeCaveat) {
    throw new Error(
      'Invalid payee caveats: use either LogicalOrWrapperEnforcer or a single-payee caveat',
    );
  }

  if (logicalOrCaveats.length === 1) {
    if (enforcers.singlePayeeEnforcer !== enforcers.allowedCalldataEnforcer) {
      throw new Error(
        'Invalid LogicalOrWrapperEnforcer payee caveat: only ERC20 payees may use LogicalOrWrapperEnforcer',
      );
    }

    const [logicalOrCaveat] = logicalOrCaveats;
    if (logicalOrCaveat.args !== LOGICAL_OR_WRAPPER_CAVEAT_ARGS) {
      throw new Error(
        `Invalid LogicalOrWrapperEnforcer payee args: must be ${LOGICAL_OR_WRAPPER_CAVEAT_ARGS}`,
      );
    }

    const decoded = decodeLogicalOrWrapperTerms(logicalOrCaveat.terms);
    if (decoded.caveatGroups.length === 0) {
      throw new Error(
        'Invalid LogicalOrWrapperEnforcer payee terms: must contain at least one caveat group',
      );
    }

    return decoded.caveatGroups.flatMap((group) => {
      if (group.length !== 1) {
        throw new Error(
          'Invalid LogicalOrWrapperEnforcer payee terms: each caveat group must contain exactly one caveat',
        );
      }

      const addresses = extractPayeeAddressesFromExpectedCaveat(
        group[0],
        enforcers,
      );

      return addresses;
    });
  }

  if (singlePayeeCaveat) {
    return extractPayeeAddressesFromExpectedCaveat(
      singlePayeeCaveat,
      enforcers,
    );
  }

  return null;
}
