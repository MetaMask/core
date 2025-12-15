import type { FetchFunction } from './types';

export type IntentSubmissionParams = {
  srcChainId: string;
  quoteId: string;
  signature: string;
  order: unknown;
  userAddress: string;
  aggregatorId: string;
};

export type IntentApi = {
  submitIntent(params: IntentSubmissionParams): Promise<unknown>;
};

export class IntentApiImpl implements IntentApi {
  readonly #baseUrl: string;

  readonly #fetchFn: FetchFunction;

  constructor(baseUrl: string, fetchFn: FetchFunction) {
    this.#baseUrl = baseUrl;
    this.#fetchFn = fetchFn;
  }

  async submitIntent(params: IntentSubmissionParams): Promise<unknown> {
    const endpoint = `${this.#baseUrl}/submitOrder`;
    try {
      const response = await this.#fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return response;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to submit intent: ${error.message}`);
      }
      return null;
    }
  }

  async getOrderStatus(
    orderId: string,
    aggregatorId: string,
    srcChainId: string,
  ): Promise<unknown> {
    const endpoint = `${this.#baseUrl}/getOrderStatus?orderId=${orderId}&aggregatorId=${encodeURIComponent(aggregatorId)}&srcChainId=${srcChainId}`;
    try {
      const response = await this.#fetchFn(endpoint, {
        method: 'GET',
      });
      return response;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to get order status: ${error.message}`);
      }
      return null;
    }
  }
}
