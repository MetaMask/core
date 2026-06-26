import {
  getClientHeaders,
  isNonEvmChainId,
  StatusTypes,
} from '@metamask/bridge-controller';
import type { Quote, QuoteResponse } from '@metamask/bridge-controller';
import type { Provider } from '@metamask/network-controller';
import { StructError } from '@metamask/superstruct';

import { REFRESH_INTERVAL_MS } from '../constants';
import type {
  StatusResponse,
  StatusRequestWithSrcTxHash,
  StatusRequestDto,
  FetchFunction,
  BridgeHistoryItem,
  StatusRequest,
  BridgeStatusControllerMessenger,
} from '../types';
import { isHistoryItemTooOld } from './history';
import { getNetworkClientByChainId } from './network';
import { validateBridgeStatusResponse } from './validators';

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
      error.failures().forEach(({ path }) => {
        const aggregatorId =
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

/*
 * Checks if a pending history item is older than 2 days and does not have a valid tx hash
 *
 * @param messenger - The messenger to use to get the transaction meta by hash or id
 * @param historyItem - The history item to check
 *
 * @returns true if the src tx hash is valid or we should still wait for it, false otherwise
 */
export const shouldWaitForFinalBridgeStatus = async (
  messenger: BridgeStatusControllerMessenger,
  historyItem: BridgeHistoryItem,
): Promise<boolean> => {
  // Keep waiting for status if the history is not pending or is not old enough yet
  if (
    !(
      isHistoryItemTooOld(messenger, historyItem) &&
      [StatusTypes.PENDING, StatusTypes.UNKNOWN].includes(
        historyItem.status.status,
      )
    )
  ) {
    return true;
  }

  if (isNonEvmChainId(historyItem.quote.srcChainId)) {
    return false;
  }

  let provider: Provider;
  try {
    provider = getNetworkClientByChainId(
      messenger,
      historyItem.quote.srcChainId,
    );
  } catch {
    // This happens when the network is disabled while the tx is pending
    return true;
  }

  if (!historyItem.status.srcChain.txHash) {
    return false;
  }

  // Otherwise check if the tx has been mined on chain
  return provider
    .request({
      method: 'eth_getTransactionReceipt',
      params: [historyItem.status.srcChain.txHash],
    })
    .then((txReceipt) => {
      if (txReceipt) {
        return true;
      }
      return false;
    })
    .catch(() => {
      return false;
    });
};

/**
 * @deprecated Use getStatusRequestWithSrcTxHash instead
 * @param quoteResponse - The quote response to get the status request parameters from
 * @returns The status request parameters
 */
export const getStatusRequestParams = (
  quoteResponse: QuoteResponse,
): StatusRequest => {
  return {
    bridgeId: quoteResponse.quote.bridgeId,
    bridge: quoteResponse.quote.bridges[0],
    srcChainId: quoteResponse.quote.srcChainId,
    destChainId: quoteResponse.quote.destChainId,
    quote: quoteResponse.quote,
    refuel: Boolean(quoteResponse.quote.refuel),
  };
};
