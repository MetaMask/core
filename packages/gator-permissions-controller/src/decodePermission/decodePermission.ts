import type { Caveat, Hex } from '@metamask/delegation-core';
import { ROOT_AUTHORITY } from '@metamask/delegation-core';
import { getChecksumAddress, hexToNumber, numberToHex } from '@metamask/utils';

import type {
  DecodedPermission,
  DeployedContractsByName,
  PermissionType,
} from './types';
import {
  createPermissionRulesForChainId,
  getChecksumEnforcersByChainId,
  getTermsByEnforcer,
  isSubset,
  splitHex,
} from './utils';

/**
 * Identifies the unique permission type that matches a given set of enforcer
 * contract addresses for a specific chain.
 *
 * A permission type matches when:
 * - All of its required enforcers are present in the provided list; and
 * - No provided enforcer falls outside the union of the type's required and
 * allowed enforcers (currently only `TimestampEnforcer` is allowed extra).
 *
 * If exactly one permission type matches, its identifier is returned.
 *
 * @param args - The arguments to this function.
 * @param args.enforcers - List of enforcer contract addresses (hex strings).
 *
 * @param args.contracts - The deployed contracts for the chain.
 * @returns The identifier of the matching permission type.
 * @throws If no permission type matches, or if more than one permission type matches.
 */
export const identifyPermissionByEnforcers = ({
  enforcers,
  contracts,
}: {
  enforcers: Hex[];
  contracts: DeployedContractsByName;
}): PermissionType => {
  const enforcersSet = new Set(enforcers.map(getChecksumAddress));

  const permissionRules = createPermissionRulesForChainId(contracts);

  let matchingPermissionType: PermissionType | null = null;

  for (const {
    allowedEnforcers,
    requiredEnforcers,
    permissionType,
  } of permissionRules) {
    const hasAllRequiredEnforcers = isSubset(requiredEnforcers, enforcersSet);

    let hasForbiddenEnforcers = false;

    for (const caveat of enforcersSet) {
      if (!allowedEnforcers.has(caveat) && !requiredEnforcers.has(caveat)) {
        hasForbiddenEnforcers = true;
        break;
      }
    }

    if (hasAllRequiredEnforcers && !hasForbiddenEnforcers) {
      if (matchingPermissionType) {
        throw new Error('Multiple permission types match');
      }
      matchingPermissionType = permissionType;
    }
  }

  if (!matchingPermissionType) {
    throw new Error('Unable to identify permission type');
  }

  return matchingPermissionType;
};

/**
 * Extracts the permission-specific data payload and the expiry timestamp from
 * the provided caveats for a given permission type.
 *
 * This function locates the relevant caveat enforcer for the `permissionType`,
 * interprets its `terms` by splitting the hex string into byte-sized segments,
 * and converts each segment into the appropriate numeric or address shape.
 *
 * The expiry timestamp is derived from the `TimestampEnforcer` terms and must
 * have a zero `timestampAfterThreshold` and a positive `timestampBeforeThreshold`.
 *
 * @param args - The arguments to this function.
 * @param args.contracts - The deployed contracts for the chain.
 * @param args.caveats - Caveats decoded from the permission context.
 * @param args.permissionType - The previously identified permission type.
 *
 * @returns An object containing the `expiry` timestamp and the decoded `data` payload.
 * @throws If the caveats are malformed, missing, or the terms fail to decode.
 */
export const getPermissionDataAndExpiry = ({
  contracts,
  caveats,
  permissionType,
}: {
  contracts: DeployedContractsByName;
  caveats: Caveat<Hex>[];
  permissionType: PermissionType;
}): {
  expiry: number;
  data: DecodedPermission['permission']['data'];
} => {
  const checksumCaveats = caveats.map((caveat) => ({
    ...caveat,
    enforcer: getChecksumAddress(caveat.enforcer),
  }));

  const {
    erc20StreamingEnforcer,
    erc20PeriodicEnforcer,
    nativeTokenStreamingEnforcer,
    nativeTokenPeriodicEnforcer,
    timestampEnforcer,
  } = getChecksumEnforcersByChainId(contracts);

  const expiryTerms = getTermsByEnforcer(checksumCaveats, timestampEnforcer);
  const [after, before] = splitHex(expiryTerms, [16, 16]);

  if (hexToNumber(after) !== 0) {
    throw new Error('Invalid expiry');
  }
  const expiry = hexToNumber(before);

  let data: DecodedPermission['permission']['data'];

  switch (permissionType) {
    case 'erc20-token-stream': {
      const erc20StreamingTerms = getTermsByEnforcer(
        checksumCaveats,
        erc20StreamingEnforcer,
      );

      const [
        tokenAddress,
        initialAmount,
        maxAmount,
        amountPerSecond,
        startTimeRaw,
      ] = splitHex(erc20StreamingTerms, [20, 32, 32, 32, 32]);

      data = {
        tokenAddress,
        initialAmount,
        maxAmount,
        amountPerSecond,
        startTime: hexToNumber(startTimeRaw),
      };
      break;
    }
    case 'erc20-token-periodic': {
      const erc20PeriodicTerms = getTermsByEnforcer(
        checksumCaveats,
        erc20PeriodicEnforcer,
      );

      const [tokenAddress, periodAmount, periodDurationRaw, startTimeRaw] =
        splitHex(erc20PeriodicTerms, [20, 32, 32, 32]);

      data = {
        tokenAddress,
        periodAmount,
        periodDuration: hexToNumber(periodDurationRaw),
        startTime: hexToNumber(startTimeRaw),
      };
      break;
    }

    case 'native-token-stream': {
      const nativeTokenStreamingTerms = getTermsByEnforcer(
        checksumCaveats,
        nativeTokenStreamingEnforcer,
      );

      const [initialAmount, maxAmount, amountPerSecond, startTimeRaw] =
        splitHex(nativeTokenStreamingTerms, [32, 32, 32, 32]);

      data = {
        initialAmount,
        maxAmount,
        amountPerSecond,
        startTime: hexToNumber(startTimeRaw),
      };
      break;
    }
    case 'native-token-periodic': {
      const nativeTokenPeriodicTerms = getTermsByEnforcer(
        checksumCaveats,
        nativeTokenPeriodicEnforcer,
      );

      const [periodAmount, periodDurationRaw, startTimeRaw] = splitHex(
        nativeTokenPeriodicTerms,
        [32, 32, 32],
      );

      data = {
        periodAmount,
        periodDuration: hexToNumber(periodDurationRaw),
        startTime: hexToNumber(startTimeRaw),
      };
      break;
    }
    default:
      throw new Error('Invalid permission type');
  }

  return { expiry, data };
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
}) => {
  if (authority !== ROOT_AUTHORITY) {
    throw new Error('Invalid authority');
  }

  const permission: DecodedPermission = {
    chainId: numberToHex(chainId),
    address: delegator,
    signer: { type: 'account', data: { address: delegate } },
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
