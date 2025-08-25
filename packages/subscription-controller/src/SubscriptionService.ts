import { getEnvUrls, type Env } from './constants';
import { SubscriptionServiceError } from './errors';
import type { GetSubscriptionsResponse, ISubscriptionService } from './types';

export type AuthUtils = {
  getAccessToken: () => Promise<string>;
};

export type SubscriptionServiceConfig = {
  env: Env;
  auth: AuthUtils;
  fetchFn: typeof globalThis.fetch;
};

type ErrorMessage = {
  message: string;
  error: string;
};

export const SUBSCRIPTION_URL = (env: Env, path: string) =>
  `${getEnvUrls(env).subscriptionApiUrl}/api/v1/${path}`;

export class SubscriptionService implements ISubscriptionService {
  readonly #authUtils: AuthUtils;

  readonly #env: Env;

  readonly #fetch: typeof globalThis.fetch;

  constructor(config: SubscriptionServiceConfig) {
    this.#env = config.env;
    this.#authUtils = config.auth;
    this.#fetch = config.fetchFn;
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

      const response = await this.#fetch(url.toString(), {
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
    const accessToken = await this.#authUtils.getAccessToken();
    return { Authorization: `Bearer ${accessToken}` };
  }
}
