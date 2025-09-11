import type {
  PermissionRequest,
  PermissionTypes,
  Signer,
} from '@metamask/7715-permission-types';
import type { Caveat, Hex } from '@metamask/delegation-core';
import { ROOT_AUTHORITY } from '@metamask/delegation-core';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import { getChecksumAddress, hexToNumber, numberToHex } from '@metamask/utils';

/**
 * Delegation framework version used to select the correct deployed enforcer
 * contract addresses from `@metamask/delegation-deployments`.
 */
export const DELEGATION_FRAMEWORK_VERSION = '1.3.0';

// This is a somewhat convoluted type - it includes all of the fields that are decoded from the permission context.
/**
 * A partially reconstructed permission object decoded from a permission context.
 *
 * This mirrors the shape of {@link PermissionRequest} for fields that can be
 * deterministically recovered from the encoded permission context, and it
 * augments the result with an explicit `expiry` property derived from the
 * `TimestampEnforcer` terms, as well as the `origin` property.
 */
export type DecodedPermission = Pick<
  PermissionRequest<Signer, PermissionTypes>,
  'chainId' | 'address' | 'signer'
> & {
  permission: Omit<
    PermissionRequest<Signer, PermissionTypes>['permission'],
    'isAdjustmentAllowed'
    // PermissionRequest type does not work well without the specific permission type, so we amend it here
  > & { justification?: string };
  expiry: number | null;
  origin: string;
};

/**
 * Supported permission type identifiers that can be decoded from a permission context.
 */
export type PermissionType = DecodedPermission['permission']['type'];

const ENFORCER_CONTRACT_NAMES = {
  ERC20PeriodTransferEnforcer: 'ERC20PeriodTransferEnforcer',
  ERC20StreamingEnforcer: 'ERC20StreamingEnforcer',
  ExactCalldataEnforcer: 'ExactCalldataEnforcer',
  NativeTokenPeriodTransferEnforcer: 'NativeTokenPeriodTransferEnforcer',
  NativeTokenStreamingEnforcer: 'NativeTokenStreamingEnforcer',
  TimestampEnforcer: 'TimestampEnforcer',
  ValueLteEnforcer: 'ValueLteEnforcer',
  NonceEnforcer: 'NonceEnforcer',
};

type PermissionRule = {
  permissionType: PermissionType;
  requiredEnforcers: Set<Hex>;
  allowedEnforcers: Set<Hex>;
};

const contractsByChainId = DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION];

/**
 * Resolves and returns checksummed addresses of all known enforcer contracts
 * for a given `chainId` under the current delegation framework version.
 *
 * @param chainId - The numeric chain ID whose enforcer contracts to load.
 * @returns An object mapping enforcer names to checksummed contract addresses.
 * @throws If the chain or an expected enforcer contract is not found.
 */
const getChecksumEnforcersByChainId = (chainId: number) => {
  const contracts = contractsByChainId[chainId];

  if (!contracts) {
    throw new Error(`Contracts not found for chainId: ${chainId}`);
  }

  const getChecksumContractAddress = (contractName: string) => {
    const address = contracts[contractName];

    if (!address) {
      throw new Error(`Contract not found: ${contractName}`);
    }

    return getChecksumAddress(address);
  };

  // permission type specific enforcers
  const erc20StreamingEnforcer = getChecksumContractAddress(
    ENFORCER_CONTRACT_NAMES.ERC20StreamingEnforcer,
  );
  const erc20PeriodicEnforcer = getChecksumContractAddress(
    ENFORCER_CONTRACT_NAMES.ERC20PeriodTransferEnforcer,
  );
  const nativeTokenStreamingEnforcer = getChecksumContractAddress(
    ENFORCER_CONTRACT_NAMES.NativeTokenStreamingEnforcer,
  );
  const nativeTokenPeriodicEnforcer = getChecksumContractAddress(
    ENFORCER_CONTRACT_NAMES.NativeTokenPeriodTransferEnforcer,
  );

  // general enforcers
  const exactCalldataEnforcer = getChecksumContractAddress(
    ENFORCER_CONTRACT_NAMES.ExactCalldataEnforcer,
  );
  const valueLteEnforcer = getChecksumContractAddress(
    ENFORCER_CONTRACT_NAMES.ValueLteEnforcer,
  );
  const timestampEnforcer = getChecksumContractAddress(
    ENFORCER_CONTRACT_NAMES.TimestampEnforcer,
  );
  const nonceEnforcer = getChecksumContractAddress(
    ENFORCER_CONTRACT_NAMES.NonceEnforcer,
  );

  return {
    erc20StreamingEnforcer,
    erc20PeriodicEnforcer,
    nativeTokenStreamingEnforcer,
    nativeTokenPeriodicEnforcer,
    exactCalldataEnforcer,
    valueLteEnforcer,
    timestampEnforcer,
    nonceEnforcer,
  };
};

