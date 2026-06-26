import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { Hex } from '@metamask/utils';

import {
  CLAIMS_API_URL_MAP,
  ClaimsServiceErrorMessages,
  SERVICE_NAME,
} from './constants';
import type { Env } from './constants';
import { createModuleLogger, projectLogger } from './logger';
import type {
  Claim,
  ClaimsConfigurationsResponse,
  GenerateSignatureMessageResponse,
} from './types';
import { createSentryError, getErrorFromResponse } from './utils';

export type ClaimsServiceFetchClaimsConfigurationsAction = {
  type: `${typeof SERVICE_NAME}:fetchClaimsConfigurations`;
  handler: ClaimsService['fetchClaimsConfigurations'];
};

export type ClaimsServiceGetClaimsAction = {
  type: `${typeof SERVICE_NAME}:getClaims`;
  handler: ClaimsService['getClaims'];
};

export type ClaimsServiceGetClaimByIdAction = {
  type: `${typeof SERVICE_NAME}:getClaimById`;
  handler: ClaimsService['getClaimById'];
};

export type ClaimsServiceGetRequestHeadersAction = {
  type: `${typeof SERVICE_NAME}:getRequestHeaders`;
  handler: ClaimsService['getRequestHeaders'];
};

export type ClaimsServiceGetClaimsApiUrlAction = {
  type: `${typeof SERVICE_NAME}:getClaimsApiUrl`;
  handler: ClaimsService['getClaimsApiUrl'];
};

export type ClaimsServiceGenerateMessageForClaimSignatureAction = {
  type: `${typeof SERVICE_NAME}:generateMessageForClaimSignature`;
  handler: ClaimsService['generateMessageForClaimSignature'];
};

export type ClaimsServiceActions =
  | ClaimsServiceFetchClaimsConfigurationsAction
  | ClaimsServiceGetClaimsAction
  | ClaimsServiceGetClaimByIdAction
  | ClaimsServiceGetRequestHeadersAction
  | ClaimsServiceGetClaimsApiUrlAction
  | ClaimsServiceGenerateMessageForClaimSignatureAction;

export type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerTokenAction;

export type ClaimsServiceEvents = never;

export type ClaimsServiceMessenger = Messenger<
  typeof SERVICE_NAME,
  ClaimsServiceActions | AllowedActions
>;

export type ClaimsServiceConfig = {
  env: Env;
  messenger: ClaimsServiceMessenger;
  fetchFunction: typeof fetch;
};

const log = createModuleLogger(projectLogger, 'ClaimsService');

export class ClaimsService {
  readonly name = SERVICE_NAME; // required for Modular Initialization

  readonly #env: Env;

  readonly #fetch: typeof fetch;

  readonly #messenger: ClaimsServiceMessenger;

  constructor({ env, messenger, fetchFunction }: ClaimsServiceConfig) {
    this.#env = env;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;

    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:fetchClaimsConfigurations`,
      this.fetchClaimsConfigurations.bind(this),
    );
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:getClaims`,
      this.getClaims.bind(this),
    );
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:getClaimById`,
      this.getClaimById.bind(this),
    );
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:getRequestHeaders`,
      this.getRequestHeaders.bind(this),
    );
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:getClaimsApiUrl`,
      this.getClaimsApiUrl.bind(this),
    );
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:generateMessageForClaimSignature`,
      this.generateMessageForClaimSignature.bind(this),
    );
  }

  /**
   * Fetch required configurations for the claims service.
   *
   * @returns The required configurations for the claims service.
   */
  async fetchClaimsConfigurations(): Promise<ClaimsConfigurationsResponse> {
    try {
      const headers = await this.getRequestHeaders();
      const url = `${this.getClaimsApiUrl()}/configurations`;
      const response = await this.#fetch(url, {
        headers,
      });

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        throw error;
      }

      const configurations = await response.json();
      return configurations;
    } catch (error) {
      log('fetchClaimsConfigurations', error);
      this.#messenger.captureException?.(
        createSentryError(
          ClaimsServiceErrorMessages.FAILED_TO_FETCH_CONFIGURATIONS,
          error as Error,
        ),
      );
      throw new Error(
        ClaimsServiceErrorMessages.FAILED_TO_FETCH_CONFIGURATIONS,
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
      const headers = await this.getRequestHeaders();
      const url = `${this.getClaimsApiUrl()}/claims`;
      const response = await this.#fetch(url, {
        headers,
      });

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        throw error;
      }

      const claims = await response.json();
      return claims;
    } catch (error) {
      log('getClaims', error);
      this.#messenger.captureException?.(
        createSentryError(
          ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIMS,
          error as Error,
        ),
      );
      throw new Error(ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIMS);
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
      const headers = await this.getRequestHeaders();
      const url = `${this.getClaimsApiUrl()}/claims/byId/${id}`;
      const response = await this.#fetch(url, {
        headers,
      });

      if (!response.ok) {
        const error = await getErrorFromResponse(response);
        throw error;
      }

      const claim = await response.json();
      return claim;
    } catch (error) {
      log('getClaimById', error);
      this.#messenger.captureException?.(
        createSentryError(
          ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID,
          error as Error,
        ),
      );
      throw new Error(ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID);
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
        const error = await getErrorFromResponse(response);
        throw error;
      }

      const message = await response.json();
      return message;
    } catch (error) {
      log('generateMessageForClaimSignature', error);
      this.#messenger.captureException?.(
        createSentryError(
          ClaimsServiceErrorMessages.SIGNATURE_MESSAGE_GENERATION_FAILED,
          error as Error,
        ),
      );
      throw new Error(
        ClaimsServiceErrorMessages.SIGNATURE_MESSAGE_GENERATION_FAILED,
      );
    }
  }

  /**
   * Create the headers for the current request.
   *
   * @returns The headers for the current request.
   */
  async getRequestHeaders(): Promise<Record<string, string>> {
    const bearerToken = await this.#messenger.call(
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
}
