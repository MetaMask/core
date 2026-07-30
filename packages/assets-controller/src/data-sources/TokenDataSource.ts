import type { V3AssetResponse } from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import type {
  BulkTokenScanResponse,
  PhishingControllerBulkScanTokensAction,
} from '@metamask/phishing-controller';
import { TokenScanResultType } from '@metamask/phishing-controller';
import { KnownCaipNamespace, parseCaipAssetType } from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';

import type { AssetsControllerMessenger } from '../AssetsController.js';
import { projectLogger, createModuleLogger } from '../logger.js';
import { forDataTypes } from '../types.js';
import type {
  Caip19AssetId,
  AssetMetadata,
  Middleware,
  FungibleAssetMetadata,
} from '../types.js';
import { fetchWithTimeout } from '../utils/index.js';
import {
  isStakingContractAssetId,
  reduceInBatchesSerially,
} from './evm-rpc-services/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'TokenDataSource';
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

/** Max asset IDs per tokens API request. */
const TOKENS_API_BATCH_SIZE = 50;

/** Max tokens per PhishingController:bulkScanTokens request (see PhishingController). */
const BULK_SCAN_BATCH_SIZE = 100;

/**
 * Fallback minimum aggregator occurrences for EVM ERC-20 spam filtering when
 * Token API `/v1/suggestedOccurrenceFloors` has no entry for the chain (or
 * the floors request fails). Non-EVM tokens are filtered via Blockaid instead.
 */
const DEFAULT_OCCURRENCE_FLOOR = 3;

/** CAIP-19 `assetNamespace` segments used across filtering logic. */
export enum CaipAssetNamespace {
  Slip44 = 'slip44',
  Erc20 = 'erc20',
  Token = 'token',
}

const MUSD_ADDRESS_LOWERCASE = '0xaca92e438df0b2401ff60da7e4337b687a2435da';

// ============================================================================
// OPTIONS
// ============================================================================

export type TokenDataSourceOptions = {
  /** ApiPlatformClient for API calls with caching */
  queryApiClient: ApiPlatformClient;
  /** Returns CAIP-19 native asset IDs from NetworkEnablementController state */
  getNativeAssetIds: () => string[];
  /** Returns the asset type ('native' | 'erc20' | 'spl') for a given CAIP-19 asset ID */
  getAssetType: (assetId: Caip19AssetId) => 'native' | 'erc20' | 'spl';
  /**
   * Timeout in ms for a single Tokens API call (default: 15000). When it
   * fires, the batch rejects so metadata enrichment proceeds without it.
   */
  fetchTimeoutMs?: number;
};

/**
 * Messenger actions `TokenDataSource` may invoke (via {@link AssetsControllerMessenger}).
 * Not re-exported from the package public `index` (repo ESLint); import from this module when
 * typing a messenger in the same package or tests.
 */
export type TokenDataSourceAllowedActions =
  PhishingControllerBulkScanTokensAction;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Transform V3 API response to FungibleAssetMetadata for state storage.
 *
 * Mapping:
 * - assetId → used to derive `type` (native/erc20/spl)
 * - iconUrl → image
 * - All other fields map directly
 *
 * @param assetId - CAIP-19 asset ID used to derive token type.
 * @param assetData - V3 API response data.
 * @param getAssetType - Returns the asset type for a given CAIP-19 asset ID.
 * @returns FungibleAssetMetadata for state storage.
 */
function transformV3AssetResponseToMetadata(
  assetId: Caip19AssetId,
  assetData: V3AssetResponse,
  getAssetType: (id: Caip19AssetId) => 'native' | 'erc20' | 'spl',
): AssetMetadata {
  const metadata: FungibleAssetMetadata = {
    type: getAssetType(assetId),
    // BaseAssetMetadata fields
    name: assetData.name,
    symbol: assetData.symbol,
    decimals: assetData.decimals,
    image: assetData.iconUrl,
    // Direct mapping fields
    coingeckoId: assetData.coingeckoId,
    occurrences: assetData.occurrences,
    aggregators: assetData.aggregators,
    labels: assetData.labels,
    erc20Permit: assetData.erc20Permit,
    fees: assetData.fees,
    honeypotStatus: assetData.honeypotStatus,
    storage: assetData.storage,
    isContractVerified: assetData.isContractVerified,
    description: assetData.description,
  };

  return metadata;
}

