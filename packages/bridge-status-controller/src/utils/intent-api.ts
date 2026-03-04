import { getClientHeaders, StatusTypes } from '@metamask/bridge-controller';
import { TransactionStatus } from '@metamask/transaction-controller';

import {
  IntentOrder,
  IntentOrderStatus,
  validateIntentOrderResponse,
} from './validators';
import type { FetchFunction, StatusResponse } from '../types';

export type IntentSubmissionParams = {
  srcChainId: string;
  quoteId: string;
  signature: string;
  order: unknown;
  userAddress: string;
  aggregatorId: string;
};

export type IntentApi = {
  submitIntent(
    params: IntentSubmissionParams,
    clientId: string,
  ): Promise<IntentOrder>;
  getOrderStatus(
    orderId: string,
    aggregatorId: string,
    srcChainId: string,
    clientId: string,
  ): Promise<IntentOrder>;
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

  async submitIntent(
    params: IntentSubmissionParams,
    clientId: string,
  ): Promise<IntentOrder> {
    const endpoint = `${this.#baseUrl}/submitOrder`;
    try {
      const jwt = await this.#getJwt();
      const response = await this.#fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getClientHeaders({ clientId, jwt }),
        },
        body: JSON.stringify(params),
      });
      if (!validateIntentOrderResponse(response)) {
        throw new Error('Invalid submitOrder response');
      }
      return response;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to submit intent: ${error.message}`);
      }
      throw new Error('Failed to submit intent');
    }
  }

  async getOrderStatus(
    orderId: string,
    aggregatorId: string,
    srcChainId: string,
    clientId: string,
  ): Promise<IntentOrder> {
    const endpoint = `${this.#baseUrl}/getOrderStatus?orderId=${orderId}&aggregatorId=${encodeURIComponent(aggregatorId)}&srcChainId=${srcChainId}`;
    try {
      const jwt = await this.#getJwt();
      const response = await this.#fetchFn(endpoint, {
        method: 'GET',
        headers: getClientHeaders({ clientId, jwt }),
      });
      if (!validateIntentOrderResponse(response)) {
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
  intentOrder: IntentOrder,
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

  const txHash = intentOrder.txHash ?? fallbackTxHash ?? '';
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