/**
 * Builds the canonical set of permission matching rules for a chain.
 *
 * Each rule specifies the `permissionType`, the set of `requiredEnforcers`
 * that must be present, and the set of `allowedEnforcers` that may appear in
 * addition to the required set.
 *
 * @param chainId - The numeric chain ID used to resolve enforcer addresses.
 * @returns A list of permission rules used to identify permission types.
 * @throws Propagates any errors from resolving enforcer addresses.
 */
const createPermissionRulesForChainId: (chainId: number) => PermissionRule[] = (
  chainId: number,
) => {
  const {
    erc20StreamingEnforcer,
    erc20PeriodicEnforcer,
    nativeTokenStreamingEnforcer,
    nativeTokenPeriodicEnforcer,
    exactCalldataEnforcer,
    valueLteEnforcer,
    timestampEnforcer,
    nonceEnforcer,
  } = getChecksumEnforcersByChainId(chainId);

  // the allowed enforcers are the same for all permission types
  const allowedEnforcers = new Set<Hex>([timestampEnforcer]);

  const permissionRules: PermissionRule[] = [
    {
      requiredEnforcers: new Set<Hex>([
        nativeTokenStreamingEnforcer,
        exactCalldataEnforcer,
        nonceEnforcer,
      ]),
      allowedEnforcers,
      permissionType: 'native-token-stream',
    },
    {
      requiredEnforcers: new Set<Hex>([
        nativeTokenPeriodicEnforcer,
        exactCalldataEnforcer,
        nonceEnforcer,
      ]),
      allowedEnforcers,
      permissionType: 'native-token-periodic',
    },
    {
      requiredEnforcers: new Set<Hex>([
        erc20StreamingEnforcer,
        valueLteEnforcer,
        nonceEnforcer,
      ]),
      allowedEnforcers,
      permissionType: 'erc20-token-stream',
    },
    {
      requiredEnforcers: new Set<Hex>([
        erc20PeriodicEnforcer,
        valueLteEnforcer,
        nonceEnforcer,
      ]),
      allowedEnforcers,
      permissionType: 'erc20-token-periodic',
    },
  ];

  return permissionRules;
};

/**
 * Determines whether all elements of `subset` are contained within `superset`.
 *
 * @param subset - The candidate subset to test.
 * @param superset - The set expected to contain all elements of `subset`.
 * @returns `true` if `subset` ⊆ `superset`, otherwise `false`.
 */
const isSubset = <T>(subset: Set<T>, superset: Set<T>) => {
  for (const x of subset) {
    if (!superset.has(x)) {
      return false;
    }
  }
  return true;
};

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
 * @param args.chainId - Chain ID to resolve the enforcer addresses against.
 *
 * @returns The identifier of the matching permission type.
 * @throws If no permission type matches, or if more than one permission type matches.
 */
