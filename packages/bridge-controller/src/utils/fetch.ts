/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { StructError } from '@metamask/superstruct';
import { KnownCaipNamespace } from '@metamask/utils';
import type { CaipAssetType, CaipChainId, Hex } from '@metamask/utils';

import { toQuoteResponseV2 } from '../coercers/quote-response-v1-to-v2';
import { toQuoteResponseV1 } from '../coercers/quote-response-v2-to-v1';
import type {
  FetchFunction,
  GenericQuoteRequest,
  QuoteRequest,
  TokenFeature,
  QuoteStreamCompleteData,
  BatchSellTradesRequest,
  BatchSellTradesResponse,
} from '../types';
import { validateBatchSellTradesResponse } from '../validators/batch-sell';
import { validateBridgeAsset } from '../validators/bridge-asset';
import type { BridgeAsset } from '../validators/bridge-asset';
import type { FeatureId } from '../validators/feature-flags';
import type { QuoteResponse } from '../validators/quote-response';
import type { QuoteResponseV1 } from '../validators/quote-response-v1';
import { validateQuoteResponseV1 } from '../validators/quote-response-v1';
import { validateQuoteStreamComplete } from '../validators/quote-stream-complete';
import { validateTokenFeature } from '../validators/token-feature';
import { isEvmTxData } from '../validators/trade';
import type { TxData } from '../validators/trade';
import { getEthUsdtResetData } from './bridge';
import {
  formatAddressToAssetId,
  formatAddressToCaipReference,
  formatChainIdToDec,
} from './caip-formatters';
import { fetchServerEvents } from './fetch-server-events';
import type { QuoteMetadata } from './quote-metadata/types';
import { formatStructErrors } from './struct-error';

export const getClientHeaders = ({
  clientId,
  clientVersion,
  jwt,
}: {
  clientId: string;
  clientVersion?: string;
  jwt?: string;
}) => ({
  'X-Client-Id': clientId,
  ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
  ...(clientVersion ? { 'Client-Version': clientVersion } : {}),
});

/**
 * Returns a list of enabled (unblocked) tokens
 *
 * @deprecated Use the popular and search bridge-api endpoints instead
 *
 * @param chainId - The chain ID to fetch tokens for
 * @param clientId - The client ID for metrics
 * @param jwt - The JWT token for authentication
 * @param fetchFn - The fetch function to use
 * @param bridgeApiBaseUrl - The base URL for the bridge API
 * @param clientVersion - The client version for metrics (optional)
 * @returns A list of enabled (unblocked) tokens
 */
export async function fetchBridgeTokens(
  chainId: Hex | CaipChainId,
  clientId: string,
  jwt: string | undefined,
  fetchFn: FetchFunction,
  bridgeApiBaseUrl: string,
  clientVersion?: string,
): Promise<Record<string, BridgeAsset>> {
  const url = `${bridgeApiBaseUrl}/getTokens?chainId=${formatChainIdToDec(chainId)}`;

  // TODO we will need to cache these. In Extension fetchWithCache is used. This is due to the following:
  // If we allow selecting dest networks which the user has not imported,
  // note that the Assets controller won't be able to provide tokens. In extension we fetch+cache the token list from bridge-api to handle this
  const tokens = await fetchFn(url, {
    headers: getClientHeaders({ clientId, clientVersion, jwt }),
  });

  const transformedTokens: Record<string, BridgeAsset> = {};
  tokens.forEach((token: unknown) => {
    if (validateBridgeAsset(token)) {
      transformedTokens[token.address] = token;
    }
  });
  return transformedTokens;
}

/**
 * Converts the generic quote request to QuoteRequest
 *
 * @param request - The quote request
 * @returns A QuoteRequest object
 */
const formatQuoteRequest = (request: GenericQuoteRequest): QuoteRequest => {
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

  return normalizedRequest;
};

/**
 * Converts the generic quote request to the type that the bridge-api expects
 *
 * @param normalizedRequest - The normalized quote request
 * @returns A URLSearchParams object with the query parameters
 */
