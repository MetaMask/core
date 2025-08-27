import { getEnvUrls, type Env } from './constants';
import { SubscriptionServiceError } from './errors';
import type {
  AuthUtils,
  GetSubscriptionsResponse,
  ISubscriptionService,
} from './types';

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
  readonly #env: Env;

  readonly #fetch: typeof globalThis.fetch;

  public authUtils: AuthUtils;

  constructor(config: SubscriptionServiceConfig) {
    this.#env = config.env;
    this.authUtils = config.auth;
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

      const responseBody = await response.json();
      if (!response.ok) {
        const { message, error } = responseBody as ErrorMessage;
        throw new Error(`HTTP error message: ${message}, error: ${error}`);
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
    const accessToken = await this.authUtils?.getAccessToken();
    return { Authorization: `Bearer ${accessToken}` };
  }
}
