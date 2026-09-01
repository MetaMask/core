import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { TokensControllerState } from '@metamask/assets-controllers';
import type { ApiPlatformClient } from '@metamask/core-backend';
import type { Hex } from '@metamask/utils';
import {
  getChecksumAddress,
  getErrorMessage,
  hasProperty,
  isObject,
} from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { divideIntoBatches } from '../data-sources/evm-rpc-services/utils/batch.js';
import { DEFAULT_TRACKED_ASSETS_BY_CHAIN, isMusdAssetId } from '../defaults.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import type {
  AccountId,
  Caip19AssetId,
  FungibleAssetMetadata,
  AssetsControllerStateInternal,
} from '../types.js';
import { fetchWithTimeout } from '../utils/fetchWithTimeout.js';

/**
 * TEMPORARY MODULE — remove in a future release.
 *
 * Port of extension migration #215 (Assets Controller Metadata Healing).
 * Issue: https://consensyssoftware.atlassian.net/browse/ASSETS-3346
 * Incident: #incident-metamask-1731
 *
 * Background: after a prior defect in AssetsController, metadata for custom
 * tokens was wiped. Most popular chains support auto-detection and can
 * self-heal, however not all.
 *
 * This module computes the state additions needed to restore metadata for
 * custom tokens on niche EVM chains (chains that cannot auto-detect and
 * self-heal), using the legacy `TokensController.allTokens` state as the
 * source of truth. It is a pure function so it can be tested in isolation;
 * the controller applies the returned patch in its constructor.
 *
 * The legacy state is treated as fully untrusted (`unknown`): every shape is
 * validated before use, and any unexpected input results in that entry being
 * skipped (or `null` being returned when nothing is restorable).
 */

/**
 * The slices of current `AssetsController` state the healing computation
 * reads. Never mutated.
 */
export type CurrentAssetsState = Pick<
  AssetsControllerStateInternal,
  'assetsInfo' | 'assetsBalance' | 'customAssets' | 'assetPreferences'
>;

/**
 * TEMPORARY — will be removed in a future release.
 *
 * Shape of the legacy persisted state the ASSETS-3346 healing reads, derived
 * from the real `TokensControllerState` and `AccountsControllerState` types.
 * Use it to type the `tempMigrateAssetsInfoMetadataAssets3346` getter when
 * integrating in a client.
 *
 * Everything is optional and only the listed slices are read:
 *
 * - `TokensController.allTokens` — required for any healing to happen.
 * - `TokensController.allIgnoredTokens` — tokens the user hid/removed
 *   (skipped during healing).
 * - `AccountsController.internalAccounts.accounts` — maps addresses to
 *   account IDs so healed tokens are also tracked in `customAssets`
 *   (without it only `assetsInfo` is healed).
 *
 * At runtime the value still crosses the boundary as `unknown`: every shape
 * is re-validated by the migration, so a partial or malformed object is safe
 * and simply skipped.
 */
export type Assets3346MigrationState = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- must match the persisted controller state key
  TokensController?: Partial<
    Pick<TokensControllerState, 'allTokens' | 'allIgnoredTokens'>
  >;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- must match the persisted controller state key
  AccountsController?: {
    internalAccounts?: {
      accounts?: Record<
        string,
        Pick<
          AccountsControllerState['internalAccounts']['accounts'][string],
          'address'
        >
      >;
    };
  };
};

export type AssetsInfoHealingPatch = {
  assetsInfo: Record<Caip19AssetId, FungibleAssetMetadata>;
  customAssets: Record<AccountId, Caip19AssetId[]>;
};

const log = createModuleLogger(projectLogger, 'tempHealAssetsInfoMetadata');

export type TempHealAssetsInfoMetadataOptions = {
  /** Current `AssetsController` state the healing patch is computed against. */
  state: AssetsControllerStateInternal;
  /**
   * Host-provided getter for the untrusted legacy state root (see
   * `AssetsControllerOptions.tempMigrateAssetsInfoMetadataAssets3346`).
   */
  getMigrationState: () => unknown;
  /** Optional Sentry-compatible reporter for healing failures. */
  captureException?: (error: Error) => void;
};

