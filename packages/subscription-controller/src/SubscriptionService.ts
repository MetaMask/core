import { handleFetch } from '@metamask/controller-utils';

import {
  getEnvUrls,
  SubscriptionControllerErrorMessage,
  type Env,
} from './constants';
import { SubscriptionServiceError } from './errors';
import type {
  AuthUtils,
  BillingPortalResponse,
  GetSubscriptionsResponse,
  ISubscriptionService,
  PricingResponse,
  SubscriptionEligibility,
  StartCryptoSubscriptionRequest,
  StartCryptoSubscriptionResponse,
  StartSubscriptionRequest,
  StartSubscriptionResponse,
  SubmitUserEventRequest,
  Subscription,
  UpdatePaymentMethodCardRequest,
  UpdatePaymentMethodCardResponse,
  UpdatePaymentMethodCryptoRequest,
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

  async cancelSubscription(params: {
    subscriptionId: string;
  }): Promise<Subscription> {
    const path = `subscriptions/${params.subscriptionId}/cancel`;
    return await this.#makeRequest(path, 'POST', {});
  }

  async unCancelSubscription(params: {
    subscriptionId: string;
  }): Promise<Subscription> {
    const path = `subscriptions/${params.subscriptionId}/uncancel`;
    return await this.#makeRequest(path, 'POST', {});
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

  async updatePaymentMethodCard(
    request: UpdatePaymentMethodCardRequest,
  ): Promise<UpdatePaymentMethodCardResponse> {
    const path = `subscriptions/${request.subscriptionId}/payment-method/card`;
    return await this.#makeRequest<UpdatePaymentMethodCardResponse>(
      path,
      'PATCH',
      {
        ...request,
        subscriptionId: undefined,
      },
    );
  }

  async updatePaymentMethodCrypto(request: UpdatePaymentMethodCryptoRequest) {
    const path = `subscriptions/${request.subscriptionId}/payment-method/crypto`;
    await this.#makeRequest(path, 'PATCH', {
      ...request,
      subscriptionId: undefined,
    });
  }

  /**
   * Get the eligibility for a shield subscription.
   *
   * @returns The eligibility for a shield subscription
   */
  async getSubscriptionsEligibilities(): Promise<SubscriptionEligibility[]> {
    const path = 'subscriptions/eligibility';
    const results = await this.#makeRequest<SubscriptionEligibility[]>(path);
    return results.map((result) => ({
      ...result,
      canSubscribe: result.canSubscribe || false,
      canViewEntryModal: result.canViewEntryModal || false,
    }));
  }

  /**
   * Submit a user event. (e.g. shield modal viewed)
   *
   * @param request - Request object containing the event to submit.
   * @example { event: SubscriptionUserEvent.ShieldEntryModalViewed }
   */
  async submitUserEvent(request: SubmitUserEventRequest): Promise<void> {
    const path = 'user-events';
    await this.#makeRequest(path, 'POST', request);
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
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);

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

  async getBillingPortalUrl(): Promise<BillingPortalResponse> {
    const path = 'billing-portal';
    return await this.#makeRequest<BillingPortalResponse>(path);
  }
}
