import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { GeolocationControllerGetGeolocationAction } from '@metamask/geolocation-controller';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationControllerGetBearerTokenAction } from '@metamask/profile-sync-controller/auth';
import type { Infer, Struct } from '@metamask/superstruct';
import {
  array,
  assert,
  boolean,
  string,
  StructError,
  type,
} from '@metamask/superstruct';

import { alpha2ToAlpha3 } from './countryCodes';
import type { KycServiceMethodActions } from './KycService-method-action-types';
import type { KycDisclaimer } from './types';

// === GENERAL ===

/**
 * The name of the {@link KycService}, used to namespace the service's actions.
 */
export const serviceName = 'KycService';

/**
 * The supported environments for the Universal KYC API.
 */
export type KycServiceEnvironment = 'production' | 'development';

const KYC_API_URLS: Record<KycServiceEnvironment, string> = {
  production: 'https://kyc-api.cx.metamask.io',
  development: 'https://kyc-api.dev-api.cx.metamask.io',
};

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'getGeoCountry',
  'fetchDisclaimers',
  'createSession',
  'checkKycRequired',
  'createUkycSession',
  'submitWrappedKey',
] as const;

/**
 * Actions that {@link KycService} exposes to other consumers.
 */
export type KycServiceActions = KycServiceMethodActions;

/**
 * Actions from other messengers that {@link KycService} calls.
 */
type AllowedActions =
  | AuthenticationControllerGetBearerTokenAction
  | GeolocationControllerGetGeolocationAction;

/**
 * Events that {@link KycService} exposes to other consumers.
 */
export type KycServiceEvents = never;

/**
 * Events from other messengers that {@link KycService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link KycService}.
 */
export type KycServiceMessenger = Messenger<
  typeof serviceName,
  KycServiceActions | AllowedActions,
  KycServiceEvents | AllowedEvents
>;

/**
 * Options for constructing a {@link KycService}.
 */
export type KycServiceOptions = {
  messenger: KycServiceMessenger;
  fetch: typeof fetch;
  env: KycServiceEnvironment;
  /**
   * Overrides the base URL derived from `env`. When provided, this value is
   * used verbatim as the base URL for all requests, which is useful for
   * targeting a local or staging KYC API.
   */
  baseUrl?: string;
  policyOptions?: CreateServicePolicyOptions;
};

// === API RESPONSE SCHEMAS ===

const DisclaimerStruct = type({
  id: string(),
  display_name: string(),
  url: string(),
});
const DisclaimersResponseStruct = array(DisclaimerStruct);

const CreateSessionResponseStruct = type({ sessionToken: string() });

// The live KYC API returns the flag under `required`; the service normalizes
// this to `kycRequired` for consumers (see `checkKycRequired`).
const KycRequiredResponseStruct = type({ required: boolean() });

const UkycSessionResponseStruct = type({
  sessionId: string(),
  wrappingPublicKey: string(),
  idosSessionId: string(),
});
export type UkycSessionResponse = Infer<typeof UkycSessionResponseStruct>;

const WrappedKeyResponseStruct = type({
  status: string(),
  applicantAccessToken: string(),
});
export type WrappedKeyResponse = Infer<typeof WrappedKeyResponseStruct>;

// === PARAM TYPES ===

export type CreateSessionParams = {
  email: string;
  termsAcceptedAt: string;
  disclaimerIds: string[];
};

export type CheckKycRequiredParams = {
  accessToken: string;
  country: string;
  capabilities?: { product: string }[];
};

export type CreateUkycSessionParams = {
  jwtToken: string;
  vendorMetadata: Record<string, unknown>;
};

export type SubmitWrappedKeyParams = {
  sessionId: string;
  wrappedUserKey: string;
  idosSessionId: string;
  jwtToken: string;
};

// === SERVICE DEFINITION ===

/**
 * `KycService` communicates with the Universal KYC (UKYC) backend to drive the
 * identity + document-verification flow. It is stateless and platform-agnostic:
 * HTTP is performed through an injected `fetch`, and the auth bearer token and
 * geolocation come from other controllers via the messenger.
 */
export class KycService {
  readonly name: typeof serviceName;

  readonly #messenger: KycServiceMessenger;

  readonly #fetch: typeof fetch;

  readonly #baseUrl: string;

  readonly #policy: ServicePolicy;

