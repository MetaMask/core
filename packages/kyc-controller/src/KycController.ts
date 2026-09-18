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
import { stringToBytes } from '@metamask/utils';
import { x25519 } from '@noble/curves/ed25519';

import { toBase64Url } from './encoding.js';
import type { KycControllerMethodActions } from './KycController-method-action-types.js';
import type { KycServiceMethodActions } from './KycService-method-action-types.js';
import type {
  CapabilityAuthorization,
  EncryptionSchema,
} from './KycService.js';
import {
  isSumSubFlowCompleted,
  isSumSubLaunchFailure,
} from './providers/sumsub.js';
import type {
  KycSumSubLauncher,
  KycSumSubStatus,
} from './providers/sumsub.js';
import type {
  KycConsentRecord,
  KycDisclaimer,
  KycDisclaimersCatalog,
  KycProviderDisclaimersAccepted,
  KycSessionDisclaimers,
  KycSessionStatus,
  KycVendor,
  KycVendorDisclaimersAccepted,
  KycVendorSigning,
} from './types.js';
import { deriveClientMaterial } from './ukyc/deriveClientMaterial.js';
import { assertAttestedServerPublicKey } from './ukyc/jwtChain.js';
import {
  getOrCreateLocalUserSecret,
  UkycLocalUserSecretStore,
} from './ukyc/localUserSecret.js';
import {
  encodeStorageAccessTokenForHeader,
  signStorageAccessToken,
} from './ukyc/storageAccessToken.js';
import { wrapEncryptionKey } from './ukyc/wrapEncryptionKey.js';
import { areSessionDisclaimersCompleted, consentRecordsFromAcceptedList } from './sessionDisclaimers.js';
import {
  areVendorDisclaimersCompleted,
  recordVendorDisclaimerAcceptance,
} from './vendorDisclaimers.js';

// === GENERAL ===

export const controllerName = 'KycController';

// Lifetime of the read-only `ukyc_capability_token` minted when creating a
// UKYC session. The storage-and-auth spec requires the token's `expires_at` to
// cover the KYC session's expected lifetime — including the provider journey —
// rather than a fixed short window, so this is a session-scoped window.
const UKYC_CAPABILITY_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

// UKYC status values. `kycStatus` (the relay-side decision) and `finalStatus`
// (the vendor-side outcome) draw from the same vocabulary, so they are defined
// once here and composed into the sets/checks below rather than repeated as
// literals.
const KYC_STATUSES = {
  approved: 'approved',
  rejected: 'rejected',
  retry: 'retry',
} as const;

// How often to poll UKYC session status until a terminal `finalStatus`.
const SESSION_STATUS_POLL_INTERVAL_MS = 15_000;

// `finalStatus` values that end {@link KycController.startSessionStatusPolling}.
const TERMINAL_SESSION_STATUSES: ReadonlySet<string> = new Set([
  KYC_STATUSES.approved,
  KYC_STATUSES.rejected,
  KYC_STATUSES.retry,
]);


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

  /** Latest UKYC session status, or `null` when none has been fetched. */
  sessionStatus: KycSessionStatus | null;

  // TODO: Check if we need truly need to persist these accepted disclaimers
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
    persist: true,
    usedInUi: false,
  },
  vendor: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  geoCountry: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  sessionStatus: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
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
    persist: true,
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
    sessionStatus: null,
    vendorDisclaimersAccepted: getDefaultKycVendorDisclaimersAccepted(),
    providerDisclaimersAccepted: getDefaultKycProviderDisclaimersAccepted(),
    idosDisclaimersAccepted: null,
    credentialReusabilityConsentGiven: null,
  };
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

