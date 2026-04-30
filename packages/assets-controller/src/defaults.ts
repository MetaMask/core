import type {
  AssetMetadata,
  Caip19AssetId,
  ChainId,
  FungibleAssetMetadata,
} from './types';

/**
 * Address of MetaMask USD (mUSD) — same canonical contract address
 * across every chain we deploy it to.
 */
const MUSD_ADDRESS = '0xaca92e438df0b2401ff60da7e4337b687a2435da';

/**
 * Hardcoded metadata for MetaMask USD. Pre-seeding this in default
 * state makes the token immediately renderable in the UI before any
 * on-chain balance has been fetched.
 */
const MUSD_METADATA: FungibleAssetMetadata = {
  type: 'erc20',
  symbol: 'mUSD',
  name: 'MetaMask USD',
  decimals: 18,
};

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
 * Default tracked tokens — assets the controller surfaces in state for
 * every account on the listed chain even when the on-chain balance is
 * still zero. Keyed by CAIP-2 chain id.
 *
 * To extend mUSD coverage to a new chain, add an entry here. To add a
 * different default token, append its CAIP-19 asset id to the
 * appropriate chain entry and provide its metadata in
 * {@link DEFAULT_ASSET_METADATA}.
 */
export const DEFAULT_TRACKED_ASSETS_BY_CHAIN: ReadonlyMap<
  ChainId,
  readonly Caip19AssetId[]
> = new Map<ChainId, readonly Caip19AssetId[]>([
  ['eip155:1' as ChainId, [musdAssetId('eip155:1' as ChainId)]],
  ['eip155:59144' as ChainId, [musdAssetId('eip155:59144' as ChainId)]],
  ['eip155:143' as ChainId, [musdAssetId('eip155:143' as ChainId)]],
]);

/**
 * Chains that have at least one default tracked asset. Useful for
 * quickly answering "should we seed defaults for this chain?".
 */
export const CHAINS_WITH_DEFAULT_TRACKED_ASSETS: ReadonlySet<ChainId> = new Set(
  DEFAULT_TRACKED_ASSETS_BY_CHAIN.keys(),
);

/**
 * Pre-seeded metadata for every default tracked asset, keyed by the
 * lowercase CAIP-19 id so callers can look up without worrying about
 * checksum case.
 */
export const DEFAULT_ASSET_METADATA: ReadonlyMap<string, AssetMetadata> =
  new Map<string, AssetMetadata>([
    [musdAssetId('eip155:1' as ChainId).toLowerCase(), MUSD_METADATA],
    [musdAssetId('eip155:59144' as ChainId).toLowerCase(), MUSD_METADATA],
    [musdAssetId('eip155:143' as ChainId).toLowerCase(), MUSD_METADATA],
  ]);

/**
 * Return the default tracked assets for a CAIP-2 chain id. Empty when
 * the chain has no defaults.
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
 * Look up pre-seeded metadata for a default tracked asset.
 *
 * @param assetId - CAIP-19 asset id (any case).
 * @returns The metadata if the asset is a default tracked asset,
 * otherwise `undefined`.
 */
export function getDefaultAssetMetadata(
  assetId: Caip19AssetId,
): AssetMetadata | undefined {
  return DEFAULT_ASSET_METADATA.get(assetId.toLowerCase());
}

/**
 * Build the `assetsInfo` map to use in default controller state —
 * pre-populated with metadata for every default tracked asset across
 * every default tracked chain. This is what makes `assetsInfo[mUSD]`
 * exist from the very first render, before any RPC poll completes.
 *
 * @returns A new map keyed by CAIP-19 id (canonical case from the
 * defaults registry) with the corresponding metadata.
 */
export function buildDefaultAssetsInfo(): Record<Caip19AssetId, AssetMetadata> {
  const info: Record<Caip19AssetId, AssetMetadata> = {};
  for (const assetIds of DEFAULT_TRACKED_ASSETS_BY_CHAIN.values()) {
    for (const assetId of assetIds) {
      info[assetId] = MUSD_METADATA;
    }
  }
  return info;
}
