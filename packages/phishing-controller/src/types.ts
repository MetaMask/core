/**
 * Represents the result of checking a domain.
 */
export type PhishingDetectorResult = {
  /**
   * The name of the configuration object in which the domain was found within
   * an allowlist, blocklist, or fuzzylist.
   */
  name?: string;
  /**
   * The version associated with the configuration object in which the domain
   * was found within an allowlist, blocklist, or fuzzylist.
   */
  version?: string;
  /**
   * Whether the domain is regarded as allowed (true) or not (false).
   */
  result: boolean;
  /**
   * A normalized version of the domain, which is only constructed if the domain
   * is found within a list.
   */
  match?: string;
  /**
   * Which type of list in which the domain was found.
   *
   * - "allowlist" means that the domain was found in the allowlist.
   * - "blocklist" means that the domain was found in the blocklist.
   * - "fuzzy" means that the domain was found in the fuzzylist.
   * - "blacklist" means that the domain was found in a blacklist of a legacy
   * configuration object.
   * - "whitelist" means that the domain was found in a whitelist of a legacy
   * configuration object.
   * - "all" means that the domain was not found in any list.
   */
  type: PhishingDetectorResultType;
};

/**
 * The type of list in which the domain was found.
 */
export enum PhishingDetectorResultType {
  /*
   * "all" means that the domain was not found in any list.
   */
  All = 'all',
  /*
   * "fuzzy" means that the domain was found in the fuzzylist.
   */
  Fuzzy = 'fuzzy',
  /*
   * "blocklist" means that the domain was found in the blocklist.
   */
  Blocklist = 'blocklist',
  /*
   * "allowlist" means that the domain was found in the allowlist.
   */
  Allowlist = 'allowlist',
  /*
   * "blacklist" means that the domain was found in a blacklist of a legacy
   * configuration object.
   */
  Blacklist = 'blacklist',
  /*
   * "whitelist" means that the domain was found in a whitelist of a legacy
   * configuration object.
   */
  Whitelist = 'whitelist',
  /*
   * "c2DomainBlocklist" means that the domain was found in the C2 domain blocklist.
   */
  C2DomainBlocklist = 'c2DomainBlocklist',
}

/**
 * PhishingDetectionScanResult represents the result of a phishing detection scan.
 */
export type PhishingDetectionScanResult = {
  domainName: string;
  recommendedAction: RecommendedAction;
  verified: boolean;
};

/**
 * Indicates the warning level based on risk factors
 */
export enum RecommendedAction {
  /**
   * None means it is most likely safe
   */
  None = 'NONE',
  /**
   * Warn means there is some risk
   */
  Warn = 'WARN',
  /**
   * Block means it is highly likely to be malicious
   */
  Block = 'BLOCK',
}