export type KycControllerEvents = KycControllerStateChangeEvent;

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

  /** Handle for the scheduled next session-status poll, or `null`. */
  #sessionStatusPollTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Monotonic polling token. Bumped when the loop stops so an in-flight fetch
   * neither writes state nor schedules a follow-up.
   */
  #sessionStatusPollToken = 0;

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

  // Only meant to be called if starting a new KYC flow
  // Use getSessionStatusForVendor() instead when only intending to check if a prior session exists for the vendor
  async startSession(params: {
    vendor: KycVendor;
    email: string; // TODO: This will be removed once partnerIdentityTokens are fully ready
  }): Promise<KycSessionStatus> {
    if (this.state.email !== null || this.state.email !== params.email) {
      throw new Error('KycController already initialized with a different email');
    }
    if (this.state.vendor !== null || this.state.vendor !== params.vendor) {
      throw new Error('KycController already initialized with a different vendor');
    }

    const geoCountry = await this.messenger.call('KycService:getGeoCountry');
    if (this.state.geoCountry !== null || this.state.geoCountry !== geoCountry) {
      throw new Error('KycController already initialized with a different geoCountry');
    }

    this.update((state) => {
      state.email = params.email;
      state.vendor = params.vendor;
      state.geoCountry = geoCountry;
    });

    if (this.state.sessionStatus === null) {
      const sessionStatus = await this.messenger.call('KycService:getSessionStatusForVendor', this.state.vendor);
      if (sessionStatus !== null) {
        this.update((state) => {
          state.sessionStatus = sessionStatus;
        });
        return sessionStatus;
      }
      return this.#createUkycSession({ vendor: params.vendor, geoCountry: geoCountry });
    } else {
      // TODO: Should this made a call to check if the session is up-to-date?
      return this.state.sessionStatus
    }
    // TODO: Should we resume polling here?
  }

  async reset(): Promise<void> {
    this.#stopSessionStatusPolling();
    this.clearState();
    // TODO: Do not clear vendorDisclaimersAccepted, providerDisclaimersAccepted, idosDisclaimersAccepted, credentialReusabilityConsentGiven?
  }

  clearState(): void {
    this.#stopSessionStatusPolling();
    this.update((state) => {
      state.email = null;
      state.vendor = null;
      state.geoCountry = null;
      state.sessionStatus = null;
      // TODO: clear rest of state
    });
  }

  getSessionStatusForVendor(vendor: KycVendor): Promise<KycSessionStatus | null> {
    return this.messenger.call('KycService:getSessionStatusForVendor', vendor);
  }

  refreshSessionStatus(): KycSessionStatus {
    if(!this.state.sessionStatus) {
      throw new Error('No session was found');
    }
    if (!TERMINAL_SESSION_STATUSES.has(this.state.sessionStatus.finalStatus)) {
      this.startSessionStatusPolling();
    }
    return this.state.sessionStatus;
  }

  /**
   * Starts polling `GET /sessions/{id}/status` for
   * {@link KycControllerState.sessionStatus}'s current `id`. Each tick writes
   * the result onto state only when the payload changed. The loop stops once
   * `finalStatus` is `approved`, `rejected`, or `retry`, or when
   * {@link reset} / {@link clearState} runs.
   *
   * @throws If there is no current session id to poll.
   */
  startSessionStatusPolling(): void {
    const sessionId = this.state.sessionStatus?.id;
    if (!sessionId) {
      throw new Error('No session was found');
    }

    this.#stopSessionStatusPolling();
    const token = this.#sessionStatusPollToken;

    const tick = async (): Promise<void> => {
      const shouldStop = await this.#pollSessionStatusOnce(token);
      if (shouldStop) {
        return;
      }
      this.#sessionStatusPollTimer = setTimeout(() => {
        this.#sessionStatusPollTimer = null;
        // `tick` swallows its own errors and therefore never rejects.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        tick();
      }, SESSION_STATUS_POLL_INTERVAL_MS);
      this.#sessionStatusPollTimer.unref?.();
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    tick();
  }

  /**
   * Fetches session status for the current `sessionStatus.id` and records it
   * when it differs from state.
   *
   * @param token - Polling token captured when the loop started.
   * @returns Whether the loop should stop.
   */
  async #pollSessionStatusOnce(token: number): Promise<boolean> {
    const sessionId = this.state.sessionStatus?.id;
    if (!sessionId) {
      this.#stopSessionStatusPolling();
      return true;
    }

    try {
      const sessionStatus = await this.messenger.call(
        'KycService:getSessionStatus',
        { sessionId },
      );
      if (this.#sessionStatusPollToken !== token) {
        return true;
      }
      if (this.state.sessionStatus?.id !== sessionId) {
        return true;
      }

      // TODO: This check seems fragile
      if (
        JSON.stringify(this.state.sessionStatus) !==
        JSON.stringify(sessionStatus)
      ) {
        this.update((state) => {
          state.sessionStatus = sessionStatus;
        });
      }

      if (TERMINAL_SESSION_STATUSES.has(sessionStatus.finalStatus)) {
        this.#stopSessionStatusPolling();
        return true;
      }
      return false;
    } catch {
      return this.#sessionStatusPollToken !== token;
    }
  }

  /**
   * Stops the session-status polling loop.
   */
  #stopSessionStatusPolling(): void {
    this.#sessionStatusPollToken += 1;
    if (this.#sessionStatusPollTimer !== null) {
      clearTimeout(this.#sessionStatusPollTimer);
      this.#sessionStatusPollTimer = null;
    }
  }

  /**
   * Creates a UKYC session, wraps the `data_encryption_key` and
   * `ukyc_capability_token` against the returned encryption schemas, and
   * submits both via authorizations. Stores `sumsub.sessionId`.
   * kyc-api returns the existing session if one with the same vendor and canonicalUserId already exists.
   *
   * @returns The created session.
   */
  async #createUkycSession(params:{
    vendor: KycVendor;
    geoCountry: string;
  }): Promise<KycSessionStatus> {
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
    const {
      sessionId,
      encryptionDataKey,
      ukycCapabilityToken: capabilityTokenSchema,
    } = await this.messenger.call('KycService:createUkycSession', {
      sessionClientPublicKey,
      residenceCountry: params.geoCountry,
      vendor: params.vendor,
    });

    await this.#verifyWrappingKeys(encryptionDataKey, capabilityTokenSchema);

    const { wrappedEncryptionDataKey, wrappedUkycCapabilityToken } =
      await this.#generateWrappedAuthorizations(
        sessionClientPrivateKey,
        encryptionDataKey,
        capabilityTokenSchema,
      );

    const sessionStatus = await this.messenger.call(
      'KycService:setAuthorizations',
      {
        sessionId,
        wrappedEncryptionDataKey,
        wrappedUkycCapabilityToken,
      },
    );

    return sessionStatus;
  }

    /**
   * Fetches the idOS + KYC-provider disclaimer catalog. Pass exactly one of
   * `sessionId` or `country`:
   *
   * - `{ sessionId }` → {@link KycService.fetchSessionDisclaimersBySessionId}
   *   (`GET /sessions/{sessionId}/disclaimers`)
   * - `{ country }` → {@link KycService.fetchSessionDisclaimersByCountry}
   *   (`GET /disclaimers?country=`)
   *
   * A session-id fetch also writes the catalog to `sessionDisclaimers`.
   *
   * @param params - The parameters. Provide exactly one of `sessionId` or
   * `country`.
   * @param params.sessionId - The UKYC session id.
   * @param params.country - ISO 3166-1 alpha-3 country code.
   * @returns The catalog. Session fetches include consent state; country
   * fetches do not.
   */
    async fetchSessionDisclaimers(
      params: FetchSessionDisclaimersParams,
    ): Promise<KycSessionDisclaimers | KycDisclaimersCatalog> {
      const { sessionId, country } = params as {
        sessionId?: string;
        country?: string;
      };
      if (sessionId && country) {
        throw new Error(
          'KycController.fetchSessionDisclaimers: provide exactly one of sessionId or country.',
        );
      }

      if (country) {
        return this.messenger.call(
          'KycService:fetchSessionDisclaimersByCountry',
          { country },
        );
      }

      if (!sessionId) {
        throw new Error(
          'KycController.fetchSessionDisclaimers: provide exactly one of sessionId or country.',
        );
      }

      const catalog = await this.messenger.call(
        'KycService:fetchSessionDisclaimersBySessionId',
        { sessionId },
      );
      return catalog;
    }

    /**
   * Fetches the session-scoped disclaimer catalog and records consents
   * derived from the T&C2 flags. Already-consented catalog rows are omitted
   * from the POST. A 409 is re-checked with a GET: continue only when every
   * accepted document is now consented, otherwise fail closed.
   *
   * @param consents - T&C2 flags mapped onto catalog documents.
   * @param consents.providerDisclaimersAccepted - Accepted Sumsub disclaimer records.
   * @param consents.idosDisclaimersAccepted - Accepted idOS disclaimer records.
   * @param consents.credentialReusabilityConsentGiven - Whether credential
   * reuse was accepted.
   * @param generation - Flow generation captured by the caller.
   */
    async recordSessionDisclaimers(
      params: {
        providerDisclaimersAccepted: KycConsentRecord[];
        idosDisclaimersAccepted: KycConsentRecord[];
        credentialReusabilityConsentGiven: boolean;
      },
    ): Promise<void> {
      if (!this.state.sessionStatus) {
        throw new Error('No session was found');
      }

      // TODO: Check if these can simply be mapped to `{key, version}` pairs instead
      const disclaimers = await this.messenger.call(
        'KycService:fetchSessionDisclaimersBySessionId',
        { sessionId: this.state.sessionStatus.id },
      );

      const idOS = consentRecordsFromAcceptedList(
        disclaimers.idOS,
        params.idosDisclaimersAccepted,
      );
      const kycProvider = consentRecordsFromAcceptedList(
        disclaimers.kycProvider,
        params.providerDisclaimersAccepted,
      );

      try {
        await this.messenger.call(
          'KycService:submitSessionDisclaimers',
          {
            sessionId: this.state.sessionStatus.id,
            idOS,
            kycProvider,
            credentialReusabilityConsentGiven:
              params.credentialReusabilityConsentGiven,
          },
        );
      } catch (error) {
        // If 409 error, the session is already completed
      }
      this.update((state) => {
        // TODO: This shouldn't be hardcoded to sumsub
        state.providerDisclaimersAccepted.sumsub = params.providerDisclaimersAccepted;
        state.idosDisclaimersAccepted = params.idosDisclaimersAccepted;
        state.credentialReusabilityConsentGiven = params.credentialReusabilityConsentGiven;
      });
    }

  async hasCompletedSessionDisclaimers(): Promise<boolean> {
    if (!this.state.sessionStatus) {
      throw new Error('No session was found');
    }
    // TODO: validate if this shorcut check is sufficient
    // return this.state.sessionStatus.consentStatus === 'given';

    const disclaimers = await this.messenger.call(
      'KycService:fetchSessionDisclaimersBySessionId',
      { sessionId: this.state.sessionStatus.id },
    );

    return areSessionDisclaimersCompleted(disclaimers);
  }

  /**
   * Fetches the vendor T&Cs the customer must accept before a session is
   * created (`GET /vendors/{vendor}/disclaimers?country=`).
   *
   * @param params - The parameters.
   * @param params.vendor - Identity vendor. Defaults to `moonpay`.
   * @param params.country - ISO 3166-1 alpha-3 country code.
   * @returns The disclaimers.
   */
  async fetchVendorDisclaimers(params: {
    vendor?: KycVendor;
    country: string;
  }): Promise<KycDisclaimer[]> {
    return this.messenger.call('KycService:fetchVendorDisclaimers', params);
  }

  /**
   * Records vendor T&C acceptance via {@link KycService.submitVendorDisclaimers}
   * and persists the accepted ids on state.
   *
   * @param params - The parameters.
   * @param params.disclaimerIds - Accepted vendor T&C ids.
   * @returns The vendor signing records.
   * @throws If `vendor` is missing from state.
   */
  async recordVendorDisclaimers(params: {
    disclaimerIds: string[];
  }): Promise<KycVendorSigning[]> {
    if (!this.state.vendor) {
      throw new Error('No vendor was found');
    }

    const vendor = this.state.vendor;
    const signings = await this.messenger.call(
      'KycService:submitVendorDisclaimers',
      {
        vendor,
        disclaimerIds: params.disclaimerIds,
      },
    );

    // TODO: this only works for Iron right now
    this.update((state) => {
      state.vendorDisclaimersAccepted = recordVendorDisclaimerAcceptance(
        state.vendorDisclaimersAccepted,
        vendor,
        {
          disclaimerIds: params.disclaimerIds,
        },
      );
    });

    return signings;
  }

  /**
   * Fetches the current vendor T&C catalog and returns whether every document
   * is already recorded in {@link KycControllerState.vendorDisclaimersAccepted}.
   *
   * @returns Whether persisted acceptance covers the fetched catalog.
   * @throws If `vendor` or `geoCountry` is missing from state.
   */
  async hasCompletedVendorDisclaimers(): Promise<boolean> {
    if (!this.state.vendor) {
      throw new Error('No vendor was found');
    }
    if (!this.state.geoCountry) {
      throw new Error('No geoCountry was found');
    }

    const fetched = await this.fetchVendorDisclaimers({
      vendor: this.state.vendor,
      country: this.state.geoCountry,
    });

    // TODO: this only works for Iron right now
    return areVendorDisclaimersCompleted(
      this.state.vendorDisclaimersAccepted,
      this.state.vendor,
      fetched,
    );
  }

  launchProviderFlow({ locale, debug }: { locale?: string; debug?: boolean }): Promise<void> {
    // Currently only sumsub is supported and must be used for Iron
    return this.#launchSumsubFlow({ locale, debug });
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
  async #launchSumsubFlow(params?: {
    locale?: string;
    debug?: boolean;
  }): Promise<void> {
    try {
      if (!this.#sumsubLauncher.isAvailable()) {
        throw new Error('SumSub SDK is not available in this runtime.');
      }

      try {
        if (!this.state.sessionStatus?.id) {
          throw new Error('No ukyc session found.');
        }

        const sessionId = this.state.sessionStatus.id;

        // TODO: check if the sumsub and idos disclaimers are accepted

        const { applicantAccessToken } = await this.messenger.call(
          'KycService:createJourney',
          sessionId,
        );

        // Track whether the SDK ever reported a successful completion. A resolved
        // `launch` alone does not imply success — the applicant may have
        // abandoned the flow or the SDK may have reported a non-success outcome.
        let reachedCompletion = false;

        const result = await this.#sumsubLauncher.launch({
          applicantAccessToken,
          onTokenExpiration: async () => {
            const journey = await this.messenger.call(
              'KycService:createJourney',
              sessionId,
            );
            return journey.applicantAccessToken;
          },
          onStatusChange: (_prev, next) => {
            if (isSumSubFlowCompleted(next)) {
              reachedCompletion = true;
            }
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


        // Once the SDK completes, the authoritative verification decision comes
        // from the UKYC backend, not the SDK result. Fetch session status once.
        if (reachedCompletion && this.state.sessionStatus) {
          // TODO: is this too opmistic?
          this.update((state) => {
            if (!state.sessionStatus) {
              return;
            }
            state.sessionStatus = {
              ...state.sessionStatus,
              finalStatus: 'pending',
            };
          });
          this.refreshSessionStatus();
        }
      } catch (error) {
        // TODO: Figure out if the sessionAlreadyCompletedError is still needed
        //
        // Applicant already finished KYC — treat as completed for Money toast.
        // if (isSessionAlreadyCompletedError(error)) {
        //   this.#applyUserStatus({
        //     status: 'completed',
        //     sumsubSessionId: null,
        //     errorCode: null,
        //   });
        //   this.#applyUpdate((state) => {
        //     state.sumsub.status = 'complete';
        //     state.sumsub.result = { alreadyCompleted: true };
        //     state.statusMessage = 'KYC already completed.';
        //     state.phase = 'done';
        //     state.error = null;
        //   });
        //   return { alreadyCompleted: true };
        // }
        // const result = { error: String(error) };
        // this.#applyUpdate((state) => {
        //   state.sumsub.status = 'failed';
        //   state.sumsub.result = result;
        // });
        // return result;
      }
    }
  }

  /**
   * Verifies each schema's jwtChain against the matching issuer JWKS, then
   * confirms the returned server public key matches the value attested inside
   * the verified JWT payload before trusting it for wrapping.
   * `encryptionDataKey` is attested by the idOS enclave; `ukycCapabilityToken`
   * by the idOS relay.
   *
   * @param encryptionDataKey - Encryption schema for the data encryption key.
   * @param capabilityTokenSchema - Encryption schema for the capability token.
   */
  async #verifyWrappingKeys(
    encryptionDataKey: EncryptionSchema,
    capabilityTokenSchema: EncryptionSchema,
  ): Promise<void> {
    const [{ keys: idosEnclaveKeys }, { keys: idosRelayKeys }] =
      await Promise.all([
        this.messenger.call('KycService:fetchIdosEnclaveJwks'),
        this.messenger.call('KycService:fetchIdosRelayJwks'),
      ]);
    assertAttestedServerPublicKey(idosEnclaveKeys, encryptionDataKey);
    assertAttestedServerPublicKey(idosRelayKeys, capabilityTokenSchema);
  }

  /**
   * Derives the `data_encryption_key` from the `local_user_secret`, mints a
   * capability token, and wraps both for the session server. Only the wrapped
   * (encrypted) material ever leaves the device.
   *
   * Only the client holds the signing key derived from `local_user_secret`, so
   * only the client can mint the token.
   *
   * @param sessionClientPrivateKey - Per-session X25519 private key used to
   * seal both secrets.
   * @param encryptionDataKey - Encryption schema for the data encryption key.
   * @param capabilityTokenSchema - Encryption schema for the capability token.
   * @returns The wrapped encryption key and capability token.
   */
  async #generateWrappedAuthorizations(
    sessionClientPrivateKey: Uint8Array,
    encryptionDataKey: EncryptionSchema,
    capabilityTokenSchema: EncryptionSchema,
  ): Promise<{
    wrappedEncryptionDataKey: CapabilityAuthorization;
    wrappedUkycCapabilityToken: CapabilityAuthorization;
  }> {
    const localUserSecret = await getOrCreateLocalUserSecret(
      this.#localUserSecretStore,
    );
    const clientMaterial = deriveClientMaterial(localUserSecret);
    const wrappedEncryptionDataKey = wrapEncryptionKey(
      sessionClientPrivateKey,
      encryptionDataKey.serverPublicKey.x,
      clientMaterial.dataEncryptionKey,
    );

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

    return { wrappedEncryptionDataKey, wrappedUkycCapabilityToken };
  }
}
