import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  UserStorageControllerPerformGetStorageAction,
  UserStorageControllerPerformSetStorageAction,
} from '@metamask/profile-sync-controller/user-storage';
import type { Json } from '@metamask/utils';
import { stringToBytes } from '@metamask/utils';
import { x25519 } from '@noble/curves/ed25519';

import { toBase64Url } from './encoding.js';
import type { KycControllerMethodActions } from './KycController-method-action-types.js';
import type { KycServiceMethodActions } from './KycService-method-action-types.js';
import type {
  CreateUkycSessionParams,
  EncryptionSchema,
} from './KycService.js';
import { controllerLog } from './logger.js';
import type {
  KycConsentRecord,
  KycDisclaimer,
  KycPhase,
  KycProduct,
  KycProviderDisclaimersAccepted,
  KycSessionDisclaimers,
  KycSessionStatus,
  KycSumSubLauncher,
  KycSumSubSdkStatus,
  KycSumSubStatus,
  KycUserStatus,
  KycVendor,
  KycVendorDisclaimersAccepted,
} from './types.js';
import { deriveClientMaterial } from './ukyc/deriveClientMaterial.js';
import { verifyJwtChain } from './ukyc/jwtChain.js';
import type { Jwk } from './ukyc/jwtChain.js';
import {
  getOrCreateLocalUserSecret,
  UkycLocalUserSecretStore,
} from './ukyc/localUserSecret.js';
import {
  encodeStorageAccessTokenForHeader,
  signStorageAccessToken,
} from './ukyc/storageAccessToken.js';
import { wrapEncryptionKey } from './ukyc/wrapEncryptionKey.js';

// === GENERAL ===

export const controllerName = 'KycController';

// Placeholder credentials for the SumSub sub-flow. These are demo values that
// must be replaced with real UKYC-issued material before production use.
const MOCK_JWT_TOKEN = 'mock-jwt-token';

// Lifetime of the read-only `ukyc_capability_token` minted when creating a
// UKYC session. The storage-and-auth spec requires the token's `expires_at` to
// cover the KYC session's expected lifetime — including the provider journey —
// rather than a fixed short window, so this is a session-scoped window.
const UKYC_CAPABILITY_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

// SumSub statuses that mean the applicant submitted (see `KycSumSubSdkStatus`
// for what each one reports). `Completed` covers launchers that normalize the
// platform status before forwarding it. Review decisions (`Approved`,
// `FinallyRejected`, `TemporarilyDeclined`) are post-submission outcomes: the
// applicant finished the SDK, so UKYC is queried for the authoritative
// decision. Pre-submission statuses (`Ready`, `Initial`, `Incomplete`) must
// not be recorded as a completed verification.
const SUMSUB_COMPLETED_STATUSES: ReadonlySet<string> =
  new Set<KycSumSubSdkStatus>([
    'Completed',
    'Pending',
    'Approved',
    'ActionCompleted',
    'FinallyRejected',
    'TemporarilyDeclined',
  ]);

// The only status meaning the SDK could not run, rather than reporting how far
// the applicant got before closing it.
const SUMSUB_FAILED_STATUS: KycSumSubSdkStatus = 'Failed';

/**
 * Checks whether a SumSub status means the applicant submitted the flow.
 *
 * @param status - Status from a launcher callback or launch result.
 * @returns Whether the applicant submitted, including a review decision.
 */
function isSumSubFlowCompleted(status: unknown): boolean {
  return typeof status === 'string' && SUMSUB_COMPLETED_STATUSES.has(status);
}

/**
 * Checks whether the SDK failed to run, as opposed to the applicant closing it
 * early. Only the former is worth reporting as an error.
 *
 * @param result - The result the launcher resolved with.
 * @returns Whether the SDK failed to run.
 */
function isSumSubLaunchFailure(result: Record<string, unknown>): boolean {
  return (
    result.status === SUMSUB_FAILED_STATUS || typeof result.error === 'string'
  );
}

// UKYC status values. `kycStatus` (the relay-side decision) and `finalStatus`
// (the vendor-side outcome) draw from the same vocabulary, so they are defined
// once here and composed into the sets/checks below rather than repeated as
// literals.
const KYC_STATUSES = {
  approved: 'approved',
  completed: 'completed',
  rejected: 'rejected',
  failed: 'failed',
  blocked: 'blocked',
  pending: 'pending',
} as const;


// === STATE ===

/**
 * Describes the shape of the state object for {@link KycController}.
 */
