import { getClientHeaders } from '@metamask/bridge-controller';
import type { Quote } from '@metamask/bridge-controller';
import { StructError } from '@metamask/superstruct';

import { validateBridgeStatusResponse } from './validators';
import { REFRESH_INTERVAL_MS } from '../constants';
import type {
  StatusResponse,
  StatusRequestWithSrcTxHash,
  StatusRequestDto,
  FetchFunction,
  BridgeHistoryItem,
} from '../types';

export const getBridgeStatusUrl = (bridgeApiBaseUrl: string): string =>
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
  jwt: string | undefined,
  fetchFn: FetchFunction,
  bridgeApiBaseUrl: string,
): Promise<{ status: StatusResponse; validationFailures: string[] }> => {
  const statusRequestDto = getStatusRequestDto(statusRequest);
  const params = new URLSearchParams(statusRequestDto);

  // Fetch
  const url = `${getBridgeStatusUrl(bridgeApiBaseUrl)}?${params.toString()}`;

  const rawTxStatus: unknown = await fetchFn(url, {
    headers: getClientHeaders({ clientId, jwt }),
  });

  const validationFailures: string[] = [];

  try {
    validateBridgeStatusResponse(rawTxStatus);
  } catch (error) {
    // Build validation failure event properties
    if (error instanceof StructError) {
      error.failures().forEach(({ branch, path }) => {
        const aggregatorId =
          branch?.[0]?.quote?.bridgeId ??
          branch?.[0]?.quote?.bridges?.[0] ??
          (rawTxStatus as StatusResponse)?.bridge ??
          (statusRequest.bridge || statusRequest.bridgeId) ??
          ('unknown' as string);
        const pathString = path?.join('.') || 'unknown';
        validationFailures.push([aggregatorId, pathString].join('|'));
      });
    }
  }
  return {
    status: rawTxStatus as StatusResponse,
    validationFailures,
  };
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
): boolean => {
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