/**
 * TEMPORARY — will be removed in a future release.
 *
 * @param options - The options bag.
 * @param options.state - Current controller state to compute the patch against.
 * @param options.getMigrationState - Getter for the untrusted legacy state root.
 * @param options.captureException - Optional reporter for healing failures.
 * @returns Updated controller state with the healing patch applied, or the
 * original state when there is nothing to heal or healing fails.
 */
export function tempHealAssetsInfoMetadata({
  state,
  getMigrationState,
  captureException,
}: TempHealAssetsInfoMetadataOptions): AssetsControllerStateInternal {
  const reportError = (error: unknown): void => {
    log('Failed to heal assetsInfo metadata', error);
    captureException?.(
      new Error(
        `AssetsController: temporary assetsInfo metadata healing failed: ${getErrorMessage(
          error,
        )}`,
      ),
    );
  };

  let patch: AssetsInfoHealingPatch | null = null;
  try {
    patch = healAssetsInfoMetadata(getMigrationState(), state);
  } catch (error) {
    reportError(error);
  }

  if (!patch) {
    return state;
  }

  try {
    const nextState = cloneDeep(state);
    applyHealingPatch(nextState, patch);

    log('Healed wiped assetsInfo metadata for niche-chain tokens', {
      healedAssetsInfoCount: Object.keys(patch.assetsInfo).length,
      healedCustomAssetsAccounts: Object.keys(patch.customAssets).length,
    });

    return nextState;
  } catch (error) {
    reportError(error);
    return state;
  }
}

/**
 * Apply a healing patch to (draft) controller state. Defensive against
 * concurrent writes: fills `assetsInfo` gaps only and dedupes `customAssets`
 * against the current draft rather than trusting the patch blindly.
 *
 * @param state - Mutable controller state copy.
 * @param patch - The additions computed by {@link healAssetsInfoMetadata}.
 */
function applyHealingPatch(
  state: CurrentAssetsState,
  patch: AssetsInfoHealingPatch,
): void {
  for (const [assetId, metadata] of Object.entries(patch.assetsInfo)) {
    state.assetsInfo[assetId as Caip19AssetId] ??= metadata;
  }

  for (const [accountId, assetIds] of Object.entries(patch.customAssets)) {
    const existing = state.customAssets[accountId] ?? [];
    state.customAssets[accountId] = [
      ...existing,
      ...assetIds.filter((assetId) => !existing.includes(assetId)),
    ];
  }
}

const EVM_CHAIN_NAMESPACE = 'eip155';

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/u;

/**
 * Popular networks (covered by the Accounts API) can self-heal through
 * auto-detection, so their tokens must not be touched. Frozen snapshot from
 * extension migration #215.
 */
const ACCOUNT_API_SUPPORTED_CHAIN_IDS: ReadonlySet<string> = new Set([
  'eip155:1', // Ethereum Mainnet
  'eip155:10', // Optimism
  'eip155:56', // BNB Smart Chain
  'eip155:137', // Polygon
  'eip155:143', // Monad
  'eip155:999', // HyperEVM
  'eip155:1329', // Sei
  'eip155:5042', // Arc
  'eip155:8453', // Base
  'eip155:42161', // Arbitrum One
  'eip155:43114', // Avalanche
  'eip155:59144', // Linea
]);

/**
 * Compute the additions required to heal `assetsInfo` metadata (and custom
 * asset tracking) for tokens on niche EVM chains, based on the legacy
 * `TokensController` state.
 *
 * What it deliberately skips:
 *
 * - Accounts-API-supported chains — see `ACCOUNT_API_SUPPORTED_CHAIN_IDS`.
 * - Tokens the user hid/removed, detected via either the legacy
 *   `TokensController.allIgnoredTokens` or the current
 *   `assetPreferences` (`hidden: true`).
 * - Non-EVM assets, ERC-721s, and tokens with invalid addresses or metadata.
 *
 * @param legacyState - Untrusted legacy state root. Expected (but not
 * required) to contain `TokensController.allTokens`,
 * `TokensController.allIgnoredTokens`, and
 * `AccountsController.internalAccounts.accounts`.
 * @param currentState - Current `AssetsController` state slices (read-only).
 * @returns The additions to apply, or `null` when there is nothing to heal.
 */
