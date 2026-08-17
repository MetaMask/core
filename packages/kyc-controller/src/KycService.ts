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
import { encodeStorageAccessTokenForHeader } from './ukyc/storageAccessToken.js';
import type { UkycStorageAccessToken } from './ukyc/storageAccessToken.js';

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
  'getWrappingKey',
  'fetchJwks',
  'createUkycSession',
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
export type KycServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

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
   * default `staleTime`/`cacheTime`). Each data service gets its own
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

// The session server's X25519 public key, in JWK-like form, returned by
// `/wrapping-key`. `x` is the base64url public key used to wrap the user key.
const SessionServerPublicKeyStruct = type({
  kty: string(),
  crv: string(),
  x: string(),
});

const WrappingKeyResponseStruct = type({
  id: string(),
  jwtChain: string(),
  sessionServerPublicKey: SessionServerPublicKeyStruct,
});
export type WrappingKeyResponse = Infer<typeof WrappingKeyResponseStruct>;

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
  // The relay-side KYC decision (e.g. `approved`) and the vendor-side final
  // status (e.g. `pending`) at session-creation time. Present when the applicant
  // already has a session in flight; absent for a brand-new session.
  kycStatus: optional(string()),
  finalStatus: optional(string()),
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

export type GetWrappingKeyParams = {
  sessionClientPublicKey: string;
};

/**
 * The wrapped `data_encryption_key` sent to the UKYC backend when creating a
 * session. `encryptedKey` and `nonce` are produced by `wrapEncryptionKey`;
 * `sessionId` is the wrapping key id returned by `getWrappingKey`.
 */
export type WrappedEncryptionKey = {
  sessionId: string;
  encryptedKey: string;
  nonce: string;
};

export type CreateUkycSessionParams = {
  jwtToken: string;
  vendorMetadata: Record<string, unknown>;
  wrappedEncryptionKey: WrappedEncryptionKey;
  /**
   * The client-signed `ukyc_capability_token` (envelope: payload + Ed25519
   * signature) authorizing later storage access for this session. It is minted
   * by the client with `read`-only scope — see the UKYC storage-and-auth spec
   * for how it is formed. Only the client holds the signing key, so only the
   * client can mint it. The envelope is base64url-encoded into a compact string
   * before it is sent to the backend.
   */
  ukycCapabilityToken: UkycStorageAccessToken;
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
 * (`staleTime`/`cacheTime` of `0`) so they never serve a stale result.
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
   * encryption service, from which the JWKS used to verify the wrapping-key
   * `jwtChain` is fetched.
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
      cacheTime: 0,
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
      cacheTime: 0,
    });
    const { required } = this.#validateResponse(
      data,
      KycRequiredResponseStruct,
      'kyc-required',
    );
    return { kycRequired: required };
  }

  /**
   * Requests a per-session wrapping key from the UKYC backend.
   *
   * The client sends its ephemeral X25519 public key; the backend responds with
   * its session public key (`sessionServerPublicKey`) and a `jwtChain` that
   * attests it. The caller must verify `jwtChain` against the Fractal JWKS
   * (see {@link KycService.fetchJwks}) before trusting the key to wrap the
   * `data_encryption_key`.
   *
   * @param params - The parameters.
   * @param params.sessionClientPublicKey - Our ephemeral X25519 public key
   * (base64url).
   * @returns The wrapping key id, `jwtChain`, and session server public key.
   */
  async getWrappingKey(
    params: GetWrappingKeyParams,
  ): Promise<WrappingKeyResponse> {
    const url = new URL('/wrapping-key', this.#baseUrl);
    const data = await this.fetchQuery({
      queryKey: [`${this.name}:getWrappingKey`, params.sessionClientPublicKey],
      queryFn: async () =>
        this.#requestJson(url, {
          method: 'POST',
          body: JSON.stringify({
            sessionClientPublicKey: params.sessionClientPublicKey,
          }),
        }),
      // A per-session key exchange must always run fresh.
      staleTime: 0,
      cacheTime: 0,
    });
    return this.#validateResponse(
      data,
      WrappingKeyResponseStruct,
      'wrapping-key',
    );
  }

  /**
   * Fetches the Fractal encryption service JWKS used to verify the `jwtChain`
   * returned by {@link KycService.getWrappingKey}.
   *
   * This is an unauthenticated request to a well-known path on the Fractal
   * host, distinct from the UKYC base URL.
   *
   * @returns The JWKS keys.
   */
  async fetchJwks(): Promise<JwksResponse> {
    if (!this.#fractalEncryptionBaseUrl) {
      throw new Error(
        'KycService: fractalEncryptionBaseUrl is not configured; cannot fetch JWKS to verify the wrapping key.',
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
   * Creates a UKYC session for the SumSub document-verification sub-flow,
   * handing over the wrapped `data_encryption_key` and the client-signed,
   * read-only `ukyc_capability_token` that authorizes later storage access for
   * the session.
   *
   * @param params - The session parameters.
   * @returns The UKYC session identifiers.
   */
  async createUkycSession(
    params: CreateUkycSessionParams,
  ): Promise<UkycSessionResponse> {
    const url = new URL('/sessions', this.#baseUrl);
    const data = await this.fetchQuery({
      queryKey: [
        `${this.name}:createUkycSession`,
        params.wrappedEncryptionKey.sessionId,
      ],
      queryFn: async () =>
        this.#requestJson(url, {
          method: 'POST',
          body: JSON.stringify({
            vendorId: 'moonpay',
            vendorUserId: 'mockedId',
            jwtToken: params.jwtToken,
            vendorMetadata: params.vendorMetadata,
            wrappedEncryptionKey: params.wrappedEncryptionKey,
            ukycCapabilityToken: encodeStorageAccessTokenForHeader(
              params.ukycCapabilityToken,
            ),
          }),
        }),
      // A session-creating mutation must never serve a stale/cached result.
      staleTime: 0,
      cacheTime: 0,
    });
    return this.#validateResponse(
      data,
      UkycSessionResponseStruct,
      'UKYC sessions',
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
      cacheTime: 0,
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
      cacheTime: 0,
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
      if (!bearerToken) {
        throw new Error(
          'Unable to obtain an authentication bearer token — is the wallet signed in?',
        );
      }
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
