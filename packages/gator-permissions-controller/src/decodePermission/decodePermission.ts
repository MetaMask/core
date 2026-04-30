import type { Caveat, Hex } from '@metamask/delegation-core';
import { ROOT_AUTHORITY } from '@metamask/delegation-core';
import { numberToHex } from '@metamask/utils';

import type {
  DecodedPermission,
  PermissionType,
  PermissionRule,
  ValidateAndDecodeResult,
} from './types';

/**
 * Returns every permission rule whose caveat-address pattern matches the given
 * enforcer list for the chain. Used when more than one permission type can
 * share the same enforcer set; the caller must disambiguate by validating
 * caveat terms (see {@link selectUniqueRuleAndDecodedPermission}).
 *
 * @param args - The arguments to this function.
 * @param args.enforcers - List of enforcer contract addresses (hex strings).
 * @param args.permissionRules - The permission rules for the chain.
 * @returns All rules that match, possibly empty.
 */
export const findRulesWithMatchingCaveatAddresses = ({
  enforcers,
  permissionRules,
}: {
  enforcers: Hex[];
  permissionRules: PermissionRule[];
}): PermissionRule[] => {
  return permissionRules.filter((rule) => rule.caveatAddressesMatch(enforcers));
};

/**
 * Returns the unique permission rule that matches a given set of enforcer
 * contract addresses (caveat types) for a specific chain.
 *
 * A rule matches when:
 * - All of its required enforcers are present in the provided list; and
 * - No provided enforcer falls outside the union of the rule's required and
 * optional enforcers (currently only `TimestampEnforcer` is allowed extra).
 *
 * If exactly one rule matches, it is returned.
 *
 * @param args - The arguments to this function.
 * @param args.enforcers - List of enforcer contract addresses (hex strings).
 * @param args.permissionRules - The permission rules for the chain.
 * @returns The matching permission rule.
 * @throws If no rule matches, or if more than one rule matches.
 */
export const findRuleWithMatchingCaveatAddresses = ({
  enforcers,
  permissionRules,
}: {
  enforcers: Hex[];
  permissionRules: PermissionRule[];
}): PermissionRule => {
  const matchingRules = findRulesWithMatchingCaveatAddresses({
    enforcers,
    permissionRules,
  });

  if (matchingRules.length === 0) {
    throw new Error('Unable to identify permission type');
  }
  if (matchingRules.length > 1) {
    throw new Error('Multiple permission types match');
  }
  return matchingRules[0];
};

type SuccessfulValidateAndDecodeResult = Extract<
  ValidateAndDecodeResult,
  { isValid: true }
>;

type RuleAndDecodedPermission = {
  rule: PermissionRule;
  rules: SuccessfulValidateAndDecodeResult['rules'];
  data: SuccessfulValidateAndDecodeResult['data'];
  expiry: SuccessfulValidateAndDecodeResult['expiry'];
};

/**
 * Runs {@link PermissionRule.validateAndDecodePermission} on each candidate
 * rule. Use when several rules share the same caveat addresses.
 *
 * @param args - The arguments to this function.
 * @param args.candidateRules - Rules whose addresses already match the caveats.
 * @param args.caveats - Caveats from the delegation.
 * @returns The unique rule and decoded expiry/data when exactly one rule validates.
 * @throws If `candidateRules` is empty, if no rule validates, or if more than one rule validates.
 */
export const selectUniqueRuleAndDecodedPermission = ({
  candidateRules,
  caveats,
}: {
  candidateRules: PermissionRule[];
  caveats: Caveat<Hex>[];
}): RuleAndDecodedPermission => {
  if (candidateRules.length === 0) {
    throw new Error('Unable to identify permission type');
  }

  const successfulDecodingResult: RuleAndDecodedPermission[] = [];

  const failedAttempts: { permissionType: PermissionType; error: Error }[] = [];

  for (const rule of candidateRules) {
    const decodeResult = rule.validateAndDecodePermission(caveats);
    if (decodeResult.isValid) {
      successfulDecodingResult.push({
        rule,
        rules: decodeResult.rules,
        data: decodeResult.data,
        expiry: decodeResult.expiry,
      });
    } else {
      failedAttempts.push({
        permissionType: rule.permissionType,
        error: decodeResult.error,
      });
    }
  }

  if (successfulDecodingResult.length === 1) {
    return successfulDecodingResult[0];
  }

  if (successfulDecodingResult.length > 1) {
    const types = successfulDecodingResult
      .map((result) => result.rule.permissionType)
      .join(', ');
    throw new Error(
      `Multiple permission types validate the same delegation caveats: ${types}`,
    );
  }

  if (failedAttempts.length === 1) {
    throw failedAttempts[0].error;
  }

  const details = failedAttempts
    .map(
      (attempt) =>
        `${String(attempt.permissionType)}: ${attempt.error.message}`,
    )
    .join('; ');

  throw new Error(
    `No permission type could validate the delegation caveats. Attempts: ${details}`,
  );
};

/**
 * Reconstructs a {@link DecodedPermission} object from primitive values
 * obtained while decoding a permission context.
 *
 * The resulting object contains:
 * - `chainId` encoded as hex (`0x…`)
 * - `address` set to the delegator (user account)
 * - `signer` set to an account signer with the delegate address
 * - `permission` with the identified type and decoded data
 * - `expiry` timestamp (or null)
 *
 * @param args - The arguments to this function.
 * @param args.chainId - Chain ID.
 * @param args.permissionType - Identified permission type.
 * @param args.delegator - Address of the account delegating permission.
 * @param args.delegate - Address that will act under the granted permission.
 * @param args.authority - Authority identifier; must be ROOT_AUTHORITY.
 * @param args.expiry - Expiry timestamp (unix seconds) or null if unbounded.
 * @param args.data - Permission-specific decoded data payload.
 * @param args.justification - Human-readable justification for the permission.
 * @param args.specifiedOrigin - The origin reported in the request metadata.
 * @param args.rules - Rules recovered from caveats (e.g. redeemer allowlist).
 *
 * @returns The reconstructed {@link DecodedPermission}.
 */
export const reconstructDecodedPermission = ({
  chainId,
  permissionType,
  delegator,
  delegate,
  authority,
  expiry,
  data,
  justification,
  specifiedOrigin,
  rules,
}: {
  chainId: number;
  permissionType: PermissionType;
  delegator: Hex;
  delegate: Hex;
  authority: Hex;
  expiry: number | null;
  data: DecodedPermission['permission']['data'];
  justification: string;
  specifiedOrigin: string;
  rules?: DecodedPermission['rules'];
}): DecodedPermission => {
  if (authority !== ROOT_AUTHORITY) {
    throw new Error('Invalid authority');
  }

  const permission: DecodedPermission = {
    chainId: numberToHex(chainId),
    from: delegator,
    to: delegate,
    permission: {
      type: permissionType,
      data,
      justification,
    },
    expiry,
    origin: specifiedOrigin,
    ...(rules === undefined ? {} : { rules }),
  };

  return permission;
};