  /**
   * Constructs a new KycService.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this service.
   * @param options.fetch - A function used to make HTTP requests.
   * @param options.env - The environment; determines the base URL.
   * @param options.baseUrl - Overrides the base URL derived from `env`.
   * @param options.policyOptions - Options for the request service policy.
   */
  constructor({
    messenger,
    fetch: fetchFunction,
    env,
    baseUrl,
    policyOptions,
  }: KycServiceOptions) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#baseUrl = baseUrl ?? KYC_API_URLS[env];
    this.#policy = createServicePolicy(policyOptions ?? {});
    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Resolves the customer's country from the geolocation source and converts it
   * to an ISO 3166-1 alpha-3 code.
   *
   * @returns The alpha-3 country code.
   * @throws If the country cannot be determined or mapped.
   */
  async getGeoCountry(): Promise<string> {
    const location = await this.#messenger.call(
      'GeolocationController:getGeolocation',
    );
    // Guard nullish/empty geolocation with the documented domain error rather
    // than letting `assert(location, string())` surface a superstruct
    // assertion error (which would change how the failure reads in
    // `disclaimersError`).
    const alpha2 =
      typeof location === 'string' ? location.split('-')[0].toUpperCase() : '';
    if (!alpha2 || alpha2 === 'UNKNOWN') {
      throw new Error(
        `Unable to determine country from geolocation (got "${String(
          location,
        )}").`,
      );
    }
    const alpha3 = alpha2ToAlpha3(alpha2);
    if (!alpha3) {
      throw new Error(
        `Unable to map country code "${alpha2}" to an ISO 3166-1 alpha-3 code.`,
      );
    }
    return alpha3;
  }

  /**
   * Fetches the disclaimers the customer must accept before a session is
   * created.
   *
   * @param params - The parameters.
   * @param params.country - ISO 3166-1 alpha-3 country code.
   * @returns The disclaimers.
   */
  async fetchDisclaimers({
    country,
  }: {
    country: string;
  }): Promise<KycDisclaimer[]> {
    const url = new URL('/vendors/moonpay/disclaimers', this.#baseUrl);
    url.searchParams.set('country', country);
    const data = await this.#request(url, { method: 'GET' });
    return this.#validateResponse(
      data,
      DisclaimersResponseStruct,
      'disclaimers',
    ) as KycDisclaimer[];
  }

  /**
   * Creates a vendor session via the UKYC backend.
   *
   * @param params - The session parameters.
   * @returns The created session token.
   */
  async createSession(
    params: CreateSessionParams,
  ): Promise<Infer<typeof CreateSessionResponseStruct>> {
    const url = new URL('/vendors/moonpay/sessions', this.#baseUrl);
    const data = await this.#request(url, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return this.#validateResponse(
      data,
      CreateSessionResponseStruct,
      'sessions',
    );
  }

  /**
   * Checks whether KYC is required for the given access token, country, and
   * capabilities.
   *
   * @param params - The check parameters.
   * @returns Whether KYC is required.
   */
  async checkKycRequired(
    params: CheckKycRequiredParams,
  ): Promise<{ kycRequired: boolean }> {
    const url = new URL('/vendors/moonpay/kyc-required', this.#baseUrl);
    const data = await this.#request(url, {
      method: 'POST',
      body: JSON.stringify({
        accessToken: params.accessToken,
        country: params.country,
        capabilities: params.capabilities ?? [{ product: 'ramps' }],
      }),
    });
    const { required } = this.#validateResponse(
      data,
      KycRequiredResponseStruct,
      'kyc-required',
    );
    return { kycRequired: required };
  }

  /**
   * Creates a UKYC session for the SumSub document-verification sub-flow.
   *
   * @param params - The session parameters.
   * @returns The UKYC session identifiers and wrapped key.
   */
  async createUkycSession(
    params: CreateUkycSessionParams,
  ): Promise<UkycSessionResponse> {
    const url = new URL('/sessions', this.#baseUrl);
    const data = await this.#request(url, {
      method: 'POST',
      body: JSON.stringify({
        vendorId: 'moonpay',
        vendorUserId: 'mockedId',
        jwtToken: params.jwtToken,
        vendorMetadata: params.vendorMetadata,
      }),
    });
    return this.#validateResponse(
      data,
      UkycSessionResponseStruct,
      'UKYC sessions',
    );
  }

  /**
   * Exchanges the wrapped user key for a SumSub applicant access token.
   *
   * @param params - The exchange parameters.
   * @returns The applicant access token and status.
   */
  async submitWrappedKey(
    params: SubmitWrappedKeyParams,
  ): Promise<WrappedKeyResponse> {
    const url = new URL(
      `/sessions/${encodeURIComponent(params.sessionId)}/wrapped-key`,
      this.#baseUrl,
    );
    const data = await this.#request(url, {
      method: 'POST',
      body: JSON.stringify({
        wrappedUserKey: params.wrappedUserKey,
        jwtToken: params.jwtToken,
        idosSessionId: params.idosSessionId,
      }),
    });
    return this.#validateResponse(
      data,
      WrappedKeyResponseStruct,
      'wrapped-key',
    );
  }

  /**
   * Validates a parsed API response against a superstruct schema, throwing a
   * descriptive error when the response does not match.
   *
   * Unlike a bare `Struct.is` check, this surfaces exactly which field was
   * missing or had the wrong type, which is essential for diagnosing shape
   * mismatches between the client and the live API.
   *
   * @param data - The parsed response body.
   * @param struct - The superstruct schema the body is expected to satisfy.
   * @param apiName - A human-readable name of the API, used in the error message.
   * @returns The validated, typed response.
   * @throws If `data` does not match `struct`.
   */
  #validateResponse<Type, Schema>(
    data: unknown,
    struct: Struct<Type, Schema>,
    apiName: string,
  ): Type {
    try {
      assert(data, struct);
      return data;
    } catch (error) {
      const detail =
        error instanceof StructError
          ? `${error.message} (received: ${JSON.stringify(data)})`
          : String(error);
      throw new Error(
        `Malformed response received from ${apiName} API: ${detail}`,
      );
    }
  }

  /**
   * Performs an authenticated JSON request wrapped in the service policy.
   *
   * @param url - The request URL.
   * @param init - The request init (method, body).
   * @returns The parsed JSON response.
   */
  async #request(url: URL, init: RequestInit): Promise<unknown> {
    const bearerToken = await this.#messenger.call(
      'AuthenticationController:getBearerToken',
    );
    assert(bearerToken, string());
    if (!bearerToken) {
      throw new Error(
        'Unable to obtain an authentication bearer token — is the wallet signed in?',
      );
    }

    const response = await this.#policy.execute(async () => {
      const localResponse = await this.#fetch(url.toString(), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
      });
      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Fetching '${url.toString()}' failed with status '${localResponse.status}'`,
        );
      }
      return localResponse;
    });

    return response.json();
  }
}
