import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import {
  array,
  boolean,
  create,
  enums,
  literal,
  optional,
  string,
  type,
} from '@metamask/superstruct';
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
  IntentEntry,
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
export type ChompApiServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

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

// === RESPONSE VALIDATION ===

const AssociateAddressResponseStruct = type({
  profileId: string(),
  address: string(),
  status: string(),
});

const UpgradeResponseStruct = type({
  signerAddress: string(),
  status: string(),
  createdAt: string(),
});

const VerifyDelegationResponseStruct = type({
  valid: boolean(),
  delegationHash: optional(string()),
  errors: optional(array(string())),
});

const SendIntentResponseArrayStruct = array(
  type({
    delegationHash: string(),
    metadata: type({
      allowance: string(),
      tokenSymbol: string(),
      tokenAddress: string(),
      type: enums(['cash-deposit', 'cash-withdrawal']),
    }),
    createdAt: string(),
  }),
);

const IntentEntryArrayStruct = array(
  type({
    account: string(),
    delegationHash: string(),
    chainId: string(),
    status: enums(['active', 'revoked']),
    metadata: type({
      allowance: string(),
      tokenAddress: string(),
      tokenSymbol: string(),
      type: enums(['deposit', 'withdraw']),
    }),
  }),
);

const CreateWithdrawalResponseStruct = type({
  success: literal(true),
});

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

  readonly #mutationPolicy: ServicePolicy;

  /**
   * Constructs a new ChompApiService.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.baseUrl - The base URL of the CHOMP API.
   * @param args.getAccessToken - An async callback that returns a valid JWT
   * access token for authenticating requests.
   * @param args.queryClientConfig - Configuration for the underlying TanStack
   * Query client.
   * @param args.policyOptions - Options to pass to `createServicePolicy`.
   */
  constructor({
    messenger,
    baseUrl,
    getAccessToken,
    queryClientConfig = {},
    policyOptions = {},
  }: {
    messenger: ChompApiServiceMessenger;
    baseUrl: string;
    getAccessToken: () => Promise<string>;
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
    this.#mutationPolicy = createServicePolicy(policyOptions);

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
   * Makes an authenticated POST request to the CHOMP API.
   *
   * @param path - The URL path relative to the base URL.
   * @param body - The request body to serialize as JSON.
   * @param acceptedStatuses - HTTP status codes that should be returned rather
   * than treated as errors (e.g. 409 for conflict).
   * @returns The raw fetch Response.
   */
  async #postJson(
    path: string,
    body: unknown,
    acceptedStatuses: number[] = [],
  ): Promise<Response> {
    const headers = await this.#authHeaders();
    return this.#mutationPolicy.execute(async () => {
      const response = await fetch(new URL(path, this.#baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok && !acceptedStatuses.includes(response.status)) {
        throw new HttpError(
          response.status,
          `POST ${path} failed with status '${response.status}'`,
        );
      }

      return response;
    });
  }

  /**
   * Associates an address with a CHOMP profile.
   *
   * POST /v1/auth/address
   *
   * @param request - The association request containing signature, timestamp,
   * and address.
   * @returns The profile association result. Returns on both 201 and 409.
   */
  async associateAddress(
    request: AssociateAddressRequest,
  ): Promise<AssociateAddressResponse> {
    const response = await this.#postJson('/v1/auth/address', request, [409]);
    const json = await response.json();
    return create(json, AssociateAddressResponseStruct);
  }

  /**
   * Creates an account upgrade request.
   *
   * POST /v1/account-upgrade
   *
   * @param request - The upgrade request containing signature components and
   * chain details.
   * @returns The upgrade result.
   */
  async createUpgrade(
    request: CreateUpgradeRequest,
  ): Promise<CreateUpgradeResponse> {
    const response = await this.#postJson('/v1/account-upgrade', request);
    const json = await response.json();
    return create(json, UpgradeResponseStruct);
  }

  /**
   * Fetches the upgrade record for a given address.
   *
   * GET /v1/account-upgrade/:address
   *
   * @param address - The address to look up.
   * @returns The upgrade record, or null if not found.
   */
  async getUpgrade(address: string): Promise<GetUpgradeResponse | null> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:getUpgrade`, address],
      queryFn: async () => {
        const headers = await this.#authHeaders();
        const response = await fetch(
          new URL(`/v1/account-upgrade/${address}`, this.#baseUrl),
          { headers },
        );

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Get upgrade request failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    if (jsonResponse === null) {
      return null;
    }

    return create(jsonResponse, UpgradeResponseStruct);
  }

  /**
   * Verifies a delegation signature.
   *
   * POST /v1/intent/verify-delegation
   *
   * @param request - The delegation verification request.
   * @returns The verification result including validity and optional errors.
   */
  async verifyDelegation(
    request: VerifyDelegationRequest,
  ): Promise<VerifyDelegationResponse> {
    const response = await this.#postJson(
      '/v1/intent/verify-delegation',
      request,
    );
    const json = await response.json();
    return create(json, VerifyDelegationResponseStruct);
  }

  /**
   * Submits one or more intents to the CHOMP API.
   *
   * POST /v1/intent
   *
   * @param intents - The array of intents to submit.
   * @returns The array of intent responses.
   */
  async createIntents(
    intents: SendIntentRequest[],
  ): Promise<SendIntentResponse[]> {
    const response = await this.#postJson('/v1/intent', intents);
    const json = await response.json();
    return create(json, SendIntentResponseArrayStruct) as SendIntentResponse[];
  }

  /**
   * Fetches intents associated with a given address.
   *
   * GET /v1/intent/account/:address
   *
   * @param address - The address to look up intents for.
   * @returns The array of intents for the address.
   */
  async getIntentsByAddress(address: string): Promise<IntentEntry[]> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:getIntentsByAddress`, address],
      queryFn: async () => {
        const headers = await this.#authHeaders();
        const response = await fetch(
          new URL(`/v1/intent/account/${address}`, this.#baseUrl),
          { headers },
        );

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Get intents request failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    return create(jsonResponse, IntentEntryArrayStruct) as IntentEntry[];
  }

  /**
   * Creates a withdrawal for card spend flows.
   *
   * POST /v1/withdrawal
   *
   * @param request - The withdrawal request containing chainId, amount
   * (decimal or hex string), and account address.
   * @returns The withdrawal result.
   */
  async createWithdrawal(
    request: CreateWithdrawalRequest,
  ): Promise<CreateWithdrawalResponse> {
    const response = await this.#postJson('/v1/withdrawal', request);
    const json = await response.json();
    return create(json, CreateWithdrawalResponseStruct);
  }
}
