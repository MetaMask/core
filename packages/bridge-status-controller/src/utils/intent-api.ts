import { IntentOrder, validateIntentOrderResponse } from './validators';
import type { FetchFunction } from '../types';

export type IntentSubmissionParams = {
  srcChainId: string;
  quoteId: string;
  signature: string;
  order: unknown;
  userAddress: string;
  aggregatorId: string;
};

export const getClientIdHeader = (clientId: string) => ({
  'X-Client-Id': clientId,
});

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

export class IntentApiImpl implements IntentApi {
  readonly #baseUrl: string;

  readonly #fetchFn: FetchFunction;

  constructor(baseUrl: string, fetchFn: FetchFunction) {
    this.#baseUrl = baseUrl;
    this.#fetchFn = fetchFn;
  }

  async submitIntent(
    params: IntentSubmissionParams,
    clientId: string,
  ): Promise<IntentOrder> {
    const endpoint = `${this.#baseUrl}/submitOrder`;
    try {
      const response = await this.#fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getClientIdHeader(clientId),
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
      const response = await this.#fetchFn(endpoint, {
        method: 'GET',
        headers: getClientIdHeader(clientId),
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
}