export function healAssetsInfoMetadata(
  legacyState: unknown,
  currentState: CurrentAssetsState,
): AssetsInfoHealingPatch | null {
  const allTokens = readPath(legacyState, ['TokensController', 'allTokens']);
  if (!isObject(allTokens)) {
    return null;
  }

  const addressToAccountId = buildAddressToAccountIdMap(legacyState);
  const hiddenAssetIds = collectHiddenAssetIds(currentState);
  const allIgnoredTokens = readPath(legacyState, [
    'TokensController',
    'allIgnoredTokens',
  ]);

  const assetsInfoAdditions: Record<Caip19AssetId, FungibleAssetMetadata> = {};
  const customAssetAdditions: Record<AccountId, Caip19AssetId[]> = {};

  for (const [hexChainId, accountTokens] of Object.entries(allTokens)) {
    if (!isObject(accountTokens)) {
      continue;
    }

    const caip2 = hexChainIdToCaip2(hexChainId);
    // Skip chains we can't parse or that self-heal via the accounts API.
    if (!caip2 || ACCOUNT_API_SUPPORTED_CHAIN_IDS.has(caip2)) {
      continue;
    }

    for (const [rawAddress, tokens] of Object.entries(accountTokens)) {
      if (!Array.isArray(tokens) || tokens.length === 0) {
        continue;
      }

      const accountId = addressToAccountId[rawAddress.toLowerCase()];
      const ignoredAddresses = collectIgnoredAddresses(
        allIgnoredTokens,
        hexChainId,
        rawAddress,
      );

      for (const token of tokens) {
        const restorable = getRestorableAsset(
          token,
          caip2,
          ignoredAddresses,
          hiddenAssetIds,
        );
        if (!restorable) {
          continue;
        }
        const { assetId, info } = restorable;

        // `assetsInfo` is a global registry; fill gaps only, never overwrite.
        if (
          currentState.assetsInfo[assetId] === undefined &&
          assetsInfoAdditions[assetId] === undefined
        ) {
          assetsInfoAdditions[assetId] = info;
        }

        // Ensure the asset is tracked for its account.
        if (accountId) {
          addCustomAssetAddition(
            currentState,
            customAssetAdditions,
            accountId,
            assetId,
          );
        }
      }
    }
  }

  if (
    Object.keys(assetsInfoAdditions).length === 0 &&
    Object.keys(customAssetAdditions).length === 0
  ) {
    return null;
  }

  return {
    assetsInfo: assetsInfoAdditions,
    customAssets: customAssetAdditions,
  };
}

/**
 * Resolve a raw `TokensController` token entry to the CAIP-19 asset ID and
 * metadata that should be healed, or `null` when the token must be skipped
 * (not an object, missing/invalid address or symbol, an ERC-721, or hidden
 * in either the legacy or the current controller).
 *
 * @param token - Raw token entry from `allTokens`.
 * @param caip2 - The CAIP-2 chain ID of the token's chain (e.g. 'eip155:14').
 * @param ignoredAddresses - Lowercase addresses hidden via legacy `allIgnoredTokens`.
 * @param hiddenAssetIds - Lowercase asset IDs hidden via current `assetPreferences`.
 * @returns The restorable asset, or `null` to skip.
 */
function getRestorableAsset(
  token: unknown,
  caip2: string,
  ignoredAddresses: Set<string>,
  hiddenAssetIds: Set<string>,
): { assetId: Caip19AssetId; info: FungibleAssetMetadata } | null {
  if (!isObject(token)) {
    return null;
  }
  // Skip NFTs — AssetsController tracks them separately.
  if (token.isERC721 === true) {
    return null;
  }
  if (
    typeof token.address !== 'string' ||
    !EVM_ADDRESS_REGEX.test(token.address)
  ) {
    return null;
  }
  // Healed metadata with no symbol would be unusable in the UI; skip it.
  if (typeof token.symbol !== 'string' || token.symbol.length === 0) {
    return null;
  }

  const assetId = buildErc20AssetId(caip2, token.address as Hex);
  if (!assetId) {
    return null;
  }

  // Skip tokens the user hid/removed — in the legacy controller…
  if (ignoredAddresses.has(token.address.toLowerCase())) {
    return null;
  }
  // …or in the current controller.
  if (hiddenAssetIds.has(assetId.toLowerCase())) {
    return null;
  }

  return { assetId, info: buildEvmAssetInfo(token) };
}