export type KycControllerState = {
  /** Email associated with the session (sourced from the account). */
  email: string | null;

  vendor: KycVendor | null;

  /** Resolved ISO 3166-1 alpha-3 country code. */
  geoCountry: string | null;

  /**
   * Persisted vendor-disclaimer acceptance (T&C1) with fixed `moonpay` and
   * `iron` keys. MoonPay stores only `termsAcceptedAt`; Iron stores
   * `disclaimerIds`.
   */
  vendorDisclaimersAccepted: KycVendorDisclaimersAccepted;
  /**
   * KYC-provider disclaimer documents the customer accepted during the last
   * terms acceptance (persisted `{ key, version }` records under `sumsub`).
   * Consents-path vendors require this when resuming a session. `null` for
   * acceptance recorded before this field existed (treated as requiring
   * reacceptance).
   */
  providerDisclaimersAccepted: KycProviderDisclaimersAccepted;
  /**
   * idOS disclaimer documents the customer accepted during the last terms
   * acceptance (persisted `{ key, version }` records). Consents-path vendors
   * require this when resuming a session. `null` for acceptance recorded
   * before this field existed (treated as requiring reacceptance).
   */
  idosDisclaimersAccepted: KycConsentRecord[] | null;
  /**
   * Whether the customer consented to reuse existing idOS credentials
   * during this session. Applied when recording session-scoped disclaimers.
   * Not persisted: a new UKYC session must collect reuse consent again.
   * `null` when never set (treated as `false`).
   */
  credentialReusabilityConsentGiven: boolean | null;
};

const kycControllerMetadata = {
  email: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: false,
  },
  vendor: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  geoCountry: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  vendorDisclaimersAccepted: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  providerDisclaimersAccepted: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  idosDisclaimersAccepted: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  credentialReusabilityConsentGiven: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: false,
  },
} satisfies StateMetadata<KycControllerState>;

/**
 * Constructs the default {@link KycVendorDisclaimersAccepted} value.
 *
 * @returns The default vendor-disclaimer acceptance map.
 */
export function getDefaultKycVendorDisclaimersAccepted(): KycVendorDisclaimersAccepted {
  return { moonpay: null, iron: null };
}

export function getDefaultKycProviderDisclaimersAccepted(): KycProviderDisclaimersAccepted {
  return { sumsub: null };
}

/**
 * Constructs the default {@link KycController} state.
 *
 * @returns The default state.
 */
export function getDefaultKycControllerState(): KycControllerState {
  return {
    email: null,
    vendor: null,
    geoCountry: null,
    vendorDisclaimersAccepted: getDefaultKycVendorDisclaimersAccepted(),
    providerDisclaimersAccepted: getDefaultKycProviderDisclaimersAccepted(),
    idosDisclaimersAccepted: null,
    credentialReusabilityConsentGiven: null,
  };
}

/**
 * Whether an error indicates the applicant already finished KYC — the UKYC /
 * relay `session_not_in_valid_state` signal — which the controller maps to the
 * simplified `completed` user status.
 *
 * @param error - The caught error.
 * @returns `true` when the error carries the `session_not_in_valid_state`
 * marker.
 */
function isSessionAlreadyCompletedError(error: unknown): boolean {
  return String(error).includes(SESSION_NOT_IN_VALID_STATE);
}

/**
 * Parameters for {@link KycController.fetchSessionDisclaimers}. Provide
 * exactly one of `sessionId` or `country`.
 */
export type FetchSessionDisclaimersParams =
  | {
      /** UKYC session id from `KycService.createUkycSession`. */
      sessionId: string;
      country?: never;
    }
  | {
      /** ISO 3166-1 alpha-3 country code for `GET /disclaimers?country=`. */
      country: string;
      sessionId?: never;
    };

// === MESSENGER ===

// TODO: Update this
const MESSENGER_EXPOSED_METHODS = [
] as const;

export type KycControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  KycControllerState
>;

export type KycControllerActions =
  | KycControllerGetStateAction
  | KycControllerMethodActions;

type AllowedActions =
  | KycServiceMethodActions
  | UserStorageControllerPerformGetStorageAction
  | UserStorageControllerPerformSetStorageAction;

export type KycControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  KycControllerState
>;

/**
 * Published when the user-keyed simplified KYC status changes (Money toast).
 */
export type KycControllerStatusChangedEvent = {
  type: `${typeof controllerName}:statusChanged`;
  payload: [
    {
      status: KycUserStatus;
      sumsubSessionId: string | null;
      errorCode: string | null;
    },
  ];
};

export type KycControllerEvents =
  | KycControllerStateChangeEvent
  | KycControllerStatusChangedEvent;

type AllowedEvents = never;

export type KycControllerMessenger = Messenger<
  typeof controllerName,
  KycControllerActions | AllowedActions,
  KycControllerEvents | AllowedEvents
