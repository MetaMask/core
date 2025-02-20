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
  /**
   * The domain name that was scanned.
   */
  domainName: string;
  /**
   * Indicates the warning level based on risk factors.
   *
   * - "NONE" means it is most likely safe.
   * - "WARN" means there is some risk.
   * - "BLOCK" means it is highly likely to be malicious.
   */
  recommendedAction: RecommendedAction;
  /**
   * Is true if the domain is on our allowlist.
   */
  verified: boolean;
  /**
   * An optional error message that exists if:
   * - The link requested is not a valid web URL.
   * - Failed to fetch the result from the phishing detector.
   *
   * Consumers can use the existence of this field to retry.
   */
  fetchError?: string;
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
