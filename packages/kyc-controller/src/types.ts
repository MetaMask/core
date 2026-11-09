/**
 * Shared types for the KYC controller and service.
 *
 * The KYC flow is vendor-backed (currently MoonPay for identity + SumSub for
 * document verification) but the surface exposed to consumers (ramps, card) is
 * intentionally vendor-neutral so a future vendor swap does not ripple out.
 */

/**
 * Identity vendors supported behind the KYC surface.
 *
 * - `moonpay` — kept as a second session slot. There is no MoonPay-specific
 *   session API; sessions are created with `createUkycSession`.
 * - `iron` — Iron Money/VBA path: empty-shell customer → consents → SumSub.
 */
export type KycVendor = 'moonpay' | 'iron' | 'kalshi';

/**
 * Vendors whose user the idOS relay registers itself, from an email the client
 * supplies. Their sessions onboard with vendor-sent email / SMS codes before
 * KYC can start, and need no separate vendor-customer call.
 */
export const VENDORS_REGISTERED_BY_RELAY: ReadonlySet<KycVendor> = new Set([
  'kalshi',
]);

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
 * Steps of a UKYC session, as reported by the kyc-api on session-status
 * responses.
 *
 * - `processing` — the vendor is working and the applicant has nothing to do.
 * - `emailOtpCollection` — waiting for the applicant's email one-time code.
 * - `phoneOtpCollection` — waiting for the applicant's phone one-time code.
 * - `capabilityAuthorization` — waiting for the capability authorization token.
 * - `kyc` — waiting for the applicant to finish document verification.
 * - `approved` — the session was approved.
 * - `rejected` — the session was rejected.
 */
export const KYC_CURRENT_STEPS = {
  processing: 'processing',
  emailOtpCollection: 'emailOtpCollection',
  phoneOtpCollection: 'phoneOtpCollection',
  capabilityAuthorization: 'capabilityAuthorization',
  kyc: 'kyc',
  approved: 'approved',
  rejected: 'rejected',
} as const;

/**
 * A step of a UKYC session. See {@link KYC_CURRENT_STEPS}.
 */
export type KycCurrentStep =
  (typeof KYC_CURRENT_STEPS)[keyof typeof KYC_CURRENT_STEPS];

/**
 * `finalStatus` values that end session-status polling.
 */
export const FINAL_STATUSES_TO_STOP_POLLING: ReadonlySet<string> = new Set([
  KYC_STATUSES.approved,
  KYC_STATUSES.rejected,
  KYC_STATUSES.retry,
]);

/**
 * Terminal `finalStatus` values (`approved`, `rejected`, `retry`).
 * Same set as {@link FINAL_STATUSES_TO_STOP_POLLING}, exported under the
 * name consumers import from the package entry point.
 */
export const TERMINAL_SESSION_STATUSES: ReadonlySet<string> =
  FINAL_STATUSES_TO_STOP_POLLING;

/**
 * Capability-authorization status values returned on {@link KycSessionStatus}.
 *
 * - `new` — no capability token has been submitted yet.
 * - `pending` — a capability token was submitted and is still being processed.
 * - `stored` — the capability token is stored and valid.
 * - `expired` — the stored capability token has expired.
 * - `wiped` — the capability authorization was wiped and must not be resubmitted
 *   by this client flow.
 */
export const CAPABILITY_AUTHORIZATION_STATUSES = {
  new: 'new',
  pending: 'pending',
  stored: 'stored',
  expired: 'expired',
  wiped: 'wiped',
} as const;

/**
 * Capability-authorization statuses that require submitting a capability
 * authorization token (`new` or `expired`).
 */
export const CAPABILITY_AUTHORIZATION_STATUSES_TO_REFRESH: ReadonlySet<string> =
  new Set([
    CAPABILITY_AUTHORIZATION_STATUSES.new,
    CAPABILITY_AUTHORIZATION_STATUSES.expired,
  ]);

/**
 * `finalStatus` values for which capability authorization must not be
 * refreshed. Once KYC has a finished decision, the capability token is no
 * longer needed.
 */
export const FINAL_STATUSES_TO_SKIP_AUTH_REFRESH: ReadonlySet<string> = new Set(
  [KYC_STATUSES.approved, KYC_STATUSES.rejected],
);

/**
 * The status of a UKYC session, returned by the `GET /sessions/{id}/status`
 * endpoint and polled after the SumSub SDK completes to determine the final
 * verification decision.
 */
export type KycSessionStatus = {
  /** UKYC session id. */
  id: string;
  /**
   * The overall status of the session. Values in `TERMINAL_SESSION_STATUSES`
   * (`approved`, `rejected`, `retry`) are finished decisions. `pending` means
   * the vendor is still processing.
   *
   * Taken from the kyc-api response as-is, except when that response reports
   * `pending` while {@link KycSessionStatus.currentStep} is `kyc`. `finalStatus`
   * is `new` in that case.
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
  consentStatus?: string;
  idOSStatus?: string;
  /** The capability-authorization status of the session. */
  capabilityAuthorizationStatus?: string;
  /**
   * Where the applicant is in the KYC flow. Known values are
   * {@link KYC_CURRENT_STEPS}. Absent on sessions saved before this field
   * existed, and when the kyc-api response does not include it.
   */
  currentStep?: string;
};

