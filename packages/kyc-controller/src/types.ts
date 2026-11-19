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

/**
 * Vendors that onboard through {@link VendorOnboardingController}. Separate from
 * {@link KycVendor}, which the older `KycController` flow uses.
 */
export type OnboardingVendor = 'iron' | 'kalshi';

/**
 * Kalshi calls the phone signs and kyc-api forwards to the relay.
 *
 * Relay checks the signature and sends the call to Kalshi unchanged. The
 * phone signs with its A2T and device key. Relay does not sign these.
 */
export const KYC_VENDOR_SIGN_OPERATIONS = [
  'enrollment/intents',
  'users/link',
  'users/link/verify',
] as const;

/** One Kalshi call the phone can sign. See {@link KYC_VENDOR_SIGN_OPERATIONS}. */
export type KycVendorSignOperation =
  (typeof KYC_VENDOR_SIGN_OPERATIONS)[number];

/**
 * The Kalshi path each signed call carries. The controller checks a signer's
 * answer against these, so a call signed for the wrong route never goes out.
 */
export const KYC_VENDOR_SIGN_PATHS: Record<KycVendorSignOperation, string> = {
  'enrollment/intents': '/trade-api/v2/isv/enrollment/intents',
  'users/link': '/trade-api/v2/isv/users/link',
  'users/link/verify': '/trade-api/v2/isv/users/link/verify',
};

/**
 * A Kalshi call waiting to be signed.
 *
 * `email` is the address inside `users/link`. `code` is the code inside
 * `users/link/verify`. `enrollment/intents` carries neither.
 */
export type KycVendorSignRequest = {
  operation: KycVendorSignOperation;
  email?: string;
  code?: string;
};

/**
 * A Kalshi call the phone has signed, in the shape the relay takes.
 *
 * `headers` is exactly what Kalshi verifies: `Authorization`,
 * `Kalshi-Device-Key`, `Kalshi-Device-Key-Salt`, `Kalshi-Device-Request-Id`,
 * `Content-Type`, `Content-Digest`, `Idempotency-Key`, `Signature-Input` and
 * `Signature`. `body` is the exact string that was signed: `""` for
 * `enrollment/intents`, `{"email":...}` for `users/link` and `{"code":...}`
 * for `users/link/verify`. kyc-api and the relay pass it on as it is and
 * never serialize it again. A signature lasts 60 seconds.
 */
export type KycSignedRequest = {
  path: string;
  headers: Record<string, string>;
  body: string;
};

/**
 * What kyc-api accepts of a {@link KycSignedRequest}: at most 16 headers, all
 * strings, and a body of at most 4 KB. kyc-api also takes a path of 1 to 256
 * characters, which the fixed Kalshi routes always meet.
 */
export const KYC_SIGNED_REQUEST_LIMITS = {
  headerCount: 16,
  bodyBytes: 4096,
} as const;

/**
 * Signs the Kalshi calls for one vendor.
 *
 * Injected by the client. The signing key lives on the device, so the
 * controller decides which calls to sign and the client only signs them. It
 * answers with one {@link KycSignedRequest} per request, in the same order.
 */
export type KycVendorRequestSigner = (params: {
  vendor: OnboardingVendor;
  requests: readonly KycVendorSignRequest[];
}) => Promise<readonly KycSignedRequest[]>;

/**
 * Codes kyc-api answers a failed Kalshi step with, as `{ code, message }` with
 * both set to the code. The relay's codes pass through unchanged. The client
 * picks its message and screen from them.
 *
 * `kalshi_*` codes and `invalid_or_expired_code` come back as 400,
 * `session_not_in_email_verification` as 412, `not_found` as 404 (for
 * example, an A2T from the dev issuer on a UAT account) and
 * `idos_relay_unavailable` as 502. `kalshi_account_exists` comes from the
 * phone step, for a user who already has a Kalshi account.
 */
