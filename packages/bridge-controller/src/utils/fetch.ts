import { StructError } from '@metamask/superstruct';
import type { CaipAssetType, CaipChainId, Hex } from '@metamask/utils';
import type { EventSourceMessage } from '@microsoft/fetch-event-source';
import { fetchEventSource } from '@microsoft/fetch-event-source';

import { isBitcoinChainId } from './bridge';
import {
  formatAddressToCaipReference,
  formatChainIdToDec,
} from './caip-formatters';
import type { FeatureId } from './validators';
import {
  validateQuoteResponse,
  validateBitcoinQuoteResponse,
  validateSwapsTokenObject,
} from './validators';
import type {
  QuoteResponse,
  FetchFunction,
  GenericQuoteRequest,
  QuoteRequest,
  BridgeAsset,
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
  // TODO make token api v2 call
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
  if (request.noFee !== undefined) {
    normalizedRequest.noFee = request.noFee;
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
        const isBitcoinQuote = isBitcoinChainId(request.srcChainId);

        if (isBitcoinQuote) {
          return validateBitcoinQuoteResponse(quoteResponse);
        }
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

  const onMessage = (event: EventSourceMessage) => {
    const uniqueValidationFailures: Set<string> = new Set<string>([]);
    if (event.data === '') {
      return;
    }
    const quoteResponse = JSON.parse(event.data);

    try {
      validateQuoteResponse(quoteResponse);
      // eslint-disable-next-line promise/catch-or-return, @typescript-eslint/no-floating-promises
      serverEventHandlers.onValidQuoteReceived(quoteResponse).then((v) => {
        return v;
      });
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
  await fetchEventSource(urlStream, {
    headers: {
      ...getClientHeaders(clientId, clientVersion),
      'Content-Type': 'text/event-stream',
    },
    signal,
    onmessage: onMessage,
    onerror: (e) => {
      // Rethrow error to prevent silent fetch failures
      throw new Error(e.toString());
    },
    onclose: () => {
      serverEventHandlers.onClose();
    },
    // Cancels the request when document is hidden, will automatically restart when visible
    openWhenHidden: false,
    fetch: fetchFn,
  });
}
