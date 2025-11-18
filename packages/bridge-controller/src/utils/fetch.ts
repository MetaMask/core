import { StructError } from '@metamask/superstruct';
import type { CaipAssetType, CaipChainId, Hex } from '@metamask/utils';

import {
  formatAddressToCaipReference,
  formatChainIdToDec,
} from './caip-formatters';
import { fetchServerEvents } from './fetch-server-events';
import type { FeatureId } from './validators';
import {
  validateQuoteResponse,
  validateSwapsAssetV2Object,
  validateSwapsTokenObject,
} from './validators';
import type {
  QuoteResponse,
  FetchFunction,
  GenericQuoteRequest,
  QuoteRequest,
  BridgeAsset,
  BridgeAssetV2,
  TokenBalance,
  MinimalAsset,
} from '../types';

export const getClientHeaders = (clientId: string, clientVersion?: string) => ({
  'X-Client-Id': clientId,
  ...(clientVersion ? { 'Client-Version': clientVersion } : {}),
});

/**
 * Returns a list of enabled (unblocked) tokens
 *
 * @param chainId - The chain ID to fetch tokens for
 * @param clientId - The client ID for metrics
 * @param fetchFn - The fetch function to use
 * @param bridgeApiBaseUrl - The base URL for the bridge API
 * @param clientVersion - The client version for metrics (optional)
 * @returns A list of enabled (unblocked) tokens
 */