const formatQueryParams = (
  normalizedRequest: QuoteRequest,
): URLSearchParams => {
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
 * @param jwt - The JWT token for authentication
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
  jwt: string | undefined,
  fetchFn: FetchFunction,
  bridgeApiBaseUrl: string,
  featureId: FeatureId | null,
  clientVersion?: string,
): Promise<{
  quotes: QuoteResponseV1[];
  validationFailures: string[];
}> {
  const normalizedRequest = formatQuoteRequest(request);
  const queryParams = formatQueryParams(normalizedRequest);

  const url = `${bridgeApiBaseUrl}/getQuote?${queryParams}`;
  const quotes: unknown[] = await fetchFn(url, {
    headers: getClientHeaders({ clientId, clientVersion, jwt }),
    signal,
  });

  const uniqueValidationFailures: Set<string> = new Set<string>([]);
  const filteredQuotes = quotes
    .filter((quoteResponse: unknown): quoteResponse is QuoteResponseV1 => {
      try {
        return validateQuoteResponseV1(quoteResponse);
      } catch (error) {
        if (error instanceof StructError) {
          error.failures().forEach(({ branch, path }) => {
            const aggregatorId =
              branch?.[0]?.quote?.bridgeId ??
              branch?.[0]?.quote?.bridges?.[0] ??
              (quoteResponse as QuoteResponseV1)?.quote?.bridgeId ??
              (quoteResponse as QuoteResponseV1)?.quote?.bridges?.[0] ??
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
      // Append the reset approval data to the quote response if the request
      // has resetApproval set to true and the quote has an approval
      resetApproval:
        request.resetApproval && quote.approval && isEvmTxData(quote.approval)
          ? {
              ...quote.approval,
              data: getEthUsdtResetData(request.destChainId),
            }
          : undefined,
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
    headers: getClientHeaders({ clientId, clientVersion }),
    signal,
  })) as unknown as Record<CaipAssetType, { [currency: string]: number }>;
  if (!priceApiResponse || typeof priceApiResponse !== 'object') {
    return {};
  }

  return Object.entries(priceApiResponse).reduce<
    Record<CaipAssetType, { [currency: string]: string }>
  >((acc, [assetId, currencyToPrice]) => {
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
  }, {});
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
    return priceApiResponse.reduce<
      Record<CaipAssetType, { [currency: string]: string }>
    >((acc, result) => {
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
    }, {});
  });

  return combinedPrices;
};

const getQuoteRequestId = ({
  srcChainId,
  destChainId,
  srcTokenAddress,
  destTokenAddress,
}: QuoteRequest): string =>
  `${formatAddressToAssetId(srcTokenAddress, srcChainId)}-${formatAddressToAssetId(destTokenAddress, destChainId)}`.toLowerCase();

const getQuoteResponseId = ({
  src: { asset: srcAsset },
  dest: { asset: destAsset },
}: QuoteResponse['quote']): string =>
  `${srcAsset.assetId}-${destAsset.assetId}`.toLowerCase();

/**
 * Fetches quotes from the bridge-api
 *
 * @param fetchFn - The fetch function to use
 * @param quoteRequests - An array of GenericQuoteRequest objects
 * @param signal - The abort signal
 * @param featureId - The {@link FeatureId} for the experience that's requesting the quotes
 * @param clientId - The client ID for metrics
 * @param jwt - The JWT token for authentication
 * @param bridgeApiBaseUrl - The base URL for the bridge API
 * @param serverEventHandlers - The server event handlers
 * @param serverEventHandlers.onQuoteValidationFailure - The function to handle quote validation failures
 * @param serverEventHandlers.onValidQuoteReceived - The function to handle valid quotes
 * @param serverEventHandlers.onTokenWarning - The function to handle token warning events
 * @param serverEventHandlers.onComplete - The function to handle the complete event emitted when the stream finishes
 * @param serverEventHandlers.onClose - The function to run when the stream is closed and there are no thrown errors
 * @param clientVersion - The client version for metrics (optional)
 * @returns A list of bridge tx quote promises
 */
export async function fetchBridgeQuoteStream(
  fetchFn: FetchFunction,
  quoteRequests: GenericQuoteRequest[],
  signal: AbortSignal | undefined,
  featureId: FeatureId,
  clientId: string,
  jwt: string | undefined,
  bridgeApiBaseUrl: string,
  serverEventHandlers: {
    onClose: () => void | Promise<void>;
    onQuoteValidationFailure: (validationFailures: string[]) => void;
    onValidQuoteReceived: (
      quotes: QuoteResponse & { resetApproval?: TxData },
    ) => Promise<void>;
    onTokenWarning: (warning: TokenFeature) => void;
    onComplete: (data: QuoteStreamCompleteData) => void;
  },
  clientVersion?: string,
): Promise<void> {
  /**
   * If the request includes multiple quote requests, it is a batch sell request.
   * A batch sell consists of multiple swaps that are executed in a single tx submission.
   */
  const isBatchSellRequest = quoteRequests.length > 1;
  const normalizedQuoteRequests = quoteRequests.map(formatQuoteRequest);
  const quoteRequestIds = isBatchSellRequest
    ? normalizedQuoteRequests.map(getQuoteRequestId)
    : undefined;

  const onQuoteReceived = async (
    quoteResponseV1OrV2: unknown,
  ): Promise<void> => {
    const uniqueValidationFailures: Set<string> = new Set<string>([]);

    try {
      const quoteResponse = toQuoteResponseV2(quoteResponseV1OrV2);
      // Fallback to 0 if the quote doesn't match any requests
      const matchedQuoteRequestIdx = Math.max(
        quoteRequestIds?.findIndex((id) => {
          return id === getQuoteResponseId(quoteResponse.quote);
        }) ?? 0,
        0,
      );
      const matchingQuoteRequest =
        normalizedQuoteRequests[matchedQuoteRequestIdx];

      return await serverEventHandlers.onValidQuoteReceived({
        ...quoteResponse,
        featureId,
        // Append the reset approval data to the quote response if the request has resetApproval set to true and the quote has an approval
        resetApproval:
          quoteResponse.namespace === KnownCaipNamespace.Eip155 &&
          matchingQuoteRequest.resetApproval &&
          quoteResponse.approval
            ? {
                ...quoteResponse.approval,
                data: getEthUsdtResetData(matchingQuoteRequest.destChainId),
              }
            : undefined,
        ...(isBatchSellRequest && {
          quoteRequestIndex: matchedQuoteRequestIdx,
        }),
      });
    } catch (error) {
      if (error instanceof StructError) {
        console.warn('Quote validation failed', formatStructErrors(error));
        error.failures().forEach(({ branch, path }) => {
          const aggregatorId =
            branch?.[0]?.quote?.aggregator ??
            branch?.[0]?.quote?.protocols?.[0] ??
            (quoteResponseV1OrV2 as QuoteResponseV1)?.quote?.protocols?.[0] ??
            (quoteResponseV1OrV2 as QuoteResponseV1)?.quote?.bridgeId ??
            (quoteResponseV1OrV2 as QuoteResponseV1)?.quote?.bridges?.[0] ??
            (quoteResponseV1OrV2 as QuoteResponse)?.quote?.aggregator ??
            'unknown';
          const pathString = path?.join('.') || 'unknown';
          uniqueValidationFailures.add([aggregatorId, pathString].join('|'));
        });
      }
      const validationFailures = Array.from(uniqueValidationFailures);
      if (uniqueValidationFailures.size > 0) {
        return serverEventHandlers.onQuoteValidationFailure(validationFailures);
      }
      // Rethrow any unexpected errors
      throw error;
    }
  };

  const onTokenWarningReceived = (data: unknown): void => {
    try {
      if (validateTokenFeature(data)) {
        serverEventHandlers.onTokenWarning(data);
      }
    } catch (error) {
      console.warn('Token warning validation failed', error);
    }
  };

  const onCompleteReceived = (data: unknown): void => {
    try {
      if (validateQuoteStreamComplete(data)) {
        serverEventHandlers.onComplete(data);
      }
    } catch (error) {
      console.warn('Quote stream complete validation failed', error);
    }
  };

  const onMessage = async (
    data: Record<string, unknown>,
    eventName?: string,
  ): Promise<void> => {
    switch (eventName) {
      case 'quote':
        return await onQuoteReceived(data);
      case 'token_warning':
        return onTokenWarningReceived(data);
      case 'complete':
        return onCompleteReceived(data);
      default:
        return undefined;
    }
  };

  const sharedFetchOptions = {
    signal,
    onMessage,
    onError: (error: unknown) => {
      // Rethrow error to prevent silent fetch failures
      throw error;
    },
    onClose: async () => {
      await serverEventHandlers.onClose();
    },
    fetchFn,
  };

  if (isBatchSellRequest) {
    const urlStream = `${bridgeApiBaseUrl}/getBatchQuoteStream`;
    await fetchServerEvents(urlStream, {
      method: 'POST',
      body: JSON.stringify({ requests: normalizedQuoteRequests }),
      headers: {
        ...getClientHeaders({ clientId, clientVersion, jwt }),
        'Content-Type': 'application/json',
      },
      ...sharedFetchOptions,
    });
    return;
  }

  const queryParams = formatQueryParams(normalizedQuoteRequests[0]);
  const urlStream = `${bridgeApiBaseUrl}/getQuoteStream?${queryParams}`;
  await fetchServerEvents(urlStream, {
    headers: {
      ...getClientHeaders({ clientId, clientVersion, jwt }),
      'Content-Type': 'text/event-stream',
    },
    ...sharedFetchOptions,
  });
}

export const formatBatchSellTradesRequest = (
  quotes: (QuoteResponse | (QuoteResponseV1 & QuoteMetadata) | null)[],
  stxEnabled: boolean,
): BatchSellTradesRequest => ({
  quotes: quotes
    .filter(
      (quote): quote is QuoteResponse | (QuoteResponseV1 & QuoteMetadata) =>
        quote !== null && Boolean(quote),
    )
    .map(toQuoteResponseV1),
  stxEnabled,
});

/**
 * Fetches quotes from the bridge-api's getQuote endpoint
 *
 * @param quotes - The quotes to fetch the gasless transaction data and fees for. May contain null values if a quote is not available for a swap
 * @param stxEnabled - Flag to estimate gas cost more precisely for the batch sell feature.
 * @param signal - The abort signal
 * @param clientId - The client ID for metrics
 * @param jwt - The JWT token for authentication
 * @param fetchFn - The fetch function to use
 * @param bridgeApiBaseUrl - The base URL for the bridge API
 * @param clientVersion - The client version for metrics (optional)
 * @returns The batch sell trades and the total network fee
 */
export async function fetchBatchSellTrades(
  quotes: (QuoteResponse | null)[],
  stxEnabled: boolean,
  signal: AbortSignal | null,
  clientId: string,
  jwt: string | undefined,
  fetchFn: FetchFunction,
  bridgeApiBaseUrl: string,
  clientVersion?: string,
): Promise<BatchSellTradesResponse> {
  const url = `${bridgeApiBaseUrl}/obtainGaslessBatch`;
  const request: BatchSellTradesRequest = formatBatchSellTradesRequest(
    quotes,
    stxEnabled,
  );
  const batchSellTradesResponse = await fetchFn(url, {
    headers: {
      ...getClientHeaders({
        clientId,
        clientVersion,
        jwt,
      }),
      'Content-Type': 'application/json',
    },
    signal,
    method: 'POST',
    body: JSON.stringify(request),
  });

  if (!batchSellTradesResponse.ok) {
    throw new Error(
      `Failed to fetch batch sell trades. ${batchSellTradesResponse.statusText}`,
    );
  }

  try {
    const data = await batchSellTradesResponse.json();
    validateBatchSellTradesResponse(data);
    return data;
  } catch (error: unknown) {
    // TODO validation failure event
    throw new Error(`Invalid batch simulation response. ${error?.toString()}`);
  }
}
