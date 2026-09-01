/**
 * Shared types for the KYC controller and service.
 *
 * The KYC flow is vendor-backed (currently MoonPay for identity + SumSub for
 * document verification) but the surface exposed to consumers (ramps, card) is
 * intentionally vendor-neutral so a future vendor swap does not ripple out.
 */

/**
 * A MetaMask feature that consumes KYC. Used to key the per-product
 * "is KYC required" cache so ramps, card, and money can share one controller.
 */
export type KycProduct = 'ramps' | 'card' | 'money';

/**
 * Identity vendors supported behind the KYC surface.
 *
 * - `moonpay` — MoonPay Check/Auth frames + SumSub documents.
 * - `iron` — Iron-only Money/VBA path: empty-shell customer → consents →
 *   SumSub, with no MoonPay Check/Auth frames.
 */
export type KycVendor = 'moonpay' | 'iron';

/**
 * Vendor-scoped identity for the currently authenticated KYC customer.
 *
 * Exposed to consumers (e.g. ramps) that must attach the vendor customer id to
 * downstream provider calls without reading the full KYC state, which also
 * holds session/access tokens. The identifier is session-scoped: it is only
 * available once the customer has authenticated through the current flow and
 * is cleared on `reset()`.
 */
export type KycCustomerIdentity = {
  /** The identity vendor that issued {@link KycCustomerIdentity.id}. */
  vendor: KycVendor;
  /** The vendor customer id (e.g. MoonPay customer UUID). */
  id: string;
};

/**
 * User-keyed KYC status returned by `GET /kyc/status` and stored for toast /
 * banner rendering. Collapses vendor + SumSub / relay state into the offsite
 * contract.
 */
export type KycUserStatus =
  | 'not-started'
  | 'pending'
  | 'need-more-information'
  | 'terminal-failure'
  | 'completed';

/**
 * Payload from `GET /kyc/status`, including optional fields that power the
 * 3-state error contract (retryable SumSub vs terminal vs EDD).
 */
export type KycUserStatusResponse = {
  status: KycUserStatus;
  /** Present when the user can reopen a SumSub session (retryable path). */
  sumsubSessionId?: string;
  /** Machine-readable error code for terminal / EDD UX. */
  errorCode?: string;
};

/**
 * Phases of the end-to-end identity flow.
 *
 * - `idle` — nothing started.
 * - `terms` — waiting for the customer to accept the vendor terms.
 * - `session` — creating the vendor session (MoonPay) or creating the UKYC
 *   session and recording session-scoped disclaimers (non-MoonPay vendors).
 * - `check` — running the invisible connection-check frame (MoonPay only).
 * - `auth` — running the visible authentication (OTP) frame (MoonPay only).
 * - `form` — authenticated. When the flow is scoped to a product, the
 *   KYC-required check runs automatically from here; otherwise the consumer
 *   drives it manually via `checkKycRequired`. Consents-path vendors skip
 *   this phase.
 * - `submit` — submitting the KYC-required check / launching SumSub.
 * - `done` — flow complete; see `kycRequiredByProduct` / `sumsub` /
 *   `userStatus`. When KYC is required, the document-verification sub-flow is
 *   launched automatically.
 * - `error` — flow halted; see `error`.
 */
export type KycPhase =
  | 'idle'
  | 'terms'
  | 'session'
  | 'check'
  | 'auth'
  | 'form'
  | 'submit'
  | 'done'
  | 'error';

/**
 * Progress of the SumSub document-verification sub-flow.
 *
 * - `polling` — the SDK finished and the controller is polling the UKYC
 *   backend for the session's final decision (see `KycSessionStatus`). The
 *   sub-flow resolves to `complete` or `failed` once a terminal status arrives.
 * - `vendorProcessing` — session creation reported that the applicant is
 *   already approved on the relay (`kycStatus`) while the vendor is still
 *   finalizing its own decision (`finalStatus`). There is nothing left for the
 *   applicant to do, so the SDK is not launched; see `statusMessage`.
 */
export type KycSumSubStatus =
  | 'idle'
  | 'creatingSession'
  | 'fetchingToken'
  | 'launching'
  | 'inProgress'
  | 'polling'
  | 'complete'
  | 'failed'
  | 'vendorProcessing';

/**
 * The status of a UKYC session, returned by the `GET /sessions/{id}/status`
 * endpoint and polled after the SumSub SDK completes to determine the final
 * verification decision.
 */
export type KycSessionStatus = {
  /**
   * The overall status of the session. Terminal values (e.g. `approved`,
   * `completed`, `rejected`, `failed`, `blocked`) end polling; any other value
   * keeps polling.
   */
  finalStatus: string;
  /** Optional human-readable message describing the status. */
  statusMessage?: string;
  /** The vendor-agnostic external user id associated with the session. */
  externalUserId: string;
  /** The KYC decision status. */
  kycStatus: string;
  /** The identity vendor that handled the session. */
  vendor: string;
  /** The vendor-specific status. */
  vendorStatus: string;
};