/**
 * Build a `FungibleAssetMetadata` from a raw `TokensController` token entry.
 * The caller has already validated `symbol` as a non-empty string.
 *
 * @param token - Raw token object.
 * @returns The metadata to write into `assetsInfo`.
 */
function buildEvmAssetInfo(
  token: Record<string, unknown>,
): FungibleAssetMetadata {
  const symbol = token.symbol as string;
  const name =
    typeof token.name === 'string' && token.name.length > 0
      ? token.name
      : symbol;
  const decimals =
    typeof token.decimals === 'number' && Number.isFinite(token.decimals)
      ? token.decimals
      : 0;

  const image =
    typeof token.image === 'string' && token.image.length > 0
      ? token.image
      : undefined;
  const aggregators = Array.isArray(token.aggregators)
    ? token.aggregators.filter(
        (aggregator): aggregator is string => typeof aggregator === 'string',
      )
    : undefined;

  return {
    type: 'erc20',
    symbol,
    name,
    decimals,
    ...(image ? { image } : {}),
    ...(aggregators ? { aggregators } : {}),
  };
}

/**
 * Build a map from lowercase account address to account UUID using the
 * legacy `AccountsController.internalAccounts.accounts`.
 *
 * @param legacyState - Untrusted legacy state root.
 * @returns Map of lowercase address to account ID (empty on invalid input).
 */
function buildAddressToAccountIdMap(
  legacyState: unknown,
): Record<string, AccountId> {
  const accounts = readPath(legacyState, [
    'AccountsController',
    'internalAccounts',
    'accounts',
  ]);
  if (!isObject(accounts)) {
    return {};
  }

  const map: Record<string, AccountId> = {};
  for (const [id, account] of Object.entries(accounts)) {
    if (
      isObject(account) &&
      typeof account.address === 'string' &&
      account.address.length > 0
    ) {
      map[account.address.toLowerCase()] = id;
    }
  }
  return map;
}

/**
 * Collect the set of CAIP-19 asset IDs (lowercased) marked `hidden: true` in
 * the current `assetPreferences`. Lowercasing lets callers compare against
 * checksummed asset IDs case-insensitively.
 *
 * @param currentState - Current `AssetsController` state slices.
 * @returns Set of lowercase hidden asset IDs.
 */
function collectHiddenAssetIds(currentState: CurrentAssetsState): Set<string> {
  const hidden = new Set<string>();
  for (const [assetId, preference] of Object.entries(
    currentState.assetPreferences,
  )) {
    if (isObject(preference) && preference.hidden === true) {
      hidden.add(assetId.toLowerCase());
    }
  }
  return hidden;
}

/**
 * Collect the lowercase token addresses ignored (hidden) in the legacy
 * `TokensController.allIgnoredTokens` for a given chain and account. The
 * account key is matched case-insensitively.
 *
 * @param allIgnoredTokens - The legacy `allIgnoredTokens` map (possibly missing).
 * @param hexChainId - The hex chain ID being processed.
 * @param accountAddress - The account address whose ignored list to read.
 * @returns Set of lowercase ignored token addresses.
 */
function collectIgnoredAddresses(
  allIgnoredTokens: unknown,
  hexChainId: string,
  accountAddress: string,
): Set<string> {
  const result = new Set<string>();
  if (!isObject(allIgnoredTokens)) {
    return result;
  }

  const chainEntry = allIgnoredTokens[hexChainId];
  if (!isObject(chainEntry)) {
    return result;
  }

  const lowerAccount = accountAddress.toLowerCase();
  for (const [address, list] of Object.entries(chainEntry)) {
    if (address.toLowerCase() !== lowerAccount || !Array.isArray(list)) {
      continue;
    }
    for (const ignored of list) {
      if (typeof ignored === 'string') {
        result.add(ignored.toLowerCase());
      }
    }
  }
  return result;
}

