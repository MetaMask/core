import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import { array, validate } from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import type { ClaimsServiceMethodActions } from './ClaimsService-method-action-types.js';
import {
  ClaimStruct,
  ClaimsConfigurationsResponseStruct,
  GenerateSignatureMessageResponseStruct,
} from './ClaimsService-structs.js';
import {
  CLAIMS_API_URL_MAP,
  ClaimsServiceErrorMessages,
  SERVICE_NAME,
} from './constants.js';
import type { Env } from './constants.js';
import { createModuleLogger, projectLogger } from './logger.js';
import type {
  Claim,
  ClaimsConfigurationsResponse,
  GenerateSignatureMessageResponse,
} from './types.js';
import { createSentryError, getErrorFromResponse } from './utils.js';

const MESSENGER_EXPOSED_METHODS = [
  'fetchClaimsConfigurations',
  'getClaims',
  'getClaimById',
  'getRequestHeaders',
  'getClaimsApiUrl',
  'generateMessageForClaimSignature',
] as const;

const DEFAULT_POLICY_OPTIONS: CreateServicePolicyOptions = {
  maxRetries: 0,
};

/**
 * Invalidates cached queries for {@link ClaimsService}.
 */
export type ClaimsServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof SERVICE_NAME>;

/**
 * Actions that {@link ClaimsService} exposes to other consumers.
 */
export type ClaimsServiceActions =
  | ClaimsServiceMethodActions
  | ClaimsServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link ClaimsService} calls.
 */
export type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerTokenAction;

/**
 * Published when {@link ClaimsService}'s cache is updated.
 */
export type ClaimsServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof SERVICE_NAME
>;

/**
 * Published when a key within {@link ClaimsService}'s cache is updated.
 */
export type ClaimsServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof SERVICE_NAME>;

/**
 * Events that {@link ClaimsService} exposes to other consumers.
 */
export type ClaimsServiceEvents =
  | ClaimsServiceCacheUpdatedEvent
  | ClaimsServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link ClaimsService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link ClaimsService}.
 */
export type ClaimsServiceMessenger = Messenger<
  typeof SERVICE_NAME,
  ClaimsServiceActions | AllowedActions,
  ClaimsServiceEvents | AllowedEvents
>;

export type ClaimsServiceConfig = {
  env: Env;
  messenger: ClaimsServiceMessenger;
  fetchFunction: typeof fetch;
  captureException?: (error: Error) => void;
  queryClientConfig?: QueryClientConfig;
  policyOptions?: CreateServicePolicyOptions;
};

const log = createModuleLogger(projectLogger, 'ClaimsService');

/**
 * This service is responsible for communicating with the Claims API.
 *
 * All requests are authenticated via JWT Bearer tokens obtained from the
 * `AuthenticationController:getBearerToken` messenger action.
 */
export class ClaimsService extends BaseDataService<
  typeof SERVICE_NAME,
  ClaimsServiceMessenger
