import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { TokensControllerState } from '@metamask/assets-controllers';
import type { Hex } from '@metamask/utils';
import {
  getChecksumAddress,
  getErrorMessage,
  hasProperty,
  isObject,
} from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { createModuleLogger, projectLogger } from '../logger';
import type {
  AccountId,
  Caip19AssetId,
  FungibleAssetMetadata,
  AssetsControllerStateInternal,
} from '../types';

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
