import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { HttpError } from '@metamask/controller-utils';
import type { GeolocationControllerGetGeolocationAction } from '@metamask/geolocation-controller';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationControllerGetBearerTokenAction } from '@metamask/profile-sync-controller/auth';
import type { Infer, Struct } from '@metamask/superstruct';
import {
  array,
  assert,
  boolean,
  optional,
  string,
  StructError,
  type,
} from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { Duration, inMilliseconds } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import { alpha2ToAlpha3 } from './countryCodes.js';
import type { KycServiceMethodActions } from './KycService-method-action-types.js';
import type { KycDisclaimer, KycSessionStatus } from './types.js';
import { UKYC_JWKS_PATH } from './ukyc/constants.js';

// === GENERAL ===

/**
 * The name of the {@link KycService}, used to namespace the service's actions.
 */
export const serviceName = 'KycService';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'getGeoCountry',
  'fetchDisclaimers',
  'createSession',
  'checkKycRequired',
  'fetchJwks',
  'createUkycSession',
  'setAuthorizations',
  'createJourney',
  'getSessionStatus',
] as const;

/**
 * Invalidates cached queries serviced by {@link KycService}.
 */
export type KycServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link KycService} exposes to other consumers.
 */
export type KycServiceActions =
  | KycServiceMethodActions
  | KycServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link KycService} calls.
 */
type AllowedActions =
  | AuthenticationControllerGetBearerTokenAction
  | GeolocationControllerGetGeolocationAction;

/**
 * Published when {@link KycService}'s cache is updated.
 */
export type KycServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

/**
 * Published when a single key within {@link KycService}'s cache is updated.
 */
export type KycServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link KycService} exposes to other consumers.
 */
export type KycServiceEvents =
  | KycServiceCacheUpdatedEvent
  | KycServiceGranularCacheUpdatedEvent;

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
  /**
   * Base url of the KYC api
   */
  baseUrl: string;
  /**
   * Base URL of the Fractal encryption api
   */
  fractalEncryptionBaseUrl: string;
  /**
   * Shared configuration applied to all queries exposed by the service (e.g. a
   * default `staleTime`/`gcTime`). Each data service gets its own
   * `QueryClient`.
   */
  queryClientConfig?: QueryClientConfig;
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

// The session server's public key, in JWK-like form, returned inside an
// encryption schema from `POST /sessions`. `x` is the base64url public key
// used to wrap a secret for that schema.
const ServerPublicKeyStruct = type({
  kty: string(),
  crv: string(),
  x: string(),
  kid: optional(string()),
  alg: optional(string()),
  use: optional(string()),
});

const EncryptionSchemaStruct = type({
  serverPublicKey: ServerPublicKeyStruct,
  jwtChain: string(),
});
export type EncryptionSchema = Infer<typeof EncryptionSchemaStruct>;

// A single Ed25519 (OKP) JWK. `type` (not `object`) keeps optional/extra JWK
// fields (`use`, `alg`) from failing validation.
const JwkStruct = type({
  kty: string(),
  crv: string(),
  x: string(),
  kid: string(),
});
const JwksResponseStruct = type({ keys: array(JwkStruct) });
export type JwksResponse = Infer<typeof JwksResponseStruct>;

const UkycSessionResponseStruct = type({
  sessionId: string(),
  // Per-secret wrapping material so the client can seal the
  // `data_encryption_key` and the `ukyc_capability_token` independently.
  encryptionDataKey: EncryptionSchemaStruct,
  ukycCapabilityToken: EncryptionSchemaStruct,
});
export type UkycSessionResponse = Infer<typeof UkycSessionResponseStruct>;

const ApplicantAccessTokenResponseStruct = type({
  status: string(),
  applicantAccessToken: string(),
});
export type ApplicantAccessTokenResponse = Infer<
  typeof ApplicantAccessTokenResponseStruct
>;

const SessionStatusResponseStruct = type({
  finalStatus: string(),
  statusMessage: optional(string()),
  externalUserId: string(),
  kycStatus: string(),
  vendor: string(),
  vendorStatus: string(),
});

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

/**
 * Encrypted capability authorization payload (base64url nonce + ciphertext)
 * accepted by `POST /sessions/:sessionId/authorizations`. Produced by
 * `wrapEncryptionKey` for both the `data_encryption_key` and the
 * `ukyc_capability_token`.
 */
export type CapabilityAuthorization = {
  nonce: string;
  data: string;
};

export type SetAuthorizationsParams = {
  sessionId: string;
  wrappedEncryptionDataKey: CapabilityAuthorization;
  wrappedUkycCapabilityToken: CapabilityAuthorization;
};

export type GetSessionStatusParams = {
  sessionId: string;
};

// === SERVICE DEFINITION ===