/**
 * Resolve the occurrence floor for an EVM asset from suggested floors keyed by
 * decimal chain ID (e.g. `{ "1": 3, "143": 1 }`).
 *
 * @param assetId - CAIP-19 asset ID.
 * @param floors - Map of decimal chain ID → suggested floor.
 * @returns Floor to apply, or {@link DEFAULT_OCCURRENCE_FLOOR} when missing.
 */
function getOccurrenceFloorForAsset(
  assetId: string,
  floors: Record<string, number>,
): number {
  try {
    const { chain } = parseCaipAssetType(assetId as CaipAssetType);
    return floors[chain.reference] ?? DEFAULT_OCCURRENCE_FLOOR;
  } catch {
    return DEFAULT_OCCURRENCE_FLOOR;
  }
}

// ============================================================================
// TOKEN DATA SOURCE
// ============================================================================

/**
 * TokenDataSource enriches responses with token metadata from the Tokens API.
 *
 * This middleware-based data source:
 * - Checks detected assets for missing metadata/images
 * - Also checks `assetsBalance` entries missing metadata/images (heal path)
 * - Fetches metadata from Tokens API v3 for assets needing enrichment
 * - Filters EVM ERC-20 spam using per-chain floors from Token API
 *   `/v1/suggestedOccurrenceFloors` (default floor 3) for newly detected
 *   assets only; balance-only heals are enriched without spam-filtering
 * - Merges fetched metadata into the response
 *
 * Pass the same {@link AssetsControllerMessenger} as other data sources for Blockaid
 * token scans.
 */
export class TokenDataSource {
  readonly name = CONTROLLER_NAME;

  getName(): string {
    return this.name;
  }

  /** ApiPlatformClient for cached API calls */
  readonly #apiClient: ApiPlatformClient;

  /** Returns CAIP-19 native asset IDs from NetworkEnablementController state */
  readonly #getNativeAssetIds: () => string[];

