import type { StateMetadata } from '@metamask/base-controller';
import type { Json } from '@metamask/utils';

import type {
  KycConsentRecord,
  KycDisclaimer,
  KycPhase,
  KycProduct,
  KycProviderDisclaimersAccepted,
  KycSessionDisclaimers,
  KycSessionStatus,
  KycSumSubStatus,
  KycUserStatus,
  KycVendor,
  KycVendorDisclaimersAccepted,
} from './types.js';

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

  /** Vendor disclaimers fetched for the current country. */
  vendorDisclaimers: KycDisclaimer[];
  /** Error encountered while loading vendor disclaimers, or `null`. */
  vendorError: string | null;
  /**
   * idOS / KYC-provider disclaimer catalog from `GET /disclaimers` or
   * `GET /sessions/{sessionId}/disclaimers`. `null` until the catalog has
   * been fetched (typically after a UKYC session exists).
   */
  sessionDisclaimers: KycSessionDisclaimers | null;

  /** Resolved ISO 3166-1 alpha-3 country code. */
  geoCountry: string | null;

  /** MoonPay session token (not persisted, not logged). */
  moonpaySessionToken: string | null;
  /** MoonPay access token (not persisted, not logged). */
  moonpayAccessToken: string | null;
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

export const kycControllerMetadata = {
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
  vendorDisclaimers: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: true,
  },
  vendorError: {
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
  moonpaySessionToken: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: false,
    usedInUi: false,
  },
  moonpayAccessToken: {
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
 * Constructs the default {@link KycVendorDisclaimersAccepted} value.
 *
 * @returns The default vendor-disclaimer acceptance map.
 */
export function getDefaultKycVendorDisclaimersAccepted(): KycVendorDisclaimersAccepted {
  return { moonpay: null, iron: null };
}

/**
 * Constructs the default {@link KycProviderDisclaimersAccepted} value.
 *
 * @returns The default provider-disclaimer acceptance map.
 */
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
    phase: 'idle',
    statusMessage: '',
    error: null,
    email: null,
    vendorDisclaimersAccepted: getDefaultKycVendorDisclaimersAccepted(),
    providerDisclaimersAccepted: getDefaultKycProviderDisclaimersAccepted(),
    idosDisclaimersAccepted: null,
    credentialReusabilityConsentGiven: null,
    vendorDisclaimers: [],
    vendorError: null,
    sessionDisclaimers: null,
    geoCountry: null,
    moonpaySessionToken: null,
    moonpayAccessToken: null,
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
