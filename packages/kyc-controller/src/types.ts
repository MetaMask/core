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
 * UKYC status values. `kycStatus` (the relay-side decision) and `finalStatus`
 * (the vendor-side outcome) draw from the same vocabulary, so they are defined
 * once here and composed into the sets/checks below rather than repeated as
 * literals.
 */
export const KYC_STATUSES = {
  approved: 'approved',
  rejected: 'rejected',
  retry: 'retry',
  new: 'new',
  pending: 'pending',
} as const;

/**
 * `finalStatus` values that end session-status polling.
 */
export const TERMINAL_SESSION_STATUSES: ReadonlySet<string> = new Set([
  KYC_STATUSES.approved,
  KYC_STATUSES.rejected,
  KYC_STATUSES.retry,
]);

/**
 * The status of a UKYC session, returned by the `GET /sessions/{id}/status`
 * endpoint and polled after the SumSub SDK completes to determine the final
 * verification decision.
 */
export type KycSessionStatus = {
  /** UKYC session id. */
  id: string;
  /**
   * The overall status of the session. Terminal values (e.g. `approved`,
   * `completed`, `rejected`, `failed`, `blocked`) are finished decisions; any
   * other value (e.g. `pending`) means the vendor is still processing.
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
  /** The consent status of the session. */
  consentStatus: string;
  idOSStatus: string;
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
 * A legal document in the global idOS / KYC-provider catalog
 * (`GET /disclaimers`). Carries no consent state, which only exists within a
 * session.
 */
export type KycCatalogDocument = {
  /** Stable identifier of the legal document. */
  key: string;
  /** Version of the document currently in force. */
  version: string;
  /** Human-readable document title. */
  title: string;
  /** URL the document body is hosted at. */
  url: string;
};

/**
 * A legal document in the session-scoped idOS / KYC-provider catalog
 * (`GET`/`POST /sessions/{sessionId}/disclaimers`).
 */
export type KycConsentDocument = KycCatalogDocument & {
  /** Whether the document version has already been consented to. */
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
 * Persisted KYC-provider disclaimer acceptance (T&C2) with a fixed `sumsub`
 * key.
 */
export type KycProviderDisclaimersAccepted = {
  sumsub: KycConsentRecord[] | null;
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
  idOS: KycCatalogDocument[];
  /** KYC provider (SumSub) legal documents. */
  kycProvider: KycCatalogDocument[];
};

/**
 * Session-scoped disclaimer catalog returned by
 * `GET`/`POST /sessions/{sessionId}/disclaimers`. Documents additionally report
 * whether that version was already consented to for the session.
 */
export type KycSessionDisclaimers = {
  /** idOS legal documents. */
  idOS: KycConsentDocument[];
  /** KYC provider (SumSub) legal documents. */
  kycProvider: KycConsentDocument[];
  /** Whether the user consented to reuse existing idOS credentials. */
  credentialReusabilityConsentGiven: boolean;
};
