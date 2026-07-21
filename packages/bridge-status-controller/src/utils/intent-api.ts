import {
  BridgeClientId,
  ChainId,
  getClientHeaders,
  Intent,
  QuoteResponse,
  StatusTypes,
} from '@metamask/bridge-controller';
import { TransactionStatus } from '@metamask/transaction-controller';

import type { FetchFunction, StatusResponse } from '../types';
import {
  IntentStatusResponse,
  IntentOrderStatus,
  validateIntentStatusResponse,
} from './validators';

export type IntentSubmissionParams = {
  srcChainId: ChainId;
  quoteId: string;
  signature: string;
  order: unknown;
  userAddress: string;
  aggregatorId: string;
};

export type IntentApi = {
  getOrderStatus(
    orderId: string,
    aggregatorId: string,
    srcChainId: ChainId,
    clientId: BridgeClientId,
  ): Promise<IntentStatusResponse>;
};

export type GetJwtFn = () => Promise<string | undefined>;

export class IntentApiImpl implements IntentApi {
  readonly #baseUrl: string;

  readonly #fetchFn: FetchFunction;

  readonly #getJwt: GetJwtFn;

  constructor(baseUrl: string, fetchFn: FetchFunction, getJwt: GetJwtFn) {
    this.#baseUrl = baseUrl;
    this.#fetchFn = fetchFn;
    this.#getJwt = getJwt;
  }

  async getOrderStatus(
    orderId: string,
    aggregatorId: string,
    srcChainId: ChainId,
    clientId: BridgeClientId,
  ): Promise<IntentStatusResponse> {
    const endpoint = `${this.#baseUrl}/getOrderStatus?orderId=${orderId}&aggregatorId=${encodeURIComponent(aggregatorId)}&srcChainId=${srcChainId}`;
    try {
      const jwt = await this.#getJwt();
      const response = await this.#fetchFn(endpoint, {
        method: 'GET',
        headers: getClientHeaders({ clientId, jwt }),
      });
      if (!validateIntentStatusResponse(response)) {
        throw new Error('Invalid getOrderStatus response');
      }
      return response;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to get order status: ${error.message}`);
      }
      throw new Error('Failed to get order status');
    }
  }
}

export type IntentBridgeStatus = {
  status: StatusResponse;
  txHash?: string;
  transactionStatus: TransactionStatus;
};

export const translateIntentOrderToBridgeStatus = (
  intentOrder: IntentStatusResponse,
  srcChainId: number,
  fallbackTxHash?: string,
): IntentBridgeStatus => {
  let statusType: StatusTypes;
  switch (intentOrder.status) {
    case IntentOrderStatus.CONFIRMED:
    case IntentOrderStatus.COMPLETED:
      statusType = StatusTypes.COMPLETE;
      break;
    case IntentOrderStatus.FAILED:
    case IntentOrderStatus.EXPIRED:
    case IntentOrderStatus.CANCELLED:
      statusType = StatusTypes.FAILED;
      break;
    case IntentOrderStatus.PENDING:
      statusType = StatusTypes.PENDING;
      break;
    case IntentOrderStatus.SUBMITTED:
      statusType = StatusTypes.SUBMITTED;
      break;
    default:
      statusType = StatusTypes.UNKNOWN;
  }

  const txHash = intentOrder.txHash ?? fallbackTxHash;
  const status: StatusResponse = {
    status: statusType,
    srcChain: {
      chainId: srcChainId,
      txHash,
    },
  };

  return {
    status,
    txHash,
    transactionStatus: mapIntentOrderStatusToTransactionStatus(
      intentOrder.status,
    ),
  };
};

export function mapIntentOrderStatusToTransactionStatus(
  intentStatus: IntentOrderStatus,
): TransactionStatus {
  switch (intentStatus) {
    case IntentOrderStatus.PENDING:
    case IntentOrderStatus.SUBMITTED:
      return TransactionStatus.submitted;
    case IntentOrderStatus.CONFIRMED:
    case IntentOrderStatus.COMPLETED:
      return TransactionStatus.confirmed;
    case IntentOrderStatus.FAILED:
    case IntentOrderStatus.EXPIRED:
    case IntentOrderStatus.CANCELLED:
      return TransactionStatus.failed;
    default:
      return TransactionStatus.submitted;
  }
}

/**
 * Extracts and validates the intent data from a quote response.
 *
 * @param quoteResponse - The quote response that may contain intent data
 * @returns The intent data from the quote
 * @throws Error if the quote does not contain intent data
 */
export function getIntentFromQuote(quoteResponse: QuoteResponse): Intent {
  const { intent } = quoteResponse.quote;
  if (!intent) {
    throw new Error('submitIntent: missing intent data');
  }
  return intent;
}

export const postSubmitOrder = async ({
  params,
  clientId,
  jwt,
  fetchFn,
  bridgeApiBaseUrl,
}: {
  params: IntentSubmissionParams;
  clientId: BridgeClientId;
  jwt: string | undefined;
  fetchFn: FetchFunction;
  bridgeApiBaseUrl: string;
}): Promise<IntentStatusResponse> => {
  const endpoint = `${bridgeApiBaseUrl}/submitOrder`;
  try {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getClientHeaders({ clientId, jwt }),
      },
      body: JSON.stringify(params),
    });
    if (!validateIntentStatusResponse(response)) {
      throw new Error('Invalid submitOrder response');
    }
    return response;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Failed to submit intent: ${error.message}`);
    }
    throw new Error('Failed to submit intent');
  }
};