> {
  readonly #env: Env;

  readonly #fetch: typeof fetch;

  readonly #captureException?: (error: Error) => void;

  constructor({
    env,
    messenger,
    fetchFunction,
    captureException: captureExceptionFn,
    queryClientConfig = {},
    policyOptions = {},
  }: ClaimsServiceConfig) {
    super({
      name: SERVICE_NAME,
      messenger,
      queryClientConfig,
      policyOptions: { ...DEFAULT_POLICY_OPTIONS, ...policyOptions },
    });

    this.#env = env;
    this.#fetch = fetchFunction;
    this.#captureException = (error: Error): void => {
      try {
        (captureExceptionFn ?? messenger.captureException)?.(error);
      } catch {
        // ignore error thrown when calling captureException
      }
    };

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetch required configurations for the claims service.
   *
   * @returns The required configurations for the claims service.
   */
  async fetchClaimsConfigurations(): Promise<ClaimsConfigurationsResponse> {
    try {
      const configurations = await this.fetchQuery({
        queryKey: [`${this.name}:fetchClaimsConfigurations`],
        queryFn: async () => {
          const headers = await this.getRequestHeaders();
          const url = `${this.getClaimsApiUrl()}/configurations`;
          const response = await this.#fetch(url, {
            headers,
          });

          if (!response.ok) {
            throw await getErrorFromResponse(response);
          }

          return response.json();
        },
      });

      return this.#validateResponse(
        configurations,
        ClaimsConfigurationsResponseStruct,
        ClaimsServiceErrorMessages.FAILED_TO_FETCH_CONFIGURATIONS,
      );
    } catch (error) {
      return this.#handleError(
        'fetchClaimsConfigurations',
        ClaimsServiceErrorMessages.FAILED_TO_FETCH_CONFIGURATIONS,
        error,
      );
    }
  }

  /**
   * Get the claims for the current user.
   *
   * @returns The claims for the current user.
   */
  async getClaims(): Promise<Claim[]> {
    try {
      const claims = await this.fetchQuery({
        queryKey: [`${this.name}:getClaims`],
        queryFn: async () => {
          const headers = await this.getRequestHeaders();
          const url = `${this.getClaimsApiUrl()}/claims`;
          const response = await this.#fetch(url, {
            headers,
          });

          if (!response.ok) {
            throw await getErrorFromResponse(response);
          }

          return response.json();
        },
      });

      const [validationError, validatedClaims] = validate(
        claims,
        array(ClaimStruct),
      );
      if (validationError) {
        throw new Error(
          `${ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIMS}: ${validationError.message}`,
        );
      }

      return validatedClaims as Claim[];
    } catch (error) {
      return this.#handleError(
        'getClaims',
        ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIMS,
        error,
      );
    }
  }

  /**
   * Get the claim by id.
   *
   * @param id - The id of the claim to get.
   * @returns The claim by id.
   */
  async getClaimById(id: string): Promise<Claim> {
    try {
      const claim = await this.fetchQuery({
        queryKey: [`${this.name}:getClaimById`, id],
        queryFn: async () => {
          const headers = await this.getRequestHeaders();
          const url = `${this.getClaimsApiUrl()}/claims/byId/${id}`;
          const response = await this.#fetch(url, {
            headers,
          });

          if (!response.ok) {
            throw await getErrorFromResponse(response);
          }

          return response.json();
        },
      });

      return this.#validateResponse(
        claim,
        ClaimStruct,
        ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID,
      ) as Claim;
    } catch (error) {
      return this.#handleError(
        'getClaimById',
        ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID,
        error,
      );
    }
  }

  /**
   * Generate a message to be signed by the user for the claim request.
   *
   * @param chainId - The chain id of the claim.
   * @param walletAddress - The impacted wallet address of the claim.
   * @returns The message for the claim signature.
   */
  async generateMessageForClaimSignature(
    chainId: number,
    walletAddress: Hex,
  ): Promise<GenerateSignatureMessageResponse> {
    try {
      const headers = await this.getRequestHeaders();
      const url = `${this.getClaimsApiUrl()}/signature/generateMessage`;
      const response = await this.#fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chainId,
          walletAddress,
        }),
      });

      if (!response.ok) {
        throw await getErrorFromResponse(response);
      }

      const message = await response.json();

      return this.#validateResponse(
        message,
        GenerateSignatureMessageResponseStruct,
        ClaimsServiceErrorMessages.SIGNATURE_MESSAGE_GENERATION_FAILED,
      );
    } catch (error) {
      return this.#handleError(
        'generateMessageForClaimSignature',
        ClaimsServiceErrorMessages.SIGNATURE_MESSAGE_GENERATION_FAILED,
        error,
      );
    }
  }

  /**
   * Create the headers for the current request.
   *
   * @returns The headers for the current request.
   */
  async getRequestHeaders(): Promise<Record<string, string>> {
    const bearerToken = await this.messenger.call(
      'AuthenticationController:getBearerToken',
    );
    return {
      Authorization: `Bearer ${bearerToken}`,
    };
  }

  /**
   * Get the URL for the claims API for the current environment.
   *
   * @returns The URL for the claims API for the current environment.
   */
  getClaimsApiUrl(): string {
    return `${CLAIMS_API_URL_MAP[this.#env]}`;
  }

  #validateResponse<TValidated>(
    responseData: unknown,
    struct: Struct<TValidated>,
    errorMessage: string,
  ): TValidated {
    const [error, validatedResponseData] = validate(responseData, struct);
    if (error) {
      throw new Error(`${errorMessage}: ${error.message}`);
    }

    return validatedResponseData;
  }

  #handleError(
    methodName: string,
    errorMessage: string,
    error: unknown,
  ): never {
    log(methodName, error);
    this.#captureException?.(createSentryError(errorMessage, error as Error));
    throw new Error(errorMessage);
  }
}
