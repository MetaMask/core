import type {
  ApprovalControllerOptions,
  ShowApprovalRequest,
} from '@metamask/approval-controller';

/**
 * Per-instance options for the wallet's `ApprovalController`. Both fields are
 * optional; see the controller's `init` for the defaults applied when omitted.
 */
export type ApprovalControllerInstanceOptions = {
  /**
   * Callback that surfaces a pending approval request to the user. Defaults to
   * a no-op so the controller works headlessly.
   */
  showApprovalRequest?: ShowApprovalRequest;
  /**
   * Approval types exempt from per-origin rate limiting. Defaults to a baseline
   * of EVM approval types.
   */
  typesExcludedFromRateLimiting?: NonNullable<
    ApprovalControllerOptions['typesExcludedFromRateLimiting']
  >;
};
