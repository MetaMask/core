import { convertHexToDecimal } from '@metamask/controller-utils';
import {
  isCaipAssetType,
  isCaipChainId,
  isStrictHexString,
  KnownCaipNamespace,
  parseCaipAssetType,
  toCaipChainId,
} from '@metamask/utils';

/**
 * Single source of truth for every staking-supported chain: its vault
 * contract address AND its native-currency SLIP-44 coin type, together. A
 * staked position has no market price of its own (the vault contract isn't a
 * priced token) — its value tracks the chain's native currency 1:1, so
 * callers alias the staked asset to `nativeSlip44` to price it.
 *
 * This used to be two separate maps (address-by-chain, slip44-by-chain) with
 * an attempted type-level check that a chain key present in one must be
 * present in the other. That check was ineffective — widening either map to
 * `Record<string, ...>` collapses `keyof typeof` back down to plain `string`,
 * so nothing actually caught a chain added to one map and not the other.
 * Keeping both pieces of a chain's staking config in ONE entry makes that
 * class of drift structurally impossible rather than merely type-checked.
 */
const STAKING_CHAIN_CONFIG: Record<
  string,
  { address: string; nativeSlip44: number }
> = {
  'eip155:1': {
    address: '0x4fef9d741011476750a243ac70b9789a63dd47df', // Mainnet
    nativeSlip44: 60,
  },
  'eip155:560048': {
    address: '0xe96ac18cfe5a7af8fe1fe7bc37ff110d88bc67ff', // Hoodi (0x88bb0)
    nativeSlip44: 60,
  },
};

/**
 * Staking contract addresses by CAIP-2 chain ID (e.g. "eip155:1"). Derived
 * from {@link STAKING_CHAIN_CONFIG}; kept as its own export since existing
 * callers (`getStakingContractAddress`, `getSupportedStakingChainIds`, and
 * direct importers such as `StakedBalanceFetcher`) only need the address.
 */
export const STAKING_CONTRACT_ADDRESS_BY_CHAINID: Record<string, string> =
  Object.fromEntries(
    Object.entries(STAKING_CHAIN_CONFIG).map(([chainId, config]) => [
      chainId,
      config.address,
    ]),
  );

/**
 * Normalize chain ID to CAIP-2 for lookup (e.g. "0x1" -> "eip155:1").
 * Uses @metamask/utils for CAIP parsing.
 *
 * @param chainId - Hex chain ID (e.g. "0x1") or CAIP-2 (e.g. "eip155:1").
 * @returns CAIP-2 chain ID.
 */
function toCaip2ChainId(chainId: string): string {
  if (isCaipChainId(chainId)) {
    return chainId;
  }
  const reference = isStrictHexString(chainId)
    ? convertHexToDecimal(chainId).toString()
    : chainId;
  return toCaipChainId(KnownCaipNamespace.Eip155, reference);
}

/**
 * Returns the set of CAIP-2 chain IDs that have a known staking contract.
 *
 * @returns Array of CAIP-2 chain IDs.
 */
export function getSupportedStakingChainIds(): string[] {
  return Object.keys(STAKING_CONTRACT_ADDRESS_BY_CHAINID);
}

/**
 * Returns the staking contract address for a chain, or undefined if not supported.
 *
 * @param chainId - Hex chain ID (e.g. "0x1") or CAIP-2 (e.g. "eip155:1").
 * @returns Contract address (checksummed as stored) or undefined.
 */
export function getStakingContractAddress(chainId: string): string | undefined {
  const caip2 = toCaip2ChainId(chainId);
  return STAKING_CONTRACT_ADDRESS_BY_CHAINID[caip2];
}

/**
 * Returns true if the CAIP-19 asset ID is for a known staking contract.
 * Used to skip fetching metadata for staking contracts from the tokens API.
 * Uses @metamask/utils parseCaipAssetType for CAIP-19 parsing.
 *
 * @param assetId - CAIP-19 asset ID (e.g. "eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df").
 * @returns True if the asset is a staking contract.
 */
export function isStakingContractAssetId(assetId: string): boolean {
  if (!isCaipAssetType(assetId)) {
    return false;
  }
  const parsed = parseCaipAssetType(assetId);
  if (parsed.assetNamespace !== 'erc20') {
    return false;
  }
  const address = parsed.assetReference.toLowerCase();
  const stakingAddress = getStakingContractAddress(
    parsed.chainId,
  )?.toLowerCase();
  return stakingAddress !== undefined && address === stakingAddress;
}

/**
 * Returns the CAIP-19 native-asset ID a staked position's price should be
 * looked up under (e.g. "eip155:1/slip44:60" for mainnet ETH staking). The
 * vault contract itself is never a priced token — the Price API returns
 * `null` for it — so a staked balance is valued at parity with the chain's
 * native currency.
 *
 * @param assetId - CAIP-19 asset ID to check (e.g. a staked-position asset).
 * @returns The chain's native CAIP-19 asset ID, or `undefined` if `assetId`
 * is not a known staking contract.
 */
export function getNativeAssetIdForStakedAsset(
  assetId: string,
): string | undefined {
  if (!isStakingContractAssetId(assetId)) {
    return undefined;
  }
  // `isStakingContractAssetId` above already confirmed `chainId` is a key of
  // `STAKING_CHAIN_CONFIG` (via `getStakingContractAddress`), which is the
  // single source of truth for both the address and the native coin type —
  // there is no second map this lookup could miss against.
  const { chainId } = parseCaipAssetType(assetId);
  const { nativeSlip44 } = STAKING_CHAIN_CONFIG[chainId];
  return `${chainId}/slip44:${nativeSlip44}`;
}

/**
 * Resolves the CAIP-19 asset ID that should actually be used to look up a
 * price for `assetId` — the chain's native asset if `assetId` is a known
 * staking-vault position, otherwise `assetId` unchanged. Staked balances
 * track their chain's native currency 1:1 and are unconditionally priced
 * that way: a stale or missing price object recorded directly under the
 * vault's own asset ID (e.g. from a persisted pre-fix state, or a currency
 * switch that only partially refreshed) must never win over the native
 * price, so callers should route ALL staking-asset price lookups through
 * this resolver rather than only falling back on a missing entry.
 *
 * @param assetId - CAIP-19 asset ID to resolve a price-lookup key for.
 * @returns The CAIP-19 asset ID to use as the `assetsPrice` lookup key.
 */
export function resolvePriceLookupAssetId(assetId: string): string {
  return getNativeAssetIdForStakedAsset(assetId) ?? assetId;
}
