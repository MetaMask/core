import type {
  AssetMetadata,
  Caip19AssetId,
  ChainId,
  FungibleAssetMetadata,
} from './types.js';

/**
 * EIP-55 checksummed address of MetaMask USD (mUSD) — same canonical contract
 * address across every chain we deploy it to.
 *
 * Must be checksummed so that the CAIP-19 asset IDs produced by
 * `musdAssetId()` (and therefore the keys seeded into `assetsInfo` by
 * `buildDefaultAssetsInfo()`) match the keys written by data sources, which
 * always pass IDs through `normalizeAssetId` → `toChecksumAddress` before
 * emitting a `DataResponse`. Using a lowercase address would cause the
 * pre-seeded keys to diverge from the data-source keys, leaving a duplicate
 * entry in `assetsInfo` after the first balance or token-data poll.
 */
const MUSD_ADDRESS = '0xacA92E438df0B2401fF60dA7E4337B687a2435DA';

/**
 * Hardcoded metadata for MetaMask USD. Pre-seeding this in default
 * state makes the token immediately renderable in the UI before any
 * on-chain balance has been fetched.
 */
const MUSD_METADATA: FungibleAssetMetadata = {
  type: 'erc20',
  symbol: 'mUSD',
  name: 'MetaMask USD',
  decimals: 6,
};

/**
 * Harcoded metadata for USDC on Arc (5042/0x13b2).
 * USDC exists as both native (18 decimals) and ERC20 (6 decimals).
 * We choose to force-hide the native version to avoid double listing using
 * `CHAIN_IDS_WITH_NO_NATIVE_TOKEN`.
 * In the meantime, the code below force-shows USDC the ERC20 token.
 */
const USDC_ON_ARC_ASSET_ID =
  'eip155:5042/erc20:0x3600000000000000000000000000000000000000';

const USDC_ON_ARC_METADATA: FungibleAssetMetadata = {
  type: 'erc20',
  symbol: 'USDC',
  name: 'USDC',
  decimals: 6,
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
  ['eip155:5042' as ChainId, [USDC_ON_ARC_ASSET_ID]],
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
 * checksummed CAIP-19 id. All callers must pass a checksummed asset ID;
 * use `normalizeAssetId` to ensure the correct format before looking up.
 */
export const DEFAULT_ASSET_METADATA: ReadonlyMap<string, AssetMetadata> =
  new Map<string, AssetMetadata>([
    [musdAssetId('eip155:1' as ChainId), MUSD_METADATA],
    [musdAssetId('eip155:59144' as ChainId), MUSD_METADATA],
    [musdAssetId('eip155:143' as ChainId), MUSD_METADATA],
    [USDC_ON_ARC_ASSET_ID, USDC_ON_ARC_METADATA],
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
 * @param assetId - CAIP-19 asset id (must be EIP-55 checksummed for EVM tokens).
 * @returns The metadata if the asset is a default tracked asset,
 * otherwise `undefined`.
 */
export function getDefaultAssetMetadata(
  assetId: Caip19AssetId,
): AssetMetadata | undefined {
  return DEFAULT_ASSET_METADATA.get(assetId);
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
      const metadata = DEFAULT_ASSET_METADATA.get(assetId);
      if (metadata) {
        info[assetId] = metadata;
      }
    }
  }
  return info;
}
