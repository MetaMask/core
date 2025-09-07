import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  safelyExecute,
  safelyExecuteWithTimeout,
} from '@metamask/controller-utils';
import { toASCII } from 'punycode/punycode.js';

import { CacheManager, type CacheEntry } from './CacheManager';
import { PhishingDetector } from './PhishingDetector';
import {
  PhishingDetectorResultType,
  type PhishingDetectorResult,
  type PhishingDetectionScanResult,
  RecommendedAction,
} from './types';
import {
  applyDiffs,
  fetchTimeNow,
  getHostnameFromUrl,
  roundToNearestMinute,
  getHostnameFromWebUrl,
} from './utils';

/**
 * TokenScanResult
 *
 * Result of a token screening scan
 * @property chainId - The chain ID where the token exists
 * @property tokenAddress - The token contract address
 * @property isMalicious - Whether the token is identified as malicious
 * @property metadata - Additional metadata about the token
 */
export type TokenScanResult = {
  chainId: string;
  tokenAddress: string;
  isMalicious: boolean;
  metadata?: {
    maliciousScore?: string;
    attackTypes?: Record<string, string | number | boolean>;
    features?: {
      feature_id: string;
      type: string;
      description: string;
    }[];
  };
};

/**
 * BulkTokenScanResponse
 *
 * Response for bulk token screening requests
 * @property results - Record of token identifiers and their scan results
 * @property errors - Record of token identifiers and their corresponding errors
 */
export type BulkTokenScanResponse = {
  results: Record<string, TokenScanResult>;
  errors: Record<string, string[]>;
};

/**
 * Token data stored in cache (excludes chainId and tokenAddress which are in the key)
 */
type TokenScanCacheData = Omit<TokenScanResult, 'chainId' | 'tokenAddress'>;

export const PHISHING_CONFIG_BASE_URL =
  'https://phishing-detection.api.cx.metamask.io';
export const METAMASK_STALELIST_FILE = '/v1/stalelist';
export const METAMASK_HOTLIST_DIFF_FILE = '/v1/diffsSince';

export const CLIENT_SIDE_DETECION_BASE_URL =
  'https://client-side-detection.api.cx.metamask.io';
export const C2_DOMAIN_BLOCKLIST_ENDPOINT = '/v1/request-blocklist';

export const PHISHING_DETECTION_BASE_URL =
  'https://dapp-scanning.api.cx.metamask.io';
export const PHISHING_DETECTION_SCAN_ENDPOINT = 'v2/scan';
export const PHISHING_DETECTION_BULK_SCAN_ENDPOINT = 'bulk-scan';

export const SECURITY_ALERTS_BASE_URL =
  'https://security-alerts.api.cx.metamask.io';
export const TOKEN_SCREENING_ENDPOINT = '/token/scan';

// Cache configuration defaults
export const DEFAULT_URL_SCAN_CACHE_TTL = 300; // 5 minutes in seconds
export const DEFAULT_URL_SCAN_CACHE_MAX_SIZE = 100;
export const DEFAULT_TOKEN_SCAN_CACHE_TTL = 5 * 60; // 5 minutes in seconds
export const DEFAULT_TOKEN_SCAN_CACHE_MAX_SIZE = 1000;

export const C2_DOMAIN_BLOCKLIST_REFRESH_INTERVAL = 5 * 60; // 5 mins in seconds
export const HOTLIST_REFRESH_INTERVAL = 5 * 60; // 5 mins in seconds
export const STALELIST_REFRESH_INTERVAL = 30 * 24 * 60 * 60; // 30 days in seconds

export const METAMASK_STALELIST_URL = `${PHISHING_CONFIG_BASE_URL}${METAMASK_STALELIST_FILE}`;
export const METAMASK_HOTLIST_DIFF_URL = `${PHISHING_CONFIG_BASE_URL}${METAMASK_HOTLIST_DIFF_FILE}`;
export const C2_DOMAIN_BLOCKLIST_URL = `${CLIENT_SIDE_DETECION_BASE_URL}${C2_DOMAIN_BLOCKLIST_ENDPOINT}`;

/**
 * @type ListTypes
 *
 * Type outlining the types of lists provided by aggregating different source lists
 */
export type ListTypes =
  | 'fuzzylist'
  | 'blocklist'
  | 'allowlist'
  | 'c2DomainBlocklist';

/**
 * @type EthPhishingResponse
 *
 * Configuration response from the eth-phishing-detect package
 * consisting of approved and unapproved website origins
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
 * @type PhishingStalelist
 *
 * type defining expected type of the stalelist.json file.
 * @property eth_phishing_detect_config - Stale list sourced from eth-phishing-detect's config.json.
 * @property tolerance - Fuzzy match tolerance level
 * @property lastUpdated - Timestamp of last update.
 * @property version - Stalelist data structure iteration.
 */
export type PhishingStalelist = {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  eth_phishing_detect_config: Record<ListTypes, string[]>;
  tolerance: number;
  version: number;
  lastUpdated: number;
};

