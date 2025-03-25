import type { Quote } from '@metamask/bridge-controller';

import { validateResponse, availableValidators } from './validators';
import { BRIDGE_STATUS_BASE_URL } from '../constants';
import type {
  StatusResponse,
  StatusRequestWithSrcTxHash,
  StatusRequestDto,
  FetchFunction,
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
  const isValid = validateResponse(
    availableValidators,
    rawTxStatus,
    BRIDGE_STATUS_BASE_URL,
  );
  if (!isValid) {
    throw new Error('Invalid response from bridge');
  }

  // Return
  return rawTxStatus as StatusResponse;
};

export const getStatusRequestWithSrcTxHash = (
  quote: Quote,
  srcTxHash: string,
): StatusRequestWithSrcTxHash => {
  return {
    bridgeId: quote.bridgeId,
    srcTxHash,
    bridge: quote.bridges[0],
    srcChainId: quote.srcChainId,
    destChainId: quote.destChainId,
    quote,
    refuel: Boolean(quote.refuel),
  };
};
