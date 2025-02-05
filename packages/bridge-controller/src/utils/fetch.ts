import { handleFetch } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { hexToNumber, numberToHex } from '@metamask/utils';

import { isSwapsDefaultTokenAddress, isSwapsDefaultTokenSymbol } from '.';
import {
  FEATURE_FLAG_VALIDATORS,
  QUOTE_VALIDATORS,
  TX_DATA_VALIDATORS,
  TOKEN_VALIDATORS,
  validateResponse,
  QUOTE_RESPONSE_VALIDATORS,
  FEE_DATA_VALIDATORS,
} from './validators';
import {
  BRIDGE_API_BASE_URL,
  BRIDGE_CLIENT_ID,
  REFRESH_INTERVAL_MS,
} from '../constants';
import type { SwapsTokenObject } from '../constants/tokens';
import { SWAPS_CHAINID_DEFAULT_TOKEN_MAP } from '../constants/tokens';
import type {
  FeatureFlagResponse,
  FeeData,
  Quote,
  QuoteRequest,
  QuoteResponse,
  TxData,
  BridgeFeatureFlags,
} from '../types';
import { BridgeFlag, FeeType, BridgeFeatureFlagsKey } from '../types';

const CLIENT_ID_HEADER = { 'X-Client-Id': BRIDGE_CLIENT_ID };
// TODO put this back in once we have a fetchWithCache equivalent
// const CACHE_REFRESH_TEN_MINUTES = 10 * Duration.Minute;

/**
 * Fetches the bridge feature flags
 *
 * @returns The bridge feature flags
 */
export async function fetchBridgeFeatureFlags(): Promise<BridgeFeatureFlags> {
  const url = `${BRIDGE_API_BASE_URL}/getAllFeatureFlags`;
  const rawFeatureFlags = await handleFetch(url, {
    headers: CLIENT_ID_HEADER,
  });

  if (
    validateResponse<FeatureFlagResponse>(
      FEATURE_FLAG_VALIDATORS,
      rawFeatureFlags,
      url,
    )
  ) {
    return {
      [BridgeFeatureFlagsKey.EXTENSION_CONFIG]: {
        ...rawFeatureFlags[BridgeFlag.EXTENSION_CONFIG],
        chains: Object.entries(
          rawFeatureFlags[BridgeFlag.EXTENSION_CONFIG].chains,
        ).reduce(
          (acc, [chainId, value]) => ({
            ...acc,
            [numberToHex(Number(chainId))]: value,
          }),
          {},
        ),
      },
    };
  }

  return {
    [BridgeFeatureFlagsKey.EXTENSION_CONFIG]: {
      refreshRate: REFRESH_INTERVAL_MS,
      maxRefreshCount: 5,
      support: false,
      chains: {},
    },
  };
}

/**
 * Returns a list of enabled (unblocked) tokens
 *
 * @param chainId - The chain ID to fetch tokens for
 * @returns A list of enabled (unblocked) tokens
 */
export async function fetchBridgeTokens(
  chainId: Hex,
): Promise<Record<string, SwapsTokenObject>> {
  // TODO make token api v2 call
  const url = `${BRIDGE_API_BASE_URL}/getTokens?chainId=${hexToNumber(
    chainId,
  )}`;

  // TODO we will need to cache these. In Extension fetchWithCache is used. This is due to the following:
  // If we allow selecting dest networks which the user has not imported,
  // note that the Assets controller won't be able to provide tokens. In extension we fetch+cache the token list from bridge-api to handle this
  const tokens = await handleFetch(url, {
    headers: CLIENT_ID_HEADER,
  });

  const nativeToken =
    SWAPS_CHAINID_DEFAULT_TOKEN_MAP[
      chainId as keyof typeof SWAPS_CHAINID_DEFAULT_TOKEN_MAP
    ];

  const transformedTokens: Record<string, SwapsTokenObject> = {};
  if (nativeToken) {
    transformedTokens[nativeToken.address] = nativeToken;
  }

  tokens.forEach((token: unknown) => {
    if (
      validateResponse<SwapsTokenObject>(TOKEN_VALIDATORS, token, url, false) &&
      !(
        isSwapsDefaultTokenSymbol(token.symbol, chainId) ||
        isSwapsDefaultTokenAddress(token.address, chainId)
      )
    ) {
      transformedTokens[token.address] = token;
    }
  });
  return transformedTokens;
}

// Returns a list of bridge tx quotes
/**
 *
 * @param request - The quote request
 * @param signal - The abort signal
 * @returns A list of bridge tx quotes
 */
export async function fetchBridgeQuotes(
  request: QuoteRequest,
  signal: AbortSignal,
): Promise<QuoteResponse[]> {
  const queryParams = new URLSearchParams({
    walletAddress: request.walletAddress,
    srcChainId: request.srcChainId.toString(),
    destChainId: request.destChainId.toString(),
    srcTokenAddress: request.srcTokenAddress,
    destTokenAddress: request.destTokenAddress,
    srcTokenAmount: request.srcTokenAmount,
    slippage: request.slippage.toString(),
    insufficientBal: request.insufficientBal ? 'true' : 'false',
    resetApproval: request.resetApproval ? 'true' : 'false',
  });
  const url = `${BRIDGE_API_BASE_URL}/getQuote?${queryParams}`;
  const quotes = await handleFetch(url, {
    headers: CLIENT_ID_HEADER,
    signal,
  });

  const filteredQuotes = quotes.filter((quoteResponse: QuoteResponse) => {
    const { quote, approval, trade } = quoteResponse;
    return (
      validateResponse<QuoteResponse>(
        QUOTE_RESPONSE_VALIDATORS,
        quoteResponse,
        url,
      ) &&
      validateResponse<Quote>(QUOTE_VALIDATORS, quote, url) &&
      validateResponse<SwapsTokenObject>(
        TOKEN_VALIDATORS,
        quote.srcAsset,
        url,
      ) &&
      validateResponse<SwapsTokenObject>(
        TOKEN_VALIDATORS,
        quote.destAsset,
        url,
      ) &&
      validateResponse<TxData>(TX_DATA_VALIDATORS, trade, url) &&
      validateResponse<FeeData>(
        FEE_DATA_VALIDATORS,
        quote.feeData[FeeType.METABRIDGE],
        url,
      ) &&
      (approval
        ? validateResponse<TxData>(TX_DATA_VALIDATORS, approval, url)
        : true)
    );
  });
  return filteredQuotes;
}
