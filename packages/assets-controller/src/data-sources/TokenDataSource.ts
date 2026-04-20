import type { V3AssetResponse } from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import type {
  BulkTokenScanResponse,
  PhishingControllerBulkScanTokensAction,
} from '@metamask/phishing-controller';
import { TokenScanResultType } from '@metamask/phishing-controller';
import { KnownCaipNamespace, parseCaipAssetType } from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';

import type { AssetsControllerMessenger } from '../AssetsController';
import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type {
  Caip19AssetId,
  AssetMetadata,
  Middleware,
  FungibleAssetMetadata,
} from '../types';
import {
  isStakingContractAssetId,
  reduceInBatchesSerially,
} from './evm-rpc-services';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'TokenDataSource';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

/** Max asset IDs per tokens API request. */
const TOKENS_API_BATCH_SIZE = 50;

/** Max tokens per PhishingController:bulkScanTokens request (see PhishingController). */
const BULK_SCAN_BATCH_SIZE = 100;

/**
 * Minimum number of aggregator occurrences required for an EVM ERC-20 token to
 * pass the spam filter. Non-EVM tokens are filtered via Blockaid bulk scan instead.
 */
const MIN_TOKEN_OCCURRENCES = 3;

/** CAIP-19 `assetNamespace` segments used across filtering logic. */
enum CaipAssetNamespace {
  Slip44 = 'slip44',
  Erc20 = 'erc20',
  Token = 'token',
}

// ============================================================================
// OPTIONS
// ============================================================================

export type TokenDataSourceOptions = {
  /** ApiPlatformClient for API calls with caching */
  queryApiClient: ApiPlatformClient;
  /** Returns CAIP-19 native asset IDs from NetworkEnablementController state */
  getNativeAssetIds: () => string[];
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

  /** Shared controller messenger — used for `PhishingController:bulkScanTokens`. */
  readonly #messenger: AssetsControllerMessenger;

  constructor(
    messenger: AssetsControllerMessenger,
    options: TokenDataSourceOptions,
  ) {
    this.#messenger = messenger;
    this.#apiClient = options.queryApiClient;
    this.#getNativeAssetIds = options.getNativeAssetIds;
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

      const { assetsInfo: stateMetadata, customAssets } = ctx.getAssetsState();
      const assetIdsNeedingMetadata = new Set<string>();

      // Custom assets are user-imported — exempt from spam filtering.
      const customAssetIds = new Set<string>(
        Object.values(customAssets ?? {}).flat(),
      );

      // Always include native asset IDs from NetworkEnablementController
      for (const nativeAssetId of this.#getNativeAssetIds()) {
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

            assetIdsNeedingMetadata.add(assetId);
          }
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
            const batchResponse = await this.#apiClient.tokens.fetchV3Assets(
              batch,
              fetchOptions,
            );
            return [...(workingResult as V3AssetResponse[]), ...batchResponse];
          },
          initialResult: [],
        });

        // Split assets by chain type: EVM uses occurrence-count filtering;
        // non-EVM non-native uses Blockaid; native (slip44) is always allowed.
        const occurrencesByAssetId = new Map(
          metadataResponse.map((a) => [a.assetId, a.occurrences]),
        );

        const evmErc20Ids: string[] = [];
        const nonEvmTokenIds: string[] = [];

        for (const assetData of metadataResponse) {
          const { assetNamespace, chain } = parseCaipAssetType(
            assetData.assetId as CaipAssetType,
          );
          if (assetNamespace === CaipAssetNamespace.Slip44) {
            // Native assets are always kept — no filtering.
          } else if (
            assetNamespace === CaipAssetNamespace.Erc20 &&
            chain.namespace === KnownCaipNamespace.Eip155
          ) {
            evmErc20Ids.push(assetData.assetId);
          } else if (assetNamespace === CaipAssetNamespace.Token) {
            nonEvmTokenIds.push(assetData.assetId);
          }
        }

        // EVM: require minimum occurrence count to suppress low-signal tokens.
        // Tokens with no occurrence data (undefined) are treated the same as
        // zero occurrences and filtered out.
        // Custom assets (user-imported) bypass the occurrence filter.
        const allowedEvmIds = new Set(
          evmErc20Ids.filter(
            (id) =>
              customAssetIds.has(id) ||
              (occurrencesByAssetId.get(id) ?? 0) >= MIN_TOKEN_OCCURRENCES,
          ),
        );

        // Non-EVM: Blockaid bulk scan.
        // Custom assets (user-imported) bypass Blockaid filtering.
        const nonEvmToScan = nonEvmTokenIds.filter(
          (id) => !customAssetIds.has(id),
        );
        const allowedNonEvmIds = new Set([
          ...nonEvmTokenIds.filter((id) => customAssetIds.has(id)),
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
            assetData.assetId,
            assetData,
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
