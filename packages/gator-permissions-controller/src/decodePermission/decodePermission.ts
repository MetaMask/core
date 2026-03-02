import type { Hex } from '@metamask/delegation-core';
import { ROOT_AUTHORITY } from '@metamask/delegation-core';
import { numberToHex } from '@metamask/utils';

import type { DecodedPermission, PermissionType } from './types';
import type { PermissionRule } from './types';

/*
 * Decoding can be driven entirely by permission rules:
 *
 *   const permissionRules = createPermissionRulesForChainId(contracts);
 *   const matchingRules = permissionRules.filter(rule => rule.caveatAddressesMatch(caveatAddresses));
 *   // Expect exactly one match for current rule set; then:
 *   const result = matchingRules[0].validateAndDecodePermission(caveats);
 *   if (result.isValid) { ... result.expiry, result.data ... }
 *
 * getPermissionRuleMatchingCaveatTypes and getPermissionDataAndExpiry use these rules
 * internally and preserve the existing throw-on-failure API.
 */

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
  const matchingRules = permissionRules.filter((rule) =>
    rule.caveatAddressesMatch(enforcers),
  );

  if (matchingRules.length === 0) {
    throw new Error('Unable to identify permission type');
  }
  if (matchingRules.length > 1) {
    throw new Error('Multiple permission types match');
  }
  return matchingRules[0];
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
  };

  return permission;
};
