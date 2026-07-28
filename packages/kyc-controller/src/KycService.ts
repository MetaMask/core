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
import { encodeStorageAccessTokenForHeader, UKYC_JWKS_PATH } from './ukyc';
import type { UkycStorageAccessToken } from './ukyc';

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
  'getWrappingKey',
  'fetchJwks',
  'createUkycSession',
  'fetchApplicantAccessToken',
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
  /**
   * Base URL of the Fractal encryption service, from which the JWKS used to
   * verify the `jwtChain` returned by {@link KycService.getWrappingKey} is
   * fetched. Required to run the wrapped-key exchange in
   * {@link KycService.fetchJwks}.
   */
  fractalEncryptionBaseUrl?: string;
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
  idosSessionId: string(),
});
export type UkycSessionResponse = Infer<typeof UkycSessionResponseStruct>;

const ApplicantAccessTokenResponseStruct = type({
  status: string(),
  applicantAccessToken: string(),
});
export type ApplicantAccessTokenResponse = Infer<
  typeof ApplicantAccessTokenResponseStruct
>;

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

export type FetchApplicantAccessTokenParams = {
  sessionId: string;
  idosSessionId: string;
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

  readonly #fractalEncryptionBaseUrl: string;

  readonly #policy: ServicePolicy;

  /**
   * Constructs a new KycService.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this service.
   * @param options.fetch - A function used to make HTTP requests.
   * @param options.env - The environment; determines the base URL.
   * @param options.baseUrl - Overrides the base URL derived from `env`.
   * @param options.fractalEncryptionBaseUrl - Base URL of the Fractal
   * encryption service, from which the JWKS used to verify the wrapping-key
   * `jwtChain` is fetched.
   * @param options.policyOptions - Options for the request service policy.
   */
  constructor({
    messenger,
    fetch: fetchFunction,
    env,
    baseUrl,
    fractalEncryptionBaseUrl,
    policyOptions,
  }: KycServiceOptions) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#baseUrl = baseUrl ?? KYC_API_URLS[env];
    this.#fractalEncryptionBaseUrl = fractalEncryptionBaseUrl ?? '';
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
    const data = await this.#request(url, {
      method: 'POST',
      body: JSON.stringify({
        sessionClientPublicKey: params.sessionClientPublicKey,
      }),
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
    const data = await this.#request(
      url,
      { method: 'GET' },
      { authenticated: false },
    );
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
    const data = await this.#request(url, {
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
    });
    return this.#validateResponse(
      data,
      UkycSessionResponseStruct,
      'UKYC sessions',
    );
  }

  /**
   * Fetches (or refreshes) the SumSub applicant access token for a UKYC
   * session.
   *
   * @param params - The parameters.
   * @param params.sessionId - The UKYC session id from `createUkycSession`.
   * @param params.idosSessionId - The idOS session id from `createUkycSession`.
   * @returns The applicant access token and status.
   */
  async fetchApplicantAccessToken(
    params: FetchApplicantAccessTokenParams,
  ): Promise<ApplicantAccessTokenResponse> {
    const url = new URL(
      `/sessions/${encodeURIComponent(params.sessionId)}/wrapped-key`,
      this.#baseUrl,
    );
    const data = await this.#request(url, {
      method: 'POST',
      body: JSON.stringify({ idosSessionId: params.idosSessionId }),
    });
    return this.#validateResponse(
      data,
      ApplicantAccessTokenResponseStruct,
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
   * Performs a JSON request wrapped in the service policy.
   *
   * Requests are authenticated with the wallet bearer token by default; pass
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
  async #request(
    url: URL,
    init: RequestInit,
    options: { authenticated?: boolean } = {},
  ): Promise<unknown> {
    const { authenticated = true } = options;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authenticated) {
      const bearerToken = await this.#messenger.call(
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

    const response = await this.#policy.execute(async () => {
      const localResponse = await this.#fetch(url.toString(), {
        ...init,
        headers,
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
