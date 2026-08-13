import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { BaseDataService } from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { handleWhen, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import { create } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import {
  Env,
  getEnvUrls,
  SubscriptionControllerErrorMessage,
  SubscriptionServiceErrorMessage,
} from './constants.js';
import {
  createSentryError,
  getSubscriptionErrorFromResponse,
  SubscriptionServiceError,
} from './errors.js';
import { createModuleLogger, projectLogger } from './logger.js';
import type { SubscriptionServiceMethodActions } from './SubscriptionService-method-action-types.js';
import {
  BillingPortalResponseStruct,
  GetSubscriptionsResponseStruct,
  PricingResponseStruct,
  StartCryptoSubscriptionResponseStruct,
  StartSubscriptionResponseStruct,
  SubscriptionApiGeneralResponseStruct,
  SubscriptionEligibilityArrayStruct,
  SubscriptionStruct,
  UpdatePaymentMethodCardResponseStruct,
} from './SubscriptionService-structs.js';
import { CRYPTO_AUTH_METHODS } from './types.js';
import type {
  AssignCohortRequest,
  BillingPortalResponse,
  CancelSubscriptionRequest,
  GetSubscriptionsEligibilitiesRequest,
  GetSubscriptionsResponse,
  LinkRewardsRequest,
  PricingResponse,
  StartCryptoSubscriptionRequest,
  StartCryptoSubscriptionResponse,
  StartSubscriptionRequest,
  StartSubscriptionResponse,
  SubmitSponsorshipIntentsRequest,
  SubmitUserEventRequest,
  Subscription,
  SubscriptionApiGeneralResponse,
  SubscriptionEligibility,
  UpdatePaymentMethodCardRequest,
  UpdatePaymentMethodCardResponse,
  UpdatePaymentMethodCryptoRequest,
} from './types.js';

export const serviceName = 'SubscriptionService';

export const SUBSCRIPTION_URL = (env: Env, path: string): string =>
  `${getEnvUrls(env).subscriptionApiUrl}/v1/${path}`;

const MESSENGER_EXPOSED_METHODS = [
  'getSubscriptions',
  'cancelSubscription',
  'unCancelSubscription',
  'startSubscriptionWithCard',
  'startSubscriptionWithCrypto',
  'updatePaymentMethodCard',
  'updatePaymentMethodCrypto',
  'getSubscriptionsEligibilities',
  'submitUserEvent',
  'assignUserToCohort',
  'submitSponsorshipIntents',
  'linkRewards',
  'getPricing',
  'getBillingPortalUrl',
] as const;

export type SubscriptionServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

export type SubscriptionServiceActions =
  | SubscriptionServiceMethodActions
  | SubscriptionServiceInvalidateQueriesAction;

type AllowedActions =
  | AuthenticationController.AuthenticationControllerGetBearerTokenAction
  | AuthenticationController.AuthenticationControllerGetSessionProfileAction;

type AllowedEvents = never;

export type SubscriptionServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

export type SubscriptionServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

export type SubscriptionServiceEvents =
  | SubscriptionServiceCacheUpdatedEvent
  | SubscriptionServiceGranularCacheUpdatedEvent;

export type SubscriptionServiceMessenger = Messenger<
  typeof serviceName,
  SubscriptionServiceActions | AllowedActions,
  SubscriptionServiceEvents | AllowedEvents
>;

export type SubscriptionServiceOptions = {
  messenger: SubscriptionServiceMessenger;
  /**
   * The `fetch` function to use for requests. Defaults to the global `fetch`.
   */
  fetchFunction?: typeof fetch;
  env?: Env;
  captureException?: (error: Error) => void;
  queryClientConfig?: QueryClientConfig;
  policyOptions?: CreateServicePolicyOptions;
};

const log = createModuleLogger(projectLogger, 'SubscriptionService');

function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpError) {
    if (error.httpStatus === 429) {
      return true;
    }
    return error.httpStatus < 400 || error.httpStatus >= 500;
  }
  return true;
}

