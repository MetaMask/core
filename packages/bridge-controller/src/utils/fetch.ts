import type { CaipChainId, Hex } from '@metamask/utils';
import { Duration } from '@metamask/utils';

import {
  formatAddressToString,
  formatChainIdToCaip,
  formatChainIdToDec,
} from './caip-formatters';
import {
  validateFeatureFlagsResponse,
  validateQuoteResponse,
  validateSwapsTokenObject,
} from './validators';
import { DEFAULT_FEATURE_FLAG_CONFIG } from '../constants/bridge';
import type {
  QuoteResponse,
  BridgeFeatureFlags,
  FetchFunction,
  ChainConfiguration,
  GenericQuoteRequest,
  QuoteRequest,
  BridgeAsset,
} from '../types';
import { BridgeFlag, BridgeFeatureFlagsKey } from '../types';

const CACHE_REFRESH_TEN_MINUTES = 10 * Duration.Minute;

export const getClientIdHeader = (clientId: string) => ({
  'X-Client-Id': clientId,
});

/**
 * Fetches the bridge feature flags
 *
 * @param clientId - The client ID for metrics
 * @param fetchFn - The fetch function to use
 * @param bridgeApiBaseUrl - The base URL for the bridge API
 * @returns The bridge feature flags
 */
export async function fetchBridgeFeatureFlags(
  clientId: string,
  fetchFn: FetchFunction,
  bridgeApiBaseUrl: string,
): Promise<BridgeFeatureFlags> {
  const url = `${bridgeApiBaseUrl}/getAllFeatureFlags`;
  const rawFeatureFlags: unknown = await fetchFn(url, {
    headers: getClientIdHeader(clientId),
    cacheOptions: { cacheRefreshTime: CACHE_REFRESH_TEN_MINUTES },
    functionName: 'fetchBridgeFeatureFlags',
  });

  if (validateFeatureFlagsResponse(rawFeatureFlags)) {
    const getChainsObj = (chains: Record<number, ChainConfiguration>) =>
      Object.entries(chains).reduce(
        (acc, [chainId, value]) => ({
          ...acc,
          [formatChainIdToCaip(chainId)]: value,
        }),
        {},
      );

    return {
      [BridgeFeatureFlagsKey.EXTENSION_CONFIG]: {
        ...rawFeatureFlags[BridgeFlag.EXTENSION_CONFIG],
        chains: getChainsObj(
          rawFeatureFlags[BridgeFlag.EXTENSION_CONFIG].chains,
        ),
      },
      [BridgeFeatureFlagsKey.MOBILE_CONFIG]: {
        ...rawFeatureFlags[BridgeFlag.MOBILE_CONFIG],
        chains: getChainsObj(rawFeatureFlags[BridgeFlag.MOBILE_CONFIG].chains),
      },
    };
  }

  return {
    [BridgeFeatureFlagsKey.EXTENSION_CONFIG]: DEFAULT_FEATURE_FLAG_CONFIG,
    [BridgeFeatureFlagsKey.MOBILE_CONFIG]: DEFAULT_FEATURE_FLAG_CONFIG,
  };
}

/**
 * Returns a list of enabled (unblocked) tokens
 *
 * @param chainId - The chain ID to fetch tokens for
 * @param clientId - The client ID for metrics
 * @param fetchFn - The fetch function to use
 * @param bridgeApiBaseUrl - The base URL for the bridge API
 * @returns A list of enabled (unblocked) tokens
 */
export async function fetchBridgeTokens(
  chainId: Hex | CaipChainId,
  clientId: string,
  fetchFn: FetchFunction,
  bridgeApiBaseUrl: string,
): Promise<Record<string, BridgeAsset>> {
  // TODO make token api v2 call
  const url = `${bridgeApiBaseUrl}/getTokens?chainId=${formatChainIdToDec(chainId)}`;

  // TODO we will need to cache these. In Extension fetchWithCache is used. This is due to the following:
  // If we allow selecting dest networks which the user has not imported,
  // note that the Assets controller won't be able to provide tokens. In extension we fetch+cache the token list from bridge-api to handle this
  const tokens = await fetchFn(url, {
    headers: getClientIdHeader(clientId),
    cacheOptions: { cacheRefreshTime: CACHE_REFRESH_TEN_MINUTES },
    functionName: 'fetchBridgeTokens',
  });

  const transformedTokens: Record<string, BridgeAsset> = {};
  tokens.forEach((token: unknown) => {
    if (validateSwapsTokenObject(token)) {
      transformedTokens[token.address] = token;
    }
  });
  return transformedTokens;
}

/**
 * Converts the generic quote request to the type that the bridge-api expects
 * then fetches quotes from the bridge-api
 *
 * @param request - The quote request
 * @param signal - The abort signal
 * @param clientId - The client ID for metrics
 * @param fetchFn - The fetch function to use
 * @param bridgeApiBaseUrl - The base URL for the bridge API
 * @returns A list of bridge tx quotes
 */
export async function fetchBridgeQuotes(
  request: GenericQuoteRequest,
  signal: AbortSignal,
  clientId: string,
  fetchFn: FetchFunction,
  bridgeApiBaseUrl: string,
): Promise<QuoteResponse[]> {
  const destWalletAddress = request.destWalletAddress ?? request.walletAddress;
  // Transform the generic quote request into QuoteRequest
  const normalizedRequest: QuoteRequest = {
    walletAddress: formatAddressToString(request.walletAddress),
    destWalletAddress: formatAddressToString(destWalletAddress),
    srcChainId: formatChainIdToDec(request.srcChainId),
    destChainId: formatChainIdToDec(request.destChainId),
    srcTokenAddress: formatAddressToString(request.srcTokenAddress),
    destTokenAddress: formatAddressToString(request.destTokenAddress),
    srcTokenAmount: request.srcTokenAmount,
    insufficientBal: Boolean(request.insufficientBal),
    resetApproval: Boolean(request.resetApproval),
  };
  if (request.slippage !== undefined) {
    normalizedRequest.slippage = request.slippage;
  }

  const queryParams = new URLSearchParams();
  Object.entries(normalizedRequest).forEach(([key, value]) => {
    queryParams.append(key, value.toString());
  });
  const url = `${bridgeApiBaseUrl}/getQuote?${queryParams}`;
  const quotes: unknown[] = await fetchFn(url, {
    headers: getClientIdHeader(clientId),
    signal,
    cacheOptions: { cacheRefreshTime: 0 },
    functionName: 'fetchBridgeQuotes',
  });

  const filteredQuotes = quotes.filter((quoteResponse: unknown) => {
    return validateQuoteResponse(quoteResponse);
  });
  return filteredQuotes as QuoteResponse[];
}