/**
 * Convert a hex chain ID (e.g. '0x1') to a CAIP-2 chain ID (e.g. 'eip155:1').
 *
 * @param hexChainId - The hex-encoded EVM chain ID.
 * @returns The CAIP-2 chain ID, or `null` when the input cannot be parsed.
 */
function hexChainIdToCaip2(hexChainId: string): string | null {
  if (!/^0x[0-9a-fA-F]+$/u.test(hexChainId)) {
    return null;
  }
  const decimal = Number.parseInt(hexChainId, 16);
  if (!Number.isFinite(decimal)) {
    return null;
  }
  return `${EVM_CHAIN_NAMESPACE}:${decimal}`;
}

/**
 * Build the checksummed CAIP-19 asset ID for an ERC-20 token.
 *
 * @param caip2 - The CAIP-2 chain ID (e.g. 'eip155:14').
 * @param tokenAddress - The ERC-20 contract address.
 * @returns The asset ID, or `null` when the address cannot be checksummed.
 */
function buildErc20AssetId(
  caip2: string,
  tokenAddress: Hex,
): Caip19AssetId | null {
  let checksummed: string;
  try {
    checksummed = getChecksumAddress(tokenAddress);
  } catch {
    return null;
  }
  return `${caip2}/erc20:${checksummed}` as Caip19AssetId;
}

/**
 * Read a nested path on an unknown value, returning `undefined` if any
 * intermediate key is missing or not an object.
 *
 * @param root - The value to read from.
 * @param path - Sequence of keys to traverse.
 * @returns The value at the path, or `undefined`.
 */
function readPath(root: unknown, path: string[]): unknown {
  return path.reduce<unknown>((cursor, key) => {
    if (!isObject(cursor) || !hasProperty(cursor, key)) {
      return undefined;
    }
    return cursor[key];
  }, root);
}

/**
 * Record `assetId` as a custom-asset addition for `accountId` unless it is
 * already tracked in the current `assetsBalance` (mutual exclusion), already
 * present in the current `customAssets`, or already queued as an addition.
 *
 * @param currentState - Current `AssetsController` state slices.
 * @param additions - The custom-asset additions accumulated so far (mutated).
 * @param accountId - The account UUID.
 * @param assetId - CAIP-19 asset identifier.
 */
function addCustomAssetAddition(
  currentState: CurrentAssetsState,
  additions: Record<AccountId, Caip19AssetId[]>,
  accountId: AccountId,
  assetId: Caip19AssetId,
): void {
  if (currentState.assetsBalance[accountId]?.[assetId]) {
    return;
  }
  if (currentState.customAssets[accountId]?.includes(assetId)) {
    return;
  }

  const queued = additions[accountId] ?? [];
  if (!queued.includes(assetId)) {
    queued.push(assetId);
  }
  additions[accountId] = queued;
}

const cleanupLog = createModuleLogger(projectLogger, 'cleanSpamAssets');

/**
 * TEMPORARY — feature flag for unlock spam cleanup
 *
 * @param remoteFeatureFlags - RemoteFeatureFlag state.
 * @returns `true` only when the flag explicitly enables the cleanup.
 */
export function isUnlockCleanupEnabled(remoteFeatureFlags: unknown): boolean {
  if (!isObject(remoteFeatureFlags)) {
    return false;
  }

  const flag = remoteFeatureFlags.assetsUnifyState;
  return (
    isObject(flag) &&
    hasProperty(flag, 'useUnlockCleanup') &&
    flag.useUnlockCleanup === true
  );
}

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_OCCURRENCE_FLOOR = 3;

/** The slices of Token API surface the cleanup uses. */
export type SpamTokensApiClient = Pick<ApiPlatformClient, 'tokens' | 'token'>;

export type CleanSpamAssetsState = Pick<
  AssetsControllerStateInternal,
  'assetsInfo' | 'assetsBalance' | 'customAssets'
>;

