import {
  getEnvUrls,
  SubscriptionControllerErrorMessage,
  SubscriptionServiceErrorMessage,
} from './constants';
import type { Env } from './constants';
import {
  createSentryError,
  getSubscriptionErrorFromResponse,
  SubscriptionServiceError,
} from './errors';
import { createModuleLogger, projectLogger } from './logger';
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
  CancelSubscriptionRequest,
} from './types';

export type SubscriptionServiceConfig = {
  env: Env;
  auth: AuthUtils;
  fetchFunction: typeof fetch;
  captureException?: (error: Error) => void;
};

export const SUBSCRIPTION_URL = (env: Env, path: string): string =>
  `${getEnvUrls(env).subscriptionApiUrl}/v1/${path}`;

const log = createModuleLogger(projectLogger, 'SubscriptionService');

export class SubscriptionService implements ISubscriptionService {
  readonly #env: Env;

  readonly #fetch: typeof fetch;

  readonly #captureException?: (error: Error) => void;

  public authUtils: AuthUtils;

  constructor(config: SubscriptionServiceConfig) {
    this.#env = config.env;
    this.authUtils = config.auth;
    this.#fetch = config.fetchFunction;
    this.#captureException = config.captureException;
  }

  async getSubscriptions(): Promise<GetSubscriptionsResponse> {
    const path = 'subscriptions';
    return await this.#makeRequest<GetSubscriptionsResponse>({
      path,
      errorMessage: SubscriptionServiceErrorMessage.FailedToGetSubscriptions,
    });
  }

  async cancelSubscription(
    params: CancelSubscriptionRequest,
  ): Promise<Subscription> {
    const path = `subscriptions/${params.subscriptionId}/cancel`;
    return await this.#makeRequest<Subscription>({
      path,
      method: 'POST',
      body: {
        cancelAtPeriodEnd: params.cancelAtPeriodEnd,
      },
      errorMessage: SubscriptionServiceErrorMessage.FailedToCancelSubscription,
    });
  }

  async unCancelSubscription(params: {
    subscriptionId: string;
  }): Promise<Subscription> {
    const path = `subscriptions/${params.subscriptionId}/uncancel`;
    return await this.#makeRequest<Subscription>({
      path,
      method: 'POST',
      body: {},
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToUncancelSubscription,
    });
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

    return await this.#makeRequest<StartSubscriptionResponse>({
      path,
      method: 'POST',
      body: request,
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToStartSubscriptionWithCard,
    });
  }

  async startSubscriptionWithCrypto(
    request: StartCryptoSubscriptionRequest,
  ): Promise<StartCryptoSubscriptionResponse> {
    const path = 'subscriptions/crypto';
    return await this.#makeRequest<StartCryptoSubscriptionResponse>({
      path,
      method: 'POST',
      body: request,
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToStartSubscriptionWithCrypto,
    });
  }

  async updatePaymentMethodCard(
    request: UpdatePaymentMethodCardRequest,
  ): Promise<UpdatePaymentMethodCardResponse> {
    const path = `subscriptions/${request.subscriptionId}/payment-method/card`;
    return await this.#makeRequest<UpdatePaymentMethodCardResponse>({
      path,
      method: 'PATCH',
      body: {
        ...request,
        subscriptionId: undefined,
      },
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToUpdatePaymentMethodCard,
    });
  }

  async updatePaymentMethodCrypto(
    request: UpdatePaymentMethodCryptoRequest,
  ): Promise<void> {
    const path = `subscriptions/${request.subscriptionId}/payment-method/crypto`;
    await this.#makeRequest({
      path,
      method: 'PATCH',
      body: {
        ...request,
        subscriptionId: undefined,
      },
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToUpdatePaymentMethodCrypto,
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
    const results = await this.#makeRequest<SubscriptionEligibility[]>({
      path,
      queryParams: query,
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToGetSubscriptionsEligibilities,
    });

    return results.map((result) => ({
      ...result,
      canSubscribe: result.canSubscribe || false,
      canViewEntryModal: result.canViewEntryModal || false,
      cohorts: result.cohorts || [],
      assignedCohort: result.assignedCohort ?? null,
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
    await this.#makeRequest({
      path,
      method: 'POST',
      body: request,
      errorMessage: SubscriptionServiceErrorMessage.FailedToSubmitUserEvent,
    });
  }

  /**
   * Assign user to a cohort.
   *
   * @param request - Request object containing the cohort to assign the user to.
   * @example { cohort: 'post_tx' }
   */
  async assignUserToCohort(request: AssignCohortRequest): Promise<void> {
    const path = 'cohorts/assign';
    await this.#makeRequest({
      path,
      method: 'POST',
      body: request,
      errorMessage: SubscriptionServiceErrorMessage.FailedToAssignUserToCohort,
    });
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
    await this.#makeRequest({
      path,
      method: 'POST',
      body: request,
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToSubmitSponsorshipIntents,
    });
  }

  /**
   * Link rewards to a subscription.
   *
   * @param request - Request object containing the reward account ID.
   * @example { rewardAccountId: 'eip155:1:0x1234567890123456789012345678901234567890' }
   * @returns The response from the API.
   */
  async linkRewards(
    request: LinkRewardsRequest,
  ): Promise<SubscriptionApiGeneralResponse> {
    const path = 'rewards/link';
    return await this.#makeRequest<SubscriptionApiGeneralResponse>({
      path,
      method: 'POST',
      body: request,
      errorMessage: SubscriptionServiceErrorMessage.FailedToLinkRewards,
    });
  }

  async getPricing(): Promise<PricingResponse> {
    const path = 'pricing';
    return await this.#makeRequest<PricingResponse>({
      path,
      errorMessage: SubscriptionServiceErrorMessage.FailedToGetPricing,
    });
  }

  async getBillingPortalUrl(): Promise<BillingPortalResponse> {
    const path = 'billing-portal';
    return await this.#makeRequest<BillingPortalResponse>({
      path,
      errorMessage: SubscriptionServiceErrorMessage.FailedToGetBillingPortalUrl,
    });
  }

  /**
   * Makes a request to the Subscription Service backend.
   *
   * @param params - The request object containing the path, method, body, query parameters, and error message.
   * @param params.path - The path of the request.
   * @param params.method - The method of the request.
   * @param params.body - The body of the request.
   * @param params.queryParams - The query parameters of the request.
   * @param params.errorMessage - The error message to throw if the request fails.
   * @returns The result of the request.
   */
  async #makeRequest<Result>({
    path,
    method = 'GET',
    body,
    queryParams,
    errorMessage,
  }: {
    path: string;
    method?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
    body?: Record<string, unknown>;
    queryParams?: Record<string, string>;
    errorMessage: string;
  }): Promise<Result> {
    const url = this.#getSubscriptionApiUrl(path);
    const headers = await this.#getAuthorizationHeader();

    try {
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      const response = await this.#fetch(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await getSubscriptionErrorFromResponse(response);
        throw error;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      log(errorMessage, error);

      const errorMessageWithUrl = `${errorMessage} (url: ${url.toString()})`;
      const errorToCapture =
        error instanceof Error ? error : new Error(errorMessage);
      this.#captureException?.(
        createSentryError(errorMessageWithUrl, errorToCapture),
      );

      throw new SubscriptionServiceError(
        `Failed to make request. ${errorMessageWithUrl}`,
        {
          cause: errorToCapture,
        },
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  async #getAuthorizationHeader(): Promise<{ Authorization: string }> {
    try {
      const accessToken = await this.authUtils.getAccessToken();
      return { Authorization: `Bearer ${accessToken}` };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error when getting authorization header';

      this.#captureException?.(
        createSentryError(
          `Failed to get authorization header. ${errorMessage}`,
          error instanceof Error ? error : new Error(errorMessage),
        ),
      );

      throw new SubscriptionServiceError(
        `Failed to get authorization header. ${errorMessage}`,
        {
          cause: error instanceof Error ? error : new Error(errorMessage),
        },
      );
    }
  }

  #getSubscriptionApiUrl(path: string): URL {
    try {
      const url = new URL(SUBSCRIPTION_URL(this.#env, path));
      return url;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error when getting subscription API URL';
      this.#captureException?.(
        createSentryError(
          `Failed to get subscription API URL. ${errorMessage}`,
          error instanceof Error ? error : new Error(errorMessage),
        ),
      );

      throw error;
    }
  }
}
