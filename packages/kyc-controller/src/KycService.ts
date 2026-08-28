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
  enums,
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
import type {
  KycConsentRecord,
  KycDisclaimer,
  KycSessionDisclaimers,
  KycSessionStatus,
  KycUserStatusResponse,
  KycVendor,
  KycVendorSigning,
} from './types.js';
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
  'createVendorCustomer',
  'submitVendorDisclaimers',
  'fetchSessionDisclaimers',
  'submitSessionDisclaimers',
  'fetchKycStatus',
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
   * A function used to make HTTP requests. Defaults to the runtime's native
   * `fetch`, so consumers do not need to inject one on platforms where `fetch`
   * is available globally (browser, React Native, Node 18+).
   */
  fetch?: typeof fetch;
  /**
   * Mandatory value that sets the base url to KYC api
   */
  baseUrl: string;
  /**
   * Base URL of the Fractal encryption service, from which the JWKS used to
   * verify encryption-schema `jwtChain`s is fetched.
   */
  fractalEncryptionBaseUrl?: string;
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

const VendorSigningStruct = type({
  id: string(),
  customer_id: string(),
  content_id: optional(string()),
});
const VendorSigningsResponseStruct = array(VendorSigningStruct);

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

// Vendor customer subset — `type` (not `object`) keeps extra vendor fields from
// failing validation while still requiring the fields the controller needs.
const VendorCustomerResponseStruct = type({
  id: string(),
  email: string(),
  status: string(),
});
export type VendorCustomerResponse = Infer<typeof VendorCustomerResponseStruct>;

const KYC_USER_STATUSES = [
  'not-started',
  'pending',
  'need-more-information',
  'terminal-failure',
  'completed',
] as const;

const KycUserStatusResponseStruct = type({
  status: enums([...KYC_USER_STATUSES]),
  sumsubSessionId: optional(string()),
  errorCode: optional(string()),
});

const ConsentDocumentStruct = type({
  key: string(),
  version: string(),
  title: string(),
  url: string(),
  consented: boolean(),
});

const SessionDisclaimersResponseStruct = type({
  idOS: array(ConsentDocumentStruct),
  kycProvider: array(ConsentDocumentStruct),
  credentialReusabilityConsentGiven: boolean(),
});

// === PARAM TYPES ===

export type CreateSessionParams = {
  email: string;
  termsAcceptedAt: string;
  disclaimerIds: string[];
};

export type CheckKycRequiredParams = {
  /**
   * Identity vendor to check. Defaults to `moonpay` for the existing
   * Check/Auth path.
   */
  vendor?: KycVendor;
  /**
   * MoonPay access token. Required when `vendor` is `moonpay` (or omitted).
   */
  accessToken?: string;
  /**
   * ISO 3166-1 alpha-3 country code. Required when `vendor` is `moonpay`.
   */
  country?: string;
  capabilities?: { product: string }[];
};

export type CreateVendorCustomerParams = {
  vendor: KycVendor;
  email: string;
};

export type SubmitVendorDisclaimersParams = {
  /** Identity vendor whose T&Cs were accepted (currently `iron`). */
  vendor: KycVendor;
  /** Disclaimer ids from {@link KycService.fetchDisclaimers}. */
  disclaimerIds: string[];
};

export type FetchSessionDisclaimersParams = {
  /** UKYC session id from {@link KycService.createUkycSession}. */
  sessionId: string;
};

export type SubmitSessionDisclaimersParams = {
  /** UKYC session id from {@link KycService.createUkycSession}. */
  sessionId: string;
  /** Consents to the idOS legal documents (`key`/`version` from the catalog). */
  idOS: KycConsentRecord[];
  /**
   * Consents to the KYC provider (SumSub) legal documents (`key`/`version`
   * from the catalog).
   */
  kycProvider: KycConsentRecord[];
  /** Consent to reuse the user's existing idOS credentials. */
  credentialReusabilityConsentGiven: boolean;
};