export const identifyPermissionByEnforcers = ({
  enforcers,
  chainId,
}: {
  enforcers: Hex[];
  chainId: number;
}): PermissionType => {
  const enforcersSet = new Set(enforcers.map(getChecksumAddress));

  const permissionRules = createPermissionRulesForChainId(chainId);

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

const getTermsByEnforcer = (caveats: Caveat<Hex>[], enforcer: Hex) => {
  const matchingCaveats = caveats.filter(
    (caveat) => caveat.enforcer === enforcer,
  );

  if (matchingCaveats.length !== 1) {
    throw new Error('Invalid caveats');
  }

  return matchingCaveats[0].terms;
};

/**
 * Splits a 0x-prefixed hex string into parts according to the provided byte lengths.
 *
 * Each entry in `lengths` represents a part length in bytes; internally this is
 * multiplied by 2 to derive the number of hexadecimal characters to slice. The
 * returned substrings do not include the `0x` prefix and preserve leading zeros.
 *
 * Note: This function does not perform input validation (e.g., verifying the
 * payload length equals the sum of requested lengths). Callers are expected to
 * provide well-formed inputs.
 *
 * Example:
 * splitHex('0x12345678', [1, 3]) => ['0x12', '0x345678']
 *
 * @param value - The 0x-prefixed hex string to split.
 * @param lengths - The lengths of each part, in bytes.
 * @returns An array of hex substrings (each with `0x` prefix), one for each part.
 */
function splitHex(value: Hex, lengths: number[]): Hex[] {
  let start = 2;
  const parts: Hex[] = [];
  for (const partLength of lengths) {
    const partCharLength = partLength * 2;
    const part = value.slice(start, start + partCharLength);
    start += partCharLength;
    parts.push(`0x${part}` as Hex);
  }
  return parts;
}

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
 * @param args.chainId - Chain ID used to resolve the enforcer addresses for lookups.
 * @param args.caveats - Caveats decoded from the permission context.
 * @param args.permissionType - The previously identified permission type.
 *
 * @returns An object containing the `expiry` timestamp and the decoded `data` payload.
 * @throws If the caveats are malformed, missing, or the terms fail to decode.
 */
export const getPermissionDataAndExpiry = ({
  chainId,
  caveats,
  permissionType,
}: {
  chainId: number;
  caveats: Caveat<Hex>[];
  permissionType: PermissionType;
}): {
  expiry: number;
  data: DecodedPermission['permission']['data'];
} => {
  const checksummedCaveats = caveats.map((caveat) => ({
    ...caveat,
    enforcer: getChecksumAddress(caveat.enforcer),
  }));

  const {
    erc20StreamingEnforcer,
    erc20PeriodicEnforcer,
    nativeTokenStreamingEnforcer,
    nativeTokenPeriodicEnforcer,
    timestampEnforcer,
  } = getChecksumEnforcersByChainId(chainId);

  const expiryTerms = getTermsByEnforcer(checksummedCaveats, timestampEnforcer);
  const [after, before] = splitHex(expiryTerms, [16, 16]);

  if (hexToNumber(after) !== 0) {
    throw new Error('Invalid expiry');
  }
  const expiry = hexToNumber(before);

  let data: DecodedPermission['permission']['data'];

  switch (permissionType) {
    case 'erc20-token-stream': {
      const erc20StreamingTerms = getTermsByEnforcer(
        checksummedCaveats,
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
      } as unknown as DecodedPermission['permission']['data'];
      break;
    }
    case 'erc20-token-periodic': {
      const erc20PeriodicTerms = getTermsByEnforcer(
        checksummedCaveats,
        erc20PeriodicEnforcer,
      );

      const [tokenAddress, periodAmount, periodDurationRaw, startTimeRaw] =
        splitHex(erc20PeriodicTerms, [20, 32, 32, 32]);

      const periodDuration = hexToNumber(periodDurationRaw);

      data = {
        tokenAddress,
        periodAmount,
        periodDuration,
        startTime: hexToNumber(startTimeRaw),
      } as unknown as DecodedPermission['permission']['data'];
      break;
    }

    case 'native-token-stream': {
      const nativeTokenStreamingTerms = getTermsByEnforcer(
        checksummedCaveats,
        nativeTokenStreamingEnforcer,
      );

      const [initialAmount, maxAmount, amountPerSecond, startTimeRaw] =
        splitHex(nativeTokenStreamingTerms, [32, 32, 32, 32]);

      data = {
        initialAmount,
        maxAmount,
        amountPerSecond,
        startTime: hexToNumber(startTimeRaw),
      } as unknown as DecodedPermission['permission']['data'];
      break;
    }
    case 'native-token-periodic': {
      const nativeTokenPeriodicTerms = getTermsByEnforcer(
        checksummedCaveats,
        nativeTokenPeriodicEnforcer,
      );

      const [periodAmount, periodDuration, startTimeRaw] = splitHex(
        nativeTokenPeriodicTerms,
        [32, 32, 32],
      );

      data = {
        periodAmount,
        periodDuration,
        startTime: hexToNumber(startTimeRaw),
      } as unknown as DecodedPermission['permission']['data'];
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
 * @param args.chainId - Numeric chain ID.
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