/**
 * `KycService` communicates with the Universal KYC (UKYC) backend to drive the
 * identity + document-verification flow. It is stateless and platform-agnostic:
 * HTTP is performed through the global `fetch`, and the auth bearer token and
 * geolocation come from other controllers via the messenger.
 *
 * It extends {@link BaseDataService}, so every request is routed through
 * `fetchQuery`: it is wrapped in the shared service policy (retries, circuit
 * breaker) and its result is exposed via the service's `QueryClient`. Read-only
 * endpoints (`fetchDisclaimers`, `fetchJwks`) are cached with a `staleTime`;
 * the session-creating and status-polling endpoints opt out of caching
 * (`staleTime`/`gcTime` of `0`) so they never serve a stale result.
 */
export class KycService extends BaseDataService<
  typeof serviceName,
  KycServiceMessenger
> {
  readonly #baseUrl: string;

  readonly #fractalEncryptionBaseUrl: string;

  /**
   * Constructs a new KycService.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this service.
   * @param options.baseUrl - Base URL of the KYC API
   * @param options.fractalEncryptionBaseUrl - Base URL of the Fractal
   * encryption service, from which the JWKS used to verify encryption-schema
   * `jwtChain`s is fetched.
   * @param options.queryClientConfig - Shared configuration for all queries
   * exposed by the service.
   * @param options.policyOptions - Options for the request service policy.
   */
  constructor({
    messenger,
    baseUrl,
    fractalEncryptionBaseUrl,
    queryClientConfig = {},
    policyOptions = {},
  }: KycServiceOptions) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      policyOptions,
    });
    this.#baseUrl = baseUrl;
    this.#fractalEncryptionBaseUrl = fractalEncryptionBaseUrl;
    this.messenger.registerMethodActionHandlers(
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
    const location = await this.messenger.call(
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
    const data = await this.fetchQuery({
      queryKey: [`${this.name}:fetchDisclaimers`, country],
      queryFn: async () => this.#requestJson(url, { method: 'GET' }),
      staleTime: inMilliseconds(5, Duration.Minute),
    });
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
    const data = await this.fetchQuery({
      queryKey: [
        `${this.name}:createSession`,
        params.email,
        params.termsAcceptedAt,
        params.disclaimerIds,
      ],
      queryFn: async () =>
        this.#requestJson(url, {
          method: 'POST',
          body: JSON.stringify(params),
        }),
      // A session-creating mutation must never serve a stale/cached result.
      staleTime: 0,
      gcTime: 0,
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
    const capabilities = params.capabilities ?? [{ product: 'ramps' }];
    const data = await this.fetchQuery({
      queryKey: [
        `${this.name}:checkKycRequired`,
        params.accessToken,
        params.country,
        capabilities,
      ],
      queryFn: async () =>
        this.#requestJson(url, {
          method: 'POST',
          body: JSON.stringify({
            accessToken: params.accessToken,
            country: params.country,
            capabilities,
          }),
        }),
      // The requirement can change server-side, so always re-check.
      staleTime: 0,
      gcTime: 0,
    });
    const { required } = this.#validateResponse(
      data,
      KycRequiredResponseStruct,
      'kyc-required',
    );
    return { kycRequired: required };
  }

  /**
   * Fetches the Fractal encryption service JWKS used to verify the `jwtChain`s
   * returned inside encryption schemas from {@link KycService.createUkycSession}.
   *
   * This is an unauthenticated request to a well-known path on the Fractal
   * host, distinct from the UKYC base URL.
   *
   * @returns The JWKS keys.
   */
  async fetchJwks(): Promise<JwksResponse> {
    if (!this.#fractalEncryptionBaseUrl) {
      throw new Error(
        'KycService: fractalEncryptionBaseUrl is not configured; cannot fetch JWKS to verify encryption schemas.',
      );
    }
    const url = new URL(UKYC_JWKS_PATH, this.#fractalEncryptionBaseUrl);
    const data = await this.fetchQuery({
      queryKey: [`${this.name}:fetchJwks`, this.#fractalEncryptionBaseUrl],
      queryFn: async () =>
        this.#requestJson(url, { method: 'GET' }, { authenticated: false }),
      staleTime: inMilliseconds(1, Duration.Hour),
    });
    return this.#validateResponse(data, JwksResponseStruct, 'JWKS');
  }

  /**
   * Creates a UKYC session for the SumSub document-verification sub-flow.
   *
   * The response carries per-secret encryption schemas (`encryptionDataKey` and
   * `ukycCapabilityToken`) so the client can wrap the `data_encryption_key` and
   * the read-only `ukyc_capability_token` and submit them via
   * {@link KycService.setAuthorizations}.
   *
   * @param params - The session parameters.
   * @returns The UKYC session id and encryption schemas.
   */
  async createUkycSession(
    params: CreateUkycSessionParams,
  ): Promise<UkycSessionResponse> {
    const url = new URL('/sessions', this.#baseUrl);
    const data = await this.fetchQuery({
      queryKey: [`${this.name}:createUkycSession`, params.jwtToken],
      queryFn: async () =>
        this.#requestJson(url, {
          method: 'POST',
          body: JSON.stringify({
            vendorId: 'moonpay',
            vendorUserId: 'mockedId',
            jwtToken: params.jwtToken,
            vendorMetadata: params.vendorMetadata,
          }),
        }),
      // A session-creating mutation must never serve a stale/cached result.
      staleTime: 0,
      gcTime: 0,
    });
    return this.#validateResponse(
      data,
      UkycSessionResponseStruct,
      'UKYC sessions',
    );
  }

  /**
   * Submits the wrapped `data_encryption_key` and wrapped
   * `ukyc_capability_token` for a UKYC session. Both secrets are sealed with
   * `wrapEncryptionKey` against the encryption schemas returned by
   * {@link KycService.createUkycSession}.
   *
   * @param params - The wrapped authorizations.
   * @returns The session status after the authorizations are applied.
   */
  async setAuthorizations(
    params: SetAuthorizationsParams,
  ): Promise<KycSessionStatus> {
    const url = new URL(
      `/sessions/${encodeURIComponent(params.sessionId)}/authorizations`,
      this.#baseUrl,
    );
    const data = await this.fetchQuery({
      queryKey: [`${this.name}:setAuthorizations`, params.sessionId],
      queryFn: async () =>
        this.#requestJson(url, {
          method: 'POST',
          body: JSON.stringify({
            wrappedEncryptionDataKey: params.wrappedEncryptionDataKey,
            wrappedUkycCapabilityToken: params.wrappedUkycCapabilityToken,
          }),
        }),
      staleTime: 0,
      gcTime: 0,
    });
    return this.#validateResponse(
      data,
      SessionStatusResponseStruct,
      'authorizations',
    );
  }

  /**
   * Creates (or refreshes) the SumSub verification journey for a UKYC session,
   * returning the applicant access token used to launch the SDK.
   *
   * @param sessionId - The UKYC session id from `createUkycSession`.
   * @returns The applicant access token and status.
   */
  async createJourney(
    sessionId: string,
  ): Promise<ApplicantAccessTokenResponse> {
    const url = new URL(
      `/sessions/${encodeURIComponent(sessionId)}/journey`,
      this.#baseUrl,
    );
    const data = await this.fetchQuery({
      queryKey: [`${this.name}:createJourney`, sessionId],
      queryFn: async () => this.#requestJson(url, { method: 'POST' }),
      // Journeys are (re)created on demand; do not reuse a cached token.
      staleTime: 0,
      gcTime: 0,
    });
    return this.#validateResponse(
      data,
      ApplicantAccessTokenResponseStruct,
      'journey',
    );
  }

  /**
   * Fetches the current status of a UKYC session. Polled after the SumSub SDK
   * completes to determine the final verification decision.
   *
   * @param params - The parameters.
   * @param params.sessionId - The UKYC session id.
   * @returns The session status.
   */
  async getSessionStatus(
    params: GetSessionStatusParams,
  ): Promise<KycSessionStatus> {
    const url = new URL(
      `/sessions/${encodeURIComponent(params.sessionId)}/status`,
      this.#baseUrl,
    );
    const data = await this.fetchQuery({
      queryKey: [`${this.name}:getSessionStatus`, params.sessionId],
      queryFn: async () => this.#requestJson(url, { method: 'GET' }),
      // Status is polled for a terminal decision, so it must always be fresh.
      staleTime: 0,
      gcTime: 0,
    });
    return this.#validateResponse(
      data,
      SessionStatusResponseStruct,
      'session status',
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
          : // `assert` only ever throws `StructError` for the plain structs used
            // here, so this is a defensive fallback that is not exercised.
            /* istanbul ignore next */
            String(error);
      throw new Error(
        `Malformed response received from ${apiName} API: ${detail}`,
      );
    }
  }

  /**
   * Performs a single JSON request.
   *
   * This is meant to be used as the `queryFn` for {@link fetchQuery}, which
   * wraps it in the shared service policy (retries, circuit breaker). Requests
   * are authenticated with the wallet bearer token by default; pass
   * `{ authenticated: false }` for calls to services that do not expect it
   * (e.g. the Fractal JWKS endpoint).
   *
   * @param url - The request URL.
   * @param init - The request init (method, body).
   * @param options - Request options.
   * @param options.authenticated - Whether to attach the bearer token. Defaults
   * to `true`.
   * @returns The parsed JSON response.
   */
  async #requestJson(
    url: URL,
    init: RequestInit,
    options: { authenticated?: boolean } = {},
  ): Promise<Json> {
    const { authenticated = true } = options;

    const headers: Record<string, string> = {};

    // Only advertise a JSON body when one is actually sent; bodyless requests
    // (e.g. `createJourney`) must not carry a `Content-Type`.
    if (init.body !== undefined && init.body !== null) {
      headers['Content-Type'] = 'application/json';
    }

    if (authenticated) {
      const bearerToken = await this.messenger.call(
        'AuthenticationController:getBearerToken',
      );
      assert(bearerToken, string());
      headers.Authorization = `Bearer ${bearerToken}`;
    }

    const response = await fetch(url.toString(), {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new HttpError(
        response.status,
        `Fetching '${url.toString()}' failed with status '${response.status}'`,
      );
    }

    return (await response.json()) as Json;
  }
}