const DEFAULT_POLICY_OPTIONS: CreateServicePolicyOptions = {
  retryFilterPolicy: handleWhen(isRetryableError),
};

/**
 * Data service for the Subscription API.
 *
 * All requests are authenticated via JWT Bearer tokens obtained from the
 * `AuthenticationController:getBearerToken` messenger action. Cached queries
 * are scoped by `profileId` from
 * `AuthenticationController:getSessionProfile`.
 */
export class SubscriptionService extends BaseDataService<
  typeof serviceName,
  SubscriptionServiceMessenger
> {
  readonly #env: Env;

  readonly #fetch: typeof fetch;

  readonly #captureException?: (error: Error) => void;

  constructor({
    messenger,
    fetchFunction = globalThis.fetch,
    env = Env.PRD,
    captureException,
    queryClientConfig = {},
    policyOptions = {},
  }: SubscriptionServiceOptions) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      policyOptions: { ...DEFAULT_POLICY_OPTIONS, ...policyOptions },
    });

    this.#env = env;
    this.#fetch = fetchFunction;
    this.#captureException = captureException;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches the user's subscriptions.
   *
   * @returns The subscriptions response.
   */
  async getSubscriptions(): Promise<GetSubscriptionsResponse> {
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    const jsonResponse = await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'getSubscriptions',
      requestParams: null,
      path: 'subscriptions',
      errorMessage: SubscriptionServiceErrorMessage.FailedToGetSubscriptions,
    });

    return create(jsonResponse, GetSubscriptionsResponseStruct);
  }

  /**
   * Cancels a subscription.
   *
   * @param params - The cancel subscription request.
   * @returns The updated subscription.
   */
  async cancelSubscription(
    params: CancelSubscriptionRequest,
  ): Promise<Subscription> {
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    const path = `subscriptions/${params.subscriptionId}/cancel`;
    const jsonResponse = await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'cancelSubscription',
      requestParams: params,
      path,
      method: 'POST',
      body: {
        cancelAtPeriodEnd: params.cancelAtPeriodEnd,
      },
      errorMessage: SubscriptionServiceErrorMessage.FailedToCancelSubscription,
    });

    return create(jsonResponse, SubscriptionStruct);
  }

  /**
   * Reverses a pending subscription cancellation.
   *
   * @param params - The uncancel subscription request.
   * @param params.subscriptionId - The subscription ID to uncancel.
   * @returns The updated subscription.
   */
  async unCancelSubscription(params: {
    subscriptionId: string;
  }): Promise<Subscription> {
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    const path = `subscriptions/${params.subscriptionId}/uncancel`;
    const jsonResponse = await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'unCancelSubscription',
      requestParams: params,
      path,
      method: 'POST',
      body: {},
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToUncancelSubscription,
    });

    return create(jsonResponse, SubscriptionStruct);
  }

  /**
   * Starts a card-paid subscription checkout session for the requested products
   * (e.g. Shield or Money Account Plus).
   *
   * @param request - The start subscription request.
   * @returns The checkout session response.
   */
  async startSubscriptionWithCard(
    request: StartSubscriptionRequest,
  ): Promise<StartSubscriptionResponse> {
    if (request.products.length === 0) {
      throw new SubscriptionServiceError(
        SubscriptionControllerErrorMessage.SubscriptionProductsEmpty,
      );
    }

    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    const jsonResponse = await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'startSubscriptionWithCard',
      requestParams: request,
      path: 'subscriptions/card',
      method: 'POST',
      body: request,
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToStartSubscriptionWithCard,
    });

    return create(jsonResponse, StartSubscriptionResponseStruct);
  }

  /**
   * Starts a subscription with a crypto payment method.
   *
   * @param request - The start crypto subscription request.
   * @returns The created subscription response.
   * @throws If the request does not use exactly one of `rawTransaction`
   * (ERC-20 approval) or `delegationHash` (delegation).
   */
  async startSubscriptionWithCrypto(
    request: StartCryptoSubscriptionRequest,
  ): Promise<StartCryptoSubscriptionResponse> {
    this.#assertValidCryptoAuthCombo(request);

    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    const jsonResponse = await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'startSubscriptionWithCrypto',
      requestParams: request,
      path: 'subscriptions/crypto',
      method: 'POST',
      body: request,
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToStartSubscriptionWithCrypto,
    });

    return create(jsonResponse, StartCryptoSubscriptionResponseStruct);
  }

  /**
   * Updates a subscription's card payment method.
   *
   * @param request - The update payment method request.
   * @returns The redirect URL response.
   */
  async updatePaymentMethodCard(
    request: UpdatePaymentMethodCardRequest,
  ): Promise<UpdatePaymentMethodCardResponse> {
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    const path = `subscriptions/${request.subscriptionId}/payment-method/card`;
    const jsonResponse = await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'updatePaymentMethodCard',
      requestParams: request,
      path,
      method: 'PATCH',
      body: {
        ...request,
        subscriptionId: undefined,
      },
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToUpdatePaymentMethodCard,
    });

    return create(jsonResponse, UpdatePaymentMethodCardResponseStruct);
  }

  /**
   * Updates a subscription's crypto payment method.
   *
   * @param request - The update payment method request.
   */
  async updatePaymentMethodCrypto(
    request: UpdatePaymentMethodCryptoRequest,
  ): Promise<void> {
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    const path = `subscriptions/${request.subscriptionId}/payment-method/crypto`;
    await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'updatePaymentMethodCrypto',
      requestParams: request,
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
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    let queryParams: Record<string, string> | undefined;
    if (request?.balanceCategory !== undefined) {
      queryParams = { balanceCategory: request.balanceCategory };
    }

    const jsonResponse = await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'getSubscriptionsEligibilities',
      requestParams: request ?? null,
      path: 'subscriptions/eligibility',
      queryParams,
      errorMessage:
        SubscriptionServiceErrorMessage.FailedToGetSubscriptionsEligibilities,
    });

    const results = create(jsonResponse, SubscriptionEligibilityArrayStruct);

    return results.map((result) => ({
      ...result,
      canSubscribe: result.canSubscribe ?? false,
      canViewEntryModal: result.canViewEntryModal ?? false,
      cohorts: result.cohorts ?? [],
      assignedCohort: result.assignedCohort ?? null,
      hasAssignedCohortExpired: result.hasAssignedCohortExpired ?? false,
    }));
  }

  /**
   * Submit a user event. (e.g. shield modal viewed)
   *
   * @param request - Request object containing the event to submit.
   * @example { event: SubscriptionUserEvent.ShieldEntryModalViewed, cohort: 'post_tx' }
   */
  async submitUserEvent(request: SubmitUserEventRequest): Promise<void> {
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'submitUserEvent',
      requestParams: request,
      path: 'user-events',
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
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'assignUserToCohort',
      requestParams: request,
      path: 'cohorts/assign',
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
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'submitSponsorshipIntents',
      requestParams: request,
      path: 'transaction-sponsorship/intents',
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
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    const jsonResponse = await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'linkRewards',
      requestParams: request,
      path: 'rewards/link',
      method: 'POST',
      body: request,
      errorMessage: SubscriptionServiceErrorMessage.FailedToLinkRewards,
    });

    return create(jsonResponse, SubscriptionApiGeneralResponseStruct);
  }

  /**
   * Fetches subscription pricing information.
   *
   * @returns The pricing response.
   */
  async getPricing(): Promise<PricingResponse> {
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    const jsonResponse = await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'getPricing',
      requestParams: null,
      path: 'pricing',
      errorMessage: SubscriptionServiceErrorMessage.FailedToGetPricing,
    });

    return create(jsonResponse, PricingResponseStruct);
  }

  /**
   * Fetches the billing portal URL.
   *
   * @returns The billing portal response.
   */
  async getBillingPortalUrl(): Promise<BillingPortalResponse> {
    const { profileKey, bearerToken } = await this.#getAuthenticatedContext();
    const jsonResponse = await this.#fetchJson({
      profileKey,
      bearerToken,
      methodName: 'getBillingPortalUrl',
      requestParams: null,
      path: 'billing-portal',
      errorMessage: SubscriptionServiceErrorMessage.FailedToGetBillingPortalUrl,
    });

    return create(jsonResponse, BillingPortalResponseStruct);
  }

  async #fetchJson({
    profileKey,
    bearerToken,
    methodName,
    requestParams,
    path,
    method = 'GET',
    body,
    queryParams,
    errorMessage,
  }: {
    profileKey: string;
    bearerToken: string;
    methodName: string;
    requestParams: unknown;
    path: string;
    method?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
    body?: Record<string, unknown>;
    queryParams?: Record<string, string>;
    errorMessage: string;
  }): Promise<unknown> {
    const url = this.#getSubscriptionApiUrl(path);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    try {
      return await this.fetchQuery({
        queryKey: [
          `${this.name}:${methodName}`,
          profileKey,
          requestParams as Json,
        ],
        staleTime: 0,
        cacheTime: 0,
        queryFn: async () => {
          const response = await this.#fetch(url.toString(), {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...this.#headersForToken(bearerToken),
            },
            body: body ? JSON.stringify(body) : undefined,
          });

          if (!response.ok) {
            const apiError = await getSubscriptionErrorFromResponse(response);
            throw new HttpError(response.status, apiError.message);
          }

          return response.json();
        },
      });
    } catch (error) {
      log(errorMessage, error);

      const errorMessageWithUrl = `${errorMessage} (url: ${url.toString()})`;
      const errorToCapture =
        error instanceof Error ? error : new Error(errorMessage);
      this.#captureException?.(
        createSentryError(errorMessageWithUrl, errorToCapture),
      );

      if (error instanceof SubscriptionServiceError) {
        throw error;
      }

      throw new SubscriptionServiceError(
        `Failed to make request. ${errorMessageWithUrl}`,
        {
          cause: errorToCapture,
        },
      );
    }
  }

  /**
   * Ensures the request uses exactly one crypto auth method: ERC-20 approval
   * (`rawTransaction`, default) or delegation (`delegationHash`).
   *
   * @param request - The start crypto subscription request.
   * @throws If both, neither, or a mismatched combo of auth fields is provided.
   */
  #assertValidCryptoAuthCombo(request: StartCryptoSubscriptionRequest): void {
    const method =
      request.cryptoAuthMethod ?? CRYPTO_AUTH_METHODS.ERC20_APPROVAL;
    const hasRawTransaction = Boolean(request.rawTransaction);
    const hasDelegationHash = Boolean(request.delegationHash);
    const isValidErc20Approval =
      method === CRYPTO_AUTH_METHODS.ERC20_APPROVAL &&
      hasRawTransaction &&
      !hasDelegationHash;
    const isValidDelegation =
      method === CRYPTO_AUTH_METHODS.DELEGATION &&
      hasDelegationHash &&
      !hasRawTransaction;

    if (!isValidErc20Approval && !isValidDelegation) {
      throw new SubscriptionServiceError(
        SubscriptionServiceErrorMessage.InvalidCryptoAuthCombo,
      );
    }
  }

  async #getAuthenticatedContext(): Promise<{
    profileKey: string;
    bearerToken: string;
  }> {
    try {
      const [bearerToken, sessionProfile] = await Promise.all([
        this.messenger.call('AuthenticationController:getBearerToken'),
        this.messenger.call('AuthenticationController:getSessionProfile'),
      ]);

      return { profileKey: sessionProfile.profileId, bearerToken };
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

  #headersForToken(bearerToken: string): Record<string, string> {
    return { Authorization: `Bearer ${bearerToken}` };
  }

  #getSubscriptionApiUrl(path: string): URL {
    try {
      return new URL(SUBSCRIPTION_URL(this.#env, path));
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
