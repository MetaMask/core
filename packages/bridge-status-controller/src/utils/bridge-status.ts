import { type Quote } from '@metamask/bridge-controller';

import { validateBridgeStatusResponse } from './validators';
import { REFRESH_INTERVAL_MS } from '../constants';
import type {
  StatusResponse,
  StatusRequestWithSrcTxHash,
  StatusRequestDto,
  FetchFunction,
  BridgeHistoryItem,
} from '../types';

export const getClientIdHeader = (clientId: string) => ({
  'X-Client-Id': clientId,
});

export const getBridgeStatusUrl = (bridgeApiBaseUrl: string) =>
  `${bridgeApiBaseUrl}/getTxStatus`;

export const getStatusRequestDto = (
  statusRequest: StatusRequestWithSrcTxHash,
): StatusRequestDto => {
  const { quote, ...statusRequestNoQuote } = statusRequest;

  const statusRequestNoQuoteFormatted = Object.fromEntries(
    Object.entries(statusRequestNoQuote).map(([key, value]) => [
      key,
      value.toString(),
    ]),
  ) as unknown as Omit<StatusRequestDto, 'requestId'>;

  const requestId: { requestId: string } | Record<string, never> =
    quote?.requestId ? { requestId: quote.requestId } : {};

  return {
    ...statusRequestNoQuoteFormatted,
    ...requestId,
  };
};

export const fetchBridgeTxStatus = async (
  statusRequest: StatusRequestWithSrcTxHash,
  clientId: string,
  fetchFn: FetchFunction,
  bridgeApiBaseUrl: string,
): Promise<StatusResponse> => {
  const statusRequestDto = getStatusRequestDto(statusRequest);
  const params = new URLSearchParams(statusRequestDto);

  // Fetch
  const url = `${getBridgeStatusUrl(bridgeApiBaseUrl)}?${params.toString()}`;

  const rawTxStatus: unknown = await fetchFn(url, {
    headers: getClientIdHeader(clientId),
  });

  // Validate
  validateBridgeStatusResponse(rawTxStatus);

  // Return
  return rawTxStatus as StatusResponse;
};

export const getStatusRequestWithSrcTxHash = (
  quote: Quote,
  srcTxHash: string,
): StatusRequestWithSrcTxHash => {
  const { bridgeId, bridges, srcChainId, destChainId, refuel } = quote;
  return {
    bridgeId,
    srcTxHash,
    bridge: bridges[0],
    srcChainId,
    destChainId,
    quote,
    refuel: Boolean(refuel),
  };
};

export const shouldSkipFetchDueToFetchFailures = (
  attempts?: BridgeHistoryItem['attempts'],
) => {
  // If there's an attempt, it means we've failed at least once,
  // so we need to check if we need to wait longer due to exponential backoff
  if (attempts) {
    // Calculate exponential backoff delay: base interval * 2^(attempts-1)
    const backoffDelay =
      REFRESH_INTERVAL_MS * Math.pow(2, attempts.counter - 1);
    const timeSinceLastAttempt = Date.now() - attempts.lastAttemptTime;

    if (timeSinceLastAttempt < backoffDelay) {
      // Not enough time has passed, skip this fetch
      return true;
    }
  }
  return false;
};