export type CreateUkycSessionParams = {
  jwtToken: string;
  /**
   * The client's per-session X25519 public key (unpadded base64url). Generated
   * with the matching private key used later to wrap authorizations, so the
   * session server can open those boxes.
   */
  sessionClientPublicKey: string;
  /**
   * Country of residence in ISO 3166-1 alpha-3 format (e.g. `USA`, `GBR`).
   */
  residenceCountry: string;
  /**
   * Identity vendor for the UKYC session. Defaults to `moonpay` for the
   * existing Check/Auth flow. Pass a non-MoonPay vendor (e.g. `iron`) for
   * the consents path (no MoonPay metadata required).
   */
  vendor?: KycVendor;
  /**
   * Vendor-specific metadata. Required for MoonPay (`moonPayAccessToken` /
   * `moonPayUserId`); optional / omitted for other vendors.
   */
  vendorMetadata?: Record<string, unknown>;
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
 * HTTP is performed through the runtime's native `fetch` (or an injected
 * `fetch` when provided), and the auth bearer token and geolocation come from
 * other controllers via the messenger.
 *
 * It extends {@link BaseDataService}, so read-only endpoints are routed through
 * `fetchQuery`: they are wrapped in the shared service policy (retries, circuit
 * breaker) and their results are exposed via the service's `QueryClient`.
 * `fetchDisclaimers` and `fetchJwks` are cached with a `staleTime`;
 * session-scoped disclaimer and status-polling reads opt out of caching
 * (`staleTime`/`gcTime` of `0`) so they never serve a stale result.
 *
 * Write endpoints (every `POST`) deliberately bypass `fetchQuery`. The query
 * cache is built for idempotent reads: it deduplicates concurrent requests
 * sharing a `queryKey`, retains responses for replay, and publishes them on the
 * messenger via `cacheUpdated`. None of that is safe for calls that create
 * sessions, customers, or consents — two overlapping `createVendorCustomer`
 * calls would collapse into a single `POST`, and session tokens would be
 * broadcast as cache payloads. Writes therefore call `#requestJson` directly,
 * which also means they are not retried by the service policy.
 */
export class KycService extends BaseDataService<
  typeof serviceName,
  KycServiceMessenger
