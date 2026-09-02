/* eslint-disable @typescript-eslint/naming-convention */
import type { PathTrie } from './PathTrie.js';

/**
 * @type ListTypes
 *
 * Type outlining the types of lists provided by aggregating different source lists
 */
export type ListTypes =
  | 'fuzzylist'
  | 'blocklist'
  | 'blocklistPaths'
  | 'allowlist'
  | 'c2DomainBlocklist';

/**
 * @type EthPhishingResponse
 *
 * Configuration response from the eth-phishing-detect package
 * consisting of approved and unapproved website origins
 *
 * @property blacklist - List of unapproved origins
 * @property fuzzylist - List of fuzzy-matched unapproved origins
 * @property tolerance - Fuzzy match tolerance level
 * @property version - Version number of this configuration
 * @property whitelist - List of approved origins
 */
export type EthPhishingResponse = {
  blacklist: string[];
  fuzzylist: string[];
  tolerance: number;
  version: number;
  whitelist: string[];
};

/**
 * @type C2DomainBlocklistResponse
 *
 * Response for blocklist update requests
 *
 * @property recentlyAdded - List of c2 domains recently added to the blocklist
 * @property recentlyRemoved - List of c2 domains recently removed from the blocklist
 * @property lastFetchedAt - Timestamp of the last fetch request
 */
export type C2DomainBlocklistResponse = {
  recentlyAdded: string[];
  recentlyRemoved: string[];
  lastFetchedAt: string;
};

/**
 * PhishingStalelist defines the expected type of the stalelist from the API.
 *
 * allowlist - List of approved origins.
 * blocklist - List of unapproved origins (hostname-only entries).
 * blocklistPaths - Trie of unapproved origins with paths (hostname + path entries).
 * fuzzylist - List of fuzzy-matched unapproved origins.
 * tolerance - Fuzzy match tolerance level
 * lastUpdated - Timestamp of last update.
 * version - Stalelist data structure iteration.
 */
export type PhishingStalelist = {
  allowlist: string[];
  blocklist: string[];
  blocklistPaths: string[];
  fuzzylist: string[];
  tolerance: number;
  version: number;
  lastUpdated: number;
};

/**
 * @type PhishingListState
 *
 * type defining the persisted list state. This is the persisted state that is updated frequently with `this.maybeUpdateState()`.
 *
 * @property allowlist - List of approved origins (legacy naming "whitelist")
 * @property blocklist - List of unapproved origins (legacy naming "blacklist")
 * @property blocklistPaths - Trie of unapproved origins with paths (hostname + path, no query params).
 * @property c2DomainBlocklist - List of hashed hostnames that C2 requests are blocked against.
 * @property fuzzylist - List of fuzzy-matched unapproved origins
 * @property tolerance - Fuzzy match tolerance level
 * @property lastUpdated - Timestamp of last update.
 * @property version - Version of the phishing list state.
 * @property name - Name of the list. Used for attribution.
 */
export type PhishingListState = {
  allowlist: string[];
  blocklist: string[];
  blocklistPaths: PathTrie;
  c2DomainBlocklist: string[];
  fuzzylist: string[];
  tolerance: number;
  version: number;
  lastUpdated: number;
  name: ListNames;
};

/**
 * @type HotlistDiff
 *
 * type defining the expected type of the diffs in hotlist.json file.
 *
 * @property url - Url of the diff entry.
 * @property timestamp - Timestamp at which the diff was identified.
 * @property targetList - The list name where the diff was identified.
 * @property isRemoval - Was the diff identified a removal type.
 */
export type HotlistDiff = {
  url: string;
  timestamp: number;
  targetList: `${ListKeys}.${ListTypes}`;
  isRemoval?: boolean;
};

export type DataResultWrapper<T> = {
  data: T;
};

/**
 * @type Hotlist
 *
 * Type defining expected hotlist.json file.
 *
 * @property url - Url of the diff entry.
 * @property timestamp - Timestamp at which the diff was identified.
 * @property targetList - The list name where the diff was identified.
 * @property isRemoval - Was the diff identified a removal type.
 */
