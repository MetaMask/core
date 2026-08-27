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

import { decryptCredentials, generateKeyPair } from './crypto.js';
import type { EncryptedCredentialsEnvelope, X25519KeyPair } from './crypto.js';
import type { KycControllerMethodActions } from './KycController-method-action-types.js';
import type { KycServiceMethodActions } from './KycService-method-action-types.js';
import type {
  CreateUkycSessionParams,
  EncryptionSchema,
} from './KycService.js';
import type {
  KycConsentDocument,
  KycCustomerIdentity,
  KycDisclaimer,
  KycPhase,
  KycProduct,
  KycSessionDisclaimers,
  KycSessionStatus,
  KycSumSubLauncher,
  KycSumSubStatus,
  KycUserStatus,
  KycVendor,
} from './types.js';
import { deriveClientMaterial } from './ukyc/deriveClientMaterial.js';
import { verifyJwtChain } from './ukyc/jwtChain.js';
import type { Jwk } from './ukyc/jwtChain.js';
import { getOrCreateLocalUserSecret } from './ukyc/localUserSecret.js';
import type { UkycLocalUserSecretStore } from './ukyc/localUserSecret.js';
import {
  encodeStorageAccessTokenForHeader,
  signStorageAccessToken,
} from './ukyc/storageAccessToken.js';
import { wrapEncryptionKey } from './ukyc/wrapEncryptionKey.js';

// === GENERAL ===

export const controllerName = 'KycController';

const FRAMES_BASE_URL = 'https://blocks.moonpay.com/platform/v1';
const CHANNEL_CHECK = 'ch_1';
const CHANNEL_AUTH = 'ch_2';
const CHANNEL_RESET = 'ch_reset';

// Placeholder credentials for the SumSub sub-flow. These are demo values that
// must be replaced with real UKYC-issued material before production use.
const MOCK_JWT_TOKEN = 'mock-jwt-token';

// Lifetime of the read-only `ukyc_capability_token` minted when creating a
// UKYC session. The storage-and-auth spec requires the token's `expires_at` to
// cover the KYC session's expected lifetime — including the provider journey —
// rather than a fixed short window, so this is a session-scoped window.
const UKYC_CAPABILITY_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

// The SumSub SDK status that signals the applicant finished the flow
// successfully. Any other resolution (abandonment, failure, or a non-success
// outcome) must not be recorded as `complete`.
const SUMSUB_COMPLETED_STATUS = 'Completed';

// Phases that represent an active vendor-session flow (tokens issued and/or
// Check/Auth frames in progress). A repeat `initialize` while in one of these
// must not restart the session and disrupt the in-flight flow.
const IN_PROGRESS_PHASES: KycPhase[] = [
  'session',
  'check',
  'auth',
  'form',
  'submit',
];

// How often to poll the UKYC session status after the SumSub SDK completes,
// until a terminal status is reached. Overridable via the constructor.
const DEFAULT_SESSION_STATUS_POLL_INTERVAL_MS = 15_000;

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

// `finalStatus` values that end the polling loop. Anything else (e.g.
// `KYC_STATUSES.pending`) keeps polling.
const TERMINAL_SESSION_STATUSES: ReadonlySet<string> = new Set([
  KYC_STATUSES.approved,
  KYC_STATUSES.completed,
  KYC_STATUSES.rejected,
  KYC_STATUSES.failed,
  KYC_STATUSES.blocked,
]);

// Terminal `finalStatus` values that represent a successful verification. Any
// other terminal status resolves the sub-flow to `failed`.
const SUCCESSFUL_SESSION_STATUSES: ReadonlySet<string> = new Set([
  KYC_STATUSES.approved,
  KYC_STATUSES.completed,
]);

// Session creation can report that the applicant is already approved on the
// relay (`kycStatus === KYC_STATUSES.approved`) while the vendor is still
// finalizing its decision (`finalStatus === KYC_STATUSES.pending`, a
// non-terminal status). In that case there is nothing left for the applicant
// to do, so the sub-flow stops before launching the SDK and surfaces this
// message.
const VENDOR_PROCESSING_MESSAGE =
  'Your KYC has been submitted and is being processed by the vendor.';

// UKYC / relay error indicating the applicant already finished KYC. Mapped to
// the simplified `completed` user status for the Money toast surface.
const SESSION_NOT_IN_VALID_STATE = 'session_not_in_valid_state';

// How often to refresh the user-keyed `GET /kyc/status` while the simplified
// status is still `pending`. Overridable via the constructor.
const DEFAULT_USER_STATUS_POLL_INTERVAL_MS = 15_000;

// === STATE ===

/**
 * Describes the shape of the state object for {@link KycController}.
 */
export type KycControllerState = {
  /** Current phase of the identity flow. */
  phase: KycPhase;
  /** Human-readable status message for the current phase. */
  statusMessage: string;
  /** The current error message, or `null`. */
  error: string | null;

  /** Email associated with the session (sourced from the account). */
  email: string | null;

  /** ISO-8601 timestamp of the customer's terms acceptance (persisted). */
  termsAcceptedAt: string | null;
  /** IDs of the disclaimers the customer accepted (persisted). */
  acceptedDisclaimerIds: string[];
  /**
   * The vendor whose disclaimers `acceptedDisclaimerIds` belong to (persisted).
   * Each vendor serves its own disclaimer set, so acceptance recorded for one
   * vendor must not be reused for another. `null` when nothing is accepted.
   */
  termsAcceptedVendor: KycVendor | null;
  /**
   * Whether the customer accepted the SumSub T&C (T&C2) during the last
   * terms acceptance (persisted). Consents-path vendors require this flag
   * when resuming a session. `null` for acceptance recorded before this
   * field existed (treated as requiring reacceptance).
   */
  sumsubTncAccepted: boolean | null;
  /**
   * Whether the customer accepted the idOS T&C (T&C2) during the last
   * terms acceptance (persisted). Consents-path vendors require this flag
   * when resuming a session. `null` for acceptance recorded before this
   * field existed (treated as requiring reacceptance).
   */
  idosTncAccepted: boolean | null;
  /**
   * Whether the customer consented to reuse existing idOS credentials
   * during this session. Applied when recording session-scoped disclaimers.
   * Not persisted: a new UKYC session must collect reuse consent again.
   * `null` when never set (treated as `false`).
   */
  credentialReusabilityConsentGiven: boolean | null;

  /** Disclaimers fetched for the current country. */
  disclaimers: KycDisclaimer[];
  /** Error encountered while loading disclaimers, or `null`. */
  disclaimersError: string | null;
  /**
   * Session-scoped idOS / KYC-provider disclaimer catalog from
   * `GET /sessions/{sessionId}/disclaimers`. `null` until a UKYC session
   * exists and the catalog has been fetched.
   */
  sessionDisclaimers: KycSessionDisclaimers | null;

  /** Resolved ISO 3166-1 alpha-3 country code. */
  geoCountry: string | null;

  /** Vendor session token (not persisted, not logged). */
  sessionToken: string | null;
  /** Vendor access token (not persisted, not logged). */
  accessToken: string | null;
  /** Vendor customer id, used for the SumSub hand-off. */
  moonpayCustomerId: string | null;

  /**
   * The identity vendor driving the current flow. Captured at `initialize`.
   * Defaults to `moonpay` when omitted so existing ramps/card callers keep
   * the Check/Auth frame path. Non-MoonPay vendors skip those frames.
   */
  activeVendor: KycVendor;

  /**
   * The product the current flow is running for. Captured at `initialize`
   * (or `acceptTermsAndStartSession`) and used to automatically run the
   * KYC-required check once authentication completes. `null` outside a
   * product-scoped flow (in which case the flow stops at `form` and the
   * consumer drives the check manually).
   */
  activeProduct: KycProduct | null;

  /** Cached "is KYC required" result per product (persisted). */
  kycRequiredByProduct: Partial<Record<KycProduct, boolean>>;
  /** ISO-8601 timestamp of the last KYC-required check (persisted). */
  lastCheckedAt: string | null;

  /**
   * User-keyed simplified KYC status from `GET /kyc/status` (persisted so the
   * Money toast can render across cold starts). `null` until the first
   * successful `refreshKycStatus`.
   */
  userStatus: KycUserStatus | null;
  /** Optional SumSub session id for the retryable error path. */
  userStatusSumsubSessionId: string | null;
  /** Optional machine-readable error code for terminal / EDD UX. */
  userStatusErrorCode: string | null;

  /** SumSub document-verification sub-flow state. */
  sumsub: {
    status: KycSumSubStatus;
    result: Json | null;
    sessionId: string | null;
    applicantAccessToken: string | null;
    /**
     * The latest UKYC session status, populated while polling after the SDK
     * completes. `null` until the first successful poll.
     */
    sessionStatus: KycSessionStatus | null;
  };
};

const kycControllerMetadata = {
  phase: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  statusMessage: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  error: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  email: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: false,
  },
  termsAcceptedAt: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  acceptedDisclaimerIds: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  termsAcceptedVendor: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  sumsubTncAccepted: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  idosTncAccepted: {
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
  disclaimers: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: true,
  },
  disclaimersError: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  sessionDisclaimers: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: true,
  },
  geoCountry: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  sessionToken: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: false,
  },
  accessToken: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: false,
  },
  moonpayCustomerId: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: false,
  },
  activeVendor: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  activeProduct: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
  kycRequiredByProduct: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  lastCheckedAt: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  userStatus: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  userStatusSumsubSessionId: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: true,
    usedInUi: true,
  },
  userStatusErrorCode: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  sumsub: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: true,
  },
} satisfies StateMetadata<KycControllerState>;

