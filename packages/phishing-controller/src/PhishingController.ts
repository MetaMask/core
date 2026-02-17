import { BaseController } from '@metamask/base-controller';
import type {
  StateMetadata,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import {
  safelyExecute,
  safelyExecuteWithTimeout,
} from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type {
  TransactionControllerStateChangeEvent,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Patch } from 'immer';
import { toASCII } from 'punycode/punycode.js';

import { CacheManager } from './CacheManager';
import type { CacheEntry } from './CacheManager';
import { convertListToTrie, insertToTrie, matchedPathPrefix } from './PathTrie';
import type { PathTrie } from './PathTrie';
import { PhishingDetector } from './PhishingDetector';
import {
  PhishingDetectorResultType,
  RecommendedAction,
  AddressScanResultType,
} from './types';
import type {
  PhishingDetectorResult,
  PhishingDetectionScanResult,
  TokenScanCacheData,
  BulkTokenScanResponse,
  BulkTokenScanRequest,
  TokenScanApiResponse,
  AddressScanCacheData,
  AddressScanResult,
} from './types';
import {
  applyDiffs,
  fetchTimeNow,
  getHostnameFromUrl,
  roundToNearestMinute,
  getHostnameFromWebUrl,
  buildCacheKey,
  splitCacheHits,
  resolveChainName,
  getPathnameFromUrl,
} from './utils';

export const PHISHING_CONFIG_BASE_URL =
  'https://phishing-detection.api.cx.metamask.io';
export const METAMASK_STALELIST_FILE = '/v1/stalelist';
export const METAMASK_HOTLIST_DIFF_FILE = '/v2/diffsSince';

export const CLIENT_SIDE_DETECION_BASE_URL =
  'https://client-side-detection.api.cx.metamask.io';
export const C2_DOMAIN_BLOCKLIST_ENDPOINT = '/v1/request-blocklist';

export const PHISHING_DETECTION_BASE_URL =
  'https://dapp-scanning.api.cx.metamask.io';
export const PHISHING_DETECTION_SCAN_ENDPOINT = 'v2/scan';
export const PHISHING_DETECTION_BULK_SCAN_ENDPOINT = 'bulk-scan';

export const SECURITY_ALERTS_BASE_URL =
  'https://security-alerts.api.cx.metamask.io';
export const TOKEN_BULK_SCANNING_ENDPOINT = '/token/scan-bulk';
export const ADDRESS_SCAN_ENDPOINT = '/address/evm/scan';

// Cache configuration defaults
export const DEFAULT_URL_SCAN_CACHE_TTL = 15 * 60; // 15 minutes in seconds
export const DEFAULT_URL_SCAN_CACHE_MAX_SIZE = 250;
export const DEFAULT_TOKEN_SCAN_CACHE_TTL = 15 * 60; // 15 minutes in seconds
export const DEFAULT_TOKEN_SCAN_CACHE_MAX_SIZE = 1000;
export const DEFAULT_ADDRESS_SCAN_CACHE_TTL = 15 * 60; // 15 minutes in seconds
export const DEFAULT_ADDRESS_SCAN_CACHE_MAX_SIZE = 1000;

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

const metadata: StateMetadata<PhishingControllerState> = {
  phishingLists: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  whitelist: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  whitelistPaths: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  hotlistLastFetched: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  stalelistLastFetched: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  c2DomainBlocklistLastFetched: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  urlScanCache: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  tokenScanCache: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  addressScanCache: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

/**
 * Get a default empty state for the controller.
 *
 * @returns The default empty state.
 */
const getDefaultState = (): PhishingControllerState => {
  return {
    phishingLists: [],
    whitelist: [],
    whitelistPaths: {},
    hotlistLastFetched: 0,
    stalelistLastFetched: 0,
    c2DomainBlocklistLastFetched: 0,
    urlScanCache: {},
    tokenScanCache: {},
    addressScanCache: {},
  };
};

/**
 * @type PhishingControllerState
 *
 * Phishing controller state
 * phishingLists - array of phishing lists
 * whitelist - origins that bypass the phishing detector
 * whitelistPaths - origins with paths that bypass the phishing detector
 * hotlistLastFetched - timestamp of the last hotlist fetch
 * stalelistLastFetched - timestamp of the last stalelist fetch
 * c2DomainBlocklistLastFetched - timestamp of the last c2 domain blocklist fetch
 * urlScanCache - cache of URL scan results
 * tokenScanCache - cache of token scan results
 * addressScanCache - cache of address scan results
 */
export type PhishingControllerState = {
  phishingLists: PhishingListState[];
  whitelist: string[];
  whitelistPaths: PathTrie;
  hotlistLastFetched: number;
  stalelistLastFetched: number;
  c2DomainBlocklistLastFetched: number;
  urlScanCache: Record<string, CacheEntry<PhishingDetectionScanResult>>;
  tokenScanCache: Record<string, CacheEntry<TokenScanCacheData>>;
  addressScanCache: Record<string, CacheEntry<AddressScanCacheData>>;
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
 * addressScanCacheTTL - Time to live in seconds for cached address scan results.
 * addressScanCacheMaxSize - Maximum number of entries in the address scan cache.
 */
export type PhishingControllerOptions = {
  stalelistRefreshInterval?: number;
  hotlistRefreshInterval?: number;
  c2DomainBlocklistRefreshInterval?: number;
  urlScanCacheTTL?: number;
  urlScanCacheMaxSize?: number;
  tokenScanCacheTTL?: number;
  tokenScanCacheMaxSize?: number;
  addressScanCacheTTL?: number;
  addressScanCacheMaxSize?: number;
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

export type PhishingControllerScanAddressAction = {
  type: `${typeof controllerName}:scanAddress`;
  handler: PhishingController['scanAddress'];
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
  | PhishingControllerScanAddressAction;

export type PhishingControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  PhishingControllerState
>;

export type PhishingControllerEvents = PhishingControllerStateChangeEvent;

/**
 * The external actions available to the PhishingController.
 */
type AllowedActions = never;

/**
 * The external events available to the PhishingController.
 */
export type AllowedEvents = TransactionControllerStateChangeEvent;

export type PhishingControllerMessenger = Messenger<
  typeof controllerName,
  PhishingControllerActions | AllowedActions,
  PhishingControllerEvents | AllowedEvents
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

  readonly #addressScanCache: CacheManager<AddressScanCacheData>;

  #inProgressHotlistUpdate?: Promise<void>;

  #inProgressStalelistUpdate?: Promise<void>;

  #isProgressC2DomainBlocklistUpdate?: Promise<void>;

  readonly #transactionControllerStateChangeHandler: (
    state: { transactions: TransactionMeta[] },
    patches: Patch[],
  ) => void;

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
   * @param config.addressScanCacheTTL - Time to live in seconds for cached address scan results.
   * @param config.addressScanCacheMaxSize - Maximum number of entries in the address scan cache.
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
    addressScanCacheTTL = DEFAULT_ADDRESS_SCAN_CACHE_TTL,
    addressScanCacheMaxSize = DEFAULT_ADDRESS_SCAN_CACHE_MAX_SIZE,
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
    this.#transactionControllerStateChangeHandler =
      this.#onTransactionControllerStateChange.bind(this);
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
    this.#addressScanCache = new CacheManager<AddressScanCacheData>({
      cacheTTL: addressScanCacheTTL,
      maxCacheSize: addressScanCacheMaxSize,
      initialCache: this.state.addressScanCache,
      updateState: (cache) => {
        this.update((draftState) => {
          draftState.addressScanCache = cache;
        });
      },
    });

    this.#registerMessageHandlers();

    this.updatePhishingDetector();
    this.#subscribeToTransactionControllerStateChange();
  }

  #subscribeToTransactionControllerStateChange() {
    this.messenger.subscribe(
      'TransactionController:stateChange',
      this.#transactionControllerStateChangeHandler,
    );
  }

  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #registerMessageHandlers(): void {
    this.messenger.registerActionHandler(
      `${controllerName}:maybeUpdateState` as const,
      this.maybeUpdateState.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:testOrigin` as const,
      this.test.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:bulkScanUrls` as const,
      this.bulkScanUrls.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:bulkScanTokens` as const,
      this.bulkScanTokens.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:scanAddress` as const,
      this.scanAddress.bind(this),
    );
  }

  /**
   * Checks if a patch represents a transaction-level change or nested transaction property change
   *
   * @param patch - Immer patch to check
   * @returns True if patch affects a transaction or its nested properties
   */
  #isTransactionPatch(patch: Patch): boolean {
    const { path } = patch;
    return (
      path.length === 2 &&
      path[0] === 'transactions' &&
      typeof path[1] === 'number'
    );
  }

  /**
   * Checks if a patch represents a simulation data change
   *
   * @param patch - Immer patch to check
   * @returns True if patch represents a simulation data change
   */
  #isSimulationDataPatch(patch: Patch): boolean {
    const { path } = patch;
    return (
      path.length === 3 &&
      path[0] === 'transactions' &&
      typeof path[1] === 'number' &&
      path[2] === 'simulationData'
    );
  }

  /**
   * Handle transaction controller state changes using Immer patches
   * Extracts token addresses from simulation data and groups them by chain for bulk scanning
   *
   * @param _state - The current transaction controller state
   * @param _state.transactions - Array of transaction metadata
   * @param patches - Array of Immer patches only for transaction-level changes
   */
  #onTransactionControllerStateChange(
    _state: { transactions: TransactionMeta[] },
    patches: Patch[],
  ) {
    try {
      const tokensByChain = new Map<string, Set<string>>();

      for (const patch of patches) {
        if (patch.op === 'remove') {
          continue;
        }

        // Handle transaction-level patches (includes simulation data updates)
        if (this.#isTransactionPatch(patch)) {
          const transaction = patch.value as TransactionMeta;
          this.#getTokensFromTransaction(transaction, tokensByChain);
        } else if (this.#isSimulationDataPatch(patch)) {
          const transactionIndex = patch.path[1] as number;
          const transaction = _state.transactions?.[transactionIndex];
          this.#getTokensFromTransaction(transaction, tokensByChain);
        }
      }

      this.#scanTokensByChain(tokensByChain);
    } catch (error) {
      console.error('Error processing transaction state change:', error);
    }
  }

  /**
   * Collect token addresses from a transaction and group them by chain
   *
   * @param transaction - Transaction metadata to extract tokens from
   * @param tokensByChain - Map to collect tokens grouped by chainId
   */
  #getTokensFromTransaction(
    transaction: TransactionMeta,
    tokensByChain: Map<string, Set<string>>,
  ) {
    // extract token addresses from simulation data
    const tokenAddresses = transaction.simulationData?.tokenBalanceChanges?.map(
      (tokenChange) => tokenChange.address.toLowerCase(),
    );

    // add token addresses to the map by chainId
    if (tokenAddresses && tokenAddresses.length > 0 && transaction.chainId) {
      const chainId = transaction.chainId.toLowerCase();

      if (!tokensByChain.has(chainId)) {
        tokensByChain.set(chainId, new Set());
      }

      const chainTokens = tokensByChain.get(chainId);
      if (chainTokens) {
        for (const address of tokenAddresses) {
          chainTokens.add(address);
        }
      }
    }
  }

  /**
   * Scan tokens grouped by chain ID
   *
   * @param tokensByChain - Map of chainId to token addresses
   */
  #scanTokensByChain(tokensByChain: Map<string, Set<string>>) {
    for (const [chainId, tokenSet] of tokensByChain) {
      if (tokenSet.size > 0) {
        const tokens = Array.from(tokenSet);
        this.bulkScanTokens({
          chainId,
          tokens,
        }).catch((error) =>
          console.error(`Error scanning tokens for chain ${chainId}:`, error),
        );
      }
    }
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
    const hostnameWithPaths = hostname + getPathnameFromUrl(origin);

    if (matchedPathPrefix(hostnameWithPaths, this.state.whitelistPaths)) {
      return { result: false, type: PhishingDetectorResultType.All };
    }

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
    const hostnameWithPaths = hostname + getPathnameFromUrl(origin);
    const { whitelist, whitelistPaths } = this.state;
    const whitelistPath = matchedPathPrefix(hostnameWithPaths, whitelistPaths);

    if (whitelist.includes(hostname || punycodeOrigin) || whitelistPath) {
      return;
    }

    // If the origin was blocked by a path, then we only want to add it to the whitelistPaths since
    // other paths with the same hostname may not be blocked.
    const blockingPath = this.#detector.blockingPath(origin);
    if (blockingPath) {
      this.update((draftState) => {
        insertToTrie(blockingPath, draftState.whitelistPaths);
      });
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
   * Fetch bulk token scan results from the security alerts API.
   *
   * @param chain - The chain name.
   * @param tokens - Array of token addresses to scan.
   * @returns The API response or null if there was an error.
   */
  readonly #fetchTokenScanBulkResults = async (
    chain: string,
    tokens: string[],
  ): Promise<TokenScanApiResponse | null> => {
    const timeout = 8000; // 8 seconds
    const apiResponse = await safelyExecuteWithTimeout(
      async () => {
        const response = await fetch(
          `${SECURITY_ALERTS_BASE_URL}${TOKEN_BULK_SCANNING_ENDPOINT}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chain,
              tokens,
            }),
          },
        );

        if (!response.ok) {
          return {
            error: `${response.status} ${response.statusText}`,
            status: response.status,
            statusText: response.statusText,
          };
        }

        const data = await response.json();
        return data;
      },
      true,
      timeout,
    );

    if (!apiResponse) {
      console.error(`Error scanning tokens: timeout of ${timeout}ms exceeded`);
      return null;
    }

    if (
      'error' in apiResponse &&
      'status' in apiResponse &&
      'statusText' in apiResponse
    ) {
      console.warn(
        `Token bulk screening API error: ${apiResponse.status} ${apiResponse.statusText}`,
      );
      return null;
    }

    return apiResponse as TokenScanApiResponse;
  };

  /**
   * Scan an address for security alerts.
   *
   * @param chainId - The chain ID in hex format (e.g., '0x1' for Ethereum).
   * @param address - The address to scan.
   * @returns The address scan result.
   */
  scanAddress = async (
    chainId: string,
    address: string,
  ): Promise<AddressScanResult> => {
    if (!address || !chainId) {
      return {
        result_type: AddressScanResultType.ErrorResult,
        label: '',
      };
    }

    const normalizedChainId = chainId.toLowerCase();
    const normalizedAddress = address.toLowerCase();
    const chain = resolveChainName(normalizedChainId);

    if (!chain) {
      return {
        result_type: AddressScanResultType.ErrorResult,
        label: '',
      };
    }

    const cacheKey = buildCacheKey(normalizedChainId, normalizedAddress);
    const cachedResult = this.#addressScanCache.get(cacheKey);
    if (cachedResult) {
      return {
        result_type: cachedResult.result_type,
        label: cachedResult.label,
      };
    }

    const apiResponse = await safelyExecuteWithTimeout(
      async () => {
        const res = await fetch(
          `${SECURITY_ALERTS_BASE_URL}${ADDRESS_SCAN_ENDPOINT}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chain,
              address: normalizedAddress,
            }),
          },
        );
        if (!res.ok) {
          return {
            error: `${res.status} ${res.statusText}`,
          };
        }
        const data: AddressScanResult = await res.json();
        return data;
      },
      true,
      5000,
    );

    if (!apiResponse) {
      return {
        result_type: AddressScanResultType.ErrorResult,
        label: '',
      };
    } else if ('error' in apiResponse) {
      return {
        result_type: AddressScanResultType.ErrorResult,
        label: '',
      };
    }

    const result: AddressScanCacheData = {
      result_type: apiResponse.result_type,
      label: apiResponse.label,
    };

    this.#addressScanCache.set(cacheKey, result);

    return {
      result_type: apiResponse.result_type,
      label: apiResponse.label,
    };
  };

  /**
   * Scan multiple tokens for malicious activity in bulk.
   *
   * @param request - The bulk scan request containing chainId and tokens.
   * @param request.chainId - The chain identifier. Accepts a hex chain ID for
   * EVM chains (e.g. `'0x1'` for Ethereum) or a chain name for non-EVM chains
   * (e.g. `'solana'`).
   * @param request.tokens - Array of token addresses to scan.
   * @returns A mapping of token addresses to their scan results. For EVM chains,
   * addresses are lowercased; for non-EVM chains, original casing is preserved.
   * Tokens that fail to scan are omitted.
   */
  bulkScanTokens = async (
    request: BulkTokenScanRequest,
  ): Promise<BulkTokenScanResponse> => {
    const { chainId, tokens } = request;

    if (!tokens || tokens.length === 0) {
      return {};
    }

    const MAX_TOKENS_PER_REQUEST = 100;
    if (tokens.length > MAX_TOKENS_PER_REQUEST) {
      console.warn(
        `Maximum of ${MAX_TOKENS_PER_REQUEST} tokens allowed per request`,
      );
      return {};
    }

    const normalizedChainId = chainId.toLowerCase();
    const chain = resolveChainName(normalizedChainId);

    if (!chain) {
      console.warn(`Unknown chain ID: ${chainId}`);
      return {};
    }

    // EVM addresses are case-insensitive; non-EVM addresses (e.g. Solana
    // base58) are case-sensitive and must not be lowercased.
    const caseSensitive = !normalizedChainId.startsWith('0x');

    // Split tokens into cached results and tokens that need to be fetched
    const { cachedResults, tokensToFetch } = splitCacheHits(
      this.#tokenScanCache,
      normalizedChainId,
      tokens,
      caseSensitive,
    );

    const results: BulkTokenScanResponse = { ...cachedResults };

    // If there are tokens to fetch, call the bulk token scan API
    if (tokensToFetch.length > 0) {
      const apiResponse = await this.#fetchTokenScanBulkResults(
        chain,
        tokensToFetch,
      );
      if (apiResponse?.results) {
        // Process API results and update cache
        for (const tokenAddress of tokensToFetch) {
          const normalizedAddress = caseSensitive
            ? tokenAddress
            : tokenAddress.toLowerCase();
          const tokenResult = apiResponse.results[normalizedAddress];

          if (tokenResult?.result_type) {
            const result = {
              result_type: tokenResult.result_type,
              chain: tokenResult.chain || normalizedChainId,
              address: tokenResult.address || normalizedAddress,
            };

            // Update cache
            const cacheKey = buildCacheKey(
              normalizedChainId,
              normalizedAddress,
              caseSensitive,
            );
            this.#tokenScanCache.set(cacheKey, {
              result_type: tokenResult.result_type,
            });

            results[normalizedAddress] = result;
          }
        }
      }
    }

    return results;
  };

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

    const metamaskListState: PhishingListState = {
      allowlist: stalelistResponse.data.allowlist,
      fuzzylist: stalelistResponse.data.fuzzylist,
      tolerance: stalelistResponse.data.tolerance,
      version: stalelistResponse.data.version,
      lastUpdated: stalelistResponse.data.lastUpdated,
      blocklist: stalelistResponse.data.blocklist,
      blocklistPaths: convertListToTrie(stalelistResponse.data.blocklistPaths),
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