>;

/**
 * Options for constructing a {@link KycController}.
 */
export type KycControllerOptions = {
  messenger: KycControllerMessenger;
  state?: Partial<KycControllerState>;
  /**
   * Platform adapter that presents the SumSub SDK. Injected by each client so
   * the controller stays platform-agnostic.
   */
  sumsubLauncher: KycSumSubLauncher;
};

// === CONTROLLER DEFINITION ===

/**
 * `KycController` orchestrates the vendor-backed KYC / identity-verification
 * flow (MoonPay identity + SumSub documents) behind a vendor-neutral, per
 * product surface used by ramps and card. It owns all state and HTTP
 * orchestration (via `KycService`), while vendor protocol handling and
 * platform-specific presentation (WebView/iframe, SumSub SDK) are delegated.
 */
export class KycController extends BaseController<
  typeof controllerName,
  KycControllerState,
  KycControllerMessenger
> {
  readonly #sumsubLauncher: KycSumSubLauncher;

  readonly #localUserSecretStore: UkycLocalUserSecretStore;

  /**
   * Constructs a new {@link KycController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - Partial initial state; merged over defaults.
   * @param options.sumsubLauncher - The platform SumSub launcher adapter.
   */
  constructor({
    messenger,
    state,
    sumsubLauncher,
  }: KycControllerOptions) {
    super({
      messenger,
      metadata: kycControllerMetadata,
      name: controllerName,
      state: { ...getDefaultKycControllerState(), ...state },
    });

    this.#sumsubLauncher = sumsubLauncher;
    this.#localUserSecretStore = new UkycLocalUserSecretStore(this.messenger);

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  async initialize(params: {
    email: string;
    vendor: KycVendor;
    geoCountry: string;
  }): Promise<void> {
    if (this.state.email !== null || this.state.email !== params.email) {
      throw new Error('KycController already initialized with a different email');
    }
    if (this.state.vendor !== null || this.state.vendor !== params.vendor) {
      throw new Error('KycController already initialized with a different vendor');
    }
    if (this.state.geoCountry !== null || this.state.geoCountry !== params.geoCountry) {
      throw new Error('KycController already initialized with a different geoCountry');
    }

    // await this.messenger.call('KycService:getGeoCountry')

    this.update((state) => {
      state.email = params.email;
      state.vendor = params.vendor;
      state.geoCountry = params.geoCountry;
    });

    // TODO: check to see if there is an existing session
  }

  async reset(): Promise<void> {
    // TODO: stop polling here
    this.clearState();
  }

  clearState(): void {
    this.update((state) => {
      state.email = null;
      state.vendor = null;
      state.geoCountry = null;
    });
  }


  /**
   * Creates a UKYC session, wraps the `data_encryption_key` and
   * `ukyc_capability_token` against the returned encryption schemas, and
   * submits both via authorizations. Stores `sumsub.sessionId`.
   *
   * @returns The created session.
   */
  async #createUkycSession(): Promise<{
    sessionId: string;
    kycStatus?: string;
    finalStatus?: string;
  }> {
    const jwtToken = MOCK_JWT_TOKEN;

    // Establish a per-session X25519 keypair used to seal both secrets. The
    // private half stays on the device; the public half is registered on the
    // session so the server can open later authorizations. Each encryption
    // schema from session creation supplies the matching server public key.
    const sessionClientPrivateKey = x25519.utils.randomSecretKey();
    const sessionClientPublicKey = toBase64Url(
      x25519.getPublicKey(sessionClientPrivateKey),
    );
    // Residence is the ISO 3166-1 alpha-3 country already resolved for
    // disclaimers / KYC-required; fetch it if this sub-flow started without
    // that earlier step.
    const residenceCountry =
      this.state.geoCountry ??
      (await this.messenger.call('KycService:getGeoCountry'));
    if (residenceCountry !== this.state.geoCountry) {
      this.#applyUpdate((state) => {
        state.geoCountry = residenceCountry;
      });
    }

    const {
      sessionId,
      encryptionDataKey,
      ukycCapabilityToken: capabilityTokenSchema,
    } = await this.messenger.call('KycService:createUkycSession', {
      jwtToken,
      sessionClientPublicKey,
      residenceCountry,
      vendor: this.state.vendor,
    });

    // Verify each schema's jwtChain against the matching issuer JWKS, then
    // confirm the returned server public key matches the value attested inside
    // the verified JWT payload before trusting it for wrapping.
    // `encryptionDataKey` is attested by the idOS enclave; `ukycCapabilityToken` by the
    // idOS relay.
    const [{ keys: idosEnclaveKeys }, { keys: idosRelayKeys }] =
      await Promise.all([
        this.messenger.call('KycService:fetchIdosEnclaveJwks'),
        this.messenger.call('KycService:fetchIdosRelayJwks'),
      ]);
    this.#assertAttestedServerPublicKey(idosEnclaveKeys, encryptionDataKey);
    this.#assertAttestedServerPublicKey(idosRelayKeys, capabilityTokenSchema);

    // Derive the data_encryption_key from the local_user_secret, mint a
    // read-only capability token, and wrap both for the session server. Only
    // the wrapped (encrypted) material ever leaves the device.
    const localUserSecret = await getOrCreateLocalUserSecret(
      this.#localUserSecretStore,
    );
    const clientMaterial = deriveClientMaterial(localUserSecret);
    const wrappedEncryptionDataKey = wrapEncryptionKey(
      sessionClientPrivateKey,
      encryptionDataKey.serverPublicKey.x,
      clientMaterial.dataEncryptionKey,
    );

    // Only the client holds the signing key derived from `local_user_secret`,
    // so only the client can mint the token; scoping it to `read` means it
    // authorizes later storage reads without granting write or delete access.
    const ukycCapabilityToken = signStorageAccessToken({
      material: clientMaterial,
      // TODO: Confirm with idOS when this can be switched back to read and a separate token is sent for write
      operations: ['read', 'write'],
      expiresAt: new Date(Date.now() + UKYC_CAPABILITY_TOKEN_TTL_MS),
    });
    const wrappedUkycCapabilityToken = wrapEncryptionKey(
      sessionClientPrivateKey,
      capabilityTokenSchema.serverPublicKey.x,
      stringToBytes(encodeStorageAccessTokenForHeader(ukycCapabilityToken)),
    );

    const { kycStatus, finalStatus } = await this.messenger.call(
      'KycService:setAuthorizations',
      {
        sessionId,
        wrappedEncryptionDataKey,
        wrappedUkycCapabilityToken,
      },
    );

    const vendorProcessing =
      kycStatus === KYC_STATUSES.approved &&
      finalStatus === KYC_STATUSES.pending;

    this.#applyUpdate((state) => {
      state.sumsub.sessionId = sessionId;
      if (vendorProcessing) {
        state.sumsub.status = 'vendorProcessing';
        state.statusMessage = VENDOR_PROCESSING_MESSAGE;
      }
    });
    return { sessionId, kycStatus, finalStatus, vendorProcessing };
  }

  /**
   * Runs the SumSub document-verification sub-flow end to end:
   *
   *  1. creates a UKYC session, receiving per-secret encryption schemas;
   *  2. verifies the `encryptionDataKey` schema's `jwtChain` against the
   *     idOS enclave JWKS and the `ukycCapabilityToken` schema's `jwtChain` against
   *     the idOS relay JWKS, then confirms each attested session server public
   *     key;
   *  3. derives the `data_encryption_key` from the wallet's UKYC
   *     `local_user_secret` and wraps it for the session server;
   *  4. mints a client-signed, read-only `ukyc_capability_token`, wraps it the
   *     same way as the encryption key, and submits both via authorizations;
   *  5. fetches the SumSub applicant access token; and
   *  6. presents the SDK via the injected launcher.
   *
   * If a UKYC session already exists (the consents path creates it before
   * recording session disclaimers), steps 1–4 are skipped.
   *
   * If authorizations report the applicant is already approved on the relay
   * while the vendor is still finalizing (`kycStatus: approved`,
   * `finalStatus: pending`), the sub-flow stops at step 4 with a
   * `vendorProcessing` status and a message rather than launching the SDK.
   *
   * @param params - Optional parameters.
   * @param params.locale - BCP-47 locale for the SDK UI.
   * @param params.debug - Enables SDK debug logging.
   * @returns The SDK result.
   */
  async startSumSub(params?: {
    locale?: string;
    debug?: boolean;
  }): Promise<Record<string, unknown>> {
    try {
      if (!this.#sumsubLauncher.isAvailable()) {
        const error = 'SumSub SDK is not available in this runtime.';
        this.#applyUpdate((state) => {
          state.sumsub.status = 'failed';
          state.sumsub.result = { error };
        });
        throw new Error(error);
      }

      try {
        if (!this.state.sumsub.sessionId) {
          this.#applyUpdate((state) => {
            state.sumsub.status = 'creatingSession';
            state.sumsub.result = null;
            state.sumsub.sessionStatus = null;
          });

          const created = await this.#createUkycSession();

          // A user who already finished the journey can return to a session the
          // relay has already approved (`kycStatus`) while the vendor is still
          // finalizing its own decision (`finalStatus`). There is nothing left to
          // verify, so stop here and surface a message rather than launching the
          // SDK again.
          if (created.vendorProcessing) {
            return {
              kycStatus: created.kycStatus,
              finalStatus: created.finalStatus,
            };
          }
        }

        // Empty string is a valid "no session id" value used by tests and
        // must not be coalesced away as missing.
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const sessionId = this.state.sumsub.sessionId || '';

        this.#applyUpdate((state) => {
          state.sumsub.status = 'fetchingToken';
          state.sumsub.sessionId = sessionId;
        });

        const { applicantAccessToken } = await this.messenger.call(
          'KycService:createJourney',
          sessionId,
        );

        this.#applyUpdate((state) => {
          state.sumsub.status = 'launching';
          state.sumsub.applicantAccessToken = applicantAccessToken;
        });

        // Track whether the SDK ever reported a successful completion. A resolved
        // `launch` alone does not imply success — the applicant may have
        // abandoned the flow or the SDK may have reported a non-success outcome.
        let reachedCompletion = false;

        const result = await this.#sumsubLauncher.launch({
          applicantAccessToken,
          onTokenExpiration: async () => {
            const refreshed = await this.messenger.call(
              'KycService:createJourney',
              sessionId,
            );
            return refreshed.applicantAccessToken;
          },
          onStatusChange: (_prev, next) => {
            if (isSumSubFlowCompleted(next)) {
              reachedCompletion = true;
            }
            this.#applyUpdate((state) => {
              state.sumsub.status = isSumSubFlowCompleted(next)
                ? 'complete'
                : 'inProgress';
            });
          },
          locale: params?.locale ?? 'en',
          debug: params?.debug ?? false,
        });

        // Some native SDKs resolve with their final status without first
        // delivering the corresponding state-change callback.
        reachedCompletion ||= isSumSubFlowCompleted(result.status);

        // A resolved `launch` alone is not the final outcome: only a submission
        // is worth asking UKYC for a decision. Without one, the SDK status is
        // the only way to tell a failure from an applicant who closed the SDK
        // early — the UKYC session leaves its initial state as soon as the
        // journey is created, so it cannot stand in for "the applicant finished".
        let settledStatus: KycSumSubStatus = 'abandoned';
        if (reachedCompletion) {
          settledStatus = 'complete';
        } else if (isSumSubLaunchFailure(result)) {
          settledStatus = 'failed';
        }
        this.#applyUpdate((state) => {
          state.sumsub.status = settledStatus;
          state.sumsub.result = result as Json;
        });

        // Once the SDK completes, the authoritative verification decision comes
        // from the UKYC backend, not the SDK result. Fetch session status once.
        if (reachedCompletion && sessionId) {
          await this.#resolveSessionStatus(sessionId);
        }
        return result;
      } catch (error) {
        // Applicant already finished KYC — treat as completed for Money toast.
        if (isSessionAlreadyCompletedError(error)) {
          this.#applyUserStatus({
            status: 'completed',
            sumsubSessionId: null,
            errorCode: null,
          });
          this.#applyUpdate((state) => {
            state.sumsub.status = 'complete';
            state.sumsub.result = { alreadyCompleted: true };
            state.statusMessage = 'KYC already completed.';
            state.phase = 'done';
            state.error = null;
          });
          return { alreadyCompleted: true };
        }
        const result = { error: String(error) };
        this.#applyUpdate((state) => {
          state.sumsub.status = 'failed';
          state.sumsub.result = result;
        });
        return result;
      }
    } finally {
      try {
        await this.refreshKycStatus();
      } catch (error) {
        controllerLog('KYC status refresh failed:', error);
      }
    }
  }

  /**
   * Confirms that an encryption schema's `serverPublicKey.x` matches the
   * `sessionServerPublicKeyX` attested inside its verified `jwtChain`. Rejects
   * a key that was swapped out-of-band after the chain was signed.
   *
   * @param keys - The issuer JWKS used to verify the chain (idOS enclave for
   * `encryptionDataKey`, idOS relay for `ukycCapabilityToken`).
   * @param schema - The encryption schema returned by session creation.
   */
  #assertAttestedServerPublicKey(keys: Jwk[], schema: EncryptionSchema): void {
    const jwtChainPayload = verifyJwtChain(keys, schema.jwtChain);
    if (jwtChainPayload.sessionServerPublicKeyX !== schema.serverPublicKey.x) {
      throw new Error(
        'sessionServerPublicKey does not match the verified jwtChain payload (sessionServerPublicKeyX).',
      );
    }
  }
}
