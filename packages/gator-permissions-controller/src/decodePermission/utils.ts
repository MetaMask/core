import type { Caveat } from '@metamask/delegation-core';
import { getChecksumAddress, hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type {
  ChecksumEnforcersByChainId,
  DeployedContractsByName,
} from './types';

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
 * 32 bytes of zero (0x + 64 hex chars).
 */
export const ZERO_32_BYTES =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

/** AllowedCalldataEnforcer terms for ERC20 approve selector. */
export const ERC20_APPROVE_SELECTOR_TERMS =
  '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as const;

/** AllowedCalldataEnforcer terms for ERC20 approve zero amount. */
export const ERC20_APPROVE_ZERO_AMOUNT_TERMS =
  '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as const;

/**
 * Get the byte length of a hex string.
 *
 * @param hexString - The hex string to get the byte length of.
 * @returns The byte length of the hex string.
 */
export const getByteLength = (hexString: Hex): number => {
  return (hexString.length - 2) / 2;
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
): ChecksumEnforcersByChainId => {
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
 * Extracts the expiry timestamp from TimestampEnforcer caveat terms.
 * Terms are 32 bytes: first 16 bytes timestampAfterThreshold (must be 0),
 * last 16 bytes timestampBeforeThreshold (expiry).
 *
 * @param terms - The hex-encoded terms from a TimestampEnforcer caveat.
 * @returns The expiry timestamp in seconds.
 * @throws If terms are invalid.
 */
export const extractExpiryFromCaveatTerms = (terms: Hex): number => {
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
 * Builds enforcer counts and set from caveat addresses (checksummed).
 * Used by caveatAddressesMatch.
 *
 * @param caveatAddresses - List of enforcer contract addresses (hex).
 * @returns Counts per enforcer and set of unique enforcers.
 */
export function buildEnforcerCountsAndSet(caveatAddresses: Hex[]): {
  counts: Map<Hex, number>;
  enforcersSet: Set<Hex>;
} {
  const counts = new Map<Hex, number>();
  for (const addr of caveatAddresses.map(getChecksumAddress)) {
    counts.set(addr, (counts.get(addr) ?? 0) + 1);
  }
  return { counts, enforcersSet: new Set(counts.keys()) };
}

/**
 * Returns true if the given counts/set match the rule (required counts exact,
 * no enforcer outside required + optional).
 *
 * @param counts - Map of enforcer address to occurrence count.
 * @param enforcersSet - Set of unique enforcer addresses present.
 * @param requiredEnforcers - Map of required enforcer to required count.
 * @param optionalEnforcers - Set of optional enforcer addresses.
 * @returns True if the counts match the rule.
 */
export function enforcersMatchRule(
  counts: Map<Hex, number>,
  enforcersSet: Set<Hex>,
  requiredEnforcers: Map<Hex, number>,
  optionalEnforcers: Set<Hex>,
): boolean {
  const allowedEnforcers = new Set<Hex>([
    ...optionalEnforcers,
    ...requiredEnforcers.keys(),
  ]);
  for (const addr of enforcersSet) {
    if (!allowedEnforcers.has(addr)) {
      return false;
    }
  }
  for (const [addr, requiredCount] of requiredEnforcers.entries()) {
    if ((counts.get(addr) ?? 0) !== requiredCount) {
      return false;
    }
  }
  return true;
}

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
