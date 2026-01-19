import type { V3AssetResponse } from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';
import { parseCaipAssetType } from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type { Caip19AssetId, AssetMetadata, Middleware } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'TokenDataSource';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

/**
 * Cache duration for supported networks (1 hour in milliseconds)
 */
const SUPPORTED_NETWORKS_CACHE_DURATION_MS = 60 * 60 * 1000;

// ============================================================================
// MESSENGER TYPES
// ============================================================================

/**
 * Action to get the TokenDataSource middleware.
 */
export type TokenDataSourceGetAssetsMiddlewareAction = {
  type: `${typeof CONTROLLER_NAME}:getAssetsMiddleware`;
  handler: () => Middleware;
};

/**
 * All actions exposed by TokenDataSource.
 */
export type TokenDataSourceActions = TokenDataSourceGetAssetsMiddlewareAction;

/**
 * TokenDataSource no longer needs external BackendApiClient actions.
 * It uses ApiPlatformClient directly.
 */
export type TokenDataSourceAllowedActions = never;

export type TokenDataSourceMessenger = Messenger<
  typeof CONTROLLER_NAME,
  TokenDataSourceActions,
  never
>;

// ============================================================================
// OPTIONS
// ============================================================================

export type TokenDataSourceOptions = {
  messenger: TokenDataSourceMessenger;
  /** ApiPlatformClient for API calls with caching */
  queryApiClient: ApiPlatformClient;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function transformV3AssetResponseToMetadata(
  assetId: string,
  assetData: V3AssetResponse,
): AssetMetadata {
  const parsed = parseCaipAssetType(assetId as CaipAssetType);
  let tokenType: 'native' | 'erc20' | 'spl' = 'erc20';

  if (parsed.assetNamespace === 'slip44') {
    tokenType = 'native';
  } else if (parsed.assetNamespace === 'spl') {
    tokenType = 'spl';
  }

  return {
    type: tokenType,
    name: assetData.name,
    symbol: assetData.symbol,
    decimals: assetData.decimals,
    image: assetData.iconUrl ?? assetData.iconUrlThumbnail,
  };
}

// ============================================================================
// TOKEN DATA SOURCE
// ============================================================================

/**
 * TokenDataSource enriches responses with token metadata from the Tokens API.
 *
 * This middleware-based data source:
 * - Checks detected assets for missing metadata/images
 * - Fetches metadata from Tokens API v3 for assets needing enrichment
 * - Merges fetched metadata into the response
 *
 * Usage:
 * ```typescript
 * // Create and initialize (registers messenger actions)
 * const tokenDataSource = new TokenDataSource({ messenger, queryApiClient });
 *
 * // Later, get middleware via messenger
 * const middleware = messenger.call('TokenDataSource:getAssetsMiddleware');
 * ```
 */
export class TokenDataSource {
  readonly name = CONTROLLER_NAME;

  readonly #messenger: TokenDataSourceMessenger;

  /** ApiPlatformClient for cached API calls */
  readonly #apiClient: ApiPlatformClient;

  /**
   * Cached set of supported chain IDs (CAIP format, e.g., "eip155:1", "tron:728126428")
   */
  #supportedNetworks: Set<string> | undefined;

  /**
   * Timestamp when supportedNetworks cache was last updated
   */
  #supportedNetworksCacheTimestamp = 0;

  constructor(options: TokenDataSourceOptions) {
    this.#messenger = options.messenger;
    this.#apiClient = options.queryApiClient;
    this.#registerActionHandlers();
  }

  /**
   * Gets the supported networks from cache or fetches them from the API.
   * Uses v2/supportedNetworks which returns both fullSupport and partialSupport.
   *
   * @returns Set of supported chain IDs in CAIP format
   */
  async #getSupportedNetworks(): Promise<Set<string>> {
    const now = Date.now();
    const cacheExpired =
      now - this.#supportedNetworksCacheTimestamp >
      SUPPORTED_NETWORKS_CACHE_DURATION_MS;

    if (this.#supportedNetworks && !cacheExpired) {
      return this.#supportedNetworks;
    }

    try {
      // Use v2/supportedNetworks which returns CAIP chain IDs
      const response =
        await this.#apiClient.tokens.fetchTokenV2SupportedNetworks();

      // Combine full and partial support networks
      const allNetworks = [...response.fullSupport, ...response.partialSupport];

      this.#supportedNetworks = new Set(allNetworks);
      this.#supportedNetworksCacheTimestamp = now;

      return this.#supportedNetworks;
    } catch (error) {
      log('Failed to fetch supported networks', { error });

      // Return cached networks if available, otherwise return empty set
      return this.#supportedNetworks ?? new Set();
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

  #registerActionHandlers(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.#messenger as any).registerActionHandler(
      'TokenDataSource:getAssetsMiddleware',
      () => this.assetsMiddleware,
    );
  }

  /**
   * Get the middleware for enriching responses with token metadata.
   *
   * This middleware:
   * 1. Extracts the response from context
   * 2. Fetches metadata for detected assets (assets without metadata)
   * 3. Enriches the response with fetched metadata
   * 4. Calls next() at the end to continue the middleware chain
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['metadata'], async (ctx, next) => {
      // Extract response from context
      const { response } = ctx;

      // Only fetch metadata for detected assets (assets without metadata)
      if (!response.detectedAssets) {
        return next(ctx);
      }

      const { assetsMetadata: stateMetadata } = ctx.getAssetsState();
      const assetIdsNeedingMetadata = new Set<string>();

      for (const detectedIds of Object.values(response.detectedAssets)) {
        for (const assetId of detectedIds) {
          // Skip if response already has metadata with image
          const responseMetadata = response.assetsMetadata?.[assetId];
          if (responseMetadata?.image) {
            continue;
          }

          // Skip if state already has metadata with image
          const existingMetadata = stateMetadata[assetId];
          if (existingMetadata?.image) {
            continue;
          }

          assetIdsNeedingMetadata.add(assetId);
        }
      }

      if (assetIdsNeedingMetadata.size === 0) {
        return next(ctx);
      }

      // Filter asset IDs to only include supported networks
      const supportedNetworks = await this.#getSupportedNetworks();
      const supportedAssetIds = this.#filterAssetsByNetwork(
        [...assetIdsNeedingMetadata],
        supportedNetworks,
      );

      if (supportedAssetIds.length === 0) {
        return next(ctx);
      }

      try {
        // Use ApiPlatformClient for fetching asset metadata
        // API returns an array with assetId as a property on each item
        const metadataResponse =
          await this.#apiClient.tokens.fetchV3Assets(supportedAssetIds);

        response.assetsMetadata ??= {};

        for (const assetData of metadataResponse) {
          const caipAssetId = assetData.assetId as Caip19AssetId;
          response.assetsMetadata[caipAssetId] =
            transformV3AssetResponseToMetadata(assetData.assetId, assetData);
        }
      } catch (error) {
        log('Failed to fetch metadata', { error });
      }

      // Call next() at the end to continue the middleware chain
      return next(ctx);
    });
  }
}
