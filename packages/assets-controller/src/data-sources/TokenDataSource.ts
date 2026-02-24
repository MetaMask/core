import type { V3AssetResponse } from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import { parseCaipAssetType } from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';

import { isStakingContractAssetId } from './evm-rpc-services';
import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type {
  Caip19AssetId,
  AssetMetadata,
  Middleware,
  FungibleAssetMetadata,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'TokenDataSource';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// MESSENGER TYPES
// ============================================================================

/**
 * TokenDataSource does not call external messenger actions.
 * It uses ApiPlatformClient directly.
 */
export type TokenDataSourceAllowedActions = never;

// ============================================================================
// OPTIONS
// ============================================================================

export type TokenDataSourceOptions = {
  /** ApiPlatformClient for API calls with caching */
  queryApiClient: ApiPlatformClient;
};

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
 * @returns FungibleAssetMetadata for state storage.
 */
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

  const metadata: FungibleAssetMetadata = {
    // Type derived from assetId
    type: tokenType,
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
 * Usage: Create with queryApiClient and use assetsMiddleware; no messenger required.
 */
export class TokenDataSource {
  readonly name = CONTROLLER_NAME;

  getName(): string {
    return this.name;
  }

  /** ApiPlatformClient for cached API calls */
  readonly #apiClient: ApiPlatformClient;

  constructor(options: TokenDataSourceOptions) {
    this.#apiClient = options.queryApiClient;
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
      const response =
        await this.#apiClient.tokens.fetchTokenV2SupportedNetworks();

      // Combine full and partial support networks
      const allNetworks = [...response.fullSupport, ...response.partialSupport];

      return new Set(allNetworks);
    } catch (error) {
      log('Failed to fetch supported networks', { error });
      return new Set();
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

      const { assetsInfo: stateMetadata } = ctx.getAssetsState();
      const assetIdsNeedingMetadata = new Set<string>();

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
        const metadataResponse = await this.#apiClient.tokens.fetchV3Assets(
          supportedAssetIds,
          {
            includeIconUrl: true,
            includeMarketData: true,
            includeMetadata: true,
            includeLabels: true,
            includeRwaData: true,
            includeAggregators: true,
          },
        );

        response.assetsInfo ??= {};

        for (const assetData of metadataResponse) {
          const caipAssetId = assetData.assetId as Caip19AssetId;
          response.assetsInfo[caipAssetId] = transformV3AssetResponseToMetadata(
            assetData.assetId,
            assetData,
          );
        }
      } catch (error) {
        log('Failed to fetch metadata', { error });
      }

      // Call next() at the end to continue the middleware chain
      return next(ctx);
    });
  }
}
