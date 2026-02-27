import type { Caveat, Hex } from '@metamask/delegation-core';
import { ROOT_AUTHORITY } from '@metamask/delegation-core';
import {
  getChecksumAddress,
  hexToBigInt,
  hexToNumber,
  numberToHex,
} from '@metamask/utils';

import type {
  DecodedPermission,
  DeployedContractsByName,
  PermissionType,
} from './types';
import {
  createPermissionRulesForChainId,
  getChecksumEnforcersByChainId,
  getTermsByEnforcer,
  splitHex,
} from './utils';

/**
 * Identifies the unique permission type that matches a given set of enforcer
 * contract addresses for a specific chain.
 *
 * A permission type matches when:
 * - All of its required enforcers are present in the provided list; and
 * - No provided enforcer falls outside the union of the type's required and
 * optional enforcers (currently only `TimestampEnforcer` is allowed extra).
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
  // Build frequency map for enforcers (using checksummed addresses)
  const counts = new Map<Hex, number>();
  for (const addr of enforcers.map(getChecksumAddress)) {
    counts.set(addr, (counts.get(addr) ?? 0) + 1);
  }
  const enforcersSet = new Set(counts.keys());

  const permissionRules = createPermissionRulesForChainId(contracts);

  let matchingPermissionType: PermissionType | null = null;

  for (const {
    optionalEnforcers,
    requiredEnforcers,
    permissionType,
  } of permissionRules) {
    // union of optional + required enforcers. Any other address is forbidden.
    const allowedEnforcers = new Set<Hex>([
      ...optionalEnforcers,
      ...requiredEnforcers.keys(),
    ]);

    let hasForbiddenEnforcers = false;

    for (const caveat of enforcersSet) {
      if (!allowedEnforcers.has(caveat)) {
        hasForbiddenEnforcers = true;
        break;
      }
    }

    // exact multiplicity match for required enforcers
    let meetsRequiredCounts = true;
    for (const [addr, requiredCount] of requiredEnforcers.entries()) {
      if ((counts.get(addr) ?? 0) !== requiredCount) {
        meetsRequiredCounts = false;
        break;
      }
    }

    if (meetsRequiredCounts && !hasForbiddenEnforcers) {
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
 * Extracts the expiry timestamp from TimestampEnforcer caveat terms.
 *
 * Based on the TimestampEnforcer contract encoding:
 * - Terms are 32 bytes total (64 hex characters without '0x')
 * - First 16 bytes (32 hex chars): timestampAfterThreshold (uint128) - must be 0
 * - Last 16 bytes (32 hex chars): timestampBeforeThreshold (uint128) - this is the expiry
 *
 * @param terms - The hex-encoded terms from a TimestampEnforcer caveat
 * @returns The expiry timestamp in seconds
 * @throws If the terms are not exactly 32 bytes, if the timestampAfterThreshold is non-zero,
 * or if the timestampBeforeThreshold is zero
 */
