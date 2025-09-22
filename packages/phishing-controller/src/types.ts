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
   * The hostname that was scanned.
   */
  hostname: string;
  /**
   * Indicates the warning level based on risk factors.
   *
   * - "NONE" means it is most likely safe.
   * - "WARN" means there is some risk.
   * - "BLOCK" means it is highly likely to be malicious.
   * - "VERIFIED" means it has been associated as an official domain of a
   * company or organization and/or a top Web3 domain.
   */
  recommendedAction: RecommendedAction;
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
  /**
   * Verified means it has been associated as an official domain of a
   * company or organization and/or a top Web3 domain.
   */
  Verified = 'VERIFIED',
}

/**
 * Request for bulk token scan
 */
export type BulkTokenScanRequest = {
  chainId: string;
  tokens: string[];
};

/**
 * Result type of a token scan
 */
export enum TokenScanResultType {
  Benign = 'Benign',
  Warning = 'Warning',
  Malicious = 'Malicious',
  Spam = 'Spam',
}

/**
 * Result of a token scan
 */
export type TokenScanResult = {
  result_type: TokenScanResultType;
  chain: string;
  address: string;
};

/**
 * Response for bulk token scan requests
 */
export type BulkTokenScanResponse = Record<string, TokenScanResult>;

/**
 * Token data stored in cache (excludes chain and address which are in the key)
 * For now, we only cache the result type, but we could add more data if needed in the future
 */
export type TokenScanCacheData = Omit<TokenScanResult, 'chain' | 'address'>;

/**
 * API response from the bulk token scanning endpoint
 */
export type TokenScanApiResponse = {
  results: Record<
    string,
    {
      result_type: TokenScanResultType;
      chain?: string;
      address?: string;
    }
  >;
};

export const DEFAULT_CHAIN_ID_TO_NAME = {
  '0x1': 'ethereum',
  '0x89': 'polygon',
  '0x38': 'bsc',
  '0xa4b1': 'arbitrum',
  '0xa86a': 'avalanche',
  '0x2105': 'base',
  '0xa': 'optimism',
  '0x76adf1': 'zora',
  '0xe708': 'linea',
  '0x27bc86aa': 'degen',
  '0x144': 'zksync',
  '0x82750': 'scroll',
  '0x13e31': 'blast',
  '0x74c': 'soneium',
  '0x79a': 'soneium-minato',
  '0x14a34': 'base-sepolia',
  '0xab5': 'abstract',
  '0x849ea': 'zero-network',
  '0x138de': 'berachain',
  '0x82': 'unichain',
  '0x7e4': 'ronin',
  '0x127': 'hedera',
} as const;

export type ChainIdToNameMap = typeof DEFAULT_CHAIN_ID_TO_NAME;