/**
 * Adjusts a kyc-api session status before it is returned to consumers.
 *
 * `finalStatus` is kept, except when the API reports `pending` while
 * `currentStep` is `kyc`. That session is waiting on document verification,
 * so `finalStatus` is reported as `new`. This is a workaround because previously
 * the idOS API would only report `finalStatus` as `pending` when Sumsub was
 * fully submitted and processing, but not when only partially submitted. This is
 * no longer true, but the easiest way to patch this behavioral change for now
 * is to use currentStep as a fallback when `finalStatus` is `pending`.
 *
 * @param sessionStatus - The session status parsed from a kyc-api response.
 * @returns The session status consumers should store and act on.
 */
export function patchKycSessionStatus(
  sessionStatus: KycSessionStatus,
): KycSessionStatus {
  if (
    sessionStatus.finalStatus === KYC_STATUSES.pending &&
    sessionStatus.currentStep === KYC_CURRENT_STEPS.kyc
  ) {
    return {
      ...sessionStatus,
      finalStatus: 'new',
    };
  }
  return sessionStatus;
}

/**
 * Whether the session's capability authorization should be submitted (or
 * refreshed). Skips finished KYC decisions (`approved` / `rejected`) and
 * submits only when the API reports `new` or `expired`.
 *
 * @param sessionStatus - The current UKYC session status.
 * @returns Whether capability authorization should be submitted.
 */
export function needsCapabilityAuthorizationRefresh(
  sessionStatus: KycSessionStatus,
): boolean {
  if (FINAL_STATUSES_TO_SKIP_AUTH_REFRESH.has(sessionStatus.finalStatus)) {
    return false;
  }
  return (
    sessionStatus.capabilityAuthorizationStatus !== undefined &&
    CAPABILITY_AUTHORIZATION_STATUSES_TO_REFRESH.has(
      sessionStatus.capabilityAuthorizationStatus,
    )
  );
}

/**
 * A record of the customer's verified identity data being shared with a vendor,
 * returned by `GET /api/kyc/external-user-id/{externalUserId}/shares`.
 *
 * Metadata only — it remains available after the relay redacts the underlying
 * session (14 days).
 */
export type KycDataShare = {
  /** The UKYC session the data was shared from. */
  kycSessionId: string;
  /**
   * The vendor the identity data was shared with.
   *
   * Plain `string` (like {@link KycSessionStatus.vendor}) because the relay
   * returns vendors this package does not model (e.g. `kalshi`, `kraken`).
   */
  vendor: string;
  /** ISO 8601 date-time string of when the data was shared. */
  sharedAt: string;
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
 * A vendor's T&C acceptance, stored on that vendor's session entry.
 *
 * Terms are shown before a session exists and can only be submitted to the
 * vendor once one does, so acceptance is recorded on the device first
 * (`submitted: false`) and marked submitted once the vendor has it.
 */
export type KycVendorDisclaimersAcceptance = {
  /** IDs of the vendor disclaimers the customer accepted. */
  disclaimerIds: string[];
  /**
   * ISO-8601 timestamp of the acceptance. `null` for acceptance migrated from
   * a version that did not record when it happened.
   */
  acceptedAt: string | null;
  /** Whether the vendor has recorded the acceptance. */
  submitted: boolean;
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

/**
 * POC: a vendor's own account state, for vendors whose account outlives the
 * UKYC session (Kalshi). UKYC decides identity; the vendor account says
 * whether the user can actually use the vendor. Values follow the Kalshi
 * onboarding states predict-api introduced.
 */
export const KYC_VENDOR_ACCOUNT_STATES = [
  'none',
  'link_pending',
  'kyc_pending',
  'kyc_review',
  'unsupported',
  'approved',
  'inconsistent',
  'cancelled',
  'active',
] as const;

export type KycVendorAccountState = (typeof KYC_VENDOR_ACCOUNT_STATES)[number];

/** The second factor a vendor asked for while linking an account. */
export type KycVendorAccountMfa = {
  method: 'sms' | 'email' | 'authenticator-app';
  phoneLast4?: string;
  obfuscatedEmail?: string;
};

/**
 * POC: the vendor account recorded on a session entry.
 */
export type KycVendorAccount = {
  /** Last state the vendor reported, or `none` before any read. */
  state: KycVendorAccountState;
  /** Raw vendor status, for logs and debugging. */
  intentStatus?: string;
  /** The user id in the vendor's system, once the vendor returned it. */
  userId?: string;
  /** Email the vendor user was registered with. Reused to link the account. */
  email?: string;
  /** Set while the vendor waits for a second factor to link the account. */
  mfa?: KycVendorAccountMfa;
  /** Wallet bound at activation. */
  walletAddress?: string;
  /** ISO time of the last update. */
  updatedAt: string;
};

/**
 * POC: platform adapter for a vendor's device-signed account calls. Injected
 * by the client, because the device key and the vendor token live only on
 * the phone. The adapter owns signing and idempotency keys.
 */
export type KycVendorAccountAdapter = {
  /** Reads the vendor account state. */
  getStatus(): Promise<{ state: KycVendorAccountState; intentStatus?: string }>;
  /** Opens the link ceremony. */
  createIntent(): Promise<{ intentStatus: string }>;
  /** Names the email to link. The vendor sends a code. */
  submitEmail(email: string): Promise<void>;
  /** Submits a link code. `mfa` is set when another factor is needed. */
  verifyCode(code: string): Promise<{
    verified: boolean;
    userId?: string;
    mfa?: KycVendorAccountMfa;
  }>;
  /** Binds the payout wallet and activates the account. */
  activate(params: {
    walletAddress: string;
    network: string;
  }): Promise<{ intentStatus: string }>;
};
