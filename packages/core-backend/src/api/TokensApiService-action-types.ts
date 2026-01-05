/**
 * Messenger action types for TokensApiService
 *
 * Actions are namespaced as: BackendApiClient:Tokens:*
 * This is for the Tokens API at tokens.api.cx.metamask.io
 */

import type {
  GetTokensSupportedNetworksV1Response,
  GetTokensSupportedNetworksV2Response,
  TokenDetails,
  AssetByIdResponse,
  TokensNetworkConfig,
  TokensTopAsset,
} from './TokensApiService';
import type {
  TokenMetadata,
  TokenSearchResponse,
  TrendingToken,
  GetTokenListOptions,
  SearchTokensOptions,
  GetTrendingTokensOptions,
  GetTokenMetadataOptions,
} from './types';

// Using string literals directly in template types to avoid unused variable lint errors
type ServiceName = 'BackendApiClient';
type Namespace = 'Tokens';

// =============================================================================
// Supported Networks Actions
// =============================================================================

export type TokensGetV1SupportedNetworksAction = {
  type: `${ServiceName}:${Namespace}:getV1SupportedNetworks`;
  handler: () => Promise<GetTokensSupportedNetworksV1Response>;
};

export type TokensGetV2SupportedNetworksAction = {
  type: `${ServiceName}:${Namespace}:getV2SupportedNetworks`;
  handler: () => Promise<GetTokensSupportedNetworksV2Response>;
};

// =============================================================================
// Token List Actions
// =============================================================================

export type TokensGetV1TokenListAction = {
  type: `${ServiceName}:${Namespace}:getV1TokenList`;
  handler: (options: GetTokenListOptions) => Promise<TokenMetadata[]>;
};

// =============================================================================
// Token Details Actions
// =============================================================================

export type TokensGetV1TokenMetadataAction = {
  type: `${ServiceName}:${Namespace}:getV1TokenMetadata`;
  handler: (
    options: GetTokenMetadataOptions,
  ) => Promise<TokenMetadata | undefined>;
};

export type TokensGetV1TokenDetailsAction = {
  type: `${ServiceName}:${Namespace}:getV1TokenDetails`;
  handler: (
    chainId: string,
    tokenAddress: string,
    options?: {
      includeEnrichedData?: boolean;
      includeCoingeckoId?: boolean;
      includeAggregators?: boolean;
      includeOccurrences?: boolean;
      includeIconUrl?: boolean;
      includeAssetType?: boolean;
      includeTokenFees?: boolean;
      includeHoneypotStatus?: boolean;
      includeContractVerificationStatus?: boolean;
      includeStorage?: boolean;
      includeERC20Permit?: boolean;
      includeDescription?: boolean;
      includeCexData?: boolean;
    },
  ) => Promise<TokenDetails | undefined>;
};

export type TokensGetV1TokensByAddressesAction = {
  type: `${ServiceName}:${Namespace}:getV1TokensByAddresses`;
  handler: (
    chainId: string,
    tokenAddresses: string[],
  ) => Promise<TokenDetails[]>;
};

// =============================================================================
// Token Search Actions
// =============================================================================

export type TokensGetV1SearchTokensAction = {
  type: `${ServiceName}:${Namespace}:getV1SearchTokens`;
  handler: (options: SearchTokensOptions) => Promise<TokenSearchResponse>;
};

export type TokensGetV1SearchTokensOnChainAction = {
  type: `${ServiceName}:${Namespace}:getV1SearchTokensOnChain`;
  handler: (
    chainId: string,
    query: string,
    options?: { limit?: number },
  ) => Promise<TokenMetadata[]>;
};

// =============================================================================
// V3 Assets Actions
// =============================================================================

export type TokensGetV3AssetsAction = {
  type: `${ServiceName}:${Namespace}:getV3Assets`;
  handler: (
    assetIds: string[],
    options?: {
      includeCoingeckoId?: boolean;
      includeAggregators?: boolean;
      includeOccurrences?: boolean;
      includeIconUrl?: boolean;
    },
  ) => Promise<Record<string, AssetByIdResponse>>;
};

// =============================================================================
// Trending Tokens Actions
// =============================================================================

export type TokensGetV3TrendingTokensAction = {
  type: `${ServiceName}:${Namespace}:getV3TrendingTokens`;
  handler: (options: GetTrendingTokensOptions) => Promise<TrendingToken[]>;
};

// =============================================================================
// Network Config Actions
// =============================================================================

export type TokensGetNetworkConfigAction = {
  type: `${ServiceName}:${Namespace}:getNetworkConfig`;
  handler: (chainId: string) => Promise<TokensNetworkConfig | undefined>;
};

export type TokensGetNetworkTokenStandardAction = {
  type: `${ServiceName}:${Namespace}:getNetworkTokenStandard`;
  handler: (
    chainId: string,
    options?: { limit?: number },
  ) => Promise<unknown[]>;
};

// =============================================================================
// Top Assets Actions
// =============================================================================

export type TokensGetTopAssetsAction = {
  type: `${ServiceName}:${Namespace}:getTopAssets`;
  handler: (chainId: string) => Promise<TokensTopAsset[]>;
};

// =============================================================================
// All Tokens API Actions
// =============================================================================

export type TokensApiActions =
  // Supported Networks
  | TokensGetV1SupportedNetworksAction
  | TokensGetV2SupportedNetworksAction
  // Token List
  | TokensGetV1TokenListAction
  // Token Details
  | TokensGetV1TokenMetadataAction
  | TokensGetV1TokenDetailsAction
  | TokensGetV1TokensByAddressesAction
  // Token Search
  | TokensGetV1SearchTokensAction
  | TokensGetV1SearchTokensOnChainAction
  // V3 Assets
  | TokensGetV3AssetsAction
  // Trending Tokens
  | TokensGetV3TrendingTokensAction
  // Network Config
  | TokensGetNetworkConfigAction
  | TokensGetNetworkTokenStandardAction
  // Top Assets
  | TokensGetTopAssetsAction;