> {
  readonly #fetch: typeof fetch;

  readonly #baseUrl: string;

  readonly #fractalEncryptionBaseUrl: string;

  /**
   * Constructs a new KycService.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this service.
   * @param options.fetch - A function used to make HTTP requests. Defaults to
   * the runtime's native `fetch`.
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
    fetch: fetchFunction,
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
    // Fall back to the runtime's native `fetch`, bound to `globalThis` so it
    // can be invoked as a method of this instance without an illegal-invocation
    // error on platforms that check the receiver.
    if (fetchFunction) {
      this.#fetch = fetchFunction;
    } else if (typeof globalThis.fetch === 'function') {
      this.#fetch = globalThis.fetch.bind(globalThis);
    } else {
      throw new Error(
        'KycService: fetch is not available globally and was not provided in options. Please inject a fetch implementation.',
      );
    }
    if (!baseUrl) {
      throw new Error('KycService: baseUrl is required');
    }
    this.#baseUrl = baseUrl;
    this.#fractalEncryptionBaseUrl = fractalEncryptionBaseUrl ?? '';
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
   * @param params.vendor - Identity vendor. Defaults to `moonpay`.
   * @param params.country - ISO 3166-1 alpha-3 country code.
   * @returns The disclaimers.
   */
  async fetchDisclaimers({
    vendor = 'moonpay',
    country,
  }: {
    vendor?: KycVendor;
    country: string;
  }): Promise<KycDisclaimer[]> {
    const url = new URL(`/vendors/${vendor}/disclaimers`, this.#baseUrl);
    url.searchParams.set('country', country);
    const data = await this.fetchQuery({
      queryKey: [`${this.name}:fetchDisclaimers`, vendor, country],
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
    const data = await this.#requestJson(url, {
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
   * Checks whether KYC is required for the given vendor, country, and
   * capabilities.
   *
   * @param params - The check parameters.
   * @returns Whether KYC is required.
   */
  async checkKycRequired(
    params: CheckKycRequiredParams,
  ): Promise<{ kycRequired: boolean }> {
    const vendor = params.vendor ?? 'moonpay';
    const url = new URL(`/vendors/${vendor}/kyc-required`, this.#baseUrl);
    const capabilities = params.capabilities ?? [{ product: 'ramps' }];
    const body =
      vendor === 'moonpay'
        ? {
            accessToken: params.accessToken,
            country: params.country,
            capabilities,
          }
        : {};

    // MoonPay requires accessToken and country; validate before making the request.
    if (vendor === 'moonpay') {
      if (!params.accessToken) {
        throw new Error(
          'checkKycRequired: accessToken is required for vendor "moonpay".',
        );
      }
      if (!params.country) {
        throw new Error(
          'checkKycRequired: country is required for vendor "moonpay".',
        );
      }
    }

    const data = await this.#requestJson(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const { required } = this.#validateResponse(
      data,
      KycRequiredResponseStruct,
      'kyc-required',
    );
    return { kycRequired: required };
  }

  /**
   * Creates (or resumes) an empty-shell customer for the authenticated
   * canonical user on the given identity vendor. Must run before showing
   * vendor T&C so the customer exists and resume logic can key off vendor
   * status.
   *
   * @param params - The parameters.
   * @param params.vendor - Identity vendor (e.g. `iron` for Money/VBA).
   * @param params.email - Email associated with the customer.
   * @returns The vendor customer record (subset validated for controller use).
   */
  async createVendorCustomer(
    params: CreateVendorCustomerParams,
  ): Promise<VendorCustomerResponse> {
    const url = new URL(`/vendors/${params.vendor}/customers`, this.#baseUrl);
    const data = await this.#requestJson(url, {
      method: 'POST',
      body: JSON.stringify({ email: params.email }),
    });
    console.log('============> createVendorCustomer', data);
    return this.#validateResponse(
      data,
      VendorCustomerResponseStruct,
      'vendor customers',
    );
  }

  /**
   * Records vendor T&C acceptance (`POST /vendors/{vendor}/disclaimers`).
   * For Iron this creates content signings from the disclaimer ids the
   * customer accepted. Session-scoped idOS / KYC-provider consents are
   * recorded separately via {@link submitSessionDisclaimers}. Retries re-POST
   * the same ids, matching the legacy `POST /consents` signing step.
   *
   * @param params - The parameters.
   * @param params.vendor - Identity vendor (e.g. `iron`).
   * @param params.disclaimerIds - Accepted vendor T&C ids.
   * @returns The vendor signing records.
   */
  async submitVendorDisclaimers(
    params: SubmitVendorDisclaimersParams,
  ): Promise<KycVendorSigning[]> {
    const url = new URL(
      `/vendors/${encodeURIComponent(params.vendor)}/disclaimers`,
      this.#baseUrl,
    );
    const data = await this.#requestJson(url, {
      method: 'POST',
      body: JSON.stringify({ disclaimerIds: params.disclaimerIds }),
    });
    return this.#validateResponse(
      data,
      VendorSigningsResponseStruct,
      'vendor disclaimers',
    );
  }

  /**
   * Fetches the session-scoped idOS + KYC-provider disclaimer catalog
   * (`GET /sessions/{sessionId}/disclaimers`). Requires an existing UKYC
   * session; vendor T&Cs continue to come from {@link fetchDisclaimers}.
   *
   * @param params - The parameters.
   * @param params.sessionId - The UKYC session id.
   * @returns The catalog, including which documents are already consented.
   */
  async fetchSessionDisclaimers(
    params: FetchSessionDisclaimersParams,
  ): Promise<KycSessionDisclaimers> {
    const url = new URL(
      `/sessions/${encodeURIComponent(params.sessionId)}/disclaimers`,
      this.#baseUrl,
    );
    const data = await this.fetchQuery({
      queryKey: [`${this.name}:fetchSessionDisclaimers`, params.sessionId],
      queryFn: async () => this.#requestJson(url, { method: 'GET' }),
      // Consent state can change after a POST, so always re-fetch.
      staleTime: 0,
      gcTime: 0,
    });
    return this.#validateResponse(
      data,
      SessionDisclaimersResponseStruct,
      'session disclaimers',
    );
  }

  /**
   * Records idOS + KYC-provider consents for a UKYC session
   * (`POST /sessions/{sessionId}/disclaimers`). `key`/`version` pairs must
   * match the current catalog from {@link fetchSessionDisclaimers}. A 409
   * means those document versions were already recorded for the session.
   *
   * @param params - The consent parameters.
   * @returns The updated catalog after recording.
   */
  async submitSessionDisclaimers(
    params: SubmitSessionDisclaimersParams,
  ): Promise<KycSessionDisclaimers> {
    const url = new URL(
      `/sessions/${encodeURIComponent(params.sessionId)}/disclaimers`,
      this.#baseUrl,
    );
    const data = await this.#requestJson(url, {
      method: 'POST',
      body: JSON.stringify({
        idOS: params.idOS,
        kycProvider: params.kycProvider,
        credentialReusabilityConsentGiven:
          params.credentialReusabilityConsentGiven,
      }),
    });
    return this.#validateResponse(
      data,
      SessionDisclaimersResponseStruct,
      'session disclaimers',
    );
  }

  /**
   * Fetches the user-keyed simplified KYC status used by Money toast / banner
   * surfaces (`GET /kyc/status`).
   *
   * @returns The simplified status payload.
   */
  async fetchKycStatus(): Promise<KycUserStatusResponse> {
    const url = new URL('/kyc/status', this.#baseUrl);
    const data = await this.fetchQuery({
      queryKey: [`${this.name}:fetchKycStatus`],
      queryFn: async () => this.#requestJson(url, { method: 'GET' }),
      // Status is polled for toast flips, so it must always be fresh.
      staleTime: 0,
      gcTime: 0,
    });
    return this.#validateResponse(
      data,
      KycUserStatusResponseStruct,
      'kyc status',
    );
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
   * The client registers its per-session X25519 public key so the server can
   * later open boxes sealed with the matching private key, and supplies the
   * customer's ISO 3166-1 alpha-3 country of residence. The response
   * carries per-secret encryption schemas (`encryptionDataKey` and
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
    const data = await this.#requestJson(url, {
      method: 'POST',
      body: JSON.stringify({
        vendorId: params.vendor ?? 'moonpay',
        vendorUserId: 'mockedId',
        jwtToken: params.jwtToken,
        sessionClientPublicKey: params.sessionClientPublicKey,
        residenceCountry: params.residenceCountry,
        vendorMetadata: params.vendorMetadata ?? {},
      }),
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
    const data = await this.#requestJson(url, {
      method: 'POST',
      body: JSON.stringify({
        wrappedEncryptionDataKey: params.wrappedEncryptionDataKey,
        wrappedUkycCapabilityToken: params.wrappedUkycCapabilityToken,
      }),
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
    const data = await this.#requestJson(url, { method: 'POST' });
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
   * Read endpoints pass this as the `queryFn` to {@link fetchQuery}, which
   * wraps it in the shared service policy (retries, circuit breaker). Write
   * endpoints call it directly, so they are executed exactly once. Requests
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
      if (!bearerToken) {
        throw new Error(
          'Unable to obtain an authentication bearer token — is the wallet signed in?',
        );
      }
      assert(bearerToken, string());
      headers.Authorization = `Bearer ${bearerToken}`;
    }

    const response = await this.#fetch(url.toString(), {
      ...init,
      headers,
    });
    if (!response.ok) {
      let detail = '';
      try {
        const errorBody: unknown = await response.json();
        if (errorBody && typeof errorBody === 'object') {
          const record = errorBody as Record<string, unknown>;
          if (typeof record.message === 'string') {
            detail = record.message;
          } else if (typeof record.error === 'string') {
            detail = record.error;
          }
        }
      } catch {
        // Ignore body parse failures; status alone is still useful.
      }
      throw new HttpError(
        response.status,
        `Fetching '${url.toString()}' failed with status '${response.status}'${
          detail ? `: ${detail}` : ''
        }`,
      );
    }

    // DELETE (and similar) endpoints return 204 No Content.
    if (response.status === 204) {
      return null;
    }

    return (await response.json()) as Json;
  }
}
