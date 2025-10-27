import type { FetchFunction } from './types';

export interface IntentSubmissionParams {
  quote: any;
  signature: string;
  userAddress: string;
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
    const endpoint = `${this.baseUrl}/submitIntent`;
    const response = (await this.fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })) as Response;
    if (!response.ok) {
      throw new Error(`Failed to submit intent: ${response.statusText}`);
    }
    return response.json();
  }
}
