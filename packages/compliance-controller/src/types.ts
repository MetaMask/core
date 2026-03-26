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

/**
 * Information about the full set of blocked wallets returned by the API.
 */
export type BlockedWalletsInfo = {
  /**
   * The list of all blocked wallet addresses.
   */
  addresses: string[];

  /**
   * The number of blocked addresses from each source.
   */
  sources: {
    ofac: number;
    remote: number;
  };

  /**
   * The date/time (in ISO-8601 format) when the blocklist was last updated
   * on the server.
   */
  lastUpdated: string;

  /**
   * The date/time (in ISO-8601 format) when this data was fetched.
   */
  fetchedAt: string;
};