  /** Returns the asset type for a given CAIP-19 asset ID */
  readonly #getAssetType: (
    assetId: Caip19AssetId,
  ) => 'native' | 'erc20' | 'spl';

  /** Shared controller messenger — used for `PhishingController:bulkScanTokens`. */
  readonly #messenger: AssetsControllerMessenger;

  readonly #fetchTimeoutMs: number;

  constructor(
    messenger: AssetsControllerMessenger,
    options: TokenDataSourceOptions,
  ) {
    this.#messenger = messenger;
    this.#apiClient = options.queryApiClient;
    this.#getNativeAssetIds = options.getNativeAssetIds;
    this.#getAssetType = options.getAssetType;
    this.#fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  }

  /**
   * Gets the supported networks from the API.
   * Caching is handled by ApiPlatformClient.
   *
   * @returns Set of supported chain IDs in CAIP format
   */
  async #getSupportedNetworks(): Promise<Set<string>> {
    try {
      // Use v2/supportedNetworks which returns CAIP chain IDs
      // ApiPlatformClient handles caching
      const response = await fetchWithTimeout(
        () => this.#apiClient.tokens.fetchTokenV2SupportedNetworks(),
        this.#fetchTimeoutMs,
      );

      // Combine full and partial support networks
      const allNetworks = [...response.fullSupport, ...response.partialSupport];

      return new Set(allNetworks);
    } catch (error) {
      log('Failed to fetch supported networks', { error });
      return new Set();
    }
  }

  /**
   * Fetches per-chain suggested occurrence floors from Token API
   * (`GET /v1/suggestedOccurrenceFloors`). Caching is handled by
   * ApiPlatformClient. Fails open to an empty map so callers fall back to
   * {@link DEFAULT_OCCURRENCE_FLOOR}.
   *
   * @returns Map of decimal chain ID → suggested occurrence floor.
   */
  async #getSuggestedOccurrenceFloors(): Promise<Record<string, number>> {
    try {
      return await fetchWithTimeout(
        () => this.#apiClient.token.fetchV1SuggestedOccurrenceFloors(),
        this.#fetchTimeoutMs,
      );
    } catch (error) {
      log('Failed to fetch suggested occurrence floors', { error });
      return {};
    }
  }

  /**
   * Filters asset IDs to only include those from supported networks.
   *
   * @param assetIds - Array of CAIP-19 asset IDs
   * @param supportedNetworks - Set of supported chain IDs
   * @returns Array of asset IDs from supported networks
   */
  #filterAssetsByNetwork(
    assetIds: string[],
    supportedNetworks: Set<string>,
  ): string[] {
    return assetIds.filter((assetId) => {
      try {
        const parsed = parseCaipAssetType(assetId as CaipAssetType);
        // chainId is in format "eip155:1" or "tron:728126428"
        // parsed.chain has namespace and reference properties
        const chainId = `${parsed.chain.namespace}:${parsed.chain.reference}`;
        return supportedNetworks.has(chainId);
      } catch {
        // If we can't parse the asset ID, filter it out
        return false;
      }
    });
  }

  /**
   * Filters non-EVM fungible `token` assets flagged as malicious by Blockaid
   * via `PhishingController:bulkScanTokens`. Only the `token` namespace (e.g.
   * Solana mints) is scanned; native (`slip44`) and EVM assets are not handled
   * here (EVM uses occurrence-count filtering instead). Fails open on error.
   *
   * @param assets - CAIP-19 asset IDs to filter (non-EVM only).
   * @returns Asset IDs with malicious tokens removed.
   */
  async #filterBlockaidSpamTokens(assets: string[]): Promise<string[]> {
    if (assets.length === 0) {
      return assets;
    }

    const tokensByChain: Record<string, { asset: string; address: string }[]> =
      {};

    for (const asset of assets) {
      try {
        const { assetNamespace, assetReference, chain } = parseCaipAssetType(
          asset as CaipAssetType,
        );

        if (assetNamespace === CaipAssetNamespace.Token) {
          const chainName = chain.namespace;
          if (!tokensByChain[chainName]) {
            tokensByChain[chainName] = [];
          }
          tokensByChain[chainName].push({ asset, address: assetReference });
        }
      } catch {
        // Malformed or unsupported for bulk scan — keep asset (fail open)
      }
    }

    if (Object.keys(tokensByChain).length === 0) {
      return assets;
    }

    const rejectedAssets = new Set<string>();

    try {
      for (const [chainId, tokenEntries] of Object.entries(tokensByChain)) {
        const addresses = tokenEntries.map((entry) => entry.address);
        const batches: string[][] = [];
        for (let i = 0; i < addresses.length; i += BULK_SCAN_BATCH_SIZE) {
          batches.push(addresses.slice(i, i + BULK_SCAN_BATCH_SIZE));
        }

        const batchResults = await Promise.allSettled(
          batches.map((batch) =>
            this.#messenger.call('PhishingController:bulkScanTokens', {
              chainId,
              tokens: batch,
            }),
          ),
        );

        const scanResponse: BulkTokenScanResponse = {};
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            Object.assign(scanResponse, result.value);
          }
        }

        for (const entry of tokenEntries) {
          const result = scanResponse[entry.address];
          if (result?.result_type === TokenScanResultType.Malicious) {
            rejectedAssets.add(entry.asset);
          }
        }
      }
    } catch (error) {
      log('Blockaid bulk token scan failed; keeping all tokens', { error });
      return assets;
    }

    return assets.filter((asset) => !rejectedAssets.has(asset));
  }

  /**
   * Get the middleware for enriching responses with token metadata.
   *
   * This middleware:
   * 1. Extracts the response from context
   * 2. Fetches metadata for detected assets and balances missing metadata
   * 3. Enriches the response with fetched metadata
   * 4. Calls next() at the end to continue the middleware chain
   *
   * Spam filtering (EVM occurrence floors / non-EVM Blockaid) applies only to
   * newly `detectedAssets`. Balance-only heals — assets already present in
   * `assetsBalance` but missing `assetsInfo`, which DetectionMiddleware skips —
   * are enriched without being filtered out of balances.
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['metadata'], async (ctx, next) => {
      // Extract response from context
      const { response } = ctx;

      const { assetsInfo: stateMetadata, customAssets } = ctx.getAssetsState();
      const assetIdsNeedingMetadata = new Set<string>();
      // Newly detected asset IDs (lowercase) — subject to spam filtering.
      const detectedAssetIds = new Set<string>();
      // Balance-only heals (in assetsBalance, not newly detected) — enrich
      // metadata but do not spam-filter / delete holdings.
      const balanceHealAssetIds = new Set<string>();

      // Custom assets are user-imported — exempt from spam filtering.
      // State stores asset IDs in their normalized (checksummed) form, but the
      // V3 Tokens API can return them lower-cased. Lowercase both sides so the
      // bypass is robust to address-case differences across data sources.
      const customAssetIds = new Set<string>(
        Object.values(customAssets ?? {})
          .flat()
          .map((id) => id.toLowerCase()),
      );

      // Always include native asset IDs from NetworkEnablementController
      const nativeAssetIdsList = this.#getNativeAssetIds();
      const nativeAssetIds = new Set(
        nativeAssetIdsList.map((id) => id.toLowerCase()),
      );
      for (const nativeAssetId of nativeAssetIdsList) {
        assetIdsNeedingMetadata.add(nativeAssetId);
      }

      // Also fetch metadata for detected assets that are missing it
      if (response.detectedAssets) {
        for (const detectedIds of Object.values(response.detectedAssets)) {
          for (const assetId of detectedIds) {
            // Skip if response already has metadata with image
            const responseMetadata = response.assetsInfo?.[assetId];
            if (responseMetadata?.image) {
              continue;
            }

            // Skip if state already has metadata with image
            const existingMetadata = stateMetadata[assetId];
            if (existingMetadata?.image) {
              continue;
            }

            // Skip staking contracts; we use built-in metadata and do not fetch from the tokens API
            if (isStakingContractAssetId(assetId)) {
              continue;
            }

            detectedAssetIds.add(assetId.toLowerCase());
            assetIdsNeedingMetadata.add(assetId);
          }
        }
      }

      // Also fetch metadata for balances that are missing it
      if (response.assetsBalance) {
        for (const accountBalances of Object.values(response.assetsBalance)) {
          for (const assetId of Object.keys(
            accountBalances,
          ) as Caip19AssetId[]) {
            if (response.assetsInfo?.[assetId]?.image) {
              continue;
            }
            if (stateMetadata[assetId]?.image) {
              continue;
            }
            if (isStakingContractAssetId(assetId)) {
              continue;
            }
            assetIdsNeedingMetadata.add(assetId);
            // Only treat as a heal when DetectionMiddleware did not queue it
            // as newly detected — those remain subject to spam filtering.
            if (!detectedAssetIds.has(assetId.toLowerCase())) {
              balanceHealAssetIds.add(assetId.toLowerCase());
            }
          }
        }
      }

      if (assetIdsNeedingMetadata.size === 0) {
        return next(ctx);
      }

      // Filter asset IDs to only include supported networks; load per-chain
      // occurrence floors in parallel (Token API suggested floors).
      const [supportedNetworks, suggestedOccurrenceFloors] = await Promise.all([
        this.#getSupportedNetworks(),
        this.#getSuggestedOccurrenceFloors(),
      ]);
      const supportedAssetIds = this.#filterAssetsByNetwork(
        [...assetIdsNeedingMetadata],
        supportedNetworks,
      );

      if (supportedAssetIds.length === 0) {
        return next(ctx);
      }

      try {
        const fetchOptions = {
          includeIconUrl: true,
          includeMarketData: true,
          includeMetadata: true,
          includeLabels: true,
          includeRwaData: true,
          includeAggregators: true,
          includeOccurrences: true,
        };

        const metadataResponse = await reduceInBatchesSerially<
          string,
          V3AssetResponse[]
        >({
          values: supportedAssetIds,
          batchSize: TOKENS_API_BATCH_SIZE,
          eachBatch: async (workingResult, batch) => {
            const batchResponse = await fetchWithTimeout(
              () => this.#apiClient.tokens.fetchV3Assets(batch, fetchOptions),
              this.#fetchTimeoutMs,
            );
            return [...(workingResult as V3AssetResponse[]), ...batchResponse];
          },
          initialResult: [],
        });

        // Split assets by chain type: EVM uses occurrence-count filtering;
        // non-EVM non-native uses Blockaid; native assets are always allowed.
        const occurrencesByAssetId = new Map(
          metadataResponse.map((a) => [a.assetId, a.occurrences]),
        );

        const evmErc20Ids: string[] = [];
        const nonEvmTokenIds: string[] = [];

        for (const assetData of metadataResponse) {
          const assetId = assetData.assetId as Caip19AssetId;
          const { assetNamespace, chain } = parseCaipAssetType(assetId);
          if (nativeAssetIds.has(assetId.toLowerCase())) {
            // Native assets are always kept — no filtering.
          } else if (
            assetNamespace === CaipAssetNamespace.Erc20 &&
            chain.namespace === KnownCaipNamespace.Eip155
          ) {
            evmErc20Ids.push(assetId);
          } else if (assetNamespace === CaipAssetNamespace.Token) {
            nonEvmTokenIds.push(assetId);
          }
        }

        // EVM: require per-chain suggested occurrence floor (from Token API
        // `/v1/suggestedOccurrenceFloors`, default {@link DEFAULT_OCCURRENCE_FLOOR})
        // to suppress low-signal tokens. Tokens with no occurrence data
        // (undefined) are treated the same as zero occurrences and filtered out.
        // Custom assets (user-imported) bypass the occurrence filter — users
        // can import whatever they want and we must keep their metadata even
        // if the API has fewer aggregator hits than the floor.
        // Balance-only heals also bypass — see `balanceHealAssetIds` below.
        const allowedEvmIds = new Set(
          evmErc20Ids.filter(
            (id) =>
              customAssetIds.has(id.toLowerCase()) ||
              balanceHealAssetIds.has(id.toLowerCase()) ||
              (occurrencesByAssetId.get(id) ?? 0) >=
                getOccurrenceFloorForAsset(id, suggestedOccurrenceFloors) ||
              id.includes(`/erc20:${MUSD_ADDRESS_LOWERCASE}`),
          ),
        );

        // Non-EVM: Blockaid bulk scan.
        // Custom assets and balance-only heals bypass Blockaid filtering.
        const nonEvmToScan = nonEvmTokenIds.filter(
          (id) =>
            !customAssetIds.has(id.toLowerCase()) &&
            !balanceHealAssetIds.has(id.toLowerCase()),
        );
        const allowedNonEvmIds = new Set([
          ...nonEvmTokenIds.filter(
            (id) =>
              customAssetIds.has(id.toLowerCase()) ||
              balanceHealAssetIds.has(id.toLowerCase()),
          ),
          ...(await this.#filterBlockaidSpamTokens(nonEvmToScan)),
        ]);

        // Start with every asset the API returned; only remove those that
        // fail their respective filter (EVM occurrences / non-EVM Blockaid).
        // Native (slip44) and unrecognised namespaces are kept (fail open).
        const allowedAssetIds = new Set(metadataResponse.map((a) => a.assetId));

        for (const id of evmErc20Ids) {
          if (!allowedEvmIds.has(id)) {
            allowedAssetIds.delete(id);
          }
        }
        for (const id of nonEvmTokenIds) {
          if (!allowedNonEvmIds.has(id)) {
            allowedAssetIds.delete(id);
          }
        }

        response.assetsInfo ??= {};

        const filteredOutAssets = new Set<string>();

        for (const assetData of metadataResponse) {
          if (!allowedAssetIds.has(assetData.assetId)) {
            filteredOutAssets.add(assetData.assetId);
            continue;
          }

          const caipAssetId = assetData.assetId as Caip19AssetId;
          response.assetsInfo[caipAssetId] = transformV3AssetResponseToMetadata(
            caipAssetId,
            assetData,
            this.#getAssetType,
          );
        }

        if (filteredOutAssets.size > 0) {
          if (response.assetsBalance) {
            for (const accountBalances of Object.values(
              response.assetsBalance,
            )) {
              for (const assetId of filteredOutAssets) {
                delete (accountBalances as Record<string, unknown>)[assetId];
              }
            }
          }

          if (response.detectedAssets) {
            for (const [accountId, assetIds] of Object.entries(
              response.detectedAssets,
            )) {
              response.detectedAssets[accountId] = assetIds.filter(
                (id) => !filteredOutAssets.has(id),
              );
            }
          }
        }
      } catch (error) {
        log('Failed to fetch metadata', { error });
      }

      // Call next() at the end to continue the middleware chain
      return next(ctx);
    });
  }
}