/**
 * @type PhishingListState
 *
 * type defining the persisted list state. This is the persisted state that is updated frequently with `this.maybeUpdateState()`.
 * @property allowlist - List of approved origins (legacy naming "whitelist")
 * @property blocklist - List of unapproved origins (legacy naming "blacklist")
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

// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export type DataResultWrapper<T> = {
  data: T;
};

/**
 * @type Hotlist
 *
 * Type defining expected hotlist.json file.
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
const phishingListNameKeyMap = {
  [ListNames.MetaMask]: ListKeys.EthPhishingDetectConfig,
};

/**
 * Maps from list key sourced from upstream data
 * provider to downstream client attribution name.
 */
export const phishingListKeyNameMap = {
  [ListKeys.EthPhishingDetectConfig]: ListNames.MetaMask,
};

const controllerName = 'PhishingController';

const metadata = {
  phishingLists: { persist: true, anonymous: false },
  whitelist: { persist: true, anonymous: false },
  hotlistLastFetched: { persist: true, anonymous: false },
  stalelistLastFetched: { persist: true, anonymous: false },
  c2DomainBlocklistLastFetched: { persist: true, anonymous: false },
  urlScanCache: { persist: true, anonymous: false },
  tokenScanCache: { persist: true, anonymous: false },
};

/**
 * Get a default empty state for the controller.
 * @returns The default empty state.
 */
const getDefaultState = (): PhishingControllerState => {
  return {
    phishingLists: [],
    whitelist: [],
    hotlistLastFetched: 0,
    stalelistLastFetched: 0,
    c2DomainBlocklistLastFetched: 0,
    urlScanCache: {},
    tokenScanCache: {},
  };
};

/**
 * @type PhishingControllerState
 *
 * Phishing controller state
 * @property phishing - eth-phishing-detect configuration
 * @property whitelist - array of temporarily-approved origins
 * @property tokenScanCache - cache of token scan results
 */
export type PhishingControllerState = {
  phishingLists: PhishingListState[];
  whitelist: string[];
  hotlistLastFetched: number;
  stalelistLastFetched: number;
  c2DomainBlocklistLastFetched: number;
  urlScanCache: Record<string, CacheEntry<PhishingDetectionScanResult>>;
  tokenScanCache: Record<string, CacheEntry<TokenScanCacheData>>;
};

/**
 * PhishingControllerOptions
 *
 * Phishing controller options
 * stalelistRefreshInterval - Polling interval used to fetch stale list.
 * hotlistRefreshInterval - Polling interval used to fetch hotlist diff list.
 * c2DomainBlocklistRefreshInterval - Polling interval used to fetch c2 domain blocklist.
 * urlScanCacheTTL - Time to live in seconds for cached scan results.
 * urlScanCacheMaxSize - Maximum number of entries in the scan cache.
 * tokenScanCacheTTL - Time to live in seconds for cached token scan results.
 * tokenScanCacheMaxSize - Maximum number of entries in the token scan cache.
 */
export type PhishingControllerOptions = {
  stalelistRefreshInterval?: number;
  hotlistRefreshInterval?: number;
  c2DomainBlocklistRefreshInterval?: number;
  urlScanCacheTTL?: number;
  urlScanCacheMaxSize?: number;
  tokenScanCacheTTL?: number;
  tokenScanCacheMaxSize?: number;
  messenger: PhishingControllerMessenger;
  state?: Partial<PhishingControllerState>;
};

export type MaybeUpdateState = {
  type: `${typeof controllerName}:maybeUpdateState`;
  handler: PhishingController['maybeUpdateState'];
};

export type TestOrigin = {
  type: `${typeof controllerName}:testOrigin`;
  handler: PhishingController['test'];
};

export type PhishingControllerBulkScanUrlsAction = {
  type: `${typeof controllerName}:bulkScanUrls`;
  handler: PhishingController['bulkScanUrls'];
};

export type PhishingControllerBulkScanTokensAction = {
  type: `${typeof controllerName}:bulkScanTokens`;
  handler: PhishingController['bulkScanTokens'];
};

export type PhishingControllerScanTokenAction = {
  type: `${typeof controllerName}:scanToken`;
  handler: PhishingController['scanToken'];
};

export type PhishingControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  PhishingControllerState
>;

export type PhishingControllerActions =
  | PhishingControllerGetStateAction
  | MaybeUpdateState
  | TestOrigin
  | PhishingControllerBulkScanUrlsAction
  | PhishingControllerBulkScanTokensAction
  | PhishingControllerScanTokenAction;

export type PhishingControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  PhishingControllerState
>;

export type PhishingControllerEvents = PhishingControllerStateChangeEvent;

export type PhishingControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  PhishingControllerActions,
  PhishingControllerEvents,
  never,
  never
>;

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
 * Controller that manages community-maintained lists of approved and unapproved website origins.
 */
export class PhishingController extends BaseController<
  typeof controllerName,
  PhishingControllerState,
  PhishingControllerMessenger
