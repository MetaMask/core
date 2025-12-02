import { handleFetch } from '@metamask/controller-utils';

import {
  getEnvUrls,
  SubscriptionControllerErrorMessage,
  type Env,
} from './constants';
import { SubscriptionServiceError } from './errors';
import type {
  AssignCohortRequest,
  AuthUtils,
  BillingPortalResponse,
  GetSubscriptionsEligibilitiesRequest,
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
  SubmitSponsorshipIntentsRequest,
  LinkRewardsRequest,
  SubscriptionApiGeneralResponse,
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
   * @param request - Optional request object containing user balance category to check cohort eligibility
   * @returns The eligibility for a shield subscription
   */
  async getSubscriptionsEligibilities(
    request?: GetSubscriptionsEligibilitiesRequest,
  ): Promise<SubscriptionEligibility[]> {
    const path = 'subscriptions/eligibility';
    let query: Record<string, string> | undefined;
    if (request?.balanceCategory !== undefined) {
      query = { balanceCategory: request.balanceCategory };
    }
    const results = await this.#makeRequest<SubscriptionEligibility[]>(
      path,
      'GET',
      undefined,
      query,
    );

    return results.map((result) => ({
      ...result,
      canSubscribe: result.canSubscribe || false,
      canViewEntryModal: result.canViewEntryModal || false,
      cohorts: result.cohorts || [],
      assignedCohort: result.assignedCohort || null,
      hasAssignedCohortExpired: result.hasAssignedCohortExpired || false,
    }));
  }

  /**
   * Submit a user event. (e.g. shield modal viewed)
   *
   * @param request - Request object containing the event to submit.
   * @example { event: SubscriptionUserEvent.ShieldEntryModalViewed, cohort: 'post_tx' }
   */
  async submitUserEvent(request: SubmitUserEventRequest): Promise<void> {
    const path = 'user-events';
    await this.#makeRequest(path, 'POST', request);
  }

  /**
   * Assign user to a cohort.
   *
   * @param request - Request object containing the cohort to assign the user to.
   * @example { cohort: 'post_tx' }
   */
  async assignUserToCohort(request: AssignCohortRequest): Promise<void> {
    const path = 'cohorts/assign';
    await this.#makeRequest(path, 'POST', request);
  }

  /**
   * Submit sponsorship intents to the Subscription Service backend.
   *
   * This is intended to be used together with the crypto subscription flow.
   * When the user has enabled the smart transaction feature, we will sponsor the gas fees for the subscription approval transaction.
   *
   * @param request - Request object containing the address and products.
   * @example { address: '0x1234567890123456789012345678901234567890', products: [ProductType.Shield] }
   */
  async submitSponsorshipIntents(
    request: SubmitSponsorshipIntentsRequest,
  ): Promise<void> {
    const path = 'transaction-sponsorship/intents';
    await this.#makeRequest(path, 'POST', request);
  }

  /**
   * Link rewards to a subscription.
   *
   * @param request - Request object containing the reward subscription ID.
   * @example { rewardSubscriptionId: '1234567890' }
   * @returns The response from the API.
   */
  async linkRewards(
    request: LinkRewardsRequest,
  ): Promise<SubscriptionApiGeneralResponse> {
    const path = 'subscriptions/rewards/link';
    return await this.#makeRequest<SubscriptionApiGeneralResponse>(
      path,
      'POST',
      request,
    );
  }

  async #makeRequest<Result>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH' = 'GET',
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>,
  ): Promise<Result> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const url = new URL(SUBSCRIPTION_URL(this.#env, path));

      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

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
