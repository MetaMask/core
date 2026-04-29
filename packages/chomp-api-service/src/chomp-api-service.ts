import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import {
  array,
  boolean,
  create,
  enums,
  literal,
  number,
  optional,
  record,
  string,
  type,
} from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';
import { StrictHexStruct } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import type { ChompApiServiceMethodActions } from './chomp-api-service-method-action-types';
import type {
  AssociateAddressParams,
  AssociateAddressResponse,
  CreateUpgradeParams,
  UpgradeResponse,
  CreateWithdrawalParams,
  CreateWithdrawalResponse,
  IntentEntry,
  SendIntentParams,
  SendIntentResponse,
  ServiceDetailsResponse,
  VerifyDelegationParams,
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
  'getServiceDetails',
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
type AllowedActions = {
  type: 'AuthenticationController:getBearerToken';
  handler: (entropySourceId?: string) => Promise<string>;
};

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
  address: StrictHexStruct,
  status: string(),
});

const UpgradeResponseStruct = type({
  signerAddress: StrictHexStruct,
  status: string(),
  createdAt: string(),
});

const VerifyDelegationResponseStruct = type({
  valid: boolean(),
  delegationHash: optional(StrictHexStruct),
  errors: optional(array(string())),
});

const SendIntentResponseArrayStruct = array(
  type({
    delegationHash: StrictHexStruct,
    metadata: type({
      allowance: StrictHexStruct,
      tokenSymbol: string(),
      tokenAddress: StrictHexStruct,
      type: enums(['cash-deposit', 'cash-withdrawal']),
    }),
    createdAt: string(),
  }),
);

const IntentEntryArrayStruct = array(
  type({
    account: StrictHexStruct,
    delegationHash: StrictHexStruct,
    chainId: StrictHexStruct,
    status: enums(['active', 'revoked']),
    metadata: type({
      allowance: StrictHexStruct,
      tokenAddress: StrictHexStruct,
      tokenSymbol: string(),
      type: enums(['deposit', 'withdraw']),
    }),
  }),
);

const CreateWithdrawalResponseStruct = type({
  success: literal(true),
});

const ServiceDetailsProtocolStruct = type({
  supportedTokens: array(
    type({
      tokenAddress: StrictHexStruct,
      tokenDecimals: number(),
    }),
  ),
  adapterAddress: StrictHexStruct,
  intentTypes: array(enums(['cash-deposit', 'cash-withdrawal'])),
});

const ServiceDetailsResponseStruct = type({
  auth: type({
    message: string(),
  }),
  chains: record(
    StrictHexStruct,
    type({
      autoDepositDelegate: StrictHexStruct,
      protocol: record(string(), ServiceDetailsProtocolStruct),
    }),
  ),
});

// === SERVICE DEFINITION ===

/**
 * This service is responsible for communicating with the CHOMP API.
 *
 * All requests are authenticated via JWT Bearer tokens obtained from the
 * `AuthenticationController:getBearerToken` messenger action.
 */
export class ChompApiService extends BaseDataService<
  typeof serviceName,
  ChompApiServiceMessenger