export type CleanSpamAssetsOptions = {
  state: CleanSpamAssetsState;
  apiClient: SpamTokensApiClient;
  captureException?: (error: Error) => void;
};

/**
 * Cleanup of Spam Assets.
 * The state can be persisted with spam tokens through boundary faults (API loosened, WS passing in spam)
 *
 * @param options - Input params.
 * @param options.state - Current controller state (read-only).
 * @param options.apiClient - Token API client.
 * @param options.captureException - Optional reporter for failures.
 * @returns Updated or original controller state
 */
export async function cleanSpamAssets({
  state,
  apiClient,
  captureException,
}: CleanSpamAssetsOptions): Promise<{
  spamAssetIds: Caip19AssetId[];
  applyPatch: typeof applyCleanupPatch;
} | null> {
  const candidates = collectSpamCleanupCandidates(state);
  if (candidates.length === 0) {
    return null;
  }

  try {
    const floors = await fetchSuggestedOccurrenceFloors(apiClient);
    const spamAssetIds: Caip19AssetId[] = [];

    for (const batch of divideIntoBatches(candidates, {
      batchSize: 50,
    })) {
      const belowFloorAssetIds = await findBelowFloorAssetIds(
        batch,
        floors,
        apiClient,
      ).catch(() => []);
      if (belowFloorAssetIds.length > 0) {
        cleanupLog('Classified a batch of assets as spam', {
          batchSize: batch.length,
          spamCount: belowFloorAssetIds.length,
        });
        spamAssetIds.push(...belowFloorAssetIds);
      }
    }

    if (spamAssetIds.length === 0) {
      return null;
    }

    return { spamAssetIds, applyPatch: applyCleanupPatch };
  } catch (error) {
    // API calls failed, cleanup not performed. Will be retried when next invoked.
    cleanupLog(
      'Spam cleanup failed; leaving remaining assets untouched',
      error,
    );
    captureException?.(
      new Error(
        `AssetsController: assetsInfo spam cleanup failed: ${getErrorMessage(
          error,
        )}`,
      ),
    );
    return null;
  }
}

/**
 * Collect the assets eligible for cleanup:
 * - ERC-20 token
 * - Not in excluded list
 * - Not a custom asset
 * - On Account API covered chains
 *
 * @param state - Current controller state.
 * @param state.assetsInfo - Tracked asset metadata, keyed by CAIP-19 ID.
 * @param state.customAssets - Per-account custom asset IDs.
 * @returns Candidate asset IDs.
 */
function collectSpamCleanupCandidates({
  assetsInfo,
  customAssets,
}: Pick<CleanSpamAssetsState, 'assetsInfo' | 'customAssets'>): Caip19AssetId[] {
  const customAssetIds = new Set(
    Object.values(customAssets)
      .flat()
      .map((assetId) => assetId.toLowerCase()),
  );

  const excludedAssets = [...DEFAULT_TRACKED_ASSETS_BY_CHAIN.values()]
    .flat()
    .map((a) => a.toLowerCase());

  return (Object.keys(assetsInfo) as Caip19AssetId[]).filter((assetId) => {
    const lowerId = assetId.toLowerCase();
    const [chainId, asset] = lowerId.split('/');

    const isERC20 = Boolean(asset?.startsWith('erc20:'));
    // `DEFAULT_TRACKED_ASSETS_BY_CHAIN` is a *seeding* registry that only
    // lists mUSD on the chains it's been added as a default tracked asset —
    // not every chain mUSD is actually deployed to. Exempting by that list
    // alone left mUSD holdings on every other chain exposed to the
    // occurrence-floor filter below, where mUSD's real (low) aggregator
    // count falls under the floor and this sweep deletes the holding. Exempt
    // mUSD chain-agnostically by address instead, matching how the sibling
    // spam filters in `TokenDataSource.ts` already do it.
    const isNotExcluded = !excludedAssets.includes(lowerId) && !isMusdAssetId(lowerId);
    const isNotCustomAsset = !customAssetIds.has(lowerId);
    const isOnAccountAPICoveredChain =
      ACCOUNT_API_SUPPORTED_CHAIN_IDS.has(chainId);

    return (
      isERC20 && isNotExcluded && isNotCustomAsset && isOnAccountAPICoveredChain
    );
  });
}