/**
 * A single disclaimer/term the customer must accept before a vendor session is
 * created (`GET /vendors/{vendor}/disclaimers`).
 */
export type KycDisclaimer = {
  id: string;
  // Mirrors the vendor API response field, which is snake_case.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  display_name: string;
  url: string;
};

/**
 * A vendor T&C signing returned by `POST /vendors/{vendor}/disclaimers`.
 */
export type KycVendorSigning = {
  /** Iron signing id. */
  id: string;
  // Mirrors the vendor API response field, which is snake_case.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  customer_id: string;
  // Mirrors the vendor API response field, which is snake_case.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  content_id?: string;
};

/**
 * A legal document in the idOS / KYC-provider catalog
 * (`GET /disclaimers`, or `GET`/`POST /sessions/{sessionId}/disclaimers`).
 */
export type KycConsentDocument = {
  /** Stable identifier of the legal document. */
  key: string;
  /** Version of the document currently in force. */
  version: string;
  /** Human-readable document title. */
  title: string;
  /** URL the document body is hosted at. */
  url: string;
  /**
   * Whether the document version has already been consented to (session-scoped
   * fetches). For the global catalog this is typically `false`.
   */
  consented: boolean;
};

/**
 * A consent record posted for a catalog document. `key` and `version` must
 * match the current session catalog.
 */
export type KycConsentRecord = {
  key: string;
  version: string;
};

/**
 * MoonPay vendor T&C1 acceptance persisted under
 * {@link KycVendorDisclaimersAccepted.moonpay}.
 */
export type KycMoonpayVendorDisclaimersAccepted = {
  /** ISO-8601 timestamp of terms acceptance for MoonPay. */
  termsAcceptedAt: string;
};

/**
 * Iron vendor T&C1 acceptance persisted under
 * {@link KycVendorDisclaimersAccepted.iron}.
 */
export type KycIronVendorDisclaimersAccepted = {
  /** IDs of Iron vendor disclaimers the customer accepted. */
  disclaimerIds: string[];
};

/**
 * Persisted vendor-disclaimer acceptance with fixed `moonpay` and `iron` keys.
 */
export type KycVendorDisclaimersAccepted = {
  moonpay: KycMoonpayVendorDisclaimersAccepted | null;
  iron: KycIronVendorDisclaimersAccepted | null;
};

/**
 * idOS / KYC-provider disclaimer catalog returned by
 * `GET /disclaimers?country=` (no session — no credential-reuse consent state).
 */
export type KycDisclaimersCatalog = {
  /** idOS legal documents. */
  idOS: KycConsentDocument[];
  /** KYC provider (SumSub) legal documents. */
  kycProvider: KycConsentDocument[];
};

/**
 * Session-scoped disclaimer catalog returned by
 * `GET`/`POST /sessions/{sessionId}/disclaimers`.
 */
export type KycSessionDisclaimers = KycDisclaimersCatalog & {
  /** Whether the user consented to reuse existing idOS credentials. */
  credentialReusabilityConsentGiven: boolean;
};

/**
 * Parameters passed to a platform SumSub launcher.
 */
export type KycSumSubLaunchParams = {
  /**
   * The applicant access token used to initialize the SumSub SDK.
   */
  applicantAccessToken: string;

  /**
   * Called by the SDK when the access token expires; must resolve with a fresh
   * applicant access token.
   */
  onTokenExpiration: () => Promise<string>;

  /**
   * Called when the SDK reports a status transition.
   */
  onStatusChange?: (prevStatus: string, newStatus: string) => void;

  /**
   * BCP-47 locale for the SDK UI.
   */
  locale?: string;

  /**
   * Enables SDK debug logging.
   */
  debug?: boolean;
};

/**
 * Platform adapter that launches the native/web SumSub SDK.
 *
 * The KYC controller is platform-agnostic and does not import any SDK; each
 * client (mobile / extension / web) injects an implementation of this
 * interface. The controller owns all orchestration (session creation, token
 * exchange, token refresh, state) and only delegates the actual SDK
 * presentation to `launch`.
 */
export type KycSumSubLauncher = {
  /**
   * Whether the underlying SDK is available in the current runtime (e.g. the
   * native module is linked). When `false`, `startSumSub` fails fast.
   */
  isAvailable(): boolean;

  /**
   * Presents the SumSub verification flow and resolves with the SDK result.
   */
  launch(params: KycSumSubLaunchParams): Promise<Record<string, unknown>>;
};