export const KYC_KALSHI_ERROR_CODES = [
  'kalshi_signed_request_path_not_allowed',
  'kalshi_signed_requests_sequence_invalid',
  'kalshi_signed_request_a2t_missing',
  'kalshi_signed_request_a2t_invalid',
  'kalshi_signed_request_sub_mismatch',
  'kalshi_signed_request_signature_missing',
  'kalshi_signed_request_body_invalid',
  'kalshi_signed_request_email_mismatch',
  'kalshi_signed_request_rejected',
  'kalshi_signed_request_required',
  'kalshi_account_exists',
  'invalid_or_expired_code',
  'session_not_in_email_verification',
  'not_found',
  'idos_relay_unavailable',
] as const;

/** A code from {@link KYC_KALSHI_ERROR_CODES}. */
export type KycKalshiErrorCode = (typeof KYC_KALSHI_ERROR_CODES)[number];

/**
 * The steps kyc-api can send for a vendor. The client maps each step to a
 * screen it already has; kyc-api never sends copy or layout.
 *
 * Kalshi sends `terms`, `mfa`, `kalshi_email_link`, `kalshi_phone_link`,
 * `sumsub`, and `decision`. Iron sends `terms`, `mfa`, `sumsub`, and
 * `decision`. `kalshi_email_link` is the email and its code, and
 * `kalshi_phone_link` is the phone and its code. Each is one step and two
 * screens, and the phone owns the second screen. Signing `users/link` and
 * `users/link/verify` stays on those email calls.
 */
export const KYC_STEPS = [
  'terms',
  'mfa',
  'kalshi_email_link',
  'kalshi_phone_link',
  'sumsub',
  /** Nothing left for the user to do. {@link KycStatus} says whether that is
   * good news. */
  'decision',
  'error',
] as const;

/**
 * How the user's verification is going, reported next to the step.
 *
 * Separate from the step: a user asked to redo the identity provider is on
 * the same step as one doing it for the first time, and the same screen is
 * shown. Only the status differs, which is what a "we need another look"
 * banner keys off.
 */
export const KYC_STEP_STATUSES = [
  'none',
  'pending',
  'retry',
  'approved',
  'rejected',
] as const;

/**
 * A status returned alongside a step by kyc-api. Distinct from
 * {@link KYC_STATUSES}, which is the UKYC session's own vocabulary.
 */
export type KycStepStatus = (typeof KYC_STEP_STATUSES)[number];

/**
 * Narrows a status string from kyc-api. An unknown status reads as `none`,
 * so an older app shows the step's plain screen rather than guessing.
 *
 * @param value - The status string from kyc-api.
 * @returns The known status, or `none`.
 */
export function toKycStepStatus(value: string): KycStepStatus {
  return (KYC_STEP_STATUSES as readonly string[]).includes(value)
    ? (value as KycStepStatus)
    : 'none';
}

/** Where the user is, and how their verification is going. */
export type KycStepInfo = { step: KycStep; status: KycStepStatus };

/**
 * What only the device knows, sent with a step request.
 *
 * Kept deliberately small: a fact belongs here only when kyc-api genuinely
 * cannot see it. kyc-api reads it for one answer and stores none of it.
 */
export type KycClientContext = {
  /**
   * The user accepted the vendor's terms on this device, before kyc-api
   * could record them. Needed where a vendor cannot be told about an
   * acceptance until an account exists.
   */
  vendorTermsAcceptedLocally?: boolean;
};

/** A step returned by kyc-api. See {@link KYC_STEPS}. */
export type KycStep = (typeof KYC_STEPS)[number];

/**
 * Narrows a step string from kyc-api. A step this client version does not
 * know is `error`, so an older app shows its error screen instead of
 * guessing a screen.
 *
 * @param value - The step string from kyc-api.
 * @returns The known step, or `error`.
 */
export function toKycStep(value: string): KycStep {
  return (KYC_STEPS as readonly string[]).includes(value)
    ? (value as KycStep)
    : 'error';
}
