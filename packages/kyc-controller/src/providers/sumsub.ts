/**
 * SumSub document-verification types and SDK status helpers.
 *
 * The KYC controller is platform-agnostic and does not import any SDK; each
 * client (mobile / extension / web) injects a {@link KycSumSubLauncher}.
 */

/**
 * Progress of the SumSub document-verification sub-flow.
 *
 * - `inProgress` — the SumSub SDK is on screen.
 * - `vendorProcessing` — session creation reported that the applicant is
 *   already approved on the relay (`kycStatus`) while the vendor is still
 *   finalizing its own decision (`finalStatus`). There is nothing left for the
 *   applicant to do, so the SDK is not launched; see `statusMessage`.
 * - `abandoned` — the applicant closed the SDK before submitting. Unlike
 *   `failed`, nothing went wrong, so `error` is left unset and consumers should
 *   offer a retry rather than report a problem.
 */
export type KycSumSubStatus =
  | 'idle'
  | 'creatingSession'
  | 'fetchingToken'
  | 'launching'
  | 'inProgress'
  | 'complete'
  | 'abandoned'
  | 'failed'
  | 'vendorProcessing';

/**
 * Status strings a SumSub SDK reports, through either the status-change
 * callback or the `launch` result. Distinct from {@link KycSumSubStatus},
 * which tracks the controller's own sub-flow.
 *
 * - `Ready` — initialized and presented; no step reported yet.
 * - `Failed` — the SDK itself could not run.
 * - `Initial` — no verification step has been passed.
 * - `Incomplete` — some but not all verification steps have been passed.
 * - `Pending` — the applicant submitted and review is pending.
 * - `TemporarilyDeclined` — the applicant was declined but may resubmit.
 * - `FinallyRejected` — the applicant was rejected for good.
 * - `Approved` — the applicant was approved.
 * - `ActionCompleted` — an applicant action (e.g. a liveness check) finished.
 * - `Completed` — normalized completion reported by non-native launchers.
 */
export type KycSumSubSdkStatus =
  | 'Ready'
  | 'Failed'
  | 'Initial'
  | 'Incomplete'
  | 'Pending'
  | 'TemporarilyDeclined'
  | 'FinallyRejected'
  | 'Approved'
  | 'ActionCompleted'
  | 'Completed';

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
export function isSumSubFlowCompleted(status: unknown): boolean {
  return typeof status === 'string' && SUMSUB_COMPLETED_STATUSES.has(status);
}

/**
 * Checks whether the SDK failed to run, as opposed to the applicant closing it
 * early. Only the former is worth reporting as an error.
 *
 * @param result - The result the launcher resolved with.
 * @returns Whether the SDK failed to run.
 */
export function isSumSubLaunchFailure(
  result: Record<string, unknown>,
): boolean {
  return (
    result.status === SUMSUB_FAILED_STATUS || typeof result.error === 'string'
  );
}
