/**
 * The result of checking a single wallet address for compliance.
 */
export type WalletComplianceStatus = {
  /**
   * The wallet address that was checked.
   */
  address: string;

  /**
   * Whether the wallet address is blocked.
   */
  blocked: boolean;

  /**
   * The date/time (in ISO-8601 format) when this check was performed.
   */
  checkedAt: string;
};