const extractExpiryFromCaveatTerms = (terms: Hex): number => {
  // Validate terms length: must be exactly 32 bytes (64 hex chars + '0x' prefix = 66 chars)
  if (terms.length !== 66) {
    throw new Error(
      `Invalid TimestampEnforcer terms length: expected 66 characters (0x + 64 hex), got ${terms.length}`,
    );
  }

  const [after, before] = splitHex(terms, [16, 16]);

  if (hexToNumber(after) !== 0) {
    throw new Error('Invalid expiry: timestampAfterThreshold must be 0');
  }

  const expiry = hexToNumber(before);

  if (expiry === 0) {
    throw new Error(
      'Invalid expiry: timestampBeforeThreshold must be greater than 0',
    );
  }

  return expiry;
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
  expiry: number | null;
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
    allowedCalldataEnforcer,
    valueLteEnforcer,
  } = getChecksumEnforcersByChainId(contracts);

  const expiryTerms = getTermsByEnforcer({
    caveats: checksumCaveats,
    enforcer: timestampEnforcer,
    throwIfNotFound: false,
  });

  let expiry: number | null = null;
  if (expiryTerms) {
    expiry = extractExpiryFromCaveatTerms(expiryTerms);
  }

  let data: DecodedPermission['permission']['data'];

  switch (permissionType) {
    case 'erc20-token-stream': {
      const erc20StreamingTerms = getTermsByEnforcer({
        caveats: checksumCaveats,
        enforcer: erc20StreamingEnforcer,
      });

      const [
        tokenAddress,
        initialAmount,
        maxAmount,
        amountPerSecond,
        startTimeRaw,
      ] = splitHex(erc20StreamingTerms, [20, 32, 32, 32, 32]);

      const startTime = hexToNumber(startTimeRaw);
      const initialAmountBigInt = hexToBigInt(initialAmount);
      const maxAmountBigInt = hexToBigInt(maxAmount);

      if (maxAmountBigInt < initialAmountBigInt) {
        throw new Error(
          'Invalid erc20-token-stream terms: maxAmount must be greater than initialAmount',
        );
      }

      if (startTime <= 0) {
        throw new Error(
          'Invalid erc20-token-stream terms: startTime must be a positive number',
        );
      }

      data = {
        tokenAddress,
        initialAmount,
        maxAmount,
        amountPerSecond,
        startTime,
      };
      break;
    }
    case 'erc20-token-periodic': {
      const erc20PeriodicTerms = getTermsByEnforcer({
        caveats: checksumCaveats,
        enforcer: erc20PeriodicEnforcer,
      });

      const [tokenAddress, periodAmount, periodDurationRaw, startTimeRaw] =
        splitHex(erc20PeriodicTerms, [20, 32, 32, 32]);

      const periodDuration = hexToNumber(periodDurationRaw);
      const startTime = hexToNumber(startTimeRaw);

      if (periodDuration <= 0) {
        throw new Error(
          'Invalid erc20-token-periodic terms: periodDuration must be a positive number',
        );
      }

      if (startTime <= 0) {
        throw new Error(
          'Invalid erc20-token-periodic terms: startTime must be a positive number',
        );
      }

      data = {
        tokenAddress,
        periodAmount,
        periodDuration,
        startTime,
      };
      break;
    }

    case 'native-token-stream': {
      const nativeTokenStreamingTerms = getTermsByEnforcer({
        caveats: checksumCaveats,
        enforcer: nativeTokenStreamingEnforcer,
      });

      const [initialAmount, maxAmount, amountPerSecond, startTimeRaw] =
        splitHex(nativeTokenStreamingTerms, [32, 32, 32, 32]);

      const initialAmountBigInt = hexToBigInt(initialAmount);
      const maxAmountBigInt = hexToBigInt(maxAmount);
      const amountPerSecondBigInt = hexToBigInt(amountPerSecond);
      const startTime = hexToNumber(startTimeRaw);

      if (initialAmountBigInt <= 0n) {
        throw new Error(
          'Invalid native-token-stream terms: initialAmount must be a positive number',
        );
      }

      if (maxAmountBigInt <= 0n) {
        throw new Error(
          'Invalid native-token-stream terms: maxAmount must be a positive number',
        );
      }

      if (amountPerSecondBigInt <= 0n) {
        throw new Error(
          'Invalid native-token-stream terms: amountPerSecond must be a positive number',
        );
      }

      if (startTime <= 0) {
        throw new Error(
          'Invalid native-token-stream terms: startTime must be a positive number',
        );
      }

      data = {
        initialAmount,
        maxAmount,
        amountPerSecond,
        startTime,
      };
      break;
    }
    case 'native-token-periodic': {
      const nativeTokenPeriodicTerms = getTermsByEnforcer({
        caveats: checksumCaveats,
        enforcer: nativeTokenPeriodicEnforcer,
      });

      const [periodAmount, periodDurationRaw, startTimeRaw] = splitHex(
        nativeTokenPeriodicTerms,
        [32, 32, 32],
      );

      const periodDuration = hexToNumber(periodDurationRaw);
      const startTime = hexToNumber(startTimeRaw);

      if (periodDuration <= 0) {
        throw new Error(
          'Invalid native-token-periodic terms: periodDuration must be a positive number',
        );
      }

      if (startTime <= 0) {
        throw new Error(
          'Invalid native-token-periodic terms: startTime must be a positive number',
        );
      }

      data = {
        periodAmount,
        periodDuration,
        startTime,
      };
      break;
    }
    case 'erc20-token-revocation': {
      // 0 value for ValueLteEnforcer
      const ZERO_32_BYTES =
        '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

      // Approve() 4byte selector starting at index 0
      const ERC20_APPROVE_SELECTOR_TERMS =
        '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as const;

      // 0 amount starting at index 24
      const ERC20_APPROVE_ZERO_AMOUNT_TERMS =
        '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as const;

      const allowedCalldataCaveats = checksumCaveats.filter(
        (caveat) => caveat.enforcer === allowedCalldataEnforcer,
      );

      const allowedCalldataTerms = allowedCalldataCaveats.map((caveat) =>
        caveat.terms.toLowerCase(),
      );

      const hasApproveSelector = allowedCalldataTerms.includes(
        ERC20_APPROVE_SELECTOR_TERMS,
      );

      const hasZeroAmount = allowedCalldataTerms.includes(
        ERC20_APPROVE_ZERO_AMOUNT_TERMS,
      );

      if (!hasApproveSelector || !hasZeroAmount) {
        throw new Error(
          'Invalid erc20-token-revocation terms: expected approve selector and zero amount constraints',
        );
      }

      const valueLteTerms = getTermsByEnforcer({
        caveats: checksumCaveats,
        enforcer: valueLteEnforcer,
      });

      if (valueLteTerms !== ZERO_32_BYTES) {
        throw new Error('Invalid ValueLteEnforcer terms: maxValue must be 0');
      }

      data = {};
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