/**
 * Constructs the default {@link KycController} state.
 *
 * @returns The default state.
 */
export function getDefaultKycControllerState(): KycControllerState {
  return {
    phase: 'idle',
    statusMessage: '',
    error: null,
    email: null,
    termsAcceptedAt: null,
    acceptedDisclaimerIds: [],
    termsAcceptedVendor: null,
    sumsubTncAccepted: null,
    idosTncAccepted: null,
    credentialReusabilityConsentGiven: null,
    disclaimers: [],
    disclaimersError: null,
    sessionDisclaimers: null,
    geoCountry: null,
    sessionToken: null,
    accessToken: null,
    moonpayCustomerId: null,
    activeVendor: 'moonpay',
    activeProduct: null,
    kycRequiredByProduct: {},
    lastCheckedAt: null,
    userStatus: null,
    userStatusSumsubSessionId: null,
    userStatusErrorCode: null,
    sumsub: {
      status: 'idle',
      result: null,
      sessionId: null,
      applicantAccessToken: null,
      sessionStatus: null,
    },
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
 * Whether recording session disclaimers failed because those document
 * versions were already consented for the session (`409 Conflict`).
 *
 * @param error - The caught error.
 * @returns `true` when the error is an HTTP 409.
 */
function isConsentConflictError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { httpStatus?: unknown }).httpStatus === 'number' &&
    (error as { httpStatus: number }).httpStatus === 409
  );
}

/**
 * Maps a session-disclaimer catalog into the `{ key, version }` records the
 * record-consents API expects, or an empty list when the user declined that
 * category.
 *
 * @param documents - Catalog documents for one consent category.
 * @param accepted - Whether the user accepted that category.
 * @returns Consent records, or `[]` when not accepted.
 */
function consentRecordsFromCatalog(
  documents: KycConsentDocument[],
  accepted: boolean,
): { key: string; version: string }[] {
  if (!accepted) {
    return [];
  }
  return documents
    .filter((document) => !document.consented)
    .map(({ key, version }) => ({ key, version }));
}

/**
 * Whether an accepted T&C2 category has no catalog documents. An empty list
 * would otherwise skip the POST and count as success.
 *
 * @param documents - Catalog documents for one consent category.
 * @param accepted - Whether the user accepted that category.
 * @returns `true` when the user accepted and the catalog is empty.
 */
function isAcceptedCategoryEmpty(
  documents: KycConsentDocument[],
  accepted: boolean,
): boolean {
  return accepted && documents.length === 0;
}

/**
 * Whether an accepted category is still missing consent after a 409 re-GET:
 * empty catalog or any document still unconsented.
 *
 * @param documents - Latest catalog documents for one consent category.
 * @param accepted - Whether the user accepted that category.
 * @returns `true` when accepted documents are not fully consented.
 */
function acceptedCategoryStillMissing(
  documents: KycConsentDocument[],
  accepted: boolean,
): boolean {
  return (
    accepted &&
    (documents.length === 0 ||
      documents.some((document) => !document.consented))
  );
}

/**
 * Vendors other than MoonPay skip Check/Auth frames and use the empty-shell
 * customer + consents path instead.
 *
 * @param vendor - The identity vendor for the current flow.
 * @returns `true` when the vendor uses the consents session path.
 */
function usesConsentsFlow(vendor: KycVendor): boolean {
  return vendor !== 'moonpay';
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'initialize',
  'loadDisclaimers',
  'acceptTermsAndStartSession',
  'createVendorCustomer',
  'clearSavedTerms',
  'handleFrameMessage',
  'buildCheckFrameUrl',
  'buildAuthFrameUrl',
  'buildResetFrameUrl',
  'checkKycRequired',
  'getKycStatus',
  'getCustomerIdentity',
  'refreshKycStatus',
  'startSumSub',
  'getSessionStatus',
  'reset',
  'clearState',
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
  /**
   * How often, in milliseconds, to poll the UKYC session status after the
   * SumSub SDK completes. Defaults to
   * {@link DEFAULT_SESSION_STATUS_POLL_INTERVAL_MS}.
   */
  sessionStatusPollIntervalMs?: number;
  /**
   * How often, in milliseconds, to refresh `GET /kyc/status` while the
   * simplified user status is `pending`. Defaults to
   * {@link DEFAULT_USER_STATUS_POLL_INTERVAL_MS}.
   */
  userStatusPollIntervalMs?: number;
};

/**
 * The shape of a message posted by a Check/Auth frame.
 */
type FrameMessage = {
  meta?: { channelId?: string };
  kind?: string;
  payload?: {
    status?:
      | 'active'
      | 'connectionRequired'
      | 'termsAcceptanceRequired'
      | 'pending'
      | 'unavailable'
      | 'failed';
    credentials?: EncryptedCredentialsEnvelope | string;
    customer?: { id?: string };
  };
};

// === CONTROLLER DEFINITION ===

/**
 * `KycController` orchestrates the vendor-backed KYC / identity-verification
 * flow (MoonPay identity + SumSub documents) behind a vendor-neutral, per
 * product surface used by ramps and card. It owns all state, HTTP
 * orchestration (via `KycService`), crypto, and the frame message protocol;
 * platform-specific presentation (WebView/iframe, SumSub SDK) is injected.
 */
export class KycController extends BaseController<
  typeof controllerName,
  KycControllerState,
  KycControllerMessenger