> {
  readonly #baseUrl: string;

  /**
   * Constructs a new ChompApiService.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.baseUrl - The base URL of the CHOMP API.
   * @param args.queryClientConfig - Configuration for the underlying TanStack
   * Query client.
   * @param args.policyOptions - Options to pass to `createServicePolicy`.
   */
  constructor({
    messenger,
    baseUrl,
    queryClientConfig = {},
    policyOptions = {},
  }: {
    messenger: ChompApiServiceMessenger;
    baseUrl: string;
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
    const token = await this.messenger.call(
      'AuthenticationController:getBearerToken',
    );
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
   * @param params - The association params containing signature, timestamp,
   * and address.
   * @returns The profile association result. Returns on both 201 and 409.
   */
  async associateAddress(
    params: AssociateAddressParams,
  ): Promise<AssociateAddressResponse> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:associateAddress`, params],
      staleTime: 0,
      queryFn: async () => {
        const headers = await this.#authHeaders();
        const response = await fetch(
          new URL('/v1/auth/address', this.#baseUrl),
          {
            method: 'POST',
            headers,
            body: JSON.stringify(params),
          },
        );

        if (!response.ok && response.status !== 409) {
          throw new HttpError(
            response.status,
            `POST /v1/auth/address failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    return create(jsonResponse, AssociateAddressResponseStruct);
  }

  /**
   * Creates an account upgrade request.
   *
   * POST /v1/account-upgrade
   *
   * @param params - The upgrade params containing signature components and
   * chain details.
   * @returns The upgrade result.
   */
  async createUpgrade(params: CreateUpgradeParams): Promise<UpgradeResponse> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:createUpgrade`, params],
      staleTime: 0,
      queryFn: async () => {
        const headers = await this.#authHeaders();
        const response = await fetch(
          new URL('/v1/account-upgrade', this.#baseUrl),
          {
            method: 'POST',
            headers,
            body: JSON.stringify(params),
          },
        );

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `POST /v1/account-upgrade failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    return create(jsonResponse, UpgradeResponseStruct);
  }

  /**
   * Fetches the upgrade record for a given address.
   *
   * GET /v1/account-upgrade/:address
   *
   * @param address - The address to look up.
   * @returns The upgrade record, or null if not found.
   */
  async getUpgrade(address: Hex): Promise<UpgradeResponse | null> {
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
   * @param params - The delegation verification params.
   * @returns The verification result including validity and optional errors.
   */
  async verifyDelegation(
    params: VerifyDelegationParams,
  ): Promise<VerifyDelegationResponse> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:verifyDelegation`, params],
      staleTime: 0,
      queryFn: async () => {
        const headers = await this.#authHeaders();
        const response = await fetch(
          new URL('/v1/intent/verify-delegation', this.#baseUrl),
          {
            method: 'POST',
            headers,
            body: JSON.stringify(params),
          },
        );

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `POST /v1/intent/verify-delegation failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    return create(jsonResponse, VerifyDelegationResponseStruct);
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
    intents: SendIntentParams[],
  ): Promise<SendIntentResponse[]> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:createIntents`, intents],
      staleTime: 0,
      queryFn: async () => {
        const headers = await this.#authHeaders();
        const response = await fetch(new URL('/v1/intent', this.#baseUrl), {
          method: 'POST',
          headers,
          body: JSON.stringify(intents),
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `POST /v1/intent failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    return create(jsonResponse, SendIntentResponseArrayStruct);
  }

  /**
   * Fetches intents associated with a given address.
   *
   * GET /v1/intent/account/:address
   *
   * @param address - The address to look up intents for.
   * @returns The array of intents for the address.
   */
  async getIntentsByAddress(address: Hex): Promise<IntentEntry[]> {
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

    return create(jsonResponse, IntentEntryArrayStruct);
  }

  /**
   * Creates a withdrawal for card spend flows.
   *
   * POST /v1/withdrawal
   *
   * @param params - The withdrawal params containing chainId, amount
   * (decimal or hex string), and account address.
   * @returns The withdrawal result.
   */
  async createWithdrawal(
    params: CreateWithdrawalParams,
  ): Promise<CreateWithdrawalResponse> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:createWithdrawal`, params],
      staleTime: 0,
      queryFn: async () => {
        const headers = await this.#authHeaders();
        const response = await fetch(new URL('/v1/withdrawal', this.#baseUrl), {
          method: 'POST',
          headers,
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `POST /v1/withdrawal failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    return create(jsonResponse, CreateWithdrawalResponseStruct);
  }

  /**
   * Retrieves service details including delegation redeemer addresses and DeFi
   * contract details for signing delegations for auto-deposit functionality.
   *
   * GET /v1/chomp
   *
   * @param chainIds - Array of chain IDs (0x-prefixed hex strings) to retrieve
   * details for.
   * @returns The service details for the requested chains.
   */
  async getServiceDetails(chainIds: Hex[]): Promise<ServiceDetailsResponse> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:getServiceDetails`, chainIds],
      queryFn: async () => {
        const headers = await this.#authHeaders();
        const url = new URL('/v1/chomp', this.#baseUrl);
        url.searchParams.set('chainId', chainIds.join(','));
        const response = await fetch(url, { headers });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `GET /v1/chomp failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    return create(jsonResponse, ServiceDetailsResponseStruct);
  }
}
