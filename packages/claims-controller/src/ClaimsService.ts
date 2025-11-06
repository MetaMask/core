import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import {
  CLAIMS_API_URL,
  type Env,
  HttpContentTypeHeader,
  SERVICE_NAME,
} from './constants';
import type { Claim } from './types';

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

export type ClaimsServiceActions =
  | ClaimsServiceGetClaimsAction
  | ClaimsServiceGetClaimByIdAction
  | ClaimsServiceGetRequestHeadersAction
  | ClaimsServiceGetClaimsApiUrlAction;

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
  name = SERVICE_NAME; // required for Modular Initialization

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
  }

  /**
   * Get the claims for the current user.
   *
   * @returns The claims for the current user.
   */
  async getClaims(): Promise<Claim[]> {
    const headers = await this.getRequestHeaders();
    const url = this.getClaimsApiUrl();
    const response = await this.#fetch(url, {
      headers,
    });

    if (!response.ok) {
      throw new Error('Failed to get claims');
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
    const url = `${this.getClaimsApiUrl()}/byId/${id}`;
    const response = await this.#fetch(url, {
      headers,
    });

    if (!response.ok) {
      throw new Error('Failed to get claim by id');
    }

    const claim = await response.json();
    return claim;
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
    return `${CLAIMS_API_URL[this.#env]}/claims`;
  }
}
