import { getEnvUrls, type Env } from './constants';
import { SubscriptionServiceError } from './errors';
import type { GetSubscriptionsResponse, ISubscriptionService } from './types';

export type SubscriptionServiceConfig = {
  env: Env;
  auth: {
    getAccessToken: () => Promise<string>;
  };
};

type ErrorMessage = {
  message: string;
  error: string;
};

export const SUBSCRIPTION_URL = (env: Env, path: string) =>
  `${getEnvUrls(env).subscriptionApiUrl}/api/v1/${path}`;

export class SubscriptionService implements ISubscriptionService {
  readonly #config: SubscriptionServiceConfig;

  readonly #env: Env;

  constructor(config: SubscriptionServiceConfig) {
    this.#env = config.env;
    this.#config = config;
  }

  async getSubscriptions(): Promise<GetSubscriptionsResponse> {
    const path = 'subscriptions';
    return await this.#makeRequest(path);
  }

  async cancelSubscription(params: { subscriptionId: string }): Promise<void> {
    const path = `subscriptions/${params.subscriptionId}`;
    return await this.#makeRequest(path, 'DELETE');
  }

  async #makeRequest<Result>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH' = 'GET',
  ): Promise<Result> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const url = new URL(SUBSCRIPTION_URL(this.#env, path));

      const response = await fetch(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      const responseBody = (await response.json()) as ErrorMessage;
      if (!response.ok) {
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }

      return responseBody as Result;
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? 'unknown error');

      throw new SubscriptionServiceError(
        `failed to make request. ${errorMessage}`,
      );
    }
  }

  async #getAuthorizationHeader(): Promise<{ Authorization: string }> {
    const accessToken = await this.#config.auth.getAccessToken();
    return { Authorization: `Bearer ${accessToken}` };
  }
}