export type Hotlist = HotlistDiff[];

/**
 * Enum containing upstream data provider source list keys.
 * These are the keys denoting lists consumed by the upstream data provider.
 */
export enum ListKeys {
  EthPhishingDetectConfig = 'eth_phishing_detect_config',
}

/**
 * Enum containing downstream client attribution names.
 */
export enum ListNames {
  MetaMask = 'MetaMask',
}

/**
 * Maps from downstream client attribution name
 * to list key sourced from upstream data provider.
 */
export const phishingListNameKeyMap = {
  [ListNames.MetaMask]: ListKeys.EthPhishingDetectConfig,
};

/**
 * Maps from list key sourced from upstream data
 * provider to downstream client attribution name.
 */
export const phishingListKeyNameMap = {
  [ListKeys.EthPhishingDetectConfig]: ListNames.MetaMask,
};

/**
 * BulkPhishingDetectionScanResponse
 *
 * Response for bulk phishing detection scan requests
 * results - Record of domain names and their corresponding phishing detection scan results
 *
 * errors - Record of domain names and their corresponding errors
 */
export type BulkPhishingDetectionScanResponse = {
  results: Record<string, PhishingDetectionScanResult>;
  errors: Record<string, string[]>;
};

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
  '0x12c': 'zksync-sepolia',
  '0xaa36a7': 'ethereum-sepolia',
  '0xa869': 'avalanche-fuji',
  '0x343b': 'immutable-zkevm',
  '0x34a1': 'immutable-zkevm-testnet',
  '0x64': 'gnosis',
  '0x1e0': 'worldchain',
  '0x8173': 'apechain',
  '0x138c5': 'berachain-bartio',
  '0xdef1': 'ink',
  '0xba5ed': 'ink-sepolia',
  '0x2b74': 'abstract-testnet',
  '0x531': 'sei',
  '0x2eb': 'flow-evm',
  '0x8f': 'monad',
  '0x3e7': 'hyperevm',
  '0xc4': 'xlayer',
  '0x10e6': 'megaeth',
  '0x1079': 'tempo',
  '0xa5bf': 'tempo-testnet',
  '0x2019': 'kaia',
  '0x1237': 'robinhood',
  '0x13b2': 'arc',
  '0x2611': 'plasma',
  '0x1388': 'mantle',
  '0xb67d2': 'katana',
  '0x18232': 'plume',
  '0x93e': 'kite-ai',
  '0x279f': 'monad-testnet',
  solana: 'solana',
  starknet: 'starknet',
  'starknet-sepolia': 'starknet-sepolia',
  stellar: 'stellar',
  bitcoin: 'bitcoin',
  sui: 'sui',
  tron: 'tron',
} as const;

export type ChainIdToNameMap = typeof DEFAULT_CHAIN_ID_TO_NAME;

/**
 * Result type of an address scan
 */
export enum AddressScanResultType {
  /**
   * Address is benign/safe
   */
  Benign = 'Benign',
  /**
   * Address has warning indicators
   */
  Warning = 'Warning',
  /**
   * Address is malicious
   */
  Malicious = 'Malicious',
  /**
   * Error occurred during scan
   */
  ErrorResult = 'ErrorResult',
}

/**
 * Result of an address security scan
 */
export type AddressScanResult = {
  /**
   * The result type indicating the security assessment
   */
  result_type: AddressScanResultType;
  /**
   * Additional label or description for the result
   */
  label: string;
};

/**
 * Address data stored in cache (minimal data needed)
 */
export type AddressScanCacheData = {
  result_type: AddressScanResultType;
  label: string;
};

/**
 * Similar address match metadata for address poisoning detection.
 */