/**
 * Fetch and filter assets by occurrence floor.
 * If fetch fails, error is propagated (fail-close, cleanup not performed)
 *
 * @param assetIds - A single batch of candidate asset IDs.
 * @param floors - Suggested occurrence floors keyed by decimal chain ID.
 * @param apiClient - Token API client.
 * @returns The subset of `assetIds` that falls below its chain's floor.
 */
async function findBelowFloorAssetIds(
  assetIds: Caip19AssetId[],
  floors: Record<string, number>,
  apiClient: SpamTokensApiClient,
): Promise<Caip19AssetId[]> {
  try {
    const assets = await fetchWithTimeout(
      () =>
        apiClient.tokens.fetchV3Assets(
          assetIds,
          { includeOccurrences: true },
          { staleTime: 0, gcTime: 0 },
        ),
      FETCH_TIMEOUT_MS,
    );

    // Assets absent from the response array altogether are ones the API has
    // never indexed at all (e.g. a chain it doesn't serve) — distinct from
    // an asset the API *did* respond about but scored with no occurrence
    // count. Only the former is unjudgeable; matches the sibling
    // `TokenDataSource.occurrenceFilterMiddleware`'s "only assets the API
    // knows can be judged; missing ones are kept" contract, which likewise
    // never iterates past what the response array actually contains. Unlike
    // that sibling — whose worst case for "unjudgeable" is not adding a
    // token — this function DELETES existing holdings, so defaulting an
    // asset entirely missing from the response to a confirmed-zero
    // occurrence count turned "the API has never indexed this asset" into
    // "delete the user's holding of it".
    const respondedLowerIds = new Set(
      assets.map((asset) => asset.assetId.toLowerCase()),
    );
    const occurrencesByLowerId = new Map(
      assets.map((asset) => [asset.assetId.toLowerCase(), asset.occurrences]),
    );

    return assetIds.filter((assetId) => {
      const lowerId = assetId.toLowerCase();
      if (!respondedLowerIds.has(lowerId)) {
        return false;
      }
      const chainReference = assetId.split(':')[1]?.split('/')[0] ?? '';
      const floor = floors[chainReference] ?? DEFAULT_OCCURRENCE_FLOOR;
      return (occurrencesByLowerId.get(lowerId) ?? 0) < floor;
    });
  } catch (error) {
    cleanupLog('Failed to fetch assets', error);
    throw error;
  }
}

/**
 * Fetch per-chain suggested occurrence floors.
 * If fetch fails, error is propagated (fail-close, cleanup not performed)
 *
 * @param apiClient - Token API client.
 * @returns Map of decimal chain ID to suggested floor.
 */
async function fetchSuggestedOccurrenceFloors(
  apiClient: SpamTokensApiClient,
): Promise<Record<string, number>> {
  try {
    return await fetchWithTimeout(
      () =>
        apiClient.token.fetchV1SuggestedOccurrenceFloors({
          staleTime: 0,
          gcTime: 0,
        }),
      FETCH_TIMEOUT_MS,
    );
  } catch (error) {
    cleanupLog('Failed to fetch suggested occurrence floors', error);
    throw error;
  }
}

function applyCleanupPatch(
  state: Pick<CleanSpamAssetsState, 'assetsInfo' | 'assetsBalance'>,
  patch: {
    spamAssetIds: Caip19AssetId[];
  },
): void {
  const { spamAssetIds } = patch;

  const spam = new Set(spamAssetIds.map((assetId) => assetId.toLowerCase()));
  if (spam.size === 0) {
    return;
  }
  const isSpam = (assetId: string): boolean => spam.has(assetId.toLowerCase());

  for (const assetId of Object.keys(state.assetsInfo).filter(isSpam)) {
    delete state.assetsInfo[assetId as Caip19AssetId];
  }
  for (const balances of Object.values(state.assetsBalance)) {
    for (const assetId of Object.keys(balances).filter(isSpam)) {
      delete balances[assetId as Caip19AssetId];
    }
  }

  cleanupLog('Removed spam assets', { count: spam.size });
}
