import { handleFetch } from '@metamask/controller-utils';

import {
  getEnvUrls,
  SubscriptionControllerErrorMessage,
  type Env,
} from './constants';
import { SubscriptionServiceError } from './errors';
import type {
  AuthUtils,
  GetSubscriptionsResponse,
  ISubscriptionService,
  PricingResponse,
  StartCryptoSubscriptionRequest,
  StartCryptoSubscriptionResponse,
  StartSubscriptionRequest,
  StartSubscriptionResponse,
} from './types';

export type SubscriptionServiceConfig = {
  env: Env;
  auth: AuthUtils;
};

export const SUBSCRIPTION_URL = (env: Env, path: string) =>
  `${getEnvUrls(env).subscriptionApiUrl}/v1/${path}`;

export class SubscriptionService implements ISubscriptionService {
  readonly #env: Env;

  public authUtils: AuthUtils;

  constructor(config: SubscriptionServiceConfig) {
    this.#env = config.env;
    this.authUtils = config.auth;
  }

  async getSubscriptions(): Promise<GetSubscriptionsResponse> {
    const path = 'subscriptions';
    return await this.#makeRequest(path);
  }

  async cancelSubscription(params: { subscriptionId: string }): Promise<void> {
    const path = `subscriptions/${params.subscriptionId}`;
    return await this.#makeRequest(path, 'DELETE');
  }

  async startSubscriptionWithCard(
    request: StartSubscriptionRequest,
  ): Promise<StartSubscriptionResponse> {
    if (request.products.length === 0) {
      throw new SubscriptionServiceError(
        SubscriptionControllerErrorMessage.SubscriptionProductsEmpty,
      );
    }
    const path = 'subscriptions/card';

    return await this.#makeRequest(path, 'POST', request);
  }

  async startSubscriptionWithCrypto(
    request: StartCryptoSubscriptionRequest,
  ): Promise<StartCryptoSubscriptionResponse> {
    const path = 'subscriptions/crypto';
    return await this.#makeRequest(path, 'POST', request);
  }

  async #makeRequest<Result>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH' = 'GET',
    body?: Record<string, unknown>,
  ): Promise<Result> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const url = new URL(SUBSCRIPTION_URL(this.#env, path));

      const response = await handleFetch(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      return response;
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? 'unknown error');

      throw new SubscriptionServiceError(
        `failed to make request. ${errorMessage}`,
      );
    }
  }

  async #getAuthorizationHeader(): Promise<{ Authorization: string }> {
    const accessToken = await this.authUtils.getAccessToken();
    return { Authorization: `Bearer ${accessToken}` };
  }

  async getPricing(): Promise<PricingResponse> {
    const path = 'pricing';
    return await this.#makeRequest<PricingResponse>(path);
  }
}