export type SimilarAddressMatch = {
  /**
   * The known recipient address that resembles the candidate address.
   */
  knownAddress: string;
  /**
   * Number of matching characters at the start of the address body.
   */
  prefixMatchLength: number;
  /**
   * Number of matching characters at the end of the address body.
   */
  suffixMatchLength: number;
  /**
   * Combined similarity score used to rank matches.
   */
  poisoningScore: number;
  /**
   * Character positions where the candidate and known addresses differ.
   * Indices are based on the full hex string, including the `0x` prefix.
   */
  diffIndices: number[];
};

/**
 * Thresholds for address poisoning similarity detection.
 */
export type SimilarityOptions = {
  /**
   * Minimum required prefix match length.
   */
  prefixLen?: number;
  /**
   * Minimum required suffix match length.
   */
  suffixLen?: number;
};

export const APPROVAL_SUPPORTED_CHAINS = [
  'ethereum',
  'polygon',
  'bsc',
  'avalanche',
  'arbitrum',
  'base',
  'linea',
  'optimism',
] as const;

export type ApprovalSupportedChain = (typeof APPROVAL_SUPPORTED_CHAINS)[number];

export const TOKEN_SCAN_SUPPORTED_CHAINS = [
  'arbitrum',
  'avalanche',
  'base',
  'bsc',
  'ethereum',
  'optimism',
  'polygon',
  'zora',
  'solana',
  'starknet',
  'starknet-sepolia',
  'stellar',
  'linea',
  'degen',
  'zksync',
  'scroll',
  'blast',
  'soneium-minato',
  'base-sepolia',
  'bitcoin',
  'abstract',
  'soneium',
  'ink',
  'berachain',
  'unichain',
  'ronin',
  'sui',
  'hedera',
  'hyperevm',
  'xlayer',
  'monad',
  'megaeth',
  'tempo',
  'sei',
  'kaia',
  'tron',
  'robinhood',
] as const;

export type TokenScanSupportedChain =
  (typeof TOKEN_SCAN_SUPPORTED_CHAINS)[number];

export const ADDRESS_SCAN_SUPPORTED_CHAINS = [
  'arbitrum',
  'avalanche',
  'base',
  'base-sepolia',
  'bsc',
  'ethereum',
  'optimism',
  'polygon',
  'zksync',
  'zksync-sepolia',
  'zora',
  'linea',
  'blast',
  'scroll',
  'ethereum-sepolia',
  'degen',
  'avalanche-fuji',
  'gnosis',
  'worldchain',
  'soneium-minato',
  'ronin',
  'apechain',
  'berachain',
  'berachain-bartio',
  'ink',
  'ink-sepolia',
  'abstract',
  'abstract-testnet',
  'soneium',
  'unichain',
  'sei',
  'flow-evm',
  'hyperevm',
  'megaeth',
  'katana',
  'plume',
  'xlayer',
  'monad',
  'monad-testnet',
  'tempo',
  'tempo-testnet',
  'kite-ai',
  'kaia',
  'plasma',
  'mantle',
  'robinhood',
  'arc',
] as const;

export type AddressScanSupportedChain =
  (typeof ADDRESS_SCAN_SUPPORTED_CHAINS)[number];

export enum ApprovalResultType {
  Malicious = 'Malicious',
  Warning = 'Warning',
  Benign = 'Benign',
  ErrorResult = 'Error',
}

export enum ApprovalFeatureType {
  Malicious = 'Malicious',
  Warning = 'Warning',
  Benign = 'Benign',
  Info = 'Info',
}

export type ApprovalFeature = {
  feature_id: string;
  type: ApprovalFeatureType;
  description: string;
};

export type Allowance = {
  value?: string;
  usd_price?: string;
};

export type ApprovalAsset = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo_url?: string;
  type?: string;
};

export type Exposure = {
  usd_price?: string;
  value: string;
  raw_value: string;
};

export type Spender = {
  address: string;
  label?: string;
  features?: ApprovalFeature[];
};

export type Approval = {
  allowance: Allowance;
  asset: ApprovalAsset;
  exposure: Exposure;
  spender: Spender;
  verdict: ApprovalResultType;
};

export type ApprovalsResponse = {
  approvals: Approval[];
};
