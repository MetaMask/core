import type { FetchFunction } from './types';

export interface IntentSubmissionParams {
  srcChainId: string;
  quoteId: string;
  signature: string;
  order: any;
  userAddress: string;
  aggregatorId: string;
}

export interface IntentApi {
  submitIntent(params: IntentSubmissionParams): Promise<any>;
}

export class IntentApiImpl implements IntentApi {
  private baseUrl: string;
  private fetchFn: FetchFunction;

  constructor(baseUrl: string, fetchFn: FetchFunction) {
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
  }

  async submitIntent(params: IntentSubmissionParams): Promise<any> {
    const endpoint = `${this.baseUrl}/submitOrder`;
    try {
      const response = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return response;
    } catch (e) {
      throw new Error(`Failed to submit intent: ${e}`);
    }
  }

  async getOrderStatus(
    orderId: string,
    aggregatorId: string,
    srcChainId: string,
  ): Promise<any> {
    const endpoint = `${this.baseUrl}/getOrderStatus?orderId=${orderId}&aggregatorId=${encodeURIComponent(aggregatorId)}&srcChainId=${srcChainId}`;
    try {
      const response = await this.fetchFn(endpoint, {
        method: 'GET',
      });
      return response;
    } catch (e) {
      throw new Error(`Failed to get order status: ${e}`);
    }
  }
}
