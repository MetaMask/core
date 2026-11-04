import type {
  AuthenticatedUserStorageServicePutIdentitySharingConsentAction,
  IdentitySharingAudience,
} from '@metamask/authenticated-user-storage';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationControllerGetPartnerIdentityTokenAction } from '@metamask/profile-sync-controller/auth';
import type {
  UserStorageControllerPerformGetStorageAction,
  UserStorageControllerPerformSetStorageAction,
} from '@metamask/profile-sync-controller/user-storage';
import { stringToBytes, wrapError } from '@metamask/utils';
import { x25519 } from '@noble/curves/ed25519';

import type {
  KycAnalyticsStatus,
  KycAnalyticsTrackers,
  KycAnalyticsVerificationOutcomePayload,
} from './analytics.js';
import { getKycAnalyticsStatus } from './analytics.js';
import { toBase64Url } from './encoding.js';
import type { KycControllerMethodActions } from './KycController-method-action-types.js';
import type { KycServiceMethodActions } from './KycService-method-action-types.js';
import type {
  CapabilityAuthorization,
  EncryptionSchema,
  KycOnboardingStep,
} from './KycService.js';
import {
  getEmailFromPartnerIdentityToken,
  isEmailRequiredError,
} from './partnerIdentityToken.js';
import {
  isSumSubFlowCompleted,
  isSumSubFlowFailed,
} from './providers/sumsub.js';
import type { KycSumSubLauncher } from './providers/sumsub.js';
import { getKycSessionDecision } from './sessionDecision.js';
import type { KycSessionDecision } from './sessionDecision.js';
import { consentRecordsFromAcceptedList } from './sessionDisclaimers.js';
import {
  needsCapabilityAuthorizationRefresh,
  FINAL_STATUSES_TO_STOP_POLLING,
  KYC_CURRENT_STEPS,
  KYC_STATUSES,
  VENDORS_REGISTERED_BY_RELAY,
} from './types.js';
import type {
  KycConsentRecord,
  KycDataShare,
  KycDisclaimer,
  KycDisclaimersCatalog,
  KycSessionDisclaimers,
  KycSessionStatus,
  KycVendor,
  KycVendorDisclaimersAcceptance,
  KycVendorSigning,
} from './types.js';
import { deriveClientMaterial } from './ukyc/deriveClientMaterial.js';
import type { UkycClientMaterial } from './ukyc/deriveClientMaterial.js';
import { assertAttestedServerPublicKey } from './ukyc/jwtChain.js';
import type { Jwk } from './ukyc/jwtChain.js';
import {
  getOrCreateLocalUserSecret,
  UkycLocalUserSecretStore,
} from './ukyc/localUserSecret.js';
import {
  encodeStorageAccessTokenForHeader,
  signStorageAccessToken,
} from './ukyc/storageAccessToken.js';
import type { UkycStorageOperation } from './ukyc/storageAccessToken.js';
import { wrapEncryptionKey } from './ukyc/wrapEncryptionKey.js';
import { areVendorDisclaimersCompleted } from './vendorDisclaimers.js';

// === GENERAL ===

export const controllerName = 'KycController';

export const KYC_PROVIDER_FLOW_STATUSES = [
  'not_started',
  'submitted',
  'abandoned',
  'failed',
] as const;

/**
 * Durable outcome of the identity-provider flow.
 *
 * Unlike the KYC session's `finalStatus`, this distinguishes a newly-created
 * pending session from a provider flow that the customer actually submitted.
 */
export type KycProviderFlowStatus = (typeof KYC_PROVIDER_FLOW_STATUSES)[number];

// Lifetime of the read-only `ukyc_capability_token` minted when creating a
// UKYC session. The storage-and-auth spec requires the token's `expires_at` to
// cover the KYC session's expected lifetime — including the provider journey —
// rather than a fixed short window, so this is a session-scoped window.
const UKYC_CAPABILITY_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

// Lifetime of the `delete`-scoped `ukyc_capability_token`. The token is minted
// and presented immediately, so four hours is enough.
const UKYC_DELETE_CAPABILITY_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

// First wait between UKYC session-status polls. Each later wait grows by this
// step, so the delays are 10s, 20s, 30s, and so on.
const SESSION_STATUS_POLL_INTERVAL_MS = 10_000;

// === STATE ===

/**
 * One vendor's KYC session and everything recorded for it. Sessions are keyed
 * by vendor, matching kyc-api: a customer holds at most one session per vendor,
 * and features that use the same vendor share it.
 */
export type KycVendorSessionState = {
  /** Latest UKYC session status, or `null` before a session exists. */
  sessionStatus: KycSessionStatus | null;

  /** Last durable identity-provider flow outcome for this session. */
  providerFlowStatus: KycProviderFlowStatus;

  /**
   * ISO 3166-1 alpha-3 country this vendor's session was created with, or the
   * country its terms were accepted for before a session existed. Vendor
   * disclaimer checks read the catalog for this country.
   */
  residenceCountry: string | null;

  /**
   * The vendor's T&C acceptance (T&C1). Stored on the device before a session
   * exists, then marked submitted once the vendor records it.
   */
  vendorDisclaimersAccepted: KycVendorDisclaimersAcceptance | null;

  /**
   * KYC-provider (SumSub) disclaimer documents accepted for this session, as
   * `{ key, version }` records. `null` when none were recorded.
   */
  providerDisclaimersAccepted: KycConsentRecord[] | null;

  /**
   * idOS disclaimer documents accepted for this session, as `{ key, version }`
   * records. `null` when none were recorded.
   */
  idosDisclaimersAccepted: KycConsentRecord[] | null;

  /**
   * Whether the customer consented to reuse existing idOS credentials for this
   * session. `null` when never set (treated as `false`).
   */
  credentialReusabilityConsentGiven: boolean | null;
};

/**
 * Describes the shape of the state object for {@link KycController}.
 */
export type KycControllerState = {
  /** Session entries keyed by identity vendor. */
  sessions: Partial<Record<KycVendor, KycVendorSessionState>>;
};

const kycControllerMetadata = {
  sessions: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
} satisfies StateMetadata<KycControllerState>;

/**
 * Constructs an empty {@link KycVendorSessionState}.
 *
 * @returns A vendor session entry with no session and nothing accepted.
 */
export function getDefaultKycVendorSessionState(): KycVendorSessionState {
  return {
    sessionStatus: null,
    providerFlowStatus: 'not_started',
    residenceCountry: null,
    vendorDisclaimersAccepted: null,
    providerDisclaimersAccepted: null,
    idosDisclaimersAccepted: null,
    credentialReusabilityConsentGiven: null,
  };
}

/**
 * Constructs the default {@link KycController} state.
 *
 * @returns The default state.
 */
export function getDefaultKycControllerState(): KycControllerState {
  return { sessions: {} };
}

/**
 * Parameters for {@link KycController.fetchSessionDisclaimers}. Provide
 * exactly one of `sessionId` or `country`.
 */