export async function fetchBridgeTokens(
  chainId: Hex | CaipChainId,
  clientId: string,
  fetchFn: FetchFunction,
  bridgeApiBaseUrl: string,
  clientVersion?: string,
): Promise<Record<string, BridgeAsset>> {
  const url = `${bridgeApiBaseUrl}/getTokens?chainId=${formatChainIdToDec(chainId)}`;

  // TODO we will need to cache these. In Extension fetchWithCache is used. This is due to the following:
  // If we allow selecting dest networks which the user has not imported,
  // note that the Assets controller won't be able to provide tokens. In extension we fetch+cache the token list from bridge-api to handle this
  const tokens = await fetchFn(url, {
    headers: getClientHeaders(clientId, clientVersion),
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
 * Fetches a list of tokens sorted by balance, popularity and other criteria from the bridge-api
 *
 * @param params - The parameters for the fetchPopularTokens function
 * @param params.chainIds - The chain IDs to fetch tokens for
 * @param params.assetsWithBalances - The user's balances sorted by amount. This is used to add balance information to the returned tokens. These assets are returned first in the list in the same order as the input.
 * @param params.clientId - The client ID for metrics
 * @param params.fetchFn - The fetch function to use
 * @param params.bridgeApiBaseUrl - The base URL for the bridge API
 * @param params.clientVersion - The client version for metrics (optional)
 * @param params.signal - The abort signal
 * @returns A list of sorted tokens
 */
export async function fetchPopularTokens({
  signal,
  chainIds,
  clientId,
  fetchFn,
  bridgeApiBaseUrl,
  clientVersion,
  assetsWithBalances,
}: {
  signal: AbortSignal;
  chainIds: CaipChainId[];
  clientId: string;
  fetchFn: FetchFunction;
  bridgeApiBaseUrl: string;
  clientVersion?: string;
  assetsWithBalances?: MinimalAsset[];
}): Promise<BridgeAssetV2[]> {
  const url = `${bridgeApiBaseUrl}/getTokens/popular`;

  const tokens = await fetchFn(url, {
    signal,
    method: 'POST',
    body: JSON.stringify({
      chainIds,
      includeAssets: assetsWithBalances,
    }),
    headers: {
      ...getClientHeaders(clientId, clientVersion),
      'Content-Type': 'application/json',
    },
  });

  return tokens
    .map((token: unknown) => (validateSwapsAssetV2Object(token) ? token : null))
    .filter(Boolean);
}

/**
 * Yields a list of matching tokens sorted by balance, popularity and other criteria from the bridge-api
 *
 * @param params - The parameters for the fetchTokensBySearchQuery function
 * @param params.chainIds - The chain IDs to fetch tokens for
 * @param params.query - The search query
 * @param params.clientId - The client ID for metrics
 * @param params.fetchFn - The fetch function to use
 * @param params.bridgeApiBaseUrl - The base URL for the bridge API
 * @param params.clientVersion - The client version for metrics (optional)
 * @param params.assetsWithBalances - The assets to include in the search
 * @param params.after - The cursor to start from
 * @param params.signal - The abort signal
 * @yields A list of sorted tokens
 *
 * @example
 * const abortController = new AbortController();
 * const searchResults = [];
 * const tokens = fetchTokensBySearchQuery({
 *   chainIds,
 *   query,
 *   clientId,
 *   fetchFn,
 *   bridgeApiBaseUrl,
 *   clientVersion,
 *   assetsWithBalances,
 *   signal: abortController.signal,
 * });
 * for await (const tokens of tokens) {
 *   searchResults.push(...tokens.map(addBalanceDisplayData));
 * }
 * return searchResults;
 */
export async function* fetchTokensBySearchQuery({
  signal,
  chainIds,
  query,
  clientId,
  fetchFn,
  bridgeApiBaseUrl,
  clientVersion,
  assetsWithBalances,
  after,
}: {
  signal: AbortSignal;
  chainIds: CaipChainId[];
  query: string;
  clientId: string;
  fetchFn: FetchFunction;
  bridgeApiBaseUrl: string;
  clientVersion?: string;
  assetsWithBalances?: MinimalAsset[];
  after?: string;
}): AsyncGenerator<BridgeAssetV2[]> {
  const url = `${bridgeApiBaseUrl}/getTokens/search`;
  const { data: tokens, pageInfo } = await fetchFn(url, {
    method: 'POST',
    body: JSON.stringify({
      chainIds,
      includeAssets: assetsWithBalances,
      after,
      query,
    }),
    signal,
    headers: {
      ...getClientHeaders(clientId, clientVersion),
      'Content-Type': 'application/json',
    },
  });
  const { hasNextPage, endCursor } = pageInfo;

  yield tokens
    .map((token: unknown) => (validateSwapsAssetV2Object(token) ? token : null))
    .filter(Boolean);

  if (hasNextPage) {
    yield* fetchTokensBySearchQuery({
      chainIds,
      query,
      clientId,
      fetchFn,
      bridgeApiBaseUrl,
      clientVersion,
      assetsWithBalances,
      after: endCursor,
      signal,
    });
  }
}

/**
 * Converts the generic quote request to the type that the bridge-api expects
 *
 * @param request - The quote request
 * @returns A URLSearchParams object with the query parameters
 */
const formatQueryParams = (request: GenericQuoteRequest): URLSearchParams => {
  const destWalletAddress = request.destWalletAddress ?? request.walletAddress;
  // Transform the generic quote request into QuoteRequest
  const normalizedRequest: QuoteRequest = {
    walletAddress: formatAddressToCaipReference(request.walletAddress),
    destWalletAddress: formatAddressToCaipReference(destWalletAddress),
    srcChainId: formatChainIdToDec(request.srcChainId),
    destChainId: formatChainIdToDec(request.destChainId),
    srcTokenAddress: formatAddressToCaipReference(request.srcTokenAddress),
    destTokenAddress: formatAddressToCaipReference(request.destTokenAddress),
    srcTokenAmount: request.srcTokenAmount,
    insufficientBal: Boolean(request.insufficientBal),
    resetApproval: Boolean(request.resetApproval),
    gasIncluded: Boolean(request.gasIncluded),
    gasIncluded7702: Boolean(request.gasIncluded7702),
  };
  if (request.slippage !== undefined) {
    normalizedRequest.slippage = request.slippage;
  }
  if (request.fee !== undefined) {
    normalizedRequest.fee = request.fee;
  }
  if (request.aggIds && request.aggIds.length > 0) {
    normalizedRequest.aggIds = request.aggIds;
  }
  if (request.bridgeIds && request.bridgeIds.length > 0) {
    normalizedRequest.bridgeIds = request.bridgeIds;
  }

  const queryParams = new URLSearchParams();
  Object.entries(normalizedRequest).forEach(([key, value]) => {
    queryParams.append(key, value.toString());
  });
  return queryParams;
};

/**
 * Fetches quotes from the bridge-api's getQuote endpoint
 *
 * @param request - The quote request
 * @param signal - The abort signal
 * @param clientId - The client ID for metrics
 * @param fetchFn - The fetch function to use
 * @param bridgeApiBaseUrl - The base URL for the bridge API
 * @param featureId - The feature ID to append to each quote
 * @param clientVersion - The client version for metrics (optional)
 * @returns A list of bridge tx quotes
 */
export async function fetchBridgeQuotes(
  request: GenericQuoteRequest,
  signal: AbortSignal | null,
  clientId: string,
  fetchFn: FetchFunction,
  bridgeApiBaseUrl: string,
  featureId: FeatureId | null,
  clientVersion?: string,
): Promise<{
  quotes: QuoteResponse[];
  validationFailures: string[];
}> {
  const queryParams = formatQueryParams(request);

  const url = `${bridgeApiBaseUrl}/getQuote?${queryParams}`;
  const quotes: unknown[] = await fetchFn(url, {
    headers: getClientHeaders(clientId, clientVersion),
    signal,
  });

  const uniqueValidationFailures: Set<string> = new Set<string>([]);
  const filteredQuotes = quotes
    .filter((quoteResponse: unknown): quoteResponse is QuoteResponse => {
      try {
        return validateQuoteResponse(quoteResponse);
      } catch (error) {
        if (error instanceof StructError) {
          error.failures().forEach(({ branch, path }) => {
            const aggregatorId =
              branch?.[0]?.quote?.bridgeId ||
              branch?.[0]?.quote?.bridges?.[0] ||
              (quoteResponse as QuoteResponse)?.quote?.bridgeId ||
              (quoteResponse as QuoteResponse)?.quote?.bridges?.[0] ||
              'unknown';
            const pathString = path?.join('.') || 'unknown';
            uniqueValidationFailures.add([aggregatorId, pathString].join('|'));
          });
        }
        return false;
      }
    })
    .map((quote) => ({
      ...quote,
      featureId: featureId ?? undefined,
    }));

  const validationFailures = Array.from(uniqueValidationFailures);
  if (uniqueValidationFailures.size > 0) {
    console.warn('Quote validation failed', validationFailures);
  }

  return {
    quotes: filteredQuotes,
    validationFailures,
  };
}

const fetchAssetPricesForCurrency = async (request: {
  currency: string;
  assetIds: Set<CaipAssetType>;
  clientId: string;
  clientVersion?: string;
  fetchFn: FetchFunction;
  signal?: AbortSignal;
}): Promise<Record<CaipAssetType, { [currency: string]: string }>> => {
  const { currency, assetIds, clientId, clientVersion, fetchFn, signal } =
    request;
  const validAssetIds = Array.from(assetIds).filter(Boolean);
  if (validAssetIds.length === 0) {
    return {};
  }

  const queryParams = new URLSearchParams({
    assetIds: validAssetIds.filter(Boolean).join(','),
    vsCurrency: currency,
  });
  const url = `https://price.api.cx.metamask.io/v3/spot-prices?${queryParams}`;
  const priceApiResponse = (await fetchFn(url, {
    headers: getClientHeaders(clientId, clientVersion),
    signal,
  })) as Record<CaipAssetType, { [currency: string]: number }>;
  if (!priceApiResponse || typeof priceApiResponse !== 'object') {
    return {};
  }

  return Object.entries(priceApiResponse).reduce(
    (acc, [assetId, currencyToPrice]) => {
      if (!currencyToPrice) {
        return acc;
      }
      if (!acc[assetId as CaipAssetType]) {
        acc[assetId as CaipAssetType] = {};
      }
      if (currencyToPrice[currency]) {
        acc[assetId as CaipAssetType][currency] =
          currencyToPrice[currency].toString();
      }
      return acc;
    },
    {} as Record<CaipAssetType, { [currency: string]: string }>,
  );
};

/**
 * Fetches the asset prices from the price API for multiple currencies
 *
 * @param request - The request object
 * @returns The asset prices by assetId
 */
export const fetchAssetPrices = async (
  request: {
    currencies: Set<string>;
  } & Omit<Parameters<typeof fetchAssetPricesForCurrency>[0], 'currency'>,
): Promise<
  Record<CaipAssetType, { [currency: string]: string } | undefined>
> => {
  const { currencies, ...args } = request;

  const combinedPrices = await Promise.allSettled(
    Array.from(currencies).map(
      async (currency) =>
        await fetchAssetPricesForCurrency({ ...args, currency }),
    ),
  ).then((priceApiResponse) => {
    return priceApiResponse.reduce(
      (acc, result) => {
        if (result.status === 'fulfilled') {
          Object.entries(result.value).forEach(([assetId, currencyToPrice]) => {
            const existingPrices = acc[assetId as CaipAssetType];
            if (!existingPrices) {
              acc[assetId as CaipAssetType] = {};
            }
            Object.entries(currencyToPrice).forEach(([currency, price]) => {
              acc[assetId as CaipAssetType][currency] = price;
            });
          });
        }
        return acc;
      },
      {} as Record<CaipAssetType, { [currency: string]: string }>,
    );
  });

  return combinedPrices;
};

/**
 * Converts the generic quote request to the type that the bridge-api expects
 * then fetches quotes from the bridge-api
 *
 * @param fetchFn - The fetch function to use
 * @param request - The quote request
 * @param signal - The abort signal
 * @param clientId - The client ID for metrics
 * @param bridgeApiBaseUrl - The base URL for the bridge API
 * @param serverEventHandlers - The server event handlers
 * @param serverEventHandlers.onValidationFailure - The function to handle validation failures
 * @param serverEventHandlers.onValidQuoteReceived - The function to handle valid quotes
 * @param serverEventHandlers.onClose - The function to run when the stream is closed and there are no thrown errors
 * @param clientVersion - The client version for metrics (optional)
 * @returns A list of bridge tx quotes
 */
export async function fetchBridgeQuoteStream(
  fetchFn: FetchFunction,
  request: GenericQuoteRequest,
  signal: AbortSignal | undefined,
  clientId: string,
  bridgeApiBaseUrl: string,
  serverEventHandlers: {
    onClose: () => void;
    onValidationFailure: (validationFailures: string[]) => void;
    onValidQuoteReceived: (quotes: QuoteResponse) => Promise<void>;
  },
  clientVersion?: string,
): Promise<void> {
  const queryParams = formatQueryParams(request);

  const onMessage = (quoteResponse: unknown) => {
    const uniqueValidationFailures: Set<string> = new Set<string>([]);

    try {
      if (validateQuoteResponse(quoteResponse)) {
        // eslint-disable-next-line promise/catch-or-return, @typescript-eslint/no-floating-promises
        serverEventHandlers.onValidQuoteReceived(quoteResponse).then((v) => {
          return v;
        });
      }
    } catch (error) {
      if (error instanceof StructError) {
        error.failures().forEach(({ branch, path }) => {
          const aggregatorId =
            branch?.[0]?.quote?.bridgeId ||
            branch?.[0]?.quote?.bridges?.[0] ||
            (quoteResponse as QuoteResponse)?.quote?.bridgeId ||
            (quoteResponse as QuoteResponse)?.quote?.bridges?.[0] ||
            'unknown';
          const pathString = path?.join('.') || 'unknown';
          uniqueValidationFailures.add([aggregatorId, pathString].join('|'));
        });
      }
      const validationFailures = Array.from(uniqueValidationFailures);
      if (uniqueValidationFailures.size > 0) {
        console.warn('Quote validation failed', validationFailures);
        serverEventHandlers.onValidationFailure(validationFailures);
      } else {
        // Rethrow any unexpected errors
        throw error;
      }
    }
  };

  const urlStream = `${bridgeApiBaseUrl}/getQuoteStream?${queryParams}`;
  await fetchServerEvents(urlStream, {
    headers: {
      ...getClientHeaders(clientId, clientVersion),
      'Content-Type': 'text/event-stream',
    },
    signal,
    onMessage,
    onError: (e) => {
      // Rethrow error to prevent silent fetch failures
      throw e;
    },
    onClose: () => {
      serverEventHandlers.onClose();
    },
    fetchFn,
  });
}
