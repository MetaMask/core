import type { FeatureFlags } from '@metamask/remote-feature-flag-controller';
import type { Json } from '@metamask/utils';
import { parseCaipChainId } from '@metamask/utils';

import type { ChainId } from '../types';

/**
 * Per-network rollout stage for the Snaps → AssetsController assets migration.
 *
 * The stage is resolved per CAIP-2 chain id, so each migration network (Solana,
 * Stellar, Tron) advances and rolls back independently. A network with no flag
 * (or an unknown/malformed value) resolves to {@link Off}.
 */
export enum SnapsAssetsMigrationStage {
  /**
   * Status quo — the Snap uses its own AssetsService and the AssetsController
   * does NOT ingest for the network.
   */
  Off = 0,
  /**
   * The AssetsController ingests for the network (Account Activity WebSocket +
   * AccountsAPI) and reads route through it, falling back to the Snap's
   * AssetsService when the controller has no value.
   */
  ReadAssetsControllerWithFallback = 1,
  /**
   * Reads come from the AssetsController only (no fallback), but the Snap still
   * tracks/persists in the background so rollback stays safe.
   */
  ReadAssetsControllerWithoutFallback = 2,
  /**
   * The Snap stops tracking/persisting; the AssetsController is the only source.
   */
  ReadAssetsControllerOnly = 3,
}

/**
 * CAIP-2 namespaces covered by the Snaps → AssetsController assets migration.
 * Only chains in these namespaces are stage-gated; every other namespace
 * (e.g. `eip155`) keeps its existing, ungated ingestion behavior.
 */
export const SNAPS_ASSETS_MIGRATION_NAMESPACES = [
  'solana',
  'stellar',
  'tron',
] as const;

export type SnapsAssetsMigrationNamespace =
  (typeof SNAPS_ASSETS_MIGRATION_NAMESPACES)[number];

/**
 * Per-network remote feature flag keys (LaunchDarkly) that drive the migration.
 * Each flag's resolved value carries the {@link SnapsAssetsMigrationStage} for
 * that network — see {@link parseSnapsAssetsMigrationStage}.
 */
export const SNAPS_ASSETS_MIGRATION_FLAG_KEYS: Record<
  SnapsAssetsMigrationNamespace,
  string
> = {
  solana: 'networkAssetsSnapsMigrationSolana',
  stellar: 'networkAssetsSnapsMigrationStellar',
  tron: 'networkAssetsSnapsMigrationTron',
};

/**
 * Resolve the CAIP-2 namespace of a chain when it belongs to a migration
 * network (Solana, Stellar, Tron).
 *
 * @param chainId - The CAIP-2 chain id.
 * @returns The migration namespace, or `undefined` for any other chain.
 */
export function getSnapsAssetsMigrationNamespace(
  chainId: ChainId,
): SnapsAssetsMigrationNamespace | undefined {
  try {
    const { namespace } = parseCaipChainId(chainId);
    return (SNAPS_ASSETS_MIGRATION_NAMESPACES as readonly string[]).includes(
      namespace,
    )
      ? (namespace as SnapsAssetsMigrationNamespace)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a CAIP-2 chain id belongs to a network covered by the assets
 * migration (Solana, Stellar, Tron).
 *
 * @param chainId - The CAIP-2 chain id to check.
 * @returns True when the chain's namespace is a migration namespace.
 */
export function isSnapsAssetsMigrationNamespace(chainId: ChainId): boolean {
  return getSnapsAssetsMigrationNamespace(chainId) !== undefined;
}

/**
 * Coerce a resolved remote feature flag value into a {@link SnapsAssetsMigrationStage}.
 *
 * `RemoteFeatureFlagController` resolves a threshold-scoped flag to a
 * `{ name, value }` variant, so the migration payload
 * `{ featureVersion, minimumSnapVersion, stage }` (and thus `stage`) lives under
 * `value` — the same nesting the sibling `assetsAccountsApiV6` flag uses. The
 * top-level object is used as a fallback so a plain, unscoped `{ stage }`
 * variation still resolves. Anything missing, malformed, or carrying an unknown
 * `stage` resolves to {@link SnapsAssetsMigrationStage.Off}.
 *
 * @param flagValue - The resolved remote feature flag value for a network.
 * @returns The migration stage.
 */
export function parseSnapsAssetsMigrationStage(
  flagValue: Json | undefined,
): SnapsAssetsMigrationStage {
  if (
    typeof flagValue !== 'object' ||
    flagValue === null ||
    Array.isArray(flagValue)
  ) {
    return SnapsAssetsMigrationStage.Off;
  }

  const { value } = flagValue as { value?: unknown };
  const payload =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value
      : flagValue;

  const { stage } = payload as { stage?: unknown };
  switch (stage) {
    case SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback:
    case SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback:
    case SnapsAssetsMigrationStage.ReadAssetsControllerOnly:
      return stage;
    default:
      return SnapsAssetsMigrationStage.Off;
  }
}

/**
 * Whether a network's migration stage is active, i.e. the AssetsController
 * (rather than the Snap) is the source of assets for the network.
 *
 * A stage is active from {@link SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback}
 * onward and inactive at {@link SnapsAssetsMigrationStage.Off}.
 *
 * @param stage - The resolved per-network migration stage.
 * @returns True when the migration is active for the network.
 */
export function isMigrationStageActive(
  stage: SnapsAssetsMigrationStage,
): boolean {
  return stage >= SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback;
}

/**
 * Resolve the Snaps → AssetsController migration stage for each migration
 * network (Solana, Stellar, Tron) from the remote feature flags. The order
 * matches {@link SNAPS_ASSETS_MIGRATION_NAMESPACES}, so the result can be joined
 * into a stable primitive signature for change detection.
 *
 * @param remoteFeatureFlags - The remote feature flags state to resolve stages from.
 * @returns An array of each migration namespace's resolved stage.
 */
export function getMigrationStages(
  remoteFeatureFlags: FeatureFlags,
): SnapsAssetsMigrationStage[] {
  return SNAPS_ASSETS_MIGRATION_NAMESPACES.map((namespace) =>
    parseSnapsAssetsMigrationStage(
      remoteFeatureFlags[SNAPS_ASSETS_MIGRATION_FLAG_KEYS[namespace]],
    ),
  );
}

/**
 * Whether a supported network should be surfaced as an active chain, gated by
 * the Snaps → AssetsController migration feature flags.
 *
 * Non-migration namespaces (e.g. `eip155`) are always surfaced. Migration
 * networks (Solana, Stellar, Tron) are only surfaced once their per-network
 * stage reaches {@link SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback};
 * they are excluded when the stage is `Off` (also the fail-safe when the flag is
 * missing or the flags are unavailable).
 *
 * @param chainId - The CAIP-2 chain id to check.
 * @param remoteFeatureFlags - The remote feature flags state, or `undefined` when unavailable.
 * @returns `true` when the chain should be surfaced as an active chain.
 */
export function shouldSupportChain(
  chainId: ChainId,
  remoteFeatureFlags: FeatureFlags | undefined,
): boolean {
  const namespace = getSnapsAssetsMigrationNamespace(chainId);
  // Non-migration namespaces (e.g. `eip155`) are never gated.
  if (!namespace) {
    return true;
  }

  const stage = parseSnapsAssetsMigrationStage(
    remoteFeatureFlags?.[SNAPS_ASSETS_MIGRATION_FLAG_KEYS[namespace]],
  );
  return isMigrationStageActive(stage);
}
