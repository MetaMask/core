import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { Hex } from '@metamask/utils';

import {
  CLAIMS_API_URL,
  ClaimsServiceErrorMessages,
  type Env,
  HttpContentTypeHeader,
  SERVICE_NAME,
} from './constants';
import type { Claim, GenerateSignatureMessageResponse } from './types';

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
  | ClaimsServiceGetClaimsAction
  | ClaimsServiceGetClaimByIdAction
  | ClaimsServiceGetRequestHeadersAction
  | ClaimsServiceGetClaimsApiUrlAction
  | ClaimsServiceGenerateMessageForClaimSignatureAction;

export type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerToken;

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
   * Get the claims for the current user.
   *
   * @returns The claims for the current user.
   */
  async getClaims(): Promise<Claim[]> {
    const headers = await this.getRequestHeaders();
    const url = `${this.getClaimsApiUrl()}/claims`;
    const response = await this.#fetch(url, {
      headers,
    });

    if (!response.ok) {
      throw new Error(ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIMS);
    }

    const claims = await response.json();
    return claims;
  }

  /**
   * Get the claim by id.
   *
   * @param id - The id of the claim to get.
   * @returns The claim by id.
   */
  async getClaimById(id: string): Promise<Claim> {
    const headers = await this.getRequestHeaders();
    const url = `${this.getClaimsApiUrl()}/claims/byId/${id}`;
    const response = await this.#fetch(url, {
      headers,
    });

    if (!response.ok) {
      throw new Error(ClaimsServiceErrorMessages.FAILED_TO_GET_CLAIM_BY_ID);
    }

    const claim = await response.json();
    return claim;
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
    const headers = await this.getRequestHeaders();
    const url = `${this.getClaimsApiUrl()}/signature/generateMessage`;
    const response = await this.#fetch(url, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        chainId,
        walletAddress,
      }),
    });

    if (!response.ok) {
      throw new Error(
        ClaimsServiceErrorMessages.SIGNATURE_MESSAGE_GENERATION_FAILED,
      );
    }

    const message = await response.json();
    return message;
  }

  /**
   * Create the headers for the current request.
   *
   * @param contentType - The content type of the request. Defaults to 'application/json'.
   * @returns The headers for the current request.
   */
  async getRequestHeaders(
    contentType: HttpContentTypeHeader = HttpContentTypeHeader.APPLICATION_JSON,
  ): Promise<Record<string, string>> {
    const bearerToken = await this.#messenger.call(
      'AuthenticationController:getBearerToken',
    );
    return {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': contentType,
    };
  }

  /**
   * Get the URL for the claims API for the current environment.
   *
   * @returns The URL for the claims API for the current environment.
   */
  getClaimsApiUrl(): string {
    return `${CLAIMS_API_URL[this.#env]}`;
  }
}
