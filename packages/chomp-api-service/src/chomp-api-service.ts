import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { QueryClientConfig } from '@tanstack/query-core';

import type { ChompApiServiceMethodActions } from './chomp-api-service-method-action-types';
import type {
  AssociateAddressRequest,
  AssociateAddressResponse,
  CreateUpgradeRequest,
  CreateUpgradeResponse,
  CreateWithdrawalRequest,
  CreateWithdrawalResponse,
  GetUpgradeResponse,
  SendIntentRequest,
  SendIntentResponse,
  VerifyDelegationRequest,
  VerifyDelegationResponse,
} from './types';

// === GENERAL ===

/**
 * The name of the {@link ChompApiService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'ChompApiService';

// === MESSENGER ===

/**
 * All of the methods within {@link ChompApiService} that are exposed via the
 * messenger.
 */
const MESSENGER_EXPOSED_METHODS = [
  'associateAddress',
  'createUpgrade',
  'getUpgrade',
  'verifyDelegation',
  'createIntents',
  'getIntentsByAddress',
  'createWithdrawal',
] as const;

/**
 * Invalidates cached queries for {@link ChompApiService}.
 */
export type ChompApiServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link ChompApiService} exposes to other consumers.
 */
export type ChompApiServiceActions =
  | ChompApiServiceMethodActions
  | ChompApiServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link ChompApiService} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link ChompApiService}'s cache is updated.
 */
export type ChompApiServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link ChompApiService}'s cache is updated.
 */
export type ChompApiServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link ChompApiService} exposes to other consumers.
 */
export type ChompApiServiceEvents =
  | ChompApiServiceCacheUpdatedEvent
  | ChompApiServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link ChompApiService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link ChompApiService}.
 */
export type ChompApiServiceMessenger = Messenger<
  typeof serviceName,
  ChompApiServiceActions | AllowedActions,
  ChompApiServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * This service is responsible for communicating with the CHOMP API.
 *
 * All requests are authenticated via JWT Bearer tokens obtained from the
 * `getAccessToken` callback provided at construction time.
 */
export class ChompApiService extends BaseDataService<
  typeof serviceName,
  ChompApiServiceMessenger
