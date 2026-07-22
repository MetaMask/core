/**
 * Shared types for the KYC controller and service.
 *
 * The KYC flow is vendor-backed (currently MoonPay for identity + SumSub for
 * document verification) but the surface exposed to consumers (ramps, card) is
 * intentionally vendor-neutral so a future vendor swap does not ripple out.
 */

/**
 * A MetaMask feature that consumes KYC. Used to key the per-product
 * "is KYC required" cache so ramps and card can share one controller.
 */
export type KycProduct = 'ramps' | 'card';

/**
 * Identity vendors supported behind the KYC surface.
 */
export type KycVendor = 'moonpay';

/**
 * Phases of the end-to-end identity flow.
 *
 * - `idle` — nothing started.
 * - `terms` — waiting for the customer to accept the vendor terms.
 * - `session` — creating the vendor session.
 * - `check` — running the invisible connection-check frame.
 * - `auth` — running the visible authentication (OTP) frame.
 * - `form` — authenticated; ready to submit the identity check.
 * - `submit` — submitting the KYC-required check.
 * - `done` — flow complete; see `kycRequiredByProduct` / `sumsub`.
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
 */
export type KycSumSubStatus =
  | 'idle'
  | 'creatingSession'
  | 'fetchingToken'
  | 'launching'
  | 'inProgress'
  | 'complete'
  | 'failed';

/**
 * A single disclaimer/term the customer must accept before a session is
 * created.
 */
export type KycDisclaimer = {
  id: string;
  // Mirrors the vendor API response field, which is snake_case.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  display_name: string;
  url: string;
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