> {
  readonly #sumsubLauncher: KycSumSubLauncher;

  /** Ephemeral X25519 keypair for the frame key exchange (never persisted). */
  readonly #keypair: X25519KeyPair;

  /** Auth-frame client token, kept out of state. */
  #authClientToken: string | null = null;

  /**
   * Monotonic flow generation. Incremented by {@link reset} and
   * {@link clearState} so in-flight async work (e.g. the KYC-required check)
   * can detect that it was superseded and avoid writing stale results onto a
   * reset controller.
   */
  #generation = 0;

  /** Interval, in milliseconds, between session-status polls. */
  readonly #sessionStatusPollIntervalMs: number;

  /** Handle for the scheduled next session-status poll, or `null`. */
  #pollTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Monotonic polling token. Bumped by {@link #stopPolling} (called on reset, a
   * new sub-flow, and once a terminal status is reached) so an in-flight poll
   * `tick` can detect it was superseded and neither write state nor schedule a
   * follow-up. This closes the gap where clearing the timer alone would still
   * let an already-awaiting request finish and reschedule.
   */
  #pollToken = 0;

  /** Interval, in milliseconds, between user-keyed status polls. */
  readonly #userStatusPollIntervalMs: number;

  /** Handle for the scheduled next user-status poll, or `null`. */
  #userStatusPollTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Whether a user-status poll loop is currently active. Tracked separately
   * from {@link #userStatusPollTimer} because a scheduled tick clears the timer
   * handle before awaiting `fetchKycStatus`; relying on the handle alone would
   * let a concurrent {@link refreshKycStatus} start a second loop on the same
   * token during that in-flight window.
   */
  #userStatusPolling = false;

  /** Monotonic token for the user-status poll loop (see `#pollToken`). */
  #userStatusPollToken = 0;

  /**
   * Constructs a new {@link KycController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - Partial initial state; merged over defaults.
   * @param options.sumsubLauncher - The platform SumSub launcher adapter.
   * @param options.sessionStatusPollIntervalMs - How often to poll the UKYC
   * session status after the SumSub SDK completes.
   * @param options.userStatusPollIntervalMs - How often to refresh the
   * user-keyed KYC status while it is still `pending`.
   */
  constructor({
    messenger,
    state,
    sumsubLauncher,
    sessionStatusPollIntervalMs = DEFAULT_SESSION_STATUS_POLL_INTERVAL_MS,
    userStatusPollIntervalMs = DEFAULT_USER_STATUS_POLL_INTERVAL_MS,
  }: KycControllerOptions) {
    super({
      messenger,
      metadata: kycControllerMetadata,
      name: controllerName,
      state: { ...getDefaultKycControllerState(), ...state },
    });

    this.#sumsubLauncher = sumsubLauncher;
    this.#sessionStatusPollIntervalMs = sessionStatusPollIntervalMs;
    this.#userStatusPollIntervalMs = userStatusPollIntervalMs;
    this.#keypair = generateKeyPair();

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Builds an adapter over `UserStorageController` that the platform-agnostic
   * `getOrCreateLocalUserSecret` helper uses to persist/load the UKYC
   * `local_user_secret`.
   *
   * @returns The Encrypted User Storage adapter.
   */
  #localUserSecretStore(): UkycLocalUserSecretStore {
    return {
      get: async (
        path: string,
        entropySourceId?: string,
      ): Promise<string | null> =>
        this.messenger.call(
          'UserStorageController:performGetStorage',
          path as `${string}.${string}`,
          entropySourceId,
        ),
      set: async (
        path: string,
        value: string,
        entropySourceId?: string,
      ): Promise<void> =>
        this.messenger.call(
          'UserStorageController:performSetStorage',
          path as `${string}.${string}`,
          value,
          entropySourceId,
        ),
    };
  }

  /**
   * Resolves persisted terms + geolocation, and auto-creates a session when
   * terms are already accepted and an email is available.
   *
   * @param params - Optional parameters.
   * @param params.email - The account email to associate with the session.
   * @param params.product - The consuming feature the flow runs for. When
   * provided, the controller automatically runs the KYC-required check once
   * authentication completes (and chains into document verification when KYC
   * is required). When omitted, the flow stops at `form` and the consumer must
   * call `checkKycRequired` manually.
   * @param params.vendor - Identity vendor for this flow. Non-MoonPay vendors
   * skip Check/Auth frames and use the consents path. Defaults to `moonpay`.
   */
  async initialize(params?: {
    email?: string;
    product?: KycProduct;
    vendor?: KycVendor;
  }): Promise<void> {
    // A repeat `initialize` while a session flow is already in progress must
    // not tear it down: creating a new vendor session clears the tokens and
    // forces `phase` back through `session`/`check`, breaking an in-flight
    // Check/Auth frame flow. Leave the active flow untouched and let the
    // consumer drive it (or call `reset` first to start over).
    if (IN_PROGRESS_PHASES.includes(this.state.phase)) {
      return;
    }

    const vendor = params?.vendor ?? 'moonpay';

    // `initialize` starts a fresh flow, so `activeProduct` is always reset to
    // this call's product (or `null`). Otherwise a prior run's product could
    // linger and cause `#continueAfterAuthentication` to auto-run the check /
    // sub-flow when the caller intended the manual (product-less) flow.
    this.#applyUpdate((state) => {
      if (params?.email) {
        state.email = params.email;
      }
      state.activeVendor = vendor;
      // MoonPay Check/Auth artifacts must not survive a switch to another
      // vendor: leftover `sessionToken` would keep `buildCheckFrameUrl` alive,
      // leftover `accessToken` / `#authClientToken` would keep Auth / KYC
      // calls bound to MoonPay, and leftover `moonpayCustomerId` would make
      // `getCustomerIdentity` report a MoonPay id under the wrong vendor.
      if (vendor !== 'moonpay') {
        this.#authClientToken = null;
        this.#clearMoonPaySession(state);
      }
      state.activeProduct = params?.product ?? null;
    });

    // Capture the flow generation so a `reset()` landing while the async
    // geolocation / session steps below are in flight cannot write results
    // onto an idle controller.
    const generation = this.#generation;

    // Resolve country for display; non-blocking.
    try {
      const country = await this.messenger.call('KycService:getGeoCountry');
      this.#updateIfCurrent(generation, (state) => {
        state.geoCountry = country;
      });
    } catch {
      // Ignore; disclaimers loading will surface a country error if needed.
    }

    // A `reset()` / `clearState()` that landed while the geolocation request
    // was in flight supersedes this flow. Stop here rather than driving the
    // controller on into `terms` (or a new session): the steps below write
    // unconditionally, and `loadDisclaimers` captures the post-reset
    // generation, so its own guard would not catch this.
    if (this.#generation !== generation) {
      return;
    }

    if (usesConsentsFlow(vendor) && this.state.email) {
      try {
        await this.messenger.call('KycService:createVendorCustomer', {
          vendor,
          email: this.state.email,
        });
      } catch (error) {
        if (this.#generation !== generation) {
          return;
        }
        this.#fail(`Vendor customer creation failed: ${String(error)}`);
        return;
      }
    }

    // Drop another vendor's persisted acceptance only after this flow has
    // committed (customer creation succeeded, or there was none to wait for).
    // Clearing earlier would permanently lose ramps/card terms if Iron
    // customer creation failed or a reset landed while it was in flight.
    if (this.#generation !== generation) {
      return;
    }
    this.#dropTermsUnlessForVendor(vendor);

    const hasTerms =
      Boolean(this.state.termsAcceptedAt) &&
      this.state.acceptedDisclaimerIds.length > 0;

    if (hasTerms && this.state.email) {
      if (usesConsentsFlow(vendor)) {
        // Consents-path vendors require T&C2 flags; if they weren't persisted
        // (i.e. null from pre-migration state), require reacceptance.
        const sumsubTncSigned = this.state.sumsubTncAccepted;
        const idosTncSigned = this.state.idosTncAccepted;
        if (sumsubTncSigned === null || idosTncSigned === null) {
          this.#applyUpdate((state) => {
            this.#clearAcceptedTerms(state);
            state.phase = 'terms';
          });
          await this.loadDisclaimers();
          return;
        }
        await this.#startConsentsSession({
          sumsubTncSigned,
          idosTncSigned,
          credentialReusabilityConsentGiven:
            this.state.credentialReusabilityConsentGiven ?? false,
        });
      } else {
        await this.#createSession();
      }
      return;
    }

    this.#applyUpdate((state) => {
      state.phase = 'terms';
    });
    await this.loadDisclaimers();
  }

  /**
   * Creates (or resumes) an empty-shell customer for the given identity
   * vendor. Exposed so a consumer can ensure the customer exists before
   * showing T&C screens independently of {@link initialize}.
   *
   * A call while a session flow is already in progress is a no-op — matching
   * {@link initialize} — so a vendor switch cannot leave Check/Auth frames
   * attached to the wrong vendor. Call {@link reset} first to start over.
   *
   * @param params - The parameters.
   * @param params.vendor - Identity vendor for the customer.
   * @param params.email - Email for the vendor customer.
   */
  async createVendorCustomer(params: {
    vendor: KycVendor;
    email: string;
  }): Promise<void> {
    if (IN_PROGRESS_PHASES.includes(this.state.phase)) {
      return;
    }

    this.#applyUpdate((state) => {
      state.email = params.email;
      // MoonPay Check/Auth artifacts must not survive a switch to another
      // vendor — see `initialize`. Terms for another vendor are dropped only
      // after this request succeeds.
      state.activeVendor = params.vendor;
      if (params.vendor !== 'moonpay') {
        this.#authClientToken = null;
        this.#clearMoonPaySession(state);
      }
    });
    const generation = this.#generation;
    try {
      await this.messenger.call('KycService:createVendorCustomer', {
        vendor: params.vendor,
        email: params.email,
      });
      if (this.#generation !== generation) {
        return;
      }
      this.#dropTermsUnlessForVendor(params.vendor);
    } catch (error) {
      if (this.#generation !== generation) {
        return;
      }
      this.#fail(`Vendor customer creation failed: ${String(error)}`);
    }
  }

  /**
   * Loads the disclaimers for the resolved (or provided) country.
   *
   * @param params - Optional parameters.
   * @param params.country - ISO 3166-1 alpha-3 country code override.
   */
  async loadDisclaimers(params?: { country?: string }): Promise<void> {
    // Capture the flow generation so a `reset()` landing while the geo /
    // disclaimers requests are in flight cannot write results onto an idle
    // controller.
    const generation = this.#generation;
    try {
      const country =
        params?.country ??
        this.state.geoCountry ??
        (await this.messenger.call('KycService:getGeoCountry'));
      if (country !== this.state.geoCountry) {
        this.#updateIfCurrent(generation, (state) => {
          state.geoCountry = country;
        });
      }
      const disclaimers = await this.messenger.call(
        'KycService:fetchDisclaimers',
        {
          vendor: this.state.activeVendor,
          country,
        },
      );
      this.#updateIfCurrent(generation, (state) => {
        state.disclaimers = disclaimers;
        state.disclaimersError = null;
      });
    } catch (error) {
      this.#updateIfCurrent(generation, (state) => {
        state.disclaimersError = `Failed to load disclaimers: ${String(error)}`;
      });
    }
  }

  /**
   * Captures terms acceptance for the currently loaded disclaimers and creates
   * a session.
   *
   * @param params - The parameters.
   * @param params.email - The account email to associate with the session.
   * @param params.product - The consuming feature the flow runs for. See
   * {@link initialize} for how the product drives the automatic post
   * authentication continuation.
   * @param params.sumsubTncSigned - Whether Sumsub T&C were accepted (T&C2).
   * Required for every vendor so callers explicitly declare acceptance.
   * @param params.idosTncSigned - Whether idOS T&C were accepted (T&C2).
   * Required for every vendor so callers explicitly declare acceptance.
   * @param params.credentialReusabilityConsentGiven - Whether the customer
   * consented to reuse existing idOS credentials. Used when recording
   * session-scoped disclaimers on the consents path. Defaults to `false`.
   */
  async acceptTermsAndStartSession(params: {
    email?: string;
    product?: KycProduct;
    sumsubTncSigned: boolean;
    idosTncSigned: boolean;
    credentialReusabilityConsentGiven?: boolean;
  }): Promise<void> {
    const sumsubTncSigned = params?.sumsubTncSigned;
    const idosTncSigned = params?.idosTncSigned;
    if (
      typeof sumsubTncSigned !== 'boolean' ||
      typeof idosTncSigned !== 'boolean'
    ) {
      this.#fail('Missing T&C2 acceptance flags.');
      return;
    }
    const credentialReusabilityConsentGiven =
      params.credentialReusabilityConsentGiven ?? false;

    const termsAcceptedAt = new Date().toISOString();
    const disclaimerIds = this.state.disclaimers.map(
      (disclaimer) => disclaimer.id,
    );
    this.#applyUpdate((state) => {
      if (params.email) {
        state.email = params.email;
      }
      if (params.product) {
        state.activeProduct = params.product;
      }
      state.termsAcceptedAt = termsAcceptedAt;
      state.acceptedDisclaimerIds = disclaimerIds;
      state.termsAcceptedVendor = state.activeVendor;
      state.sumsubTncAccepted = sumsubTncSigned;
      state.idosTncAccepted = idosTncSigned;
      state.credentialReusabilityConsentGiven =
        credentialReusabilityConsentGiven;
    });
    if (usesConsentsFlow(this.state.activeVendor)) {
      await this.#startConsentsSession({
        sumsubTncSigned,
        idosTncSigned,
        credentialReusabilityConsentGiven,
      });
      return;
    }
    await this.#createSession();
  }

  /**
   * Consents-path vendors: record vendor T&Cs, create a UKYC session,
   * record session-scoped idOS / KYC-provider disclaimers, then launch
   * SumSub — skipping MoonPay Check/Auth frames.
   *
   * @param consents - T&C2 flags mapped onto the session disclaimer catalog.
   * @param consents.sumsubTncSigned - Whether Sumsub T&C were accepted.
   * @param consents.idosTncSigned - Whether idOS T&C were accepted.
   * @param consents.credentialReusabilityConsentGiven - Whether credential
   * reuse was accepted.
   */
  async #startConsentsSession(consents: {
    sumsubTncSigned: boolean;
    idosTncSigned: boolean;
    credentialReusabilityConsentGiven: boolean;
  }): Promise<void> {
    const { email, acceptedDisclaimerIds } = this.state;
    if (!email) {
      this.#fail('Missing email for consents session.');
      return;
    }
    if (acceptedDisclaimerIds.length === 0) {
      this.#fail('Missing disclaimer acceptance.');
      return;
    }

    const generation = this.#generation;
    this.#applyUpdate((state) => {
      state.error = null;
      state.phase = 'session';
      state.statusMessage = 'Submitting consents...';
      state.sumsub.status = 'creatingSession';
      state.sumsub.result = null;
      state.sumsub.sessionStatus = null;
      // Consents-path vendors have no MoonPay session/access tokens.
      this.#clearMoonPaySession(state);
    });

    try {
      await this.messenger.call('KycService:submitVendorDisclaimers', {
        vendor: this.state.activeVendor,
        disclaimerIds: acceptedDisclaimerIds,
      });
      if (this.#generation !== generation) {
        return;
      }

      this.#updateIfCurrent(generation, (state) => {
        state.statusMessage = 'Creating session...';
      });

      const created = await this.#createUkycSession(generation);
      if (!created || this.#generation !== generation) {
        return;
      }

      await this.#recordSessionDisclaimers(
        created.sessionId,
        consents,
        generation,
      );
      if (this.#generation !== generation) {
        return;
      }

      if (created.vendorProcessing) {
        try {
          await this.refreshKycStatus();
        } catch (statusError) {
          console.error('KYC status refresh failed:', statusError);
        }
        this.#updateIfCurrent(generation, (state) => {
          state.phase = 'done';
          state.statusMessage = VENDOR_PROCESSING_MESSAGE;
        });
        return;
      }
      this.#applyUpdate((state) => {
        state.phase = 'submit';
        state.statusMessage = 'Starting document verification...';
      });
      const sumsubResult = await this.startSumSub();
      if (this.#generation !== generation) {
        return;
      }
      // `startSumSub` records `sumsub.status = 'failed'` for thrown steps,
      // an SDK close without Completed, *and* a terminal UKYC rejection
      // after the SDK reported Completed. Only rewind when there is no
      // session-status decision yet (abandonment / thrown step). A
      // Completed-then-rejected poll writes `sessionStatus` and is a
      // finished flow: refresh user status and land on `done`.
      if (
        this.state.sumsub.status === 'failed' &&
        this.state.sumsub.sessionStatus === null
      ) {
        const sumsubError = sumsubResult?.error;
        throw new Error(
          typeof sumsubError === 'string'
            ? sumsubError
            : 'SumSub verification did not complete.',
        );
      }
      // After SumSub, refresh user-keyed status for the Money toast and start
      // polling while still pending. Soft-fail: toast refresh must not rewind
      // the consent / SumSub outcome.
      try {
        await this.refreshKycStatus();
      } catch (statusError) {
        console.error('KYC status refresh failed:', statusError);
      }
      this.#updateIfCurrent(generation, (state) => {
        if (state.phase !== 'error' && state.phase !== 'done') {
          state.phase = 'done';
          state.statusMessage = 'KYC submitted.';
        }
      });
    } catch (error) {
      if (isSessionAlreadyCompletedError(error)) {
        if (this.#generation !== generation) {
          return;
        }
        this.#applyUserStatus({
          status: 'completed',
          sumsubSessionId: null,
          errorCode: null,
        });
        this.#updateIfCurrent(generation, (state) => {
          state.sumsub.status = 'complete';
          state.sumsub.result = { alreadyCompleted: true };
          state.statusMessage = 'KYC already completed.';
          state.phase = 'done';
          state.error = null;
        });
        return;
      }
      console.error('Consents session failed:', error);
      if (this.#generation !== generation) {
        return;
      }
      this.#applyUpdate((state) => {
        this.#clearAcceptedTerms(state);
        state.activeProduct = null;
        state.sessionDisclaimers = null;
        // Session create ran before recording disclaimers. Drop the leftover
        // UKYC session so a later `startSumSub` cannot skip consent recording.
        state.sumsub = { ...getDefaultKycControllerState().sumsub };
        state.error = `Consents session failed: ${String(error)}`;
        state.statusMessage =
          'Consent / verification failed — accept the terms to try again.';
        state.phase = 'terms';
      });
      await this.loadDisclaimers();
    }
  }

  /**
   * Fetches the session-scoped disclaimer catalog and records consents
   * derived from the T&C2 flags. Already-consented catalog rows are omitted
   * from the POST. A 409 is re-checked with a GET: continue only when every
   * accepted document is now consented, otherwise fail closed.
   *
   * @param sessionId - The UKYC session id.
   * @param consents - T&C2 flags mapped onto catalog documents.
   * @param consents.sumsubTncSigned - Whether Sumsub T&C were accepted.
   * @param consents.idosTncSigned - Whether idOS T&C were accepted.
   * @param consents.credentialReusabilityConsentGiven - Whether credential
   * reuse was accepted.
   * @param generation - Flow generation captured by the caller.
   */
  async #recordSessionDisclaimers(
    sessionId: string,
    consents: {
      sumsubTncSigned: boolean;
      idosTncSigned: boolean;
      credentialReusabilityConsentGiven: boolean;
    },
    generation: number,
  ): Promise<void> {
    const catalog = await this.messenger.call(
      'KycService:fetchSessionDisclaimers',
      { sessionId },
    );
    if (this.#generation !== generation) {
      return;
    }
    this.#applyUpdate((state) => {
      state.sessionDisclaimers = catalog;
      state.statusMessage = 'Submitting consents...';
    });

    if (
      isAcceptedCategoryEmpty(catalog.idOS, consents.idosTncSigned) ||
      isAcceptedCategoryEmpty(catalog.kycProvider, consents.sumsubTncSigned)
    ) {
      throw new Error(
        'Session disclaimer catalog is missing documents for an accepted category.',
      );
    }

    const idOS = consentRecordsFromCatalog(
      catalog.idOS,
      consents.idosTncSigned,
    );
    const kycProvider = consentRecordsFromCatalog(
      catalog.kycProvider,
      consents.sumsubTncSigned,
    );
    const reuseUnchanged =
      catalog.credentialReusabilityConsentGiven ===
      consents.credentialReusabilityConsentGiven;
    if (idOS.length === 0 && kycProvider.length === 0 && reuseUnchanged) {
      return;
    }

    try {
      const recorded = await this.messenger.call(
        'KycService:submitSessionDisclaimers',
        {
          sessionId,
          idOS,
          kycProvider,
          credentialReusabilityConsentGiven:
            consents.credentialReusabilityConsentGiven,
        },
      );
      this.#updateIfCurrent(generation, (state) => {
        state.sessionDisclaimers = recorded;
      });
    } catch (error) {
      if (!isConsentConflictError(error)) {
        throw error;
      }
      // 409 means some document version was already recorded. Re-fetch and
      // continue only when every document the user accepted is now consented;
      // otherwise fail closed so a version bump cannot skip new docs.
      const latest = await this.messenger.call(
        'KycService:fetchSessionDisclaimers',
        { sessionId },
      );
      if (this.#generation !== generation) {
        return;
      }
      this.#applyUpdate((state) => {
        state.sessionDisclaimers = latest;
      });
      const stillMissingIdos = acceptedCategoryStillMissing(
        latest.idOS,
        consents.idosTncSigned,
      );
      const stillMissingProvider = acceptedCategoryStillMissing(
        latest.kycProvider,
        consents.sumsubTncSigned,
      );
      const stillMissingReuse =
        consents.credentialReusabilityConsentGiven &&
        !latest.credentialReusabilityConsentGiven;
      if (stillMissingIdos || stillMissingProvider || stillMissingReuse) {
        throw error;
      }
    }
  }

  /**
   * Creates a vendor session from the currently stored terms + email.
   */
  async #createSession(): Promise<void> {
    const { email, termsAcceptedAt, acceptedDisclaimerIds } = this.state;
    if (!email) {
      this.#fail('Missing email for session creation.');
      return;
    }
    if (!termsAcceptedAt || acceptedDisclaimerIds.length === 0) {
      this.#fail('Missing terms acceptance for session creation.');
      return;
    }

    // A new session invalidates any authentication carried over from a prior
    // session. Clear the stale session token, access token, and auth-frame
    // client token so `buildCheckFrameUrl` cannot return a URL bound to an old
    // (or, on failure, invalid) session token, `buildAuthFrameUrl` cannot
    // return a URL tied to an old client token, and `checkKycRequired` cannot
    // run with an access token from an earlier authentication. The Check/Auth
    // frames re-populate these for the new session. Because `sessionToken` is
    // cleared here and only re-set on success, a failed creation leaves it
    // `null` rather than resurrecting the previous session.
    // Capture the flow generation so a `reset()` landing while the create
    // request is in flight cannot resurrect a session (success) or overwrite
    // the now-idle controller (failure). The synchronous update below runs
    // before any `await`, so it needs no guard.
    const generation = this.#generation;
    this.#authClientToken = null;
    this.#applyUpdate((state) => {
      state.error = null;
      state.phase = 'session';
      state.statusMessage = 'Creating session...';
      state.sessionToken = null;
      state.accessToken = null;
    });

    try {
      const { sessionToken } = await this.messenger.call(
        'KycService:createSession',
        { email, termsAcceptedAt, disclaimerIds: acceptedDisclaimerIds },
      );
      this.#updateIfCurrent(generation, (state) => {
        state.sessionToken = sessionToken;
        state.phase = 'check';
        state.statusMessage = 'Authenticating via Check frame...';
      });
    } catch (error) {
      console.error('Session creation failed:', error);
      // A reset() superseded this flow while the request was in flight; leave
      // the idle controller alone rather than forcing it back to `terms`.
      if (this.#generation !== generation) {
        return;
      }
      // Invalidate the stored acceptance so the customer can retry. Also clear
      // `activeProduct` so a later `acceptTermsAndStartSession` that omits a
      // product cannot auto-run the KYC check / SumSub chain for this failed
      // flow's product — matching how `initialize` starts from a clean product.
      this.#applyUpdate((state) => {
        this.#clearAcceptedTerms(state);
        state.activeProduct = null;
        state.error = `Session creation failed: ${String(error)}`;
        state.statusMessage =
          'Session creation failed — accept the terms to try again.';
        state.phase = 'terms';
      });
      await this.loadDisclaimers();
    }
  }

  /**
   * Clears the persisted terms acceptance.
   */
  clearSavedTerms(): void {
    this.#applyUpdate((state) => {
      this.#clearAcceptedTerms(state);
    });
  }

  /**
   * Clears the stored terms acceptance on the given draft state. Shared by the
   * paths that must invalidate acceptance — explicit clear, vendor terms
   * update, and session-creation failure — so they stay in sync. This is a
   * targeted invalidation and, unlike {@link reset}, deliberately leaves the
   * rest of the flow (geolocation, disclaimers, phase) untouched.
   *
   * @param state - The state to mutate.
   */
  #clearAcceptedTerms(state: KycControllerState): void {
    state.termsAcceptedAt = null;
    state.acceptedDisclaimerIds = [];
    state.termsAcceptedVendor = null;
    state.sumsubTncAccepted = null;
    state.idosTncAccepted = null;
    state.credentialReusabilityConsentGiven = null;
  }

  /**
   * Drops MoonPay Check/Auth artifacts from the draft. Used when switching
   * away from MoonPay (and again when the consents path starts) so leftover
   * tokens cannot keep `buildCheckFrameUrl` / `buildAuthFrameUrl` alive for
   * a consents-path vendor.
   *
   * @param state - The state to mutate.
   */
  #clearMoonPaySession(state: KycControllerState): void {
    state.moonpayCustomerId = null;
    state.sessionToken = null;
    state.accessToken = null;
  }

  /**
   * Drops persisted terms acceptance when it does not belong to `vendor`.
   * Callers must invoke this only after the vendor switch has committed
   * (e.g. `createVendorCustomer` succeeded) so a failed or reset switch
   * cannot erase another vendor's stored acceptance.
   *
   * @param vendor - The vendor that now owns the flow.
   */
  #dropTermsUnlessForVendor(vendor: KycVendor): void {
    if (this.#hasTermsForVendor(vendor)) {
      return;
    }
    this.#applyUpdate((state) => {
      this.#clearAcceptedTerms(state);
    });
  }

  /**
   * Determines whether the stored terms acceptance belongs to the given
   * vendor. Acceptance persisted before `termsAcceptedVendor` existed
   * (indicated by `null`) is invalidated to force reacceptance, ensuring users
   * re-review vendor terms after the multi-vendor upgrade.
   *
   * @param vendor - The vendor about to drive the flow.
   * @returns `true` when the stored acceptance can be reused for `vendor`.
   */
  #hasTermsForVendor(vendor: KycVendor): boolean {
    if (this.state.termsAcceptedVendor === null) {
      return false;
    }
    return this.state.termsAcceptedVendor === vendor;
  }

  /**
   * Handles a message posted by a Check/Auth frame and advances the flow.
   *
   * The transport-agnostic caller (WebView on mobile, iframe on web) forwards
   * the raw message and injects the returned `reply` back into the frame.
   *
   * @param params - The parameters.
   * @param params.message - The raw message posted by the frame.
   * @returns An object whose optional `reply` should be posted back.
   */
  async handleFrameMessage(params: {
    message: unknown;
  }): Promise<{ reply?: unknown }> {
    const payload = params.message as FrameMessage | undefined;

    if (!payload) {
      return {};
    }

    if (payload.kind === 'handshake') {
      const channelId = payload.meta?.channelId;
      return { reply: { version: 2, meta: { channelId }, kind: 'ack' } };
    }

    if (payload.kind !== 'complete') {
      return {};
    }

    const channelId = payload.meta?.channelId;

    // Only honor a Check/Auth `complete` for the MoonPay frame the flow is
    // currently waiting on. This drops stale or duplicate messages — e.g. a
    // late post after `reset()` (phase `idle`), after the flow already
    // advanced past this frame, or after a vendor switch — so they cannot
    // resurrect tokens, rewind `phase`, or recapture `moonpayCustomerId` on a
    // controller that has moved on. Frame messages are external input and,
    // unlike the async steps, are not covered by the `#generation` guard.
    let expectedPhase: KycPhase | null = null;
    if (channelId === CHANNEL_CHECK) {
      expectedPhase = 'check';
    } else if (channelId === CHANNEL_AUTH) {
      expectedPhase = 'auth';
    }
    if (
      !expectedPhase ||
      this.state.phase !== expectedPhase ||
      this.state.activeVendor !== 'moonpay'
    ) {
      return {};
    }

    const status = payload.payload?.status;
    const credsEnvelope = payload.payload?.credentials;

    const customerId = payload.payload?.customer?.id ?? null;
    if (customerId) {
      this.#applyUpdate((state) => {
        state.moonpayCustomerId = customerId;
      });
    }

    if (!status) {
      return {};
    }

    let accessToken: string | undefined;
    let clientToken: string | undefined;
    if (credsEnvelope) {
      try {
        const { credentials } = decryptCredentials(
          credsEnvelope,
          this.#keypair.privateKey,
        );
        accessToken = credentials.accessToken;
        clientToken = credentials.clientToken;
      } catch (error) {
        this.#fail(`Failed to decrypt frame credentials: ${String(error)}`);
        return {};
      }
    }

    if (channelId === CHANNEL_CHECK) {
      await this.#handleCheckOutcome(status, accessToken, clientToken);
      return {};
    }

    // channelId === CHANNEL_AUTH, guaranteed by the expectedPhase guard above.
    await this.#handleAuthOutcome(status, accessToken);
    return {};
  }

  /**
   * Applies a Check-frame outcome.
   *
   * @param status - The frame status.
   * @param accessToken - The decrypted access token, if any.
   * @param clientToken - The decrypted client token, if any.
   */
  async #handleCheckOutcome(
    status: NonNullable<FrameMessage['payload']>['status'],
    accessToken?: string,
    clientToken?: string,
  ): Promise<void> {
    if (status === 'active' && accessToken) {
      this.#applyUpdate((state) => {
        state.accessToken = accessToken;
        state.phase = 'form';
        state.statusMessage = 'Already authenticated. Review to submit.';
      });
      await this.#continueAfterAuthentication();
      return;
    }
    if (status === 'connectionRequired' && clientToken) {
      this.#authClientToken = clientToken;
      this.#applyUpdate((state) => {
        state.phase = 'auth';
        state.statusMessage = 'Verify your email via OTP in the Auth frame.';
      });
      return;
    }
    if (status === 'termsAcceptanceRequired') {
      this.#requireTermsReacceptance();
      return;
    }
    this.#fail(`Check frame returned status: ${status}`);
  }

  /**
   * Applies an Auth-frame outcome.
   *
   * @param status - The frame status.
   * @param accessToken - The decrypted access token, if any.
   */
  async #handleAuthOutcome(
    status: NonNullable<FrameMessage['payload']>['status'],
    accessToken?: string,
  ): Promise<void> {
    if (status === 'active' && accessToken) {
      this.#applyUpdate((state) => {
        state.accessToken = accessToken;
        state.phase = 'form';
        state.statusMessage = 'Authenticated. Review to submit.';
      });
      await this.#continueAfterAuthentication();
      return;
    }
    if (status === 'termsAcceptanceRequired') {
      this.#requireTermsReacceptance();
      return;
    }
    this.#fail(`Auth frame returned status: ${status}`);
  }

  /**
   * Continues the flow once authentication has completed (phase `form`).
   *
   * When the flow is scoped to a product (see {@link initialize}), the
   * KYC-required check runs automatically, and — when KYC is required — the
   * document-verification sub-flow is launched. When no product is set, this is
   * a no-op and the flow stays at `form` for the consumer to drive manually.
   *
   * Errors are already recorded on state by `checkKycRequired` (`error`
   * phase) and `startSumSub` (`sumsub.status = 'failed'`); this method swallows
   * them so it can be awaited safely from the frame-message handler.
   */
  async #continueAfterAuthentication(): Promise<void> {
    const product = this.state.activeProduct;
    if (!product) {
      return;
    }

    // Re-entry protection lives at the frame boundary: `handleFrameMessage`
    // only honors a Check/Auth `complete` while `phase` matches and
    // `activeVendor` is MoonPay, and both outcome handlers move `phase` to
    // `form` before awaiting this method. A duplicate, late, or cross-vendor
    // `complete` therefore lands after the phase moved on (or on the wrong
    // vendor) and is dropped before it can start a second continuation. Any
    // writes here are additionally guarded by `#generation` (see
    // `checkKycRequired` / `startSumSub`) so a `reset()` mid-continuation
    // cannot corrupt state.
    const kycRequired = await this.checkKycRequired({ product });
    if (!kycRequired) {
      return;
    }

    try {
      await this.startSumSub();
    } catch {
      // `startSumSub` already records `sumsub.status = 'failed'`; swallow the
      // rethrown error (e.g. SDK unavailable) so the awaited continuation
      // resolves cleanly rather than surfacing as an unhandled rejection.
    }
  }

  /**
   * Invalidates stored terms and returns to the terms phase.
   */
  #requireTermsReacceptance(): void {
    this.#applyUpdate((state) => {
      this.#clearAcceptedTerms(state);
      state.phase = 'terms';
      state.statusMessage =
        'The vendor updated its Terms of Use — please re-accept.';
    });
  }

  /**
   * Builds the Check-frame URL, or `null` when no session exists yet.
   *
   * @returns The Check-frame URL or `null`.
   */
  buildCheckFrameUrl(): string | null {
    if (this.state.activeVendor !== 'moonpay' || !this.state.sessionToken) {
      return null;
    }
    const url = new URL(`${FRAMES_BASE_URL}/check-connection`);
    url.searchParams.set('sessionToken', this.state.sessionToken);
    url.searchParams.set('publicKey', this.#keypair.publicKeyHex);
    url.searchParams.set('channelId', CHANNEL_CHECK);
    url.searchParams.set('skipKyc', 'true');
    return url.toString();
  }

  /**
   * Builds the Auth-frame URL, or `null` when no client token is available.
   *
   * @returns The Auth-frame URL or `null`.
   */
  buildAuthFrameUrl(): string | null {
    if (this.state.activeVendor !== 'moonpay' || !this.#authClientToken) {
      return null;
    }
    const url = new URL(`${FRAMES_BASE_URL}/auth`);
    url.searchParams.set('clientToken', this.#authClientToken);
    url.searchParams.set('publicKey', this.#keypair.publicKeyHex);
    url.searchParams.set('channelId', CHANNEL_AUTH);
    return url.toString();
  }

  /**
   * Builds the Reset-frame URL.
   *
   * @returns The Reset-frame URL.
   */
  buildResetFrameUrl(): string {
    const url = new URL(`${FRAMES_BASE_URL}/reset`);
    url.searchParams.set('channelId', CHANNEL_RESET);
    return url.toString();
  }

  /**
   * Checks whether KYC is required for a product and caches the result.
   *
   * @param params - The parameters.
   * @param params.product - The consuming feature.
   * @param params.country - Optional alpha-3 country override.
   * @returns Whether KYC is required.
   */
  async checkKycRequired(params: {
    product: KycProduct;
    country?: string;
  }): Promise<boolean> {
    const { accessToken } = this.state;
    if (!accessToken) {
      this.#fail('Missing accessToken — repeat the authentication step.');
      return false;
    }
    const country = params.country ?? this.state.geoCountry;
    if (!country) {
      this.#fail('Missing country for KYC-required check.');
      return false;
    }

    // Capture the flow generation so we can detect a `reset()` that happens
    // while the HTTP call is in flight and avoid writing stale results.
    const generation = this.#generation;

    this.#applyUpdate((state) => {
      state.phase = 'submit';
      state.statusMessage = 'Checking KYC status...';
    });

    try {
      const { kycRequired } = await this.messenger.call(
        'KycService:checkKycRequired',
        { accessToken, country, capabilities: [{ product: params.product }] },
      );
      // The flow was reset while the check was in flight; discard the result
      // rather than resurrecting a done/cached state on an idle controller.
      const applied = this.#updateIfCurrent(generation, (state) => {
        state.kycRequiredByProduct[params.product] = kycRequired;
        state.lastCheckedAt = new Date().toISOString();
        state.phase = 'done';
        state.statusMessage = 'KYC check complete.';
      });
      if (!applied) {
        return false;
      }
      return kycRequired;
    } catch (error) {
      if (this.#generation !== generation) {
        return false;
      }
      this.#fail(`KYC check failed: ${String(error)}`);
      return false;
    }
  }

  /**
   * Reads the cached "is KYC required" result for a product.
   *
   * @param params - The parameters.
   * @param params.product - The consuming feature.
   * @returns The cached value, or `undefined` if not yet checked.
   */
  getKycStatus(params: { product: KycProduct }): boolean | undefined {
    return this.state.kycRequiredByProduct[params.product];
  }

  /**
   * Returns the vendor-scoped identity for the currently authenticated
   * customer, or `null` when the flow has not yet captured a vendor customer
   * id (before authentication or after {@link reset}), or when a MoonPay id
   * is present under a different `activeVendor`.
   *
   * Exposed so consumers (e.g. ramps autoramp creation) can attach the vendor
   * customer id to downstream calls without reading the full KYC state, which
   * also holds session/access tokens. The id is session-scoped and never
   * persisted.
   *
   * @returns The current {@link KycCustomerIdentity}, or `null`.
   */
  getCustomerIdentity(): KycCustomerIdentity | null {
    const { moonpayCustomerId, activeVendor } = this.state;
    // `moonpayCustomerId` is issued only by MoonPay Check/Auth frames. Never
    // pair it with another vendor, even if a switch left the fields out of
    // sync, so consumers cannot attach a MoonPay id to an Iron (or other)
    // downstream call.
    if (!moonpayCustomerId || activeVendor !== 'moonpay') {
      return null;
    }
    return { vendor: 'moonpay', id: moonpayCustomerId };
  }

  /**
   * Builds the vendor-specific fields spread into a
   * `KycService:createUkycSession` call, derived from the active vendor and the
   * currently captured auth state.
   *
   * MoonPay sessions must carry the access token and customer id in
   * `vendorMetadata`; other vendors carry no vendor metadata.
   *
   * @returns The vendor-specific subset of the `createUkycSession` params.
   */
  #buildUkycSessionVendorFields(): Pick<
    CreateUkycSessionParams,
    'vendor' | 'vendorMetadata'
  > {
    if (this.state.activeVendor === 'moonpay') {
      return {
        vendor: 'moonpay',
        vendorMetadata: {
          moonPayAccessToken: this.state.accessToken,
          moonPayUserId: this.state.moonpayCustomerId,
        },
      };
    }

    return { vendor: this.state.activeVendor };
  }

  /**
   * Creates a UKYC session, wraps the `data_encryption_key` and
   * `ukyc_capability_token` against the returned encryption schemas, and
   * submits both via authorizations. Stores `sumsub.sessionId`. Returns `null`
   * when a `reset()` superseded the flow.
   *
   * @param generation - Flow generation captured by the caller.
   * @returns The created session, or `null` if superseded.
   */
  async #createUkycSession(generation: number): Promise<{
    sessionId: string;
    kycStatus?: string;
    finalStatus?: string;
    vendorProcessing: boolean;
  } | null> {
    const jwtToken = MOCK_JWT_TOKEN;

    // Establish a per-session X25519 keypair used to seal both secrets. The
    // private half stays on the device; each encryption schema from session
    // creation supplies the matching server public key.
    const sessionClientPrivateKey = x25519.utils.randomSecretKey();

    const {
      sessionId,
      encryptionDataKey,
      ukycCapabilityToken: capabilityTokenSchema,
    } = await this.messenger.call('KycService:createUkycSession', {
      jwtToken,
      ...this.#buildUkycSessionVendorFields(),
    });
    if (this.#generation !== generation) {
      return null;
    }

    // Verify each jwtChain against Fractal's JWKS, then confirm the returned
    // server public key matches the value attested inside the verified JWT
    // payload before trusting it for wrapping.
    const { keys } = await this.messenger.call('KycService:fetchJwks');
    this.#assertAttestedServerPublicKey(keys, encryptionDataKey);
    this.#assertAttestedServerPublicKey(keys, capabilityTokenSchema);

    // Derive the data_encryption_key from the local_user_secret, mint a
    // read-only capability token, and wrap both for the session server. Only
    // the wrapped (encrypted) material ever leaves the device.
    const localUserSecret = await getOrCreateLocalUserSecret(
      this.#localUserSecretStore(),
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
      operations: ['read'],
      expiresAt: new Date(Date.now() + UKYC_CAPABILITY_TOKEN_TTL_MS),
    });
    const wrappedUkycCapabilityToken = wrapEncryptionKey(
      sessionClientPrivateKey,
      capabilityTokenSchema.serverPublicKey.x,
      stringToBytes(encodeStorageAccessTokenForHeader(ukycCapabilityToken)),
    );
    if (this.#generation !== generation) {
      return null;
    }

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

    const stillCurrent = this.#updateIfCurrent(generation, (state) => {
      state.sumsub.sessionId = sessionId;
      if (vendorProcessing) {
        state.sumsub.status = 'vendorProcessing';
        state.statusMessage = VENDOR_PROCESSING_MESSAGE;
      }
    });
    if (!stillCurrent) {
      return null;
    }
    return { sessionId, kycStatus, finalStatus, vendorProcessing };
  }

  /**
   * Runs the SumSub document-verification sub-flow end to end:
   *
   *  1. creates a UKYC session, receiving per-secret encryption schemas;
   *  2. verifies each schema's `jwtChain` against the Fractal JWKS and confirms
   *     the attested session server public key;
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
    // A new sub-flow supersedes any polling still running from a prior run.
    this.#stopPolling();

    if (!this.#sumsubLauncher.isAvailable()) {
      const error = 'SumSub SDK is not available in this runtime.';
      this.#applyUpdate((state) => {
        state.sumsub.status = 'failed';
        state.sumsub.result = { error };
      });
      throw new Error(error);
    }

    // Capture the flow generation so each async step can detect a `reset()`
    // that lands mid-flight and avoid writing stale sub-flow state (or, worse,
    // presenting the SDK) on a controller that is now idle.
    const generation = this.#generation;

    try {
      if (!this.state.sumsub.sessionId) {
        this.#applyUpdate((state) => {
          state.sumsub.status = 'creatingSession';
          state.sumsub.result = null;
          state.sumsub.sessionStatus = null;
        });

        const created = await this.#createUkycSession(generation);
        if (!created) {
          return {};
        }

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

      // Empty string is a valid "no id to poll" session id used by tests and
      // must not be coalesced away as missing.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const sessionId = this.state.sumsub.sessionId || '';

      this.#updateIfCurrent(generation, (state) => {
        state.sumsub.status = 'fetchingToken';
        state.sumsub.sessionId = sessionId;
      });

      const { applicantAccessToken } = await this.messenger.call(
        'KycService:createJourney',
        sessionId,
      );

      // A reset() may have landed while the session/token was being prepared.
      // Gate the `launching` write and the decision to open the SDK behind a
      // single generation check: `#updateIfCurrent` only writes when still
      // current and reports whether it did. Since there is no `await` between
      // this check and `launch` below, a successful result guarantees the SDK
      // is never presented on a flow that a concurrent reset() returned to idle.
      const stillCurrent = this.#updateIfCurrent(generation, (state) => {
        state.sumsub.status = 'launching';
        state.sumsub.applicantAccessToken = applicantAccessToken;
      });
      if (!stillCurrent) {
        return {};
      }

      // Track whether the SDK ever reported a successful completion. A resolved
      // `launch` alone does not imply success — the applicant may have
      // abandoned the flow or the SDK may have reported a non-success outcome.
      let reachedCompletion = false;

      const result = await this.#sumsubLauncher.launch({
        applicantAccessToken,
        onTokenExpiration: async () => {
          // A reset() may have superseded this flow while the SDK stayed open.
          // Refuse to refresh against the now-stale UKYC session rather than
          // silently keeping an orphaned SDK alive.
          if (this.#generation !== generation) {
            throw new Error(
              'KYC flow was reset; SumSub session is no longer active.',
            );
          }
          const refreshed = await this.messenger.call(
            'KycService:createJourney',
            sessionId,
          );
          return refreshed.applicantAccessToken;
        },
        onStatusChange: (_prev, next) => {
          if (next === SUMSUB_COMPLETED_STATUS) {
            reachedCompletion = true;
          }
          this.#updateIfCurrent(generation, (state) => {
            state.sumsub.status =
              next === SUMSUB_COMPLETED_STATUS ? 'complete' : 'inProgress';
          });
        },
        locale: params?.locale ?? 'en',
        debug: params?.debug ?? false,
      });

      // A resolved `launch` alone is not the final outcome: only a SDK-reported
      // completion is worth polling for a verification decision. Anything else
      // (abandonment, non-success) is `failed` and must not be polled.
      const applied = this.#updateIfCurrent(generation, (state) => {
        state.sumsub.status = reachedCompletion ? 'polling' : 'failed';
        state.sumsub.result = result as Json;
      });

      // Once the SDK completes, the authoritative verification decision comes
      // from the UKYC backend, not the SDK result. Poll the session status
      // until it reaches a terminal decision. Guard on `applied` so a `reset()`
      // that landed during `launch` cannot start polling on an idle flow.
      if (applied && reachedCompletion) {
        if (sessionId) {
          await this.#startSessionStatusPolling(sessionId);
        } else {
          // No session id to poll against; fall back to treating the SDK
          // completion as the final outcome.
          this.#updateIfCurrent(generation, (state) => {
            state.sumsub.status = 'complete';
          });
        }
      }
      return result;
    } catch (error) {
      // Applicant already finished KYC — treat as completed for Money toast.
      if (isSessionAlreadyCompletedError(error)) {
        // A reset() may have landed while `launch` was in flight; forcing
        // `completed` (and publishing `statusChanged`) on an idle controller
        // would resurrect a flow the consumer already tore down.
        if (this.#generation !== generation) {
          return { alreadyCompleted: true };
        }
        this.#applyUserStatus({
          status: 'completed',
          sumsubSessionId: null,
          errorCode: null,
        });
        this.#updateIfCurrent(generation, (state) => {
          state.sumsub.status = 'complete';
          state.sumsub.result = { alreadyCompleted: true };
          state.statusMessage = 'KYC already completed.';
          state.phase = 'done';
          state.error = null;
        });
        return { alreadyCompleted: true };
      }
      const result = { error: String(error) };
      this.#updateIfCurrent(generation, (state) => {
        state.sumsub.status = 'failed';
        state.sumsub.result = result;
      });
      return result;
    }
  }

  /**
   * Refreshes the user-keyed simplified KYC status from `GET /kyc/status`,
   * stores it on state, publishes {@link KycControllerStatusChangedEvent}, and
   * schedules short-interval polling while the status is `pending`.
   *
   * @returns The latest status payload.
   */
  async refreshKycStatus(): Promise<{
    status: KycUserStatus;
    sumsubSessionId: string | null;
    errorCode: string | null;
  }> {
    const generation = this.#generation;
    const payload = await this.#fetchAndApplyUserStatus();
    // A `reset()` landing while the request was in flight already stopped
    // polling and left the flow idle, and the payload above is the pre-reset
    // cached status. Starting a loop from it would poll — and publish
    // `statusChanged` — on a torn-down flow.
    if (this.#generation !== generation) {
      return payload;
    }
    if (payload.status === 'pending') {
      this.#ensureUserStatusPolling();
    } else {
      this.#stopUserStatusPolling();
    }
    return payload;
  }

  /**
   * Fetches `GET /kyc/status` and applies it to state without managing the
   * poll loop (used by both {@link refreshKycStatus} and the poll tick).
   *
   * @returns The latest status payload.
   */
  async #fetchAndApplyUserStatus(): Promise<{
    status: KycUserStatus;
    sumsubSessionId: string | null;
    errorCode: string | null;
  }> {
    const generation = this.#generation;
    const response = await this.messenger.call('KycService:fetchKycStatus');
    if (this.#generation !== generation) {
      return {
        status: this.state.userStatus ?? 'not-started',
        sumsubSessionId: this.state.userStatusSumsubSessionId,
        errorCode: this.state.userStatusErrorCode,
      };
    }
    const payload = {
      status: response.status,
      sumsubSessionId: response.sumsubSessionId ?? null,
      errorCode: response.errorCode ?? null,
    };
    this.#applyUserStatus(payload);
    return payload;
  }

  /**
   * Writes user-keyed status onto state and publishes `statusChanged` when the
   * value actually changes.
   *
   * @param payload - The status payload to apply.
   * @param payload.status - User-keyed KYC status from `GET /kyc/status`.
   * @param payload.sumsubSessionId - Optional SumSub session id from status.
   * @param payload.errorCode - Optional error code from status.
   */
  #applyUserStatus(payload: {
    status: KycUserStatus;
    sumsubSessionId: string | null;
    errorCode: string | null;
  }): void {
    const previous = this.state.userStatus;
    this.#applyUpdate((state) => {
      state.userStatus = payload.status;
      state.userStatusSumsubSessionId = payload.sumsubSessionId;
      state.userStatusErrorCode = payload.errorCode;
    });
    if (previous !== payload.status) {
      this.messenger.publish(`${controllerName}:statusChanged`, payload);
    }
  }

  /**
   * Starts the user-status poll loop when not already running and status is
   * still `pending`.
   */
  #ensureUserStatusPolling(): void {
    if (this.#userStatusPolling) {
      return;
    }
    this.#userStatusPolling = true;
    const token = this.#userStatusPollToken;
    const tick = async (): Promise<void> => {
      try {
        const payload = await this.#fetchAndApplyUserStatus();
        // Race with `reset()` / `#stopUserStatusPolling` while the request was
        // in flight — do not reschedule onto an idle controller.
        /* istanbul ignore next */
        if (this.#userStatusPollToken !== token) {
          return;
        }
        if (payload.status !== 'pending') {
          this.#stopUserStatusPolling();
          return;
        }
      } catch {
        // Keep polling on transient errors, unless the loop was superseded.
        /* istanbul ignore next */
        if (this.#userStatusPollToken !== token) {
          return;
        }
      }
      this.#userStatusPollTimer = setTimeout(() => {
        this.#userStatusPollTimer = null;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        tick();
      }, this.#userStatusPollIntervalMs);
      // Allow the process to exit while a pending-status poll is scheduled.
      // React Native / browser timers are numbers with no `unref`, hence the
      // optional call.
      this.#userStatusPollTimer.unref?.();
    };
    this.#userStatusPollTimer = setTimeout(() => {
      this.#userStatusPollTimer = null;
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      tick();
    }, this.#userStatusPollIntervalMs);
    this.#userStatusPollTimer.unref?.();
  }

  /**
   * Stops the user-keyed status poll loop.
   */
  #stopUserStatusPolling(): void {
    this.#userStatusPollToken += 1;
    this.#userStatusPolling = false;
    if (this.#userStatusPollTimer !== null) {
      clearTimeout(this.#userStatusPollTimer);
      this.#userStatusPollTimer = null;
    }
  }

  /**
   * Fetches the current UKYC session status for the active sub-flow and records
   * it on state. Useful for a one-off refresh outside the automatic polling
   * loop that {@link startSumSub} runs.
   *
   * @returns The fetched session status.
   * @throws If there is no active SumSub session to query.
   */
  async getSessionStatus(): Promise<KycSessionStatus> {
    const { sessionId } = this.state.sumsub;
    if (!sessionId) {
      throw new Error('Cannot fetch session status: no active SumSub session.');
    }

    // Capture the flow generation so a `reset()` landing while the request is
    // in flight cannot write the result onto an idle controller.
    const generation = this.#generation;
    const sessionStatus = await this.messenger.call(
      'KycService:getSessionStatus',
      { sessionId },
    );
    this.#updateIfCurrent(generation, (state) => {
      state.sumsub.sessionStatus = sessionStatus;
    });
    return sessionStatus;
  }

  /**
   * Begins polling the UKYC session status until a terminal decision is
   * reached. The first poll runs immediately (and is awaited by
   * {@link startSumSub}); subsequent polls are scheduled every
   * `#sessionStatusPollIntervalMs`.
   *
   * @param sessionId - The UKYC session id to poll.
   * @returns A promise that resolves once the first poll settles.
   */
  async #startSessionStatusPolling(sessionId: string): Promise<void> {
    // Supersede any prior loop and claim a fresh token for this one. Because
    // `#stopPolling` bumps the token, any in-flight poll from a previous loop
    // sees a mismatch and neither writes state nor reschedules.
    this.#stopPolling();
    const token = this.#pollToken;

    const tick = async (): Promise<void> => {
      const shouldStop = await this.#pollSessionStatusOnce(sessionId, token);
      if (shouldStop) {
        return;
      }
      this.#pollTimer = setTimeout(() => {
        this.#pollTimer = null;
        // `tick` swallows its own errors (see `#pollSessionStatusOnce`) and
        // therefore never rejects, so this fire-and-forget scheduled poll
        // cannot surface as an unhandled rejection.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        tick();
      }, this.#sessionStatusPollIntervalMs);
    };

    await tick();
  }

  /**
   * Performs a single session-status poll: fetches the status, records it, and
   * resolves the sub-flow when the status is terminal.
   *
   * Transient errors are swallowed so the loop keeps polling; the last good
   * `sessionStatus` is deliberately preserved rather than being overwritten
   * with the error.
   *
   * @param sessionId - The UKYC session id to poll.
   * @param token - The polling token captured when the loop started.
   * @returns `true` when the loop should stop (terminal status or superseded
   * by a reset / new sub-flow), `false` when it should keep polling.
   */
  async #pollSessionStatusOnce(
    sessionId: string,
    token: number,
  ): Promise<boolean> {
    try {
      const sessionStatus = await this.messenger.call(
        'KycService:getSessionStatus',
        { sessionId },
      );
      // Superseded while the request was in flight — drop the result.
      if (this.#pollToken !== token) {
        return true;
      }
      const isTerminal = TERMINAL_SESSION_STATUSES.has(
        sessionStatus.finalStatus,
      );
      this.#applyUpdate((state) => {
        state.sumsub.sessionStatus = sessionStatus;
        if (isTerminal) {
          state.sumsub.status = SUCCESSFUL_SESSION_STATUSES.has(
            sessionStatus.finalStatus,
          )
            ? 'complete'
            : 'failed';
        }
      });
      if (isTerminal) {
        this.#stopPolling();
      }
      return isTerminal;
    } catch {
      // Keep polling on transient errors, preserving the last good status.
      // Stop only when a reset / new sub-flow superseded this loop.
      return this.#pollToken !== token;
    }
  }

  /**
   * Stops the session-status polling loop: bumps the polling token (so any
   * in-flight `tick` bows out) and clears any scheduled poll.
   */
  #stopPolling(): void {
    this.#pollToken += 1;
    if (this.#pollTimer !== null) {
      clearTimeout(this.#pollTimer);
      this.#pollTimer = null;
    }
  }

  /**
   * Resets the flow to idle, clearing session tokens and sub-flow state while
   * preserving persisted terms acceptance and the per-product cache.
   */
  reset(): void {
    this.#cancelPendingSession();
    this.#applyUpdate((state) => {
      state.phase = 'idle';
      state.statusMessage = '';
      state.error = null;
      state.disclaimers = [];
      state.disclaimersError = null;
      state.sessionDisclaimers = null;
      state.credentialReusabilityConsentGiven = null;
      state.sessionToken = null;
      state.accessToken = null;
      state.moonpayCustomerId = null;
      state.activeVendor = 'moonpay';
      state.activeProduct = null;
      state.sumsub = {
        status: 'idle',
        result: null,
        sessionId: null,
        applicantAccessToken: null,
        sessionStatus: null,
      };
    });
  }

  /**
   * Restores the controller to its default state, discarding everything
   * {@link reset} deliberately keeps: the session email, the persisted terms
   * acceptance, the per-product KYC-required cache and the user-keyed status.
   *
   * Intended for a full wallet reset, where no trace of the previous
   * customer may survive into the next wallet.
   */
  clearState(): void {
    this.#cancelPendingSession();
    this.#applyUpdate((state) => {
      Object.assign(state, getDefaultKycControllerState());
    });
  }

  /**
   * Tears down everything that lives outside state: drops the auth-frame
   * client token, stops both polling loops, and bumps the flow generation so
   * async steps started earlier discard their results instead of writing them
   * onto the controller. Shared by {@link reset} and {@link clearState}.
   */
  #cancelPendingSession(): void {
    this.#authClientToken = null;
    this.#stopPolling();
    this.#stopUserStatusPolling();
    this.#generation += 1;
  }

  /**
   * Applies a state update only when the flow has not been reset since
   * `generation` was captured. Prevents an in-flight async step from writing
   * stale results onto a controller that a concurrent {@link reset} has
   * returned to idle.
   *
   * @param generation - The flow generation captured before the async work.
   * @param updater - The state mutation to apply when still current.
   * @returns `true` if the update was applied, `false` if it was superseded.
   */
  #updateIfCurrent(
    generation: number,
    updater: (state: KycControllerState) => void,
  ): boolean {
    if (this.#generation !== generation) {
      return false;
    }
    this.#applyUpdate(updater);
    return true;
  }

  /**
   * The single state-update path for this controller. All mutations go through
   * here (rather than calling `this.update` directly) so the mechanism stays
   * consistent and one subtlety is handled in a single place:
   *
   * `sumsub.result` is typed as the recursive `Json`, and expanding
   * `Draft<Json>` (which happens whenever an updater touches `sumsub.result`)
   * can trip TypeScript's "type instantiation is excessively deep" guard. By
   * typing the callback parameter as the plain {@link KycControllerState}
   * instead of Immer's `Draft`, we avoid expanding the draft type while keeping
   * the same mutate-in-place semantics (the underlying value is still the Immer
   * draft at runtime).
   *
   * @param updater - The state mutation to apply.
   */
  #applyUpdate(updater: (state: KycControllerState) => void): void {
    this.update((state) => {
      // @ts-expect-error Avoid "type instantiation is excessively deep".
      updater(state);
    });
  }

  /**
   * Confirms that an encryption schema's `serverPublicKey.x` matches the
   * `sessionServerPublicKeyX` attested inside its verified `jwtChain`. Rejects
   * a key that was swapped out-of-band after the chain was signed.
   *
   * @param keys - The Fractal JWKS used to verify the chain.
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

  /**
   * Transitions to the error phase with a message.
   *
   * @param message - The error message.
   */
  #fail(message: string): void {
    this.#applyUpdate((state) => {
      state.error = message;
      state.phase = 'error';
    });
  }
}