> {
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #detector: any;

  #stalelistRefreshInterval: number;

  #hotlistRefreshInterval: number;

  #c2DomainBlocklistRefreshInterval: number;

  readonly #urlScanCache: CacheManager<PhishingDetectionScanResult>;

  readonly #tokenScanCache: CacheManager<TokenScanCacheData>;

  #inProgressHotlistUpdate?: Promise<void>;

  #inProgressStalelistUpdate?: Promise<void>;

  #isProgressC2DomainBlocklistUpdate?: Promise<void>;

  /**
   * Construct a Phishing Controller.
   *
   * @param config - Initial options used to configure this controller.
   * @param config.stalelistRefreshInterval - Polling interval used to fetch stale list.
   * @param config.hotlistRefreshInterval - Polling interval used to fetch hotlist diff list.
   * @param config.c2DomainBlocklistRefreshInterval - Polling interval used to fetch c2 domain blocklist.
   * @param config.urlScanCacheTTL - Time to live in seconds for cached scan results.
   * @param config.urlScanCacheMaxSize - Maximum number of entries in the scan cache.
   * @param config.tokenScanCacheTTL - Time to live in seconds for cached token scan results.
   * @param config.tokenScanCacheMaxSize - Maximum number of entries in the token scan cache.
   * @param config.messenger - The controller restricted messenger.
   * @param config.state - Initial state to set on this controller.
   */
  constructor({
    stalelistRefreshInterval = STALELIST_REFRESH_INTERVAL,
    hotlistRefreshInterval = HOTLIST_REFRESH_INTERVAL,
    c2DomainBlocklistRefreshInterval = C2_DOMAIN_BLOCKLIST_REFRESH_INTERVAL,
    urlScanCacheTTL = DEFAULT_URL_SCAN_CACHE_TTL,
    urlScanCacheMaxSize = DEFAULT_URL_SCAN_CACHE_MAX_SIZE,
    tokenScanCacheTTL = DEFAULT_TOKEN_SCAN_CACHE_TTL,
    tokenScanCacheMaxSize = DEFAULT_TOKEN_SCAN_CACHE_MAX_SIZE,
    messenger,
    state = {},
  }: PhishingControllerOptions) {
    super({
      name: controllerName,
      metadata,
      messenger,
      state: {
        ...getDefaultState(),
        ...state,
      },
    });

    this.#stalelistRefreshInterval = stalelistRefreshInterval;
    this.#hotlistRefreshInterval = hotlistRefreshInterval;
    this.#c2DomainBlocklistRefreshInterval = c2DomainBlocklistRefreshInterval;
    // Initialize URL scan cache
    this.#urlScanCache = new CacheManager<PhishingDetectionScanResult>({
      cacheTTL: urlScanCacheTTL,
      maxCacheSize: urlScanCacheMaxSize,
      initialCache: this.state.urlScanCache,
      updateState: (cache) => {
        this.update((draftState) => {
          draftState.urlScanCache = cache;
        });
      },
    });

    // Initialize token scan cache
    this.#tokenScanCache = new CacheManager<TokenScanCacheData>({
      cacheTTL: tokenScanCacheTTL,
      maxCacheSize: tokenScanCacheMaxSize,
      initialCache: this.state.tokenScanCache,
      updateState: (cache) => {
        this.update((draftState) => {
          draftState.tokenScanCache = cache;
        });
      },
    });

    this.#registerMessageHandlers();

    this.updatePhishingDetector();
  }

  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:maybeUpdateState` as const,
      this.maybeUpdateState.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:testOrigin` as const,
      this.test.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:bulkScanUrls` as const,
      this.bulkScanUrls.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:bulkScanTokens` as const,
      this.bulkScanTokens.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:scanToken` as const,
      this.scanToken.bind(this),
    );
  }

  /**
   * Updates this.detector with an instance of PhishingDetector using the current state.
   */
  updatePhishingDetector() {
    this.#detector = new PhishingDetector(this.state.phishingLists);
  }

  /**
   * Set the interval at which the stale phishing list will be refetched.
   * Fetching will only occur on the next call to test/bypass.
   * For immediate update to the phishing list, call {@link updateStalelist} directly.
   *
   * @param interval - the new interval, in ms.
   */
  setStalelistRefreshInterval(interval: number) {
    this.#stalelistRefreshInterval = interval;
  }

  /**
   * Set the interval at which the hot list will be refetched.
   * Fetching will only occur on the next call to test/bypass.
   * For immediate update to the phishing list, call {@link updateHotlist} directly.
   *
   * @param interval - the new interval, in ms.
   */
  setHotlistRefreshInterval(interval: number) {
    this.#hotlistRefreshInterval = interval;
  }

  /**
   * Set the interval at which the C2 domain blocklist will be refetched.
   * Fetching will only occur on the next call to test/bypass.
   * For immediate update to the phishing list, call {@link updateHotlist} directly.
   *
   * @param interval - the new interval, in ms.
   */
  setC2DomainBlocklistRefreshInterval(interval: number) {
    this.#c2DomainBlocklistRefreshInterval = interval;
  }

  /**
   * Set the time-to-live for URL scan cache entries.
   *
   * @param ttl - The TTL in seconds.
   */
  setUrlScanCacheTTL(ttl: number) {
    this.#urlScanCache.setTTL(ttl);
  }

  /**
   * Set the maximum number of entries in the URL scan cache.
   *
   * @param maxSize - The maximum cache size.
   */
  setUrlScanCacheMaxSize(maxSize: number) {
    this.#urlScanCache.setMaxSize(maxSize);
  }

  /**
   * Clear the URL scan cache.
   */
  clearUrlScanCache() {
    this.#urlScanCache.clear();
  }

  /**
   * Determine if an update to the stalelist configuration is needed.
   *
   * @returns Whether an update is needed
   */
  isStalelistOutOfDate() {
    return (
      fetchTimeNow() - this.state.stalelistLastFetched >=
      this.#stalelistRefreshInterval
    );
  }

  /**
   * Determine if an update to the hotlist configuration is needed.
   *
   * @returns Whether an update is needed
   */
  isHotlistOutOfDate() {
    return (
      fetchTimeNow() - this.state.hotlistLastFetched >=
      this.#hotlistRefreshInterval
    );
  }

  /**
   * Determine if an update to the C2 domain blocklist is needed.
   *
   * @returns Whether an update is needed
   */
  isC2DomainBlocklistOutOfDate() {
    return (
      fetchTimeNow() - this.state.c2DomainBlocklistLastFetched >=
      this.#c2DomainBlocklistRefreshInterval
    );
  }

  /**
   * Conditionally update the phishing configuration.
   *
   * If the stalelist configuration is out of date, this function will call `updateStalelist`
   * to update the configuration. This will automatically grab the hotlist,
   * so it isn't necessary to continue on to download the hotlist and the c2 domain blocklist.
   *
   */
  async maybeUpdateState() {
    const staleListOutOfDate = this.isStalelistOutOfDate();
    if (staleListOutOfDate) {
      await this.updateStalelist();
      return;
    }
    const hotlistOutOfDate = this.isHotlistOutOfDate();
    if (hotlistOutOfDate) {
      await this.updateHotlist();
    }
    const c2DomainBlocklistOutOfDate = this.isC2DomainBlocklistOutOfDate();
    if (c2DomainBlocklistOutOfDate) {
      await this.updateC2DomainBlocklist();
    }
  }

  /**
   * Determines if a given origin is unapproved.
   *
   * It is strongly recommended that you call {@link maybeUpdateState} before calling this,
   * to check whether the phishing configuration is up-to-date. It will be updated if necessary
   * by calling {@link updateStalelist} or {@link updateHotlist}.
   *
   * @param origin - Domain origin of a website.
   * @returns Whether the origin is an unapproved origin.
   */
  test(origin: string): PhishingDetectorResult {
    const punycodeOrigin = toASCII(origin);
    const hostname = getHostnameFromUrl(punycodeOrigin);
    if (this.state.whitelist.includes(hostname || punycodeOrigin)) {
      return { result: false, type: PhishingDetectorResultType.All }; // Same as whitelisted match returned by detector.check(...).
    }
    return this.#detector.check(punycodeOrigin);
  }

  /**
   * Checks if a request URL's domain is blocked against the request blocklist.
   *
   * This method is used to determine if a specific request URL is associated with a malicious
   * command and control (C2) domain. The URL's hostname is hashed and checked against a configured
   * blocklist of known malicious domains.
   *
   * @param origin - The full request URL to be checked.
   * @returns An object indicating whether the URL's domain is blocked and relevant metadata.
   */
  isBlockedRequest(origin: string): PhishingDetectorResult {
    const punycodeOrigin = toASCII(origin);
    const hostname = getHostnameFromUrl(punycodeOrigin);
    if (this.state.whitelist.includes(hostname || punycodeOrigin)) {
      return { result: false, type: PhishingDetectorResultType.All }; // Same as whitelisted match returned by detector.check(...).
    }
    return this.#detector.isMaliciousC2Domain(punycodeOrigin);
  }

  /**
   * Temporarily marks a given origin as approved.
   *
   * @param origin - The origin to mark as approved.
   */
  bypass(origin: string) {
    const punycodeOrigin = toASCII(origin);
    const hostname = getHostnameFromUrl(punycodeOrigin);
    const { whitelist } = this.state;
    if (whitelist.includes(hostname || punycodeOrigin)) {
      return;
    }
    this.update((draftState) => {
      draftState.whitelist.push(hostname || punycodeOrigin);
    });
  }

  /**
   * Update the C2 domain blocklist.
   *
   * If an update is in progress, no additional update will be made. Instead this will wait until
   * the in-progress update has finished.
   */
  async updateC2DomainBlocklist() {
    if (this.#isProgressC2DomainBlocklistUpdate) {
      await this.#isProgressC2DomainBlocklistUpdate;
      return;
    }

    try {
      this.#isProgressC2DomainBlocklistUpdate = this.#updateC2DomainBlocklist();
      await this.#isProgressC2DomainBlocklistUpdate;
    } finally {
      this.#isProgressC2DomainBlocklistUpdate = undefined;
    }
  }

  /**
   * Update the hotlist.
   *
   * If an update is in progress, no additional update will be made. Instead this will wait until
   * the in-progress update has finished.
   */
  async updateHotlist() {
    if (this.#inProgressHotlistUpdate) {
      await this.#inProgressHotlistUpdate;
      return;
    }

    try {
      this.#inProgressHotlistUpdate = this.#updateHotlist();
      await this.#inProgressHotlistUpdate;
    } finally {
      this.#inProgressHotlistUpdate = undefined;
    }
  }

  /**
   * Update the stalelist.
   *
   * If an update is in progress, no additional update will be made. Instead this will wait until
   * the in-progress update has finished.
   */
  async updateStalelist() {
    if (this.#inProgressStalelistUpdate) {
      await this.#inProgressStalelistUpdate;
      return;
    }

    try {
      this.#inProgressStalelistUpdate = this.#updateStalelist();
      await this.#inProgressStalelistUpdate;
    } finally {
      this.#inProgressStalelistUpdate = undefined;
    }
  }

  /**
   * Scan a URL for phishing. It will only scan the hostname of the URL. It also only supports
   * web URLs.
   *
   * @param url - The URL to scan.
   * @returns The phishing detection scan result.
   */
  scanUrl = async (url: string): Promise<PhishingDetectionScanResult> => {
    const [hostname, ok] = getHostnameFromWebUrl(url);
    if (!ok) {
      return {
        hostname: '',
        recommendedAction: RecommendedAction.None,
        fetchError: 'url is not a valid web URL',
      };
    }

    const cachedResult = this.#urlScanCache.get(hostname);
    if (cachedResult) {
      return cachedResult;
    }

    const apiResponse = await safelyExecuteWithTimeout(
      async () => {
        const res = await fetch(
          `${PHISHING_DETECTION_BASE_URL}/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(hostname)}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          },
        );
        if (!res.ok) {
          return {
            error: `${res.status} ${res.statusText}`,
          };
        }
        const data = await res.json();
        return data;
      },
      true,
      8000,
    );

    // Need to do it this way because safelyExecuteWithTimeout returns undefined for both timeouts and errors.
    if (!apiResponse) {
      return {
        hostname: '',
        recommendedAction: RecommendedAction.None,
        fetchError: 'timeout of 8000ms exceeded',
      };
    } else if ('error' in apiResponse) {
      return {
        hostname: '',
        recommendedAction: RecommendedAction.None,
        fetchError: apiResponse.error,
      };
    }

    const result = {
      hostname,
      recommendedAction: apiResponse.recommendedAction,
    };

    this.#urlScanCache.set(hostname, result);

    return result;
  };

  /**
   * Scan multiple URLs for phishing in bulk. It will only scan the hostnames of the URLs.
   * It also only supports web URLs.
   *
   * @param urls - The URLs to scan.
   * @returns A mapping of URLs to their phishing detection scan results and errors.
   */
  bulkScanUrls = async (
    urls: string[],
  ): Promise<BulkPhishingDetectionScanResponse> => {
    if (!urls || urls.length === 0) {
      return {
        results: {},
        errors: {},
      };
    }

    // we are arbitrarily limiting the number of URLs to 250
    const MAX_TOTAL_URLS = 250;
    if (urls.length > MAX_TOTAL_URLS) {
      return {
        results: {},
        errors: {
          too_many_urls: [
            `Maximum of ${MAX_TOTAL_URLS} URLs allowed per request`,
          ],
        },
      };
    }

    const MAX_URL_LENGTH = 2048;
    const combinedResponse: BulkPhishingDetectionScanResponse = {
      results: {},
      errors: {},
    };

    // Extract hostnames from URLs and check for validity and length constraints
    const urlsToHostnames: Record<string, string> = {};
    const urlsToFetch: string[] = [];

    for (const url of urls) {
      if (url.length > MAX_URL_LENGTH) {
        combinedResponse.errors[url] = [
          `URL length must not exceed ${MAX_URL_LENGTH} characters`,
        ];
        continue;
      }

      const [hostname, ok] = getHostnameFromWebUrl(url);
      if (!ok) {
        combinedResponse.errors[url] = ['url is not a valid web URL'];
        continue;
      }

      // Check if result is already in cache
      const cachedResult = this.#urlScanCache.get(hostname);
      if (cachedResult) {
        // Use cached result
        combinedResponse.results[url] = cachedResult;
      } else {
        // Add to list of URLs to fetch
        urlsToHostnames[url] = hostname;
        urlsToFetch.push(url);
      }
    }

    // If there are URLs to fetch, process them in batches
    if (urlsToFetch.length > 0) {
      // The API has a limit of 50 URLs per request, so we batch the requests
      const MAX_URLS_PER_BATCH = 50;
      const batches: string[][] = [];
      for (let i = 0; i < urlsToFetch.length; i += MAX_URLS_PER_BATCH) {
        batches.push(urlsToFetch.slice(i, i + MAX_URLS_PER_BATCH));
      }

      // Process each batch in parallel
      const batchResults = await Promise.all(
        batches.map((batchUrls) => this.#processBatch(batchUrls)),
      );

      // Merge results and errors from all batches
      batchResults.forEach((batchResponse) => {
        // Add results to cache and combine with response
        Object.entries(batchResponse.results).forEach(([url, result]) => {
          const hostname = urlsToHostnames[url];
          if (hostname) {
            this.#urlScanCache.set(hostname, result);
          }
          combinedResponse.results[url] = result;
        });

        // Combine errors
        Object.entries(batchResponse.errors).forEach(([key, messages]) => {
          combinedResponse.errors[key] = [
            ...(combinedResponse.errors[key] || []),
            ...messages,
          ];
        });
      });
    }

    return combinedResponse;
  };

  /**
   * Map chain ID to chain name for the API.
   *
   * @param chainId - The chain ID.
   * @returns The chain name.
   */
  #getChainNameFromId(chainId: string): string {
    const chainIdToName: Record<string, string> = {
      '1': 'ethereum',
      '10': 'optimism',
      '56': 'bsc',
      '137': 'polygon',
      '250': 'fantom',
      '42161': 'arbitrum',
      '43114': 'avalanche',
      '8453': 'base',
      '534352': 'scroll',
      '59144': 'linea',
      '324': 'zksync',
      '1101': 'polygon-zkevm',
      '42220': 'celo',
      '100': 'gnosis',
      '1284': 'moonbeam',
      '1285': 'moonriver',
      '122': 'fuse',
      '9001': 'evmos',
      '1313161554': 'aurora',
      '1666600000': 'harmony',
      '25': 'cronos',
      '288': 'boba',
      '106': 'velas',
      '1088': 'metis',
      '2222': 'kava',
      '10000': 'smartbch',
      '32659': 'fusion',
      '30': 'rsk',
      '4689': 'iotex',
      '1030': 'conflux',
      '71402': 'godwoken',
      '888': 'wanchain',
      '66': 'okc',
      '128': 'heco',
      '336': 'shiden',
      '592': 'astar',
      '3': 'ropsten',
      '4': 'rinkeby',
      '5': 'goerli',
      '42': 'kovan',
      '80001': 'mumbai',
      '420': 'optimism-goerli',
      '421613': 'arbitrum-goerli',
      '11155111': 'sepolia',
      '84531': 'base-goerli',
      '84532': 'base-sepolia',
    };
    return chainIdToName[chainId] || 'ethereum';
  }

  /**
   * Scan multiple tokens for malicious activity in bulk.
   *
   * @param tokens - Array of token objects to scan.
   * @returns A mapping of token identifiers to their scan results and errors.
   */
  bulkScanTokens = async (
    tokens: { chainId: string; tokenAddress: string }[],
  ): Promise<BulkTokenScanResponse> => {
    if (!tokens || tokens.length === 0) {
      return {
        results: {},
        errors: {},
      };
    }

    // Limit to 20 tokens per request
    const MAX_TOKENS_PER_REQUEST = 20;
    if (tokens.length > MAX_TOKENS_PER_REQUEST) {
      return {
        results: {},
        errors: {
          too_many_tokens: [
            `Maximum of ${MAX_TOKENS_PER_REQUEST} tokens allowed per request`,
          ],
        },
      };
    }

    const combinedResponse: BulkTokenScanResponse = {
      results: {},
      errors: {},
    };

    const tokensToFetch: {
      chainId: string;
      tokenAddress: string;
      key: string;
    }[] = [];

    // Check cache for each token
    for (const token of tokens) {
      const cacheKey = `${token.chainId}:${token.tokenAddress.toLowerCase()}`;
      const cachedResult = this.#tokenScanCache.get(cacheKey);

      if (cachedResult) {
        combinedResponse.results[cacheKey] = {
          chainId: token.chainId,
          tokenAddress: token.tokenAddress,
          isMalicious: cachedResult.isMalicious,
          metadata: cachedResult.metadata,
        };
      } else {
        tokensToFetch.push({ ...token, key: cacheKey });
      }
    }

    // If there are tokens to fetch, call the API
    if (tokensToFetch.length > 0) {
      // The security alerts API only supports single token requests, so we need to make individual calls
      const promises = tokensToFetch.map(async (token) => {
        try {
          const apiResponse = await safelyExecuteWithTimeout(
            async () => {
              const res = await fetch(
                `${SECURITY_ALERTS_BASE_URL}${TOKEN_SCREENING_ENDPOINT}`,
                {
                  method: 'POST',
                  headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    chain: this.#getChainNameFromId(token.chainId),
                    address: token.tokenAddress,
                  }),
                },
              );

              if (!res.ok) {
                return {
                  error: `${res.status} ${res.statusText}`,
                };
              }

              const data = await res.json();
              return data;
            },
            true,
            5000, // 5 second timeout
          );

          if (!apiResponse) {
            combinedResponse.errors[token.key] = ['timeout of 5000ms exceeded'];
          } else if ('error' in apiResponse) {
            combinedResponse.errors[token.key] = [apiResponse.error];
          } else {
            // Map the API response to our format
            const isMalicious =
              apiResponse.result_type === 'Malicious' ||
              (apiResponse.malicious_score &&
                parseFloat(apiResponse.malicious_score) > 0.8);

            const result: TokenScanResult = {
              chainId: token.chainId,
              tokenAddress: token.tokenAddress,
              isMalicious,
              metadata: {
                maliciousScore: apiResponse.malicious_score,
                attackTypes: apiResponse.attack_types,
                features: apiResponse.features,
              },
            };

            // Add to cache
            this.#tokenScanCache.set(token.key, {
              isMalicious,
              metadata: result.metadata,
            });

            combinedResponse.results[token.key] = result;
          }
        } catch (error) {
          combinedResponse.errors[token.key] = [
            error instanceof Error ? error.message : 'Unknown error',
          ];
        }
      });

      // Wait for all requests to complete
      await Promise.all(promises);
    }

    return combinedResponse;
  };

  /**
   * Scan a single token for malicious activity.
   *
   * @param chainId - The chain ID where the token exists.
   * @param tokenAddress - The token contract address.
   * @returns The token scan result.
   */
  scanToken = async (
    chainId: string,
    tokenAddress: string,
  ): Promise<TokenScanResult> => {
    const cacheKey = `${chainId}:${tokenAddress.toLowerCase()}`;

    // Check cache first
    const cachedResult = this.#tokenScanCache.get(cacheKey);
    if (cachedResult) {
      return {
        chainId,
        tokenAddress,
        isMalicious: cachedResult.isMalicious,
        metadata: cachedResult.metadata,
      };
    }

    // Call the API
    const apiResponse = await safelyExecuteWithTimeout(
      async () => {
        const res = await fetch(
          `${SECURITY_ALERTS_BASE_URL}${TOKEN_SCREENING_ENDPOINT}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chain: this.#getChainNameFromId(chainId),
              address: tokenAddress,
            }),
          },
        );

        if (!res.ok) {
          return {
            error: `${res.status} ${res.statusText}`,
          };
        }

        const data = await res.json();
        return data;
      },
      true,
      5000, // 5 second timeout
    );

    if (!apiResponse) {
      throw new Error('Token scan timeout: request exceeded 5000ms');
    }

    if ('error' in apiResponse) {
      throw new Error(`Token scan failed: ${apiResponse.error}`);
    }

    // Map the API response to our format
    const isMalicious =
      apiResponse.result_type === 'Malicious' ||
      (apiResponse.malicious_score &&
        parseFloat(apiResponse.malicious_score) > 0.8);

    const result: TokenScanResult = {
      chainId,
      tokenAddress,
      isMalicious,
      metadata: {
        maliciousScore: apiResponse.malicious_score,
        attackTypes: apiResponse.attack_types,
        features: apiResponse.features,
      },
    };

    // Add to cache
    this.#tokenScanCache.set(cacheKey, {
      isMalicious,
      metadata: result.metadata,
    });

    return result;
  };

  /**
   * Clear the token scan cache.
   */
  clearTokenScanCache(): void {
    this.#tokenScanCache.clear();
  }

  /**
   * Set the time-to-live for token scan cache entries.
   *
   * @param ttl - The TTL in seconds.
   */
  setTokenScanCacheTTL(ttl: number): void {
    this.#tokenScanCache.setTTL(ttl);
  }

  /**
   * Set the maximum size of the token scan cache.
   *
   * @param maxSize - The maximum cache size.
   */
  setTokenScanCacheMaxSize(maxSize: number): void {
    this.#tokenScanCache.setMaxSize(maxSize);
  }

  /**
   * Process a batch of URLs (up to 50) for phishing detection.
   *
   * @param urls - A batch of URLs to scan.
   * @returns The scan results and errors for this batch.
   */
  readonly #processBatch = async (
    urls: string[],
  ): Promise<BulkPhishingDetectionScanResponse> => {
    const apiResponse = await safelyExecuteWithTimeout(
      async () => {
        const res = await fetch(
          `${PHISHING_DETECTION_BASE_URL}/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ urls }),
          },
        );

        if (!res.ok) {
          return {
            error: `${res.status} ${res.statusText}`,
            status: res.status,
            statusText: res.statusText,
          };
        }

        const data = await res.json();
        return data;
      },
      true,
      15000,
    );

    // Handle timeout or network errors
    if (!apiResponse) {
      return {
        results: {},
        errors: {
          network_error: ['timeout of 15000ms exceeded'],
        },
      };
    }

    // Handle HTTP error responses
    if (
      'error' in apiResponse &&
      'status' in apiResponse &&
      'statusText' in apiResponse
    ) {
      return {
        results: {},
        errors: {
          api_error: [`${apiResponse.status} ${apiResponse.statusText}`],
        },
      };
    }

    return apiResponse as BulkPhishingDetectionScanResponse;
  };

  /**
   * Update the stalelist configuration.
   *
   * This should only be called from the `updateStalelist` function, which is a wrapper around
   * this function that prevents redundant configuration updates.
   */
  async #updateStalelist() {
    let stalelistResponse: DataResultWrapper<PhishingStalelist> | null = null;
    let hotlistDiffsResponse: DataResultWrapper<Hotlist> | null = null;
    let c2DomainBlocklistResponse: C2DomainBlocklistResponse | null = null;
    try {
      const stalelistPromise = this.#queryConfig<
        DataResultWrapper<PhishingStalelist>
      >(METAMASK_STALELIST_URL);

      const c2DomainBlocklistPromise =
        this.#queryConfig<C2DomainBlocklistResponse>(C2_DOMAIN_BLOCKLIST_URL);

      [stalelistResponse, c2DomainBlocklistResponse] = await Promise.all([
        stalelistPromise,
        c2DomainBlocklistPromise,
      ]);
      // Fetching hotlist diffs relies on having a lastUpdated timestamp to do `GET /v1/diffsSince/:timestamp`,
      // so it doesn't make sense to call if there is not a timestamp to begin with.
      if (stalelistResponse?.data && stalelistResponse.data.lastUpdated > 0) {
        hotlistDiffsResponse = await this.#queryConfig<
          DataResultWrapper<Hotlist>
        >(`${METAMASK_HOTLIST_DIFF_URL}/${stalelistResponse.data.lastUpdated}`);
      }
    } finally {
      // Set `stalelistLastFetched` and `hotlistLastFetched` even for failed requests to prevent server
      // from being overwhelmed with traffic after a network disruption.
      const timeNow = fetchTimeNow();
      this.update((draftState) => {
        draftState.stalelistLastFetched = timeNow;
        draftState.hotlistLastFetched = timeNow;
        draftState.c2DomainBlocklistLastFetched = timeNow;
      });
    }

    if (!stalelistResponse || !hotlistDiffsResponse) {
      return;
    }

    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    const { eth_phishing_detect_config, ...partialState } =
      stalelistResponse.data;

    const metamaskListState: PhishingListState = {
      ...eth_phishing_detect_config,
      ...partialState,
      c2DomainBlocklist: c2DomainBlocklistResponse
        ? c2DomainBlocklistResponse.recentlyAdded
        : [],
      name: phishingListKeyNameMap.eth_phishing_detect_config,
    };

    const newMetaMaskListState: PhishingListState = applyDiffs(
      metamaskListState,
      hotlistDiffsResponse.data,
      ListKeys.EthPhishingDetectConfig,
    );

    this.update((draftState) => {
      draftState.phishingLists = [newMetaMaskListState];
    });
    this.updatePhishingDetector();
  }

  /**
   * Update the stalelist configuration.
   *
   * This should only be called from the `updateStalelist` function, which is a wrapper around
   * this function that prevents redundant configuration updates.
   */
  async #updateHotlist() {
    let hotlistResponse: DataResultWrapper<Hotlist> | null;

    try {
      if (this.state.phishingLists.length === 0) {
        return;
      }

      const lastDiffTimestamp = Math.max(
        ...this.state.phishingLists.map(({ lastUpdated }) => lastUpdated),
      );

      hotlistResponse = await this.#queryConfig<DataResultWrapper<Hotlist>>(
        `${METAMASK_HOTLIST_DIFF_URL}/${lastDiffTimestamp}`,
      );
    } finally {
      // Set `hotlistLastFetched` even for failed requests to prevent server from being overwhelmed with
      // traffic after a network disruption.
      this.update((draftState) => {
        draftState.hotlistLastFetched = fetchTimeNow();
      });
    }

    if (!hotlistResponse?.data) {
      return;
    }
    const hotlist = hotlistResponse.data;
    const newPhishingLists = this.state.phishingLists.map((phishingList) => {
      const updatedList = applyDiffs(
        phishingList,
        hotlist,
        phishingListNameKeyMap[phishingList.name],
        [],
        [],
      );

      return updatedList;
    });

    this.update((draftState) => {
      draftState.phishingLists = newPhishingLists;
    });
    this.updatePhishingDetector();
  }

  /**
   * Update the C2 domain blocklist.
   *
   * This should only be called from the `updateC2DomainBlocklist` function, which is a wrapper around
   * this function that prevents redundant configuration updates.
   */
  async #updateC2DomainBlocklist() {
    let c2DomainBlocklistResponse: C2DomainBlocklistResponse | null = null;

    try {
      c2DomainBlocklistResponse =
        await this.#queryConfig<C2DomainBlocklistResponse>(
          `${C2_DOMAIN_BLOCKLIST_URL}?timestamp=${roundToNearestMinute(
            this.state.c2DomainBlocklistLastFetched,
          )}`,
        );
    } finally {
      // Set `c2DomainBlocklistLastFetched` even for failed requests to prevent server from being overwhelmed with
      // traffic after a network disruption.
      this.update((draftState) => {
        draftState.c2DomainBlocklistLastFetched = fetchTimeNow();
      });
    }

    if (!c2DomainBlocklistResponse) {
      return;
    }

    const recentlyAddedC2Domains = c2DomainBlocklistResponse.recentlyAdded;
    const recentlyRemovedC2Domains = c2DomainBlocklistResponse.recentlyRemoved;

    const newPhishingLists = this.state.phishingLists.map((phishingList) => {
      const updatedList = applyDiffs(
        phishingList,
        [],
        phishingListNameKeyMap[phishingList.name],
        recentlyAddedC2Domains,
        recentlyRemovedC2Domains,
      );

      return updatedList;
    });

    this.update((draftState) => {
      draftState.phishingLists = newPhishingLists;
    });
    this.updatePhishingDetector();
  }

  async #queryConfig<ResponseType>(
    input: RequestInfo,
  ): Promise<ResponseType | null> {
    const response = await safelyExecute(
      () => fetch(input, { cache: 'no-cache' }),
      true,
    );

    switch (response?.status) {
      case 200: {
        return await response.json();
      }

      default: {
        return null;
      }
    }
  }
}

export default PhishingController;

export type { PhishingDetectorResult };