> {
  readonly #baseUrl: string;

  readonly #getAccessToken: () => Promise<string>;

  readonly #fetch: typeof globalThis.fetch;

  /**
   * Constructs a new ChompApiService.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.baseUrl - The base URL of the CHOMP API.
   * @param args.getAccessToken - An async callback that returns a valid JWT
   * access token for authenticating requests.
   * @param args.fetchFn - An optional custom fetch implementation. Defaults to
   * the global `fetch`.
   * @param args.queryClientConfig - Configuration for the underlying TanStack
   * Query client.
   * @param args.policyOptions - Options to pass to `createServicePolicy`.
   */
  constructor({
    messenger,
    baseUrl,
    getAccessToken,
    fetchFn = globalThis.fetch,
    queryClientConfig = {},
    policyOptions = {},
  }: {
    messenger: ChompApiServiceMessenger;
    baseUrl: string;
    getAccessToken: () => Promise<string>;
    fetchFn?: typeof globalThis.fetch;
    queryClientConfig?: QueryClientConfig;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      policyOptions,
    });

    this.#baseUrl = baseUrl;
    this.#getAccessToken = getAccessToken;
    this.#fetch = fetchFn;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Builds the standard headers for an authenticated CHOMP API request.
   *
   * @returns Headers including Authorization and Content-Type.
   */
  async #authHeaders(): Promise<Record<string, string>> {
    const token = await this.#getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Associates an address with a CHOMP profile.
   *
   * POST /v1/auth/address
   *
   * TODO: Implement the request using this.fetchQuery or direct POST via
   * this.#fetch. Validate the response with a superstruct. Note that a 409
   * response is valid and should be returned (not thrown).
   *
   * @param request - The association request containing signature, timestamp,
   * and address.
   * @returns The profile association result.
   */
  async associateAddress(
    request: AssociateAddressRequest,
  ): Promise<AssociateAddressResponse> {
    // TODO: POST to `${this.#baseUrl}/v1/auth/address` with JSON body.
    // TODO: Include Authorization header via this.#authHeaders().
    // TODO: Return response body on 200 or 409; throw on other non-OK statuses.
    // TODO: Validate response shape with superstruct before returning.
    const _headers = await this.#authHeaders();
    void request;
    throw new Error('Not implemented');
  }

  /**
   * Creates an account upgrade request.
   *
   * POST /v1/account-upgrade
   *
   * TODO: Implement the POST request. Validate the response with a superstruct.
   *
   * @param request - The upgrade request containing signature components and
   * chain details.
   * @returns The upgrade result.
   */
  async createUpgrade(
    request: CreateUpgradeRequest,
  ): Promise<CreateUpgradeResponse> {
    // TODO: POST to `${this.#baseUrl}/v1/account-upgrade` with JSON body.
    // TODO: Include Authorization header via this.#authHeaders().
    // TODO: Throw on non-OK responses.
    // TODO: Validate response shape with superstruct before returning.
    const _headers = await this.#authHeaders();
    void request;
    throw new Error('Not implemented');
  }

  /**
   * Fetches the upgrade record for a given address.
   *
   * GET /v1/account-upgrade/:address
   *
   * TODO: Implement the GET request. Return null on 404. Validate the response
   * with a superstruct for non-404 responses.
   *
   * @param address - The address to look up.
   * @returns The upgrade record, or null if not found.
   */
  async getUpgrade(address: string): Promise<GetUpgradeResponse | null> {
    // TODO: GET `${this.#baseUrl}/v1/account-upgrade/${address}`.
    // TODO: Include Authorization header via this.#authHeaders().
    // TODO: Return null on 404, throw on other non-OK statuses.
    // TODO: Validate response shape with superstruct before returning.
    // TODO: Consider using this.fetchQuery with a queryKey for caching.
    const _headers = await this.#authHeaders();
    void address;
    throw new Error('Not implemented');
  }

  /**
   * Verifies a delegation signature.
   *
   * POST /v1/intent/verify-delegation
   *
   * TODO: Implement the POST request. Validate the response with a superstruct.
   *
   * @param request - The delegation verification request.
   * @returns The verification result including validity and optional errors.
   */
  async verifyDelegation(
    request: VerifyDelegationRequest,
  ): Promise<VerifyDelegationResponse> {
    // TODO: POST to `${this.#baseUrl}/v1/intent/verify-delegation` with JSON body.
    // TODO: Include Authorization header via this.#authHeaders().
    // TODO: Throw on non-OK responses.
    // TODO: Validate response shape with superstruct before returning.
    const _headers = await this.#authHeaders();
    void request;
    throw new Error('Not implemented');
  }

  /**
   * Submits one or more intents to the CHOMP API.
   *
   * POST /v1/intent
   *
   * TODO: Implement the POST request. Validate the response array with a
   * superstruct.
   *
   * @param intents - The array of intents to submit.
   * @returns The array of intent responses.
   */
  async createIntents(
    intents: SendIntentRequest[],
  ): Promise<SendIntentResponse[]> {
    // TODO: POST to `${this.#baseUrl}/v1/intent` with JSON body.
    // TODO: Include Authorization header via this.#authHeaders().
    // TODO: Throw on non-OK responses.
    // TODO: Validate response shape with superstruct before returning.
    const _headers = await this.#authHeaders();
    void intents;
    throw new Error('Not implemented');
  }

  /**
   * Fetches intents associated with a given address.
   *
   * GET /v1/intent/account/:address
   *
   * TODO: Implement the GET request. Validate the response array with a
   * superstruct.
   *
   * @param address - The address to look up intents for.
   * @returns The array of intents for the address.
   */
  async getIntentsByAddress(
    address: string,
  ): Promise<SendIntentResponse[]> {
    // TODO: GET `${this.#baseUrl}/v1/intent/account/${address}`.
    // TODO: Include Authorization header via this.#authHeaders().
    // TODO: Throw on non-OK responses.
    // TODO: Validate response shape with superstruct before returning.
    // TODO: Consider using this.fetchQuery with a queryKey for caching.
    const _headers = await this.#authHeaders();
    void address;
    throw new Error('Not implemented');
  }

  /**
   * Creates a withdrawal for card spend flows.
   *
   * TODO: Confirm the endpoint path against CHOMP API docs.
   * TODO: Implement the POST request. Validate the response with a superstruct.
   *
   * @param request - The withdrawal request.
   * @returns The withdrawal result.
   */
  async createWithdrawal(
    request: CreateWithdrawalRequest,
  ): Promise<CreateWithdrawalResponse> {
    // TODO: Confirm endpoint path (e.g. POST `${this.#baseUrl}/v1/withdrawal`).
    // TODO: Include Authorization header via this.#authHeaders().
    // TODO: Throw on non-OK responses.
    // TODO: Validate response shape with superstruct before returning.
    const _headers = await this.#authHeaders();
    void request;
    throw new Error('Not implemented');
  }
}
