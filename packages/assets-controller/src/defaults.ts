import type { Caip19AssetId, ChainId } from './types';

/**
 * Address of MetaMask USD (mUSD) — same canonical contract address
 * across every chain we deploy it to.
 */
const MUSD_ADDRESS = '0xaca92e438df0b2401ff60da7e4337b687a2435da';

/**
 * Build the CAIP-19 asset ID for the mUSD ERC-20 token on a given EVM
 * chain.
 *
 * @param chainId - The CAIP-2 chain identifier (e.g. `eip155:1`).
 * @returns The CAIP-19 asset ID for mUSD on that chain.
 */
function musdAssetId(chainId: ChainId): Caip19AssetId {
  return `${chainId}/erc20:${MUSD_ADDRESS}` as Caip19AssetId;
}

/**
 * Tokens this controller always tracks for an account on the listed
 * chain — even when the on-chain balance is zero. Used to surface
 * MetaMask-promoted tokens in the UI before any inbound transfer
 * has happened.
 *
 * Keyed by CAIP-2 chain id so we can quickly answer "what defaults
 * apply on chain X?" from the balance fetcher and the supplemental
 * RPC subscription logic.
 *
 * To add a new default token, append its CAIP-19 asset id to the
 * appropriate chain entry. To extend mUSD to a new chain, add a new
 * entry pointing at `musdAssetId('eip155:<id>')`.
 */
export const DEFAULT_TRACKED_ASSETS_BY_CHAIN: ReadonlyMap<
  ChainId,
  readonly Caip19AssetId[]
> = new Map<ChainId, readonly Caip19AssetId[]>([
  // Ethereum mainnet
  ['eip155:1' as ChainId, [musdAssetId('eip155:1' as ChainId)]],
  // Linea
  ['eip155:59144' as ChainId, [musdAssetId('eip155:59144' as ChainId)]],
  // Monad
  ['eip155:10143' as ChainId, [musdAssetId('eip155:10143' as ChainId)]],
]);

/**
 * Return the default tracked assets for the given CAIP-2 chain id.
 * Empty array when the chain has no defaults.
 *
 * @param chainId - CAIP-2 chain id to look up.
 * @returns The default asset ids for that chain.
 */
export function getDefaultTrackedAssetsForChain(
  chainId: ChainId,
): readonly Caip19AssetId[] {
  return DEFAULT_TRACKED_ASSETS_BY_CHAIN.get(chainId) ?? [];
}

/**
 * Chains that have at least one default tracked asset. Useful for the
 * supplemental-subscription logic that needs to know which chains RPC
 * must poll even when another data source owns the chain in the
 * regular handoff.
 */
export const CHAINS_WITH_DEFAULT_TRACKED_ASSETS: ReadonlySet<ChainId> = new Set(
  DEFAULT_TRACKED_ASSETS_BY_CHAIN.keys(),
);