export type FetchSessionDisclaimersParams =
  | {
      /** Identity vendor whose session catalog to fetch. */
      vendor: KycVendor;
      country?: never;
    }
  | {
      /** ISO 3166-1 alpha-3 country code for `GET /disclaimers?country=`. */
      country: string;
      vendor?: never;
    };

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'ensureLocalUserSecret',
  'startSession',
  'reset',
  'clearState',
  'getSessionStatusForVendor',
  'getDataShares',
  'getProviderFlowStatus',
  'refreshSessionStatus',
  'readSessionStatus',
  'fetchSessionStatusOnce',
  'startSessionStatusPolling',
  'fetchSessionDisclaimers',
  'recordSessionDisclaimers',
  'hasCompletedSessionDisclaimers',
  'fetchVendorDisclaimers',
  'acceptVendorDisclaimers',
  'recordVendorDisclaimers',
  'hasCompletedVendorDisclaimers',
  'getSessionDecision',
  'verifyVendorEmailOtp',
  'resendVendorEmailOtp',
  'sendVendorPhoneOtp',
  'verifyVendorPhoneOtp',
  'launchProviderFlow',
  'deleteEncryptedStorage',
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
  | UserStorageControllerPerformSetStorageAction
  | AuthenticationControllerGetPartnerIdentityTokenAction
  | AuthenticatedUserStorageServicePutIdentitySharingConsentAction;

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
  /**
   * Optional client callbacks that record KYC analytics. Omitted clients
   * record nothing. See {@link KycAnalyticsTrackers}.
   */
  trackKycAnalytics?: KycAnalyticsTrackers;
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

  readonly #trackKycAnalytics?: KycAnalyticsTrackers;

  /** Scheduled next session-status poll for each vendor that is polling. */
  readonly #sessionStatusPollTimers = new Map<
    KycVendor,
    ReturnType<typeof setTimeout>
  >();

  /**
   * Monotonic polling token per vendor. Bumped when that vendor's loop stops
   * so an in-flight fetch neither writes state nor schedules a follow-up.
   */
  readonly #sessionStatusPollTokens = new Map<KycVendor, number>();

  /** Vendor whose SumSub flow is on screen, or `null`. */
  #presentingVendor: KycVendor | null = null;

  /**
   * Constructs a new {@link KycController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - Partial initial state; merged over defaults.
   * @param options.sumsubLauncher - The platform SumSub launcher adapter.
   * @param options.trackKycAnalytics - Optional callbacks that record KYC analytics.
   */
  constructor({
    messenger,
    state,
    sumsubLauncher,
    trackKycAnalytics,
  }: KycControllerOptions) {
    super({
      messenger,
      metadata: kycControllerMetadata,
      name: controllerName,
      state: { ...getDefaultKycControllerState(), ...state },
    });

    this.#sumsubLauncher = sumsubLauncher;
    this.#trackKycAnalytics = trackKycAnalytics;
    this.#localUserSecretStore = new UkycLocalUserSecretStore(this.messenger);

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Records identity-sharing consent for the vendor's audience, then mints a
   * partner identity token and reads the verified email claim from JWT `ext`.
   *
   * @param vendor - Identity vendor whose partner audience to request.
   * @returns The minted token and its verified email, or `null` when the
   * profile has no verified email (HTTP 422 / `EmailRequiredError`).
   */
  async #getPartnerIdentityForVendor(vendor: KycVendor): Promise<{
    partnerIdentityToken: string;
    email: string;
  } | null> {
    // TODO: Fix this typing. Safe for now as only Iron is used
    const audience = vendor as IdentitySharingAudience;
    await this.messenger.call(
      'AuthenticatedUserStorageService:putIdentitySharingConsent',
      { audience, granted: true },
    );
    let partnerIdentityToken: string;
    try {
      partnerIdentityToken = await this.messenger.call(
        'AuthenticationController:getPartnerIdentityToken',
        ['email'],
        audience,
      );
    } catch (error) {
      if (isEmailRequiredError(error)) {
        return null;
      }
      throw error;
    }
    return {
      partnerIdentityToken,
      email: getEmailFromPartnerIdentityToken(partnerIdentityToken),
    };
  }

  /**
   * Creates the UKYC `local_user_secret` and stores it in Encrypted User
   * Storage when one does not already exist.
   *
   * Call this after the user has expressed intent to onboard and before
   * {@link startSession}. Persisting the secret here moves generation and the
   * storage write off the `startSession` path. `startSession` still reads the
   * secret, and still creates it when this has not been called.
   *
   * Await this call, or attach a rejection handler. A failure does not block
   * onboarding: {@link startSession} creates the secret if it is still missing.
   *
   * The operation is idempotent and uses the same primary entropy source as
   * session creation. The plaintext secret is not returned and is not sent to
   * idOS. Only the encrypted User Storage copy is synced.
   *
   * @throws When Encrypted User Storage cannot be read or written, or when a
   * stored secret has an unexpected length.
   */
  async ensureLocalUserSecret(): Promise<void> {
    await getOrCreateLocalUserSecret(this.#localUserSecretStore);
  }

  /**
   * Starts a KYC session for the given vendor. Reuses a latest vendor session
   * when one exists; otherwise creates a UKYC session. Sessions for other
   * vendors are left untouched.
   *
   * Creating a vendor customer and UKYC session requires a partner identity
   * token carrying a verified email; both requests send it as
   * `partnerIdentityToken`. Resuming an existing session does not.
   *
   * Session creation derives client material from the UKYC
   * `local_user_secret`. Call {@link ensureLocalUserSecret} after the user
   * has expressed intent to onboard so that secret is generated and stored
   * before this method runs.
   *
   * @param params - The session parameters.
   * @param params.vendor - Identity vendor for the session.
   * @param params.aal2Token - AAL2 authentication token. Required only when a
   * UKYC session must be created, where it is sent as the Authorization bearer
   * value. Omit it when reusing an existing session.
   * @returns The current or newly created session status.
   */
  async startSession(params: {
    vendor: KycVendor;
    aal2Token?: string;
    /**
     * Email the relay registers the vendor user with. Required to create a
     * session for vendors in `VENDORS_REGISTERED_BY_RELAY`; ignored otherwise.
     */
    email?: string;
  }): Promise<KycSessionStatus> {
    const { vendor } = params;
    const registeredByRelay = VENDORS_REGISTERED_BY_RELAY.has(vendor);
    // No partner identity audience exists for relay-registered vendors yet;
    // they sign up with the email the caller supplies.
    const partnerIdentity = registeredByRelay
      ? null
      : await this.#getPartnerIdentityForVendor(vendor);
    const geoCountry = await this.messenger.call('KycService:getGeoCountry');

    this.#updateVendorSession(
      vendor,
      (entry) => {
        if (entry.sessionStatus === null) {
          // Terms stored before a session exists were accepted for the catalog
          // of the country they were fetched in. If the session is going to be
          // created for another country, that acceptance does not apply: drop
          // it so the user accepts the right documents.
          if (
            entry.residenceCountry !== null &&
            entry.residenceCountry !== geoCountry &&
            entry.vendorDisclaimersAccepted?.submitted === false
          ) {
            entry.vendorDisclaimersAccepted = null;
          }
          entry.residenceCountry = geoCountry;
          entry.providerFlowStatus = 'not_started';
        } else {
          entry.residenceCountry ??= geoCountry;
        }
      },
      { create: true },
    );

    const storedSession = this.state.sessions[vendor]?.sessionStatus ?? null;
    if (storedSession === null) {
      const sessionStatus = await this.messenger.call(
        'KycService:getSessionStatusForVendor',
        vendor,
      );
      if (sessionStatus !== null) {
        this.#updateVendorSession(vendor, (entry) => {
          entry.sessionStatus = sessionStatus;
        });
        return this.#refreshAuthorizationsIfNeeded(vendor);
      }

      // TODO: Probably move this into it's own method? Feels like startSession is a little overloaded.
      // It's assumed that if the session does not exist, the customer does not exist either
      if (!params.aal2Token) {
        throw new Error(
          'KycController.startSession: aal2Token is required to create a KYC session.',
        );
      }

      let createdSession: KycSessionStatus;
      if (registeredByRelay) {
        if (!params.email) {
          throw new Error(
            'KycController.startSession: email is required to register this vendor user.',
          );
        }
        createdSession = await this.#createUkycSession({
          vendor,
          geoCountry,
          aal2Token: params.aal2Token,
          email: params.email,
        });
      } else {
        if (!partnerIdentity) {
          throw new Error('KycController missing verified email for vendor');
        }

        await this.messenger.call('KycService:createVendorCustomer', {
          vendor,
          partnerIdentityToken: partnerIdentity.partnerIdentityToken,
        });

        createdSession = await this.#createUkycSession({
          vendor,
          geoCountry,
          aal2Token: params.aal2Token,
          partnerIdentityToken: partnerIdentity.partnerIdentityToken,
        });
      }
      return createdSession;
    }
    const sessionStatus = await this.messenger.call(
      'KycService:getSessionStatus',
      { sessionId: storedSession.id },
    );

    this.#updateSessionStatusAndTrackAnalytics(vendor, sessionStatus);
    // TODO: Should we resume polling here?
    return this.#refreshAuthorizationsIfNeeded(vendor);
  }

  /**
   * Stops session-status polling and restores default controller state.
   */
  async reset(): Promise<void> {
    this.clearState();
  }

  /**
   * Stops every vendor's session-status polling and removes every session
   * entry.
   */
  clearState(): void {
    this.#stopAllSessionStatusPolling();
    this.update((state) => {
      state.sessions = {};
    });
  }

  /**
   * Fetches the latest UKYC session status for a vendor.
   *
   * @param vendor - Identity vendor whose latest session should be queried.
   * @returns The session status, or `null` when none exists.
   */
  getSessionStatusForVendor(
    vendor: KycVendor,
  ): Promise<KycSessionStatus | null> {
    return this.messenger.call('KycService:getSessionStatusForVendor', vendor);
  }

  /**
   * Fetches the vendors this customer's verified identity data has been shared
   * with, newest first.
   *
   * The external user id is the same for every vendor, so it is read from any
   * stored session. When none is stored, the latest session for each vendor
   * with an entry is fetched (without writing it to state). An unresolvable
   * session yields an empty list rather than an error, so consumers can render
   * an empty "shared with" list.
   *
   * @returns The data shares, newest first; empty when no session can be
   * resolved.
   */
  async getDataShares(): Promise<KycDataShare[]> {
    const entries = Object.values(this.state.sessions);
    let externalUserId = entries.find((entry) => entry?.sessionStatus)
      ?.sessionStatus?.externalUserId;

    if (!externalUserId) {
      for (const vendor of Object.keys(this.state.sessions) as KycVendor[]) {
        const sessionStatus = await this.messenger.call(
          'KycService:getSessionStatusForVendor',
          vendor,
        );
        if (sessionStatus) {
          externalUserId = sessionStatus.externalUserId;
          break;
        }
      }
    }

    if (!externalUserId) {
      return [];
    }
    return this.messenger.call('KycService:getDataShares', { externalUserId });
  }

  /**
   * Returns the durable outcome of a vendor's identity-provider flow.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @returns The latest provider-flow status, or `not_started` when the vendor
   * has no entry.
   */
  getProviderFlowStatus({
    vendor,
  }: {
    vendor: KycVendor;
  }): KycProviderFlowStatus {
    return this.state.sessions[vendor]?.providerFlowStatus ?? 'not_started';
  }

  // TODO: Perhaps this should be renamed to resumeSession()?
  /**
   * Returns the vendor's session already stored on state.
   *
   * Starts that vendor's session-status polling when `finalStatus` is not
   * `approved`, `rejected`, or `retry`. Does not fetch status or refresh
   * capability authorization.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @returns The session status stored at call time.
   * @throws If the vendor has no session on state.
   */
  refreshSessionStatus({ vendor }: { vendor: KycVendor }): KycSessionStatus {
    const sessionStatus = this.#requireSessionStatus(vendor);
    if (!FINAL_STATUSES_TO_STOP_POLLING.has(sessionStatus.finalStatus)) {
      this.startSessionStatusPolling({ vendor });
    }
    return sessionStatus;
  }

  /**
   * Returns the vendor's persisted session status.
   *
   * Does not call the network and does not start session-status polling.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @returns The vendor's session on state, or `null` when none is stored.
   */
  readSessionStatus({
    vendor,
  }: {
    vendor: KycVendor;
  }): KycSessionStatus | null {
    return this.state.sessions[vendor]?.sessionStatus ?? null;
  }

  /**
   * Fetches `GET /sessions/{id}/status` once for the vendor's stored session
   * and writes the result onto that vendor's entry.
   *
   * Does not start the session-status polling timer.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @returns The fetched session status.
   * @throws If the vendor has no session on state.
   */
  async fetchSessionStatusOnce({
    vendor,
  }: {
    vendor: KycVendor;
  }): Promise<KycSessionStatus> {
    const { id: sessionId } = this.#requireSessionStatus(vendor);
    const sessionStatus = await this.messenger.call(
      'KycService:getSessionStatus',
      { sessionId },
    );
    this.#updateSessionStatusAndTrackAnalytics(vendor, sessionStatus);
    return sessionStatus;
  }

  /**
   * Starts polling `GET /sessions/{id}/status` for the vendor's stored
   * session. Each vendor has its own loop. Each tick writes the result onto
   * that vendor's entry only when the payload changed. The first poll runs
   * immediately. Each later wait starts at 10 seconds and grows by 10 seconds
   * after every poll, including a failed one. Starting the loop again resets
   * that delay. The loop stops once `finalStatus` is `approved`, `rejected`,
   * or `retry`, or when {@link reset} / {@link clearState} runs.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @throws If the vendor has no session id to poll.
   */
  startSessionStatusPolling({ vendor }: { vendor: KycVendor }): void {
    const { id: sessionId } = this.#requireSessionStatus(vendor);

    this.#stopSessionStatusPolling(vendor);
    const token = this.#getSessionStatusPollToken(vendor);
    let completedPolls = 0;

    const tick = async (): Promise<void> => {
      const shouldStop = await this.#pollSessionStatusOnce(
        vendor,
        sessionId,
        token,
      );
      if (shouldStop) {
        return;
      }
      completedPolls += 1;
      const timer = setTimeout(() => {
        this.#sessionStatusPollTimers.delete(vendor);
        // `tick` swallows its own errors and therefore never rejects.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        tick();
      }, SESSION_STATUS_POLL_INTERVAL_MS * completedPolls);
      timer.unref?.();
      this.#sessionStatusPollTimers.set(vendor, timer);
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    tick();
  }

  /**
   * Fetches session status for the polled session and records it on the
   * vendor's entry when it differs from state.
   *
   * @param vendor - Vendor the loop belongs to.
   * @param sessionId - Session the loop started for.
   * @param token - Polling token captured when the loop started.
   * @returns Whether the loop should stop.
   */
  async #pollSessionStatusOnce(
    vendor: KycVendor,
    sessionId: string,
    token: number,
  ): Promise<boolean> {
    try {
      const sessionStatus = await this.messenger.call(
        'KycService:getSessionStatus',
        { sessionId },
      );
      if (this.#getSessionStatusPollToken(vendor) !== token) {
        return true;
      }
      const entry = this.state.sessions[vendor];
      /* istanbul ignore next: clearState bumps the token before removing
         entries, so a live loop always finds its entry. */
      if (!entry) {
        return true;
      }

      // TODO: This check seems fragile
      if (
        JSON.stringify(entry.sessionStatus) !== JSON.stringify(sessionStatus)
      ) {
        this.#updateSessionStatusAndTrackAnalytics(vendor, sessionStatus);
      }

      if (FINAL_STATUSES_TO_STOP_POLLING.has(sessionStatus.finalStatus)) {
        this.#stopSessionStatusPolling(vendor);
        return true;
      }
      return false;
    } catch {
      return this.#getSessionStatusPollToken(vendor) !== token;
    }
  }

  // === VENDOR SESSION ENTRIES ===

  /**
   * Applies a write to the vendor's session entry.
   *
   * A write does nothing when the vendor has no entry, so a request that was
   * still running when `clearState` / `reset` removed the entry cannot bring a
   * wiped session back. Only the calls that start a vendor's entry pass
   * `create: true`.
   *
   * @param vendor - The identity vendor.
   * @param write - Mutates the vendor's entry.
   * @param options - Write options.
   * @param options.create - Create the entry first when the vendor has none.
   */
  #updateVendorSession(
    vendor: KycVendor,
    write: (entry: KycVendorSessionState) => void,
    options: { create?: boolean } = {},
  ): void {
    this.update((state) => {
      const existing = state.sessions[vendor];
      if (!existing && !options.create) {
        return;
      }
      const entry = existing ?? getDefaultKycVendorSessionState();
      write(entry);
      state.sessions[vendor] = entry;
    });
  }

  /**
   * Returns the vendor's stored session status.
   *
   * @param vendor - The identity vendor.
   * @returns The vendor's session status.
   * @throws If the vendor has no session on state, or it has no id.
   */
  #requireSessionStatus(vendor: KycVendor): KycSessionStatus {
    const sessionStatus = this.state.sessions[vendor]?.sessionStatus;
    if (!sessionStatus?.id) {
      throw new Error('No session was found');
    }
    return sessionStatus;
  }

  // === ANALYTICS ===
  //
  // The private methods from here to `#stopSessionStatusPolling` only compute
  // analytics payloads and call `trackKycAnalytics`. Business methods call the
  // `...AndTrackAnalytics` wrappers in place of a plain `this.update`, so the
  // state write itself is unchanged and the analytics step is named at each
  // call site.

  /**
   * Computes the analytics KYC status for a vendor from the current state.
   *
   * @param vendor - The identity vendor.
   * @returns The analytics KYC status.
   */
  #getKycAnalyticsStatus(vendor: KycVendor): KycAnalyticsStatus {
    return getKycAnalyticsStatus(
      this.state.sessions[vendor]?.sessionStatus ?? null,
    );
  }

  /**
   * Reports one SumSub launch outcome through `trackKycAnalytics`.
   *
   * A callback exception is ignored. The KYC outcome is already stored, and
   * analytics must not replace it or skip the polling that follows a submit.
   *
   * @param vendor - The identity vendor.
   * @param status - The launch outcome.
   */
  #trackAnalyticsVerificationOutcome(
    vendor: KycVendor,
    status: KycAnalyticsVerificationOutcomePayload['status'],
  ): void {
    try {
      this.#trackKycAnalytics?.verificationOutcome({
        status,
        kycStatus: this.#getKycAnalyticsStatus(vendor),
        providerFlowStatus: this.getProviderFlowStatus({ vendor }),
        vendor,
      });
    } catch {
      // The host's tracker failed. The launch outcome stays as written.
    }
  }

  /**
   * Reports an analytics KYC status change when it differs from the status
   * before the causing write.
   *
   * A callback exception is ignored, so a tracker failure cannot keep a
   * finished session polling.
   *
   * @param vendor - The identity vendor.
   * @param previousAnalyticsStatus - Analytics KYC status before the causing write.
   */
  #trackAnalyticsStatusIfChanged(
    vendor: KycVendor,
    previousAnalyticsStatus: KycAnalyticsStatus,
  ): void {
    const kycStatus = this.#getKycAnalyticsStatus(vendor);
    if (kycStatus === previousAnalyticsStatus) {
      return;
    }
    try {
      this.#trackKycAnalytics?.statusChanged({
        previousKycStatus: previousAnalyticsStatus,
        kycStatus,
        providerFlowStatus: this.getProviderFlowStatus({ vendor }),
        vendor,
      });
    } catch {
      // The host's tracker failed. The stored session stays as written.
    }
  }

  /**
   * Replaces the vendor's stored session status, then reports an analytics KYC
   * status change when one occurred. State is written before the callback
   * runs.
   *
   * Writes that load a session into an empty slot must not use this helper, so
   * an already-decided session found on a fresh install is not reported.
   *
   * @param vendor - The identity vendor.
   * @param sessionStatus - The session status to store.
   */
  #updateSessionStatusAndTrackAnalytics(
    vendor: KycVendor,
    sessionStatus: KycSessionStatus,
  ): void {
    const previousAnalyticsStatus = this.#getKycAnalyticsStatus(vendor);
    this.#updateVendorSession(vendor, (entry) => {
      entry.sessionStatus = sessionStatus;
    });
    this.#trackAnalyticsStatusIfChanged(vendor, previousAnalyticsStatus);
  }

  /**
   * Applies the state write for one SumSub launch attempt, then reports the
   * launch outcome and, if the write changed the analytics KYC status (a
   * submitted launch moves it to `pending`), the status change. Every attempt
   * is reported, including a repeat of the previous outcome. Pass no `write`
   * for failures that must not write state.
   *
   * @param vendor - The identity vendor.
   * @param status - The launch outcome.
   * @param write - Optional write to the vendor's entry applied before the
   * callbacks run.
   */
  #recordLaunchOutcomeAndTrackAnalytics(
    vendor: KycVendor,
    status: 'submitted' | 'abandoned' | 'failed',
    write?: (entry: KycVendorSessionState) => void,
  ): void {
    const previousAnalyticsStatus = this.#getKycAnalyticsStatus(vendor);
    if (write) {
      this.#updateVendorSession(vendor, write);
    }
    this.#trackAnalyticsVerificationOutcome(vendor, status);
    this.#trackAnalyticsStatusIfChanged(vendor, previousAnalyticsStatus);
  }

  /**
   * Returns the vendor's current polling token.
   *
   * @param vendor - The identity vendor.
   * @returns The polling token.
   */
  #getSessionStatusPollToken(vendor: KycVendor): number {
    return this.#sessionStatusPollTokens.get(vendor) ?? 0;
  }

  /**
   * Stops the vendor's session-status polling loop.
   *
   * @param vendor - The identity vendor.
   */
  #stopSessionStatusPolling(vendor: KycVendor): void {
    this.#sessionStatusPollTokens.set(
      vendor,
      this.#getSessionStatusPollToken(vendor) + 1,
    );
    const timer = this.#sessionStatusPollTimers.get(vendor);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#sessionStatusPollTimers.delete(vendor);
    }
  }

  /**
   * Stops every vendor's session-status polling loop.
   */
  #stopAllSessionStatusPolling(): void {
    for (const vendor of this.#sessionStatusPollTokens.keys()) {
      this.#stopSessionStatusPolling(vendor);
    }
  }

  /**
   * Creates or reuses a UKYC session, wraps the `data_encryption_key` and
   * `ukyc_capability_token` against the returned encryption schemas, and
   * submits both via authorizations. Stores the resulting session status on
   * the vendor's entry. kyc-api returns the existing session if one with the
   * same vendor and canonicalUserId already exists.
   *
   * @param params - Vendor, country, and tokens used to create the session.
   * @param params.vendor - Identity vendor for the UKYC session.
   * @param params.geoCountry - ISO 3166-1 alpha-3 country of residence.
   * @param params.aal2Token - AAL2 authentication token sent as the
   * Authorization bearer value for session creation.
   * @param params.partnerIdentityToken - Partner identity token minted for
   * the vendor's audience.
   * @returns The created or refreshed session status.
   */
  async #createUkycSession(params: {
    vendor: KycVendor;
    geoCountry: string;
    aal2Token: string;
    partnerIdentityToken?: string;
    email?: string;
  }): Promise<KycSessionStatus> {
    // Establish a per-session X25519 keypair used to seal both secrets. The
    // private half stays on the device; the public half is registered on the
    // session so the server can open later authorizations. Each encryption
    // schema from session creation supplies the matching server public key.
    const sessionClientPrivateKey = x25519.utils.randomSecretKey();
    const sessionClientPublicKey = toBase64Url(
      x25519.getPublicKey(sessionClientPrivateKey),
    );
    const {
      sessionId,
      encryptionDataKey: encryptionDataKeySchema,
      ukycCapabilityToken: capabilityTokenSchema,
    } = await this.messenger.call('KycService:createUkycSession', {
      sessionClientPublicKey,
      residenceCountry: params.geoCountry,
      vendor: params.vendor,
      aal2Token: params.aal2Token,
      ...(params.partnerIdentityToken && {
        partnerIdentityToken: params.partnerIdentityToken,
      }),
      ...(params.email && { email: params.email }),
    });

    return this.#setAuthorizations({
      vendor: params.vendor,
      sessionId,
      sessionClientPrivateKey,
      sessionClientPublicKey,
      encryptionDataKeySchema,
      capabilityTokenSchema,
    });
  }

  /**
   * Verifies encryption schemas, wraps the `data_encryption_key` and
   * `ukyc_capability_token`, and submits both via
   * {@link KycService.setAuthorizations}. Stores the resulting session status
   * on the vendor's entry.
   *
   * @param params - Session key material and encryption schemas.
   * @param params.vendor - Identity vendor that owns the session.
   * @param params.sessionId - UKYC session id to authorize.
   * @param params.sessionClientPrivateKey - Per-session X25519 private key
   * used to seal both secrets.
   * @param params.sessionClientPublicKey - Matching public key registered on
   * the session (must correspond to `sessionClientPrivateKey`).
   * @param params.encryptionDataKeySchema - Encryption schema for the data
   * encryption key.
   * @param params.capabilityTokenSchema - Encryption schema for the capability
   * token.
   * @returns The session status after authorizations are applied.
   */
  async #setAuthorizations(params: {
    vendor: KycVendor;
    sessionId: string;
    sessionClientPrivateKey: Uint8Array;
    sessionClientPublicKey: string;
    encryptionDataKeySchema: EncryptionSchema;
    capabilityTokenSchema: EncryptionSchema;
  }): Promise<KycSessionStatus> {
    const {
      vendor,
      sessionId,
      sessionClientPrivateKey,
      encryptionDataKeySchema,
      capabilityTokenSchema,
    } = params;

    await this.#verifyWrappingKeys(
      encryptionDataKeySchema,
      capabilityTokenSchema,
    );

    const { wrappedEncryptionDataKey, wrappedUkycCapabilityToken } =
      await this.#generateWrappedAuthorizations(
        sessionClientPrivateKey,
        encryptionDataKeySchema,
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

    this.#updateSessionStatusAndTrackAnalytics(vendor, sessionStatus);

    return sessionStatus;
  }

  /**
   * Mints a new per-session X25519 keypair, reissues wrapping keys for the
   * vendor's session, and submits wrapped authorizations.
   *
   * @param vendor - The identity vendor.
   * @returns The session status after authorizations are applied.
   * @throws If the vendor has no session on state.
   */
  async #refreshAuthorizations(vendor: KycVendor): Promise<KycSessionStatus> {
    const { id: sessionId } = this.#requireSessionStatus(vendor);

    const sessionClientPrivateKey = x25519.utils.randomSecretKey();
    const sessionClientPublicKey = toBase64Url(
      x25519.getPublicKey(sessionClientPrivateKey),
    );

    const {
      encryptionDataKey: encryptionDataKeySchema,
      ukycCapabilityToken: capabilityTokenSchema,
    } = await this.messenger.call('KycService:resetWrappingKeys', {
      sessionId,
      sessionClientPublicKey,
    });

    return this.#setAuthorizations({
      vendor,
      sessionId,
      sessionClientPrivateKey,
      sessionClientPublicKey,
      encryptionDataKeySchema,
      capabilityTokenSchema,
    });
  }

  /**
   * Refreshes and resubmits the UKYC capability authorization when the
   * vendor's session reports it as `new` or `expired`. Uses the session status
   * already on state (callers are responsible for refreshing status when
   * needed). No-ops when KYC has already finished (`finalStatus` is `approved`
   * or `rejected`) or the capability token is `pending`, `stored`, or `wiped`.
   *
   * @param vendor - The identity vendor.
   * @returns The current or refreshed session status.
   * @throws If the vendor has no session on state.
   */
  async #refreshAuthorizationsIfNeeded(
    vendor: KycVendor,
  ): Promise<KycSessionStatus> {
    const sessionStatus = this.#requireSessionStatus(vendor);

    if (!needsCapabilityAuthorizationRefresh(sessionStatus)) {
      return sessionStatus;
    }
    return this.#refreshAuthorizations(vendor);
  }

  /**
   * Fetches the idOS + KYC-provider disclaimer catalog. Pass exactly one of
   * `vendor` or `country`:
   *
   * - `{ vendor }` → {@link KycService.fetchSessionDisclaimersBySessionId}
   *   for that vendor's session (`GET /sessions/{sessionId}/disclaimers`)
   * - `{ country }` → {@link KycService.fetchSessionDisclaimersByCountry}
   *   (`GET /disclaimers?country=`)
   *
   * @param params - The parameters. Provide exactly one of `vendor` or
   * `country`.
   * @param params.vendor - Identity vendor whose session catalog to fetch.
   * @param params.country - ISO 3166-1 alpha-3 country code.
   * @returns The catalog. Session fetches include consent state; country
   * fetches do not.
   */
  async fetchSessionDisclaimers(
    params: FetchSessionDisclaimersParams,
  ): Promise<KycSessionDisclaimers | KycDisclaimersCatalog> {
    const { vendor, country } = params as {
      vendor?: KycVendor;
      country?: string;
    };
    if (vendor && country) {
      throw new Error(
        'KycController.fetchSessionDisclaimers: provide exactly one of vendor or country.',
      );
    }

    if (country) {
      return this.messenger.call(
        'KycService:fetchSessionDisclaimersByCountry',
        { country },
      );
    }

    if (!vendor) {
      throw new Error(
        'KycController.fetchSessionDisclaimers: provide exactly one of vendor or country.',
      );
    }

    const { id: sessionId } = this.#requireSessionStatus(vendor);
    return this.messenger.call(
      'KycService:fetchSessionDisclaimersBySessionId',
      {
        sessionId,
      },
    );
  }

  /**
   * Fetches the vendor's session-scoped disclaimer catalog and records
   * consents derived from the T&C2 flags. Already-consented catalog rows are
   * omitted from the POST. A 409 is re-checked with a GET: continue only when
   * every accepted document is now consented, otherwise fail closed.
   *
   * @param params - Accepted session-disclaimer records.
   * @param params.vendor - The identity vendor.
   * @param params.providerDisclaimersAccepted - Accepted Sumsub disclaimer records.
   * @param params.idosDisclaimersAccepted - Accepted idOS disclaimer records.
   * @param params.credentialReusabilityConsentGiven - Whether credential
   * reuse was accepted.
   */
  async recordSessionDisclaimers(params: {
    vendor: KycVendor;
    providerDisclaimersAccepted: KycConsentRecord[];
    idosDisclaimersAccepted: KycConsentRecord[];
    credentialReusabilityConsentGiven: boolean;
  }): Promise<void> {
    const { vendor } = params;
    const { id: sessionId } = this.#requireSessionStatus(vendor);

    // TODO: Check if these can simply be mapped to `{key, version}` pairs instead
    const disclaimers = await this.messenger.call(
      'KycService:fetchSessionDisclaimersBySessionId',
      { sessionId },
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
      await this.messenger.call('KycService:submitSessionDisclaimers', {
        sessionId,
        idOS,
        kycProvider,
        credentialReusabilityConsentGiven:
          params.credentialReusabilityConsentGiven,
      });
    } catch {
      // A 409 means the session already recorded these consents.
    }
    this.#updateVendorSession(vendor, (entry) => {
      entry.providerDisclaimersAccepted = params.providerDisclaimersAccepted;
      entry.idosDisclaimersAccepted = params.idosDisclaimersAccepted;
      entry.credentialReusabilityConsentGiven =
        params.credentialReusabilityConsentGiven;
    });
  }

  /**
   * Fetches the vendor's current session status and reports whether consent
   * was given.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @returns Whether `consentStatus` is `given`.
   * @throws If the vendor has no session on state.
   */
  async hasCompletedSessionDisclaimers({
    vendor,
  }: {
    vendor: KycVendor;
  }): Promise<boolean> {
    const { id: sessionId } = this.#requireSessionStatus(vendor);

    // TODO: remove this explicit call to the service and use the state directly
    // after we have established the pattern for resuming a session after wallet
    // restart more concretely
    const sessionStatus = await this.messenger.call(
      'KycService:getSessionStatus',
      { sessionId },
    );

    return sessionStatus.consentStatus === 'given';
  }

  /**
   * Fetches the vendor T&Cs the customer must accept before a session is
   * created (`GET /vendors/{vendor}/disclaimers?country=`).
   *
   * @param params - The parameters.
   * @param params.vendor - Identity vendor.
   * @param params.country - ISO 3166-1 alpha-3 country code.
   * @returns The disclaimers.
   */
  async fetchVendorDisclaimers(params: {
    vendor: KycVendor;
    country: string;
  }): Promise<KycDisclaimer[]> {
    return this.messenger.call('KycService:fetchVendorDisclaimers', params);
  }

  /**
   * Stores the customer's acceptance of a vendor's T&Cs on the device, before
   * the vendor has it. Makes no network call, so it works before a session
   * exists; {@link recordVendorDisclaimers} submits it once one does. Creates
   * the vendor's entry when it has none.
   *
   * Accepting again replaces earlier acceptance and marks it not submitted.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @param params.country - ISO 3166-1 alpha-3 country the terms were fetched
   * for. Recorded as the entry's residence country until a session exists.
   * @param params.disclaimerIds - Accepted vendor T&C ids.
   */
  acceptVendorDisclaimers(params: {
    vendor: KycVendor;
    country: string;
    disclaimerIds: string[];
  }): void {
    this.#updateVendorSession(
      params.vendor,
      (entry) => {
        entry.vendorDisclaimersAccepted = {
          disclaimerIds: [...params.disclaimerIds],
          acceptedAt: new Date().toISOString(),
          submitted: false,
        };
        if (entry.sessionStatus === null) {
          entry.residenceCountry = params.country;
        }
      },
      { create: true },
    );
  }

  /**
   * Submits the vendor T&C acceptance stored by
   * {@link acceptVendorDisclaimers} via
   * {@link KycService.submitVendorDisclaimers}, then marks it submitted.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @returns The vendor signing records.
   * @throws If the vendor has no stored acceptance, or no session yet (the
   * vendor records terms against a customer that session creation creates).
   */
  async recordVendorDisclaimers({
    vendor,
  }: {
    vendor: KycVendor;
  }): Promise<KycVendorSigning[]> {
    const accepted = this.state.sessions[vendor]?.vendorDisclaimersAccepted;
    if (!accepted) {
      throw new Error('No vendor disclaimer acceptance was found');
    }
    this.#requireSessionStatus(vendor);

    const signings = await this.messenger.call(
      'KycService:submitVendorDisclaimers',
      {
        vendor,
        disclaimerIds: accepted.disclaimerIds,
      },
    );

    // The entry can be cleared while the request is in flight; do not
    // recreate it.
    this.update((state) => {
      const entry = state.sessions[vendor];
      if (entry?.vendorDisclaimersAccepted) {
        entry.vendorDisclaimersAccepted.submitted = true;
      }
    });

    return signings;
  }

  /**
   * Fetches the vendor's current T&C catalog for the entry's residence country
   * and returns whether submitted acceptance covers every document.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @returns Whether submitted acceptance covers the fetched catalog.
   * @throws If the vendor has no entry or no residence country.
   */
  async hasCompletedVendorDisclaimers({
    vendor,
  }: {
    vendor: KycVendor;
  }): Promise<boolean> {
    const entry = this.state.sessions[vendor];
    if (!entry) {
      throw new Error('No session was found');
    }
    if (!entry.residenceCountry) {
      throw new Error('No residence country was found');
    }

    const fetched = await this.fetchVendorDisclaimers({
      vendor,
      country: entry.residenceCountry,
    });

    return areVendorDisclaimersCompleted(
      entry.vendorDisclaimersAccepted,
      fetched,
    );
  }

  /**
   * Verifies the code a vendor emailed during onboarding.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @param params.otp - The code the vendor sent.
   * @returns The session status after the step.
   */
  verifyVendorEmailOtp({
    vendor,
    otp,
  }: {
    vendor: KycVendor;
    otp: string;
  }): Promise<KycSessionStatus> {
    return this.#onboardingStep(vendor, 'email/verify-otp', { otp });
  }

  /**
   * Asks the vendor to email a new onboarding code.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @returns The session status after the step.
   */
  resendVendorEmailOtp({
    vendor,
  }: {
    vendor: KycVendor;
  }): Promise<KycSessionStatus> {
    return this.#onboardingStep(vendor, 'email/resend-otp');
  }

  /**
   * Asks the vendor to text an onboarding code to a phone number.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @param params.phoneNumber - Phone number in E.164 format.
   * @returns The session status after the step.
   */
  sendVendorPhoneOtp({
    vendor,
    phoneNumber,
  }: {
    vendor: KycVendor;
    phoneNumber: string;
  }): Promise<KycSessionStatus> {
    return this.#onboardingStep(vendor, 'phone/send-otp', { phoneNumber });
  }

  /**
   * Verifies the code a vendor texted during onboarding.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @param params.otp - The code the vendor sent.
   * @returns The session status after the step.
   */
  verifyVendorPhoneOtp({
    vendor,
    otp,
  }: {
    vendor: KycVendor;
    otp: string;
  }): Promise<KycSessionStatus> {
    return this.#onboardingStep(vendor, 'phone/verify-otp', { otp });
  }

  /**
   * Runs one vendor onboarding step for the vendor's session and stores the
   * resulting status on its entry.
   *
   * @param vendor - The identity vendor.
   * @param step - The onboarding step.
   * @param body - Step payload.
   * @returns The session status after the step.
   */
  async #onboardingStep(
    vendor: KycVendor,
    step: KycOnboardingStep,
    body?: Record<string, string>,
  ): Promise<KycSessionStatus> {
    const { id: sessionId } = this.#requireSessionStatus(vendor);
    const sessionStatus = await this.messenger.call(
      'KycService:postOnboardingStep',
      { sessionId, step, ...(body && { body }) },
    );
    this.#updateSessionStatusAndTrackAnalytics(vendor, sessionStatus);
    return sessionStatus;
  }

  /**
   * Returns one verdict for the vendor's KYC session. See
   * {@link KycSessionDecision}.
   *
   * @param params - The parameters.
   * @param params.vendor - The identity vendor.
   * @returns The session decision; `none` when the vendor has no session.
   */
  getSessionDecision({ vendor }: { vendor: KycVendor }): KycSessionDecision {
    return getKycSessionDecision(this.state.sessions[vendor]);
  }

  /**
   * Deletes the caller's encrypted KYC blobs from MetaMask servers.
   *
   * Mints a fresh X25519 keypair, fetches a wrapping key from
   * `POST /deletions`, seals a `delete`-scoped `ukyc_capability_token` (4 hour
   * lifetime, client-presented) for that key, and submits it to
   * `DELETE /deletions/{deletionId}`. Both KYC API calls are authenticated
   * with `params.aal2Token`. Does not clear controller state.
   *
   * @param params - The deletion parameters.
   * @param params.aal2Token - AAL2 authentication token sent as the
   * Authorization bearer value for both deletion requests.
   */
  async deleteEncryptedStorage(params: { aal2Token: string }): Promise<void> {
    if (!params.aal2Token) {
      throw new Error(
        'KycController.deleteEncryptedStorage: aal2Token is required to delete encrypted KYC storage.',
      );
    }

    const sessionClientPrivateKey = x25519.utils.randomSecretKey();
    const sessionClientPublicKey = toBase64Url(
      x25519.getPublicKey(sessionClientPrivateKey),
    );

    const { deletionId, ukycCapabilityToken: capabilityTokenSchema } =
      await this.messenger.call('KycService:createDeletion', {
        sessionClientPublicKey,
        aal2Token: params.aal2Token,
      });

    await this.#verifyCapabilityTokenSchema(capabilityTokenSchema);

    const clientMaterial = await this.#getClientMaterial();
    const wrappedUkycCapabilityToken = this.#wrapCapabilityToken({
      clientMaterial,
      sessionClientPrivateKey,
      serverPublicKeyX: capabilityTokenSchema.serverPublicKey.x,
      operations: ['delete'],
      expiresAt: new Date(Date.now() + UKYC_DELETE_CAPABILITY_TOKEN_TTL_MS),
    });

    await this.messenger.call('KycService:completeDeletion', {
      deletionId,
      wrappedUkycCapabilityToken,
      aal2Token: params.aal2Token,
    });
  }

  /**
   * Presents the identity-provider verification UI for the vendor's session.
   * Currently launches SumSub.
   *
   * Only one flow is presented at a time. A launch while another flow is on
   * screen returns `failed` without writing state.
   *
   * @param params - The vendor and optional SDK presentation options.
   * @param params.vendor - The identity vendor.
   * @param params.locale - BCP-47 locale for the SDK UI.
   * @param params.debug - Enables SDK debug logging.
   * @returns The durable provider-flow outcome.
   */
  async launchProviderFlow({
    vendor,
    locale,
    debug,
  }: {
    vendor: KycVendor;
    locale?: string;
    debug?: boolean;
  }): Promise<KycProviderFlowStatus> {
    if (this.#presentingVendor !== null) {
      return 'failed';
    }
    this.#presentingVendor = vendor;
    try {
      // Currently only sumsub is supported and must be used for Iron
      return await this.#launchSumsubFlow(vendor, { locale, debug });
    } finally {
      this.#presentingVendor = null;
    }
  }

  /**
   * Runs the SumSub document-verification sub-flow end to end for the
   * vendor's session:
   *
   *  1. fetches the SumSub applicant access token; and
   *  2. presents the SDK via the injected launcher.
   *
   * Capability authorization must already be valid on the vendor's session
   * (see {@link KycController.#refreshAuthorizationsIfNeeded}).
   *
   * @param vendor - The identity vendor.
   * @param params - Optional parameters.
   * @param params.locale - BCP-47 locale for the SDK UI.
   * @param params.debug - Enables SDK debug logging.
   * @returns The durable provider-flow outcome.
   */
  async #launchSumsubFlow(
    vendor: KycVendor,
    params?: {
      locale?: string;
      debug?: boolean;
    },
  ): Promise<KycProviderFlowStatus> {
    const sessionId = this.state.sessions[vendor]?.sessionStatus?.id;
    if (!this.#sumsubLauncher.isAvailable() || !sessionId) {
      this.#recordLaunchOutcomeAndTrackAnalytics(vendor, 'failed', (entry) => {
        entry.providerFlowStatus = 'failed';
      });
      return 'failed';
    }

    try {
      // TODO: check if the sumsub and idos disclaimers are accepted
      const { applicantAccessToken } = await this.messenger.call(
        'KycService:createJourney',
        sessionId,
      );

      // Track whether the SDK ever reported a successful completion or its own
      // failure. A resolved `launch` alone does not imply success — the
      // applicant may have abandoned the flow, or the SDK may have reported
      // that it could not run.
      let reachedCompletion = false;
      let sdkFailed = false;

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
          if (isSumSubFlowFailed(next)) {
            sdkFailed = true;
          }
        },
        locale: params?.locale ?? 'en',
        debug: params?.debug ?? false,
      });

      // Some native SDKs resolve with their final status without first
      // delivering the corresponding state-change callback.
      reachedCompletion ||= isSumSubFlowCompleted(result.status);
      sdkFailed ||= isSumSubFlowFailed(result.status);

      const currentSessionStatus = this.state.sessions[vendor]?.sessionStatus;
      if (!currentSessionStatus || currentSessionStatus.id !== sessionId) {
        this.#recordLaunchOutcomeAndTrackAnalytics(vendor, 'failed');
        return 'failed';
      }

      if (sdkFailed) {
        this.#recordLaunchOutcomeAndTrackAnalytics(
          vendor,
          'failed',
          (entry) => {
            entry.providerFlowStatus = 'failed';
          },
        );
        return 'failed';
      }

      if (reachedCompletion) {
        // Once the SDK completes, the authoritative verification decision comes
        // from the UKYC backend, not the SDK result.
        this.#recordLaunchOutcomeAndTrackAnalytics(
          vendor,
          'submitted',
          (entry) => {
            entry.sessionStatus = {
              ...currentSessionStatus,
              finalStatus: KYC_STATUSES.pending,
              // The applicant has submitted documents, so the session is in
              // vendor processing rather than still on the `kyc` step.
              currentStep: KYC_CURRENT_STEPS.processing,
            };
            entry.providerFlowStatus = 'submitted';
          },
        );
        this.startSessionStatusPolling({ vendor });
        return 'submitted';
      }

      this.#recordLaunchOutcomeAndTrackAnalytics(
        vendor,
        'abandoned',
        (entry) => {
          entry.providerFlowStatus = 'abandoned';
        },
      );
      return 'abandoned';
    } catch {
      if (this.state.sessions[vendor]?.sessionStatus?.id === sessionId) {
        this.#recordLaunchOutcomeAndTrackAnalytics(
          vendor,
          'failed',
          (entry) => {
            entry.providerFlowStatus = 'failed';
          },
        );
      } else {
        this.#recordLaunchOutcomeAndTrackAnalytics(vendor, 'failed');
      }
      return 'failed';
    }
  }

  /**
   * Verifies the deletion wrapping key. A deletion response carries only the
   * `ukycCapabilityToken` schema, attested by the idOS relay.
   *
   * Fetch and verification failures are rethrown as a short message suitable
   * for display. The original error is preserved on `cause`.
   *
   * @param capabilityTokenSchema - Encryption schema for the capability token.
   * @throws When the relay signing keys cannot be fetched, or the schema's
   * `jwtChain` does not verify.
   */
  async #verifyCapabilityTokenSchema(
    capabilityTokenSchema: EncryptionSchema,
  ): Promise<void> {
    let idosRelayKeys: Jwk[];
    try {
      ({ keys: idosRelayKeys } = await this.messenger.call(
        'KycService:fetchIdosRelayJwks',
      ));
    } catch (error) {
      throw wrapError(
        error,
        'KycController.#verifyCapabilityTokenSchema: Unable to fetch JWKS needed to verify wrapping keys.',
      );
    }

    try {
      assertAttestedServerPublicKey(idosRelayKeys, capabilityTokenSchema);
    } catch (error) {
      throw wrapError(
        error,
        'KycController.#verifyCapabilityTokenSchema: Failed to verify the wrapping keys.',
      );
    }
  }

  /**
   * Verifies each schema's jwtChain against the matching issuer JWKS, then
   * confirms the returned server public key matches the value attested inside
   * the verified JWT payload before trusting it for wrapping.
   * `encryptionDataKey` is attested by the idOS enclave; `ukycCapabilityToken`
   * by the idOS relay.
   *
   * Fetch and verification failures are rethrown as a short message suitable
   * for display. The original error is preserved on `cause`.
   *
   * @param encryptionDataKey - Encryption schema for the data encryption key.
   * @param capabilityTokenSchema - Encryption schema for the capability token.
   * @throws When the issuer signing keys cannot be fetched, or a schema's
   * `jwtChain` does not verify.
   */
  async #verifyWrappingKeys(
    encryptionDataKey: EncryptionSchema,
    capabilityTokenSchema: EncryptionSchema,
  ): Promise<void> {
    let idosEnclaveKeys: Jwk[];
    let idosRelayKeys: Jwk[];
    try {
      [{ keys: idosEnclaveKeys }, { keys: idosRelayKeys }] = await Promise.all([
        this.messenger.call('KycService:fetchIdosEnclaveJwks'),
        this.messenger.call('KycService:fetchIdosRelayJwks'),
      ]);
    } catch (error) {
      throw wrapError(
        error,
        'KycController.#verifyWrappingKeys: Unable to fetch JWKS needed to verify wrapping keys.',
      );
    }

    try {
      assertAttestedServerPublicKey(idosEnclaveKeys, encryptionDataKey);
      assertAttestedServerPublicKey(idosRelayKeys, capabilityTokenSchema);
    } catch (error) {
      throw wrapError(
        error,
        'KycController.#verifyWrappingKeys: Failed to verify the wrapping keys.',
      );
    }
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
    const clientMaterial = await this.#getClientMaterial();
    const wrappedEncryptionDataKey = wrapEncryptionKey(
      sessionClientPrivateKey,
      encryptionDataKey.serverPublicKey.x,
      clientMaterial.dataEncryptionKey,
    );
    const wrappedUkycCapabilityToken = this.#wrapCapabilityToken({
      clientMaterial,
      sessionClientPrivateKey,
      serverPublicKeyX: capabilityTokenSchema.serverPublicKey.x,
      // TODO: Confirm with idOS when this can be switched back to read and a separate token is sent for write
      operations: ['read', 'write'],
      expiresAt: new Date(Date.now() + UKYC_CAPABILITY_TOKEN_TTL_MS),
    });

    return { wrappedEncryptionDataKey, wrappedUkycCapabilityToken };
  }

  /**
   * Loads the stored `local_user_secret`, creating one when none exists, and
   * derives the UKYC client material from it.
   *
   * @returns Client material derived from `local_user_secret`.
   */
  async #getClientMaterial(): Promise<UkycClientMaterial> {
    const localUserSecret = await getOrCreateLocalUserSecret(
      this.#localUserSecretStore,
    );
    return deriveClientMaterial(localUserSecret);
  }

  /**
   * Mints a client-presented `ukyc_capability_token` and seals it for the
   * server public key from a capability-token encryption schema.
   *
   * The operation list and lifetime stay with the caller: session
   * authorizations grant `read` and `write` for the session lifetime, while
   * deletion grants `delete` alone for a short window.
   *
   * @param params - Key material and token claims.
   * @param params.clientMaterial - Client material derived from
   * `local_user_secret`.
   * @param params.sessionClientPrivateKey - X25519 private key used to seal
   * the token.
   * @param params.serverPublicKeyX - Server X25519 public key (unpadded
   * base64url) from the capability-token schema.
   * @param params.operations - Storage operations the token authorizes.
   * `delete` must be the sole operation.
   * @param params.expiresAt - Token expiry. Must be after the issue time.
   * @returns The wrapped capability token.
   */
  #wrapCapabilityToken(params: {
    clientMaterial: UkycClientMaterial;
    sessionClientPrivateKey: Uint8Array;
    serverPublicKeyX: string;
    operations: UkycStorageOperation[];
    expiresAt: Date;
  }): CapabilityAuthorization {
    const ukycCapabilityToken = signStorageAccessToken({
      material: params.clientMaterial,
      operations: params.operations,
      expiresAt: params.expiresAt,
    });
    return wrapEncryptionKey(
      params.sessionClientPrivateKey,
      params.serverPublicKeyX,
      stringToBytes(encodeStorageAccessTokenForHeader(ukycCapabilityToken)),
    );
  }
}
