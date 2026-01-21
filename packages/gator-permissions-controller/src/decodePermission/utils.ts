import type { Caveat } from '@metamask/delegation-core';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { DeployedContractsByName, PermissionType } from './types';

/**
 * A rule that defines the required and allowed enforcers for a permission type.
 */
export type PermissionRule = {
  permissionType: PermissionType;
  requiredEnforcers: Map<Hex, number>;
  optionalEnforcers: Set<Hex>;
};

/**
 * The names of the enforcer contracts for each permission type.
 */
const ENFORCER_CONTRACT_NAMES = {
  ERC20PeriodTransferEnforcer: 'ERC20PeriodTransferEnforcer',
  ERC20StreamingEnforcer: 'ERC20StreamingEnforcer',
  ExactCalldataEnforcer: 'ExactCalldataEnforcer',
  NativeTokenPeriodTransferEnforcer: 'NativeTokenPeriodTransferEnforcer',
  NativeTokenStreamingEnforcer: 'NativeTokenStreamingEnforcer',
  TimestampEnforcer: 'TimestampEnforcer',
  ValueLteEnforcer: 'ValueLteEnforcer',
  NonceEnforcer: 'NonceEnforcer',
  AllowedCalldataEnforcer: 'AllowedCalldataEnforcer',
};

/**
 * Resolves and returns checksummed addresses of all known enforcer contracts
 * for a given `chainId` under the current delegation framework version.
 *
 * @param contracts - The deployed contracts for the chain.
 * @returns An object mapping enforcer names to checksummed contract addresses.
 * @throws If the chain or an expected enforcer contract is not found.
 */
export const getChecksumEnforcersByChainId = (
  contracts: DeployedContractsByName,
): {
  erc20StreamingEnforcer: Hex;
  erc20PeriodicEnforcer: Hex;
  nativeTokenStreamingEnforcer: Hex;
  nativeTokenPeriodicEnforcer: Hex;
  exactCalldataEnforcer: Hex;
  valueLteEnforcer: Hex;
  timestampEnforcer: Hex;
  nonceEnforcer: Hex;
  allowedCalldataEnforcer: Hex;
} => {
  const getChecksumContractAddress = (contractName: string): Hex => {
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

  const allowedCalldataEnforcer = getChecksumContractAddress(
    ENFORCER_CONTRACT_NAMES.AllowedCalldataEnforcer,
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
    allowedCalldataEnforcer,
  };
};

/**
 * Builds the canonical set of permission matching rules for a chain.
 *
 * Each rule specifies the `permissionType`, the set of `requiredEnforcers`
 * that must be present, and the set of `optionalEnforcers` that may appear in
 * addition to the required set.
 *
 * @param contracts - The deployed contracts for the chain.
 * @returns A list of permission rules used to identify permission types.
 * @throws Propagates any errors from resolving enforcer addresses.
 */
export const createPermissionRulesForChainId: (
  contracts: DeployedContractsByName,
) => PermissionRule[] = (contracts: DeployedContractsByName) => {
  const {
    erc20StreamingEnforcer,
    erc20PeriodicEnforcer,
    nativeTokenStreamingEnforcer,
    nativeTokenPeriodicEnforcer,
    exactCalldataEnforcer,
    valueLteEnforcer,
    timestampEnforcer,
    nonceEnforcer,
    allowedCalldataEnforcer,
  } = getChecksumEnforcersByChainId(contracts);

  // the optional enforcers are the same for all permission types
  const optionalEnforcers = new Set<Hex>([timestampEnforcer]);

  const permissionRules: PermissionRule[] = [
    {
      requiredEnforcers: new Map<Hex, number>([
        [nativeTokenStreamingEnforcer, 1],
        [exactCalldataEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
      optionalEnforcers,
      permissionType: 'native-token-stream',
    },
    {
      requiredEnforcers: new Map<Hex, number>([
        [nativeTokenPeriodicEnforcer, 1],
        [exactCalldataEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
      optionalEnforcers,
      permissionType: 'native-token-periodic',
    },
    {
      requiredEnforcers: new Map<Hex, number>([
        [erc20StreamingEnforcer, 1],
        [valueLteEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
      optionalEnforcers,
      permissionType: 'erc20-token-stream',
    },
    {
      requiredEnforcers: new Map<Hex, number>([
        [erc20PeriodicEnforcer, 1],
        [valueLteEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
      optionalEnforcers,
      permissionType: 'erc20-token-periodic',
    },
    {
      requiredEnforcers: new Map<Hex, number>([
        [allowedCalldataEnforcer, 2],
        [valueLteEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
      optionalEnforcers,
      permissionType: 'erc20-token-revocation',
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
export const isSubset = <TElement>(
  subset: Set<TElement>,
  superset: Set<TElement>,
): boolean => {
  for (const element of subset) {
    if (!superset.has(element)) {
      return false;
    }
  }
  return true;
};

/**
 * Gets the terms for a given enforcer from a list of caveats.
 *
 * @param args - The arguments to this function.
 * @param  args.throwIfNotFound - Whether to throw an error if no matching enforcer is found. Default is true.
 * @param args.caveats - The list of caveats to search.
 * @param args.enforcer - The enforcer to search for.
 * @returns The terms for the given enforcer.
 */
export function getTermsByEnforcer<TThrowIfNotFound extends boolean = true>({
  caveats,
  enforcer,
  throwIfNotFound,
}: {
  caveats: Caveat<Hex>[];
  enforcer: Hex;
  throwIfNotFound?: TThrowIfNotFound;
}): TThrowIfNotFound extends true ? Hex : Hex | null {
  const matchingCaveats = caveats.filter(
    (caveat) => caveat.enforcer === enforcer,
  );

  if (matchingCaveats.length === 0) {
    if (throwIfNotFound ?? true) {
      throw new Error('Invalid caveats');
    }
    return null as TThrowIfNotFound extends true ? Hex : Hex | null;
  }

  if (matchingCaveats.length > 1) {
    throw new Error('Invalid caveats');
  }

  return matchingCaveats[0].terms;
}

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
export function splitHex(value: Hex, lengths: number[]): Hex[] {
  let start = 2;
  const parts: Hex[] = [];
  for (const partLength of lengths) {
    const partCharLength = partLength * 2;
    const part = value.slice(start, start + partCharLength);
    start += partCharLength;
    parts.push(`0x${part}` as const);
  }
  return parts;
}
