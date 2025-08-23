import { getEnvUrls, type Env } from './constants';
import { SubscriptionServiceError } from './errors';
import type {
  ISubscriptionService,
  PricingResponse,
  Subscription,
} from './types';

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

  async getSubscription(): Promise<Subscription | null> {
    const path = 'subscription';
    try {
      const headers = await this.#getAuthorizationHeader();
      const url = new URL(SUBSCRIPTION_URL(this.#env, path));
      const response = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const responseBody = (await response.json()) as ErrorMessage;
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }

      const res = (await response.json()) as { data: Subscription | null };
      return res.data;
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');

      throw new SubscriptionServiceError(
        `failed to get subscription. ${errorMessage}`,
      );
    }
  }

  async cancelSubscription(params: { subscriptionId: string }): Promise<void> {
    const path = `subscription/${params.subscriptionId}/cancel`;
    try {
      const headers = await this.#getAuthorizationHeader();
      const url = new URL(SUBSCRIPTION_URL(this.#env, path));
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      if (!response.ok) {
        const responseBody = (await response.json()) as ErrorMessage;
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');

      throw new SubscriptionServiceError(
        `failed to cancel subscription. ${errorMessage}`,
      );
    }
  }

  async #getAuthorizationHeader(): Promise<{ Authorization: string }> {
    const accessToken = await this.#config.auth.getAccessToken();
    return { Authorization: `Bearer ${accessToken}` };
  }

  async getPricing(): Promise<PricingResponse> {
    const path = 'pricing';
    return await this.#makeRequest<PricingResponse>(path);
  }

  async #makeRequest<Result>(
    path: string,
    method: 'GET' | 'POST' = 'GET',
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
        `failed to make request: ${errorMessage}`,
      );
    }
  }
}
