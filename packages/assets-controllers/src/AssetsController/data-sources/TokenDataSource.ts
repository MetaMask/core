import type { AssetByIdResponse, TokensGetV3AssetsAction } from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';
import { parseCaipAssetType, type CaipAssetType } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../../logger';
import {
  forDataTypes,
  type Caip19AssetId,
  type AssetMetadata,
  type Middleware,
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
 * External actions that TokenDataSource needs to call.
 */
export type TokenDataSourceAllowedActions = TokensGetV3AssetsAction;

export type TokenDataSourceMessenger = Messenger<
  typeof CONTROLLER_NAME,
  TokenDataSourceAllowedActions | TokenDataSourceActions,
  never
>;

// ============================================================================
// OPTIONS
// ============================================================================

export interface TokenDataSourceOptions {
  messenger: TokenDataSourceMessenger;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function transformAssetByIdResponseToMetadata(
  assetId: string,
  assetData: AssetByIdResponse,
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
 * const tokenDataSource = new TokenDataSource({ messenger });
 *
 * // Later, get middleware via messenger
 * const middleware = messenger.call('TokenDataSource:getAssetsMiddleware');
 * ```
 */
export class TokenDataSource {
  readonly name = CONTROLLER_NAME;

  readonly #messenger: TokenDataSourceMessenger;

  constructor(options: TokenDataSourceOptions) {
    this.#messenger = options.messenger;
    this.#registerActionHandlers();
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
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['metadata'], async (ctx, next) => {
      const result = await next(ctx);
      const { response } = result;

      // Only fetch metadata for newly detected assets
      if (!response.detectedAssets) {
        return result;
      }

      const { assetsMetadata: stateMetadata } = ctx.getAssetsState();
      const assetIdsNeedingMetadata = new Set<string>();

      for (const detectedIds of Object.values(response.detectedAssets)) {
        for (const assetId of detectedIds) {
          // Skip if response already has metadata with image
          const responseMetadata = response.assetsMetadata?.[assetId];
          if (responseMetadata?.image) continue;

          // Skip if state already has metadata with image
          const existingMetadata = stateMetadata[assetId as Caip19AssetId];
          if (existingMetadata?.image) continue;

          assetIdsNeedingMetadata.add(assetId);
        }
      }

      if (assetIdsNeedingMetadata.size === 0) {
        return result;
      }

      log('Fetching metadata for detected assets', {
        count: assetIdsNeedingMetadata.size,
        assetIds: [...assetIdsNeedingMetadata].slice(0, 10),
      });

      try {
        const metadataResponse = await this.#messenger.call(
          'BackendApiClient:Tokens:getV3Assets',
          [...assetIdsNeedingMetadata],
          { includeIconUrl: true, includeCoingeckoId: true, includeOccurrences: true },
        );

        if (!response.assetsMetadata) {
          response.assetsMetadata = {};
        }

        for (const [assetId, assetData] of Object.entries(metadataResponse)) {
          const caipAssetId = assetId as Caip19AssetId;
          response.assetsMetadata[caipAssetId] = transformAssetByIdResponseToMetadata(
            assetId,
            assetData,
          );
        }

        log('Enriched response with metadata', {
          count: Object.keys(response.assetsMetadata).length,
        });
      } catch (error) {
        log('Failed to fetch metadata', { error });
      }

      return result;
    });
  }
}
