import { toASCII } from 'punycode/';
import DEFAULT_PHISHING_RESPONSE from 'eth-phishing-detect/src/config.json';
import PhishingDetector from 'eth-phishing-detect/src/detector';
import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';
import { applyDiffs, fetchTimeNow } from './utils';

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
export interface EthPhishingResponse {
  blacklist: string[];
  fuzzylist: string[];
  tolerance: number;
  version: number;
  whitelist: string[];
}

/**
 * @type PhishingStalelist
 *
 * Interface defining expected type of the stalelist.json file.
 * @property allowlist - List of approved origins (legacy naming "whitelist")
 * @property blocklist - List of unapproved origins (legacy naming "blacklist")
 * @property fuzzylist - List of fuzzy-matched unapproved origins
 * @property tolerance - Fuzzy match tolerance level
 * @property lastUpdated - Timestamp of last update.
 * @property version - Stalelist data structure iteration.
 */
export interface PhishingStalelist {
  allowlist: string[];
  blocklist: string[];
  fuzzylist: string[];
  tolerance: number;
  version: number;
  lastUpdated: number;
}

/**
 * @type PhishingListState
 *
 * Interface defining the persisted list state. This is the persisted state that is updated frequently with `this.maybeUpdateState()`.
 * @property allowlist - List of approved origins (legacy naming "whitelist")
 * @property blocklist - List of unapproved origins (legacy naming "blacklist")
 * @property fuzzylist - List of fuzzy-matched unapproved origins
 * @property tolerance - Fuzzy match tolerance level
 * @property lastUpdated - Timestamp of last update.
 * @property version - Version of the phishing list state.
 */
export interface PhishingListState {
  allowlist: string[];
  blocklist: string[];
  fuzzylist: string[];
  tolerance: number;
  version: number;
  lastUpdated: number;
  name: string;
}

/**
 * @type EthPhishingDetectResult
 *
 * Interface that describes the result of the `test` method.
 * @property name - Name of the config on which a match was found.
 * @property version - Version of the config on which a match was found.
 * @property result - Whether a domain was detected as a phishing domain. True means an unsafe domain.
 * @property match - The matching fuzzylist origin when a fuzzylist match is found. Returned as undefined for non-fuzzy true results.
 * @property type - The field of the config on which a match was found.
 */
export interface EthPhishingDetectResult {
  name?: string;
  version?: string;
  result: boolean;
  match?: string; // Returned as undefined for non-fuzzy true results.
  type: 'all' | 'fuzzy' | 'blocklist' | 'allowlist';
}

/**
 * @type HotlistDiff
 *
 * Interface defining the expected type of the diffs in hotlist.json file.
 * @property url - Url of the diff entry.
 * @property timestamp - Timestamp at which the diff was identified.
 * @property targetList - The list name where the diff was identified.
 * @property isRemoval - Was the diff identified a removal type.
 */
export interface HotlistDiff {
  url: string;
  timestamp: number;
  targetList: 'fuzzylist' | 'blocklist' | 'allowlist';
  isRemoval?: boolean;
}

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
 * @type PhishingConfig
 *
 * Phishing controller configuration
 * @property stalelistRefreshInterval - Polling interval used to fetch stale list.
 * @property hotlistRefreshInterval - Polling interval used to fetch hotlist diff list.
 */
export interface PhishingConfig extends BaseConfig {
  stalelistRefreshInterval: number;
  hotlistRefreshInterval: number;
}

/**
 * @type PhishingState
 *
 * Phishing controller state
 * @property phishing - eth-phishing-detect configuration
 * @property whitelist - array of temporarily-approved origins
 */
export interface PhishingState extends BaseState {
  listState: PhishingListState;
  whitelist: string[];
  hotlistLastFetched: number;
  stalelistLastFetched: number;
}

export const PHISHING_CONFIG_BASE_URL =
  'https://static.metafi.codefi.network/api/v1/lists';

export const METAMASK_STALELIST_FILE = '/stalelist.json';

export const METAMASK_HOTLIST_DIFF_FILE = '/hotlist.json';

export const HOTLIST_REFRESH_INTERVAL = 30 * 60; // 30 mins in seconds
export const STALELIST_REFRESH_INTERVAL = 4 * 24 * 60 * 60; // 4 days in seconds

export const METAMASK_STALELIST_URL = `${PHISHING_CONFIG_BASE_URL}${METAMASK_STALELIST_FILE}`;
export const METAMASK_HOTLIST_DIFF_URL = `${PHISHING_CONFIG_BASE_URL}${METAMASK_HOTLIST_DIFF_FILE}`;

/**
 * Controller that manages community-maintained lists of approved and unapproved website origins.
 */
export class PhishingController extends BaseController<
  PhishingConfig,
  PhishingState
> {
  private detector: any;

  #inProgressHotlistUpdate: Promise<void> | undefined;

  #inProgressStalelistUpdate: Promise<void> | undefined;

  /**
   * Name of this controller used during composition
   */
  override name = 'PhishingController';

  /**
   * Creates a PhishingController instance.
   *
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    config?: Partial<PhishingConfig>,
    state?: Partial<PhishingState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      stalelistRefreshInterval: STALELIST_REFRESH_INTERVAL,
      hotlistRefreshInterval: HOTLIST_REFRESH_INTERVAL,
    };

    this.defaultState = {
      listState: {
        allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
        blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
        fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
        tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
        version: DEFAULT_PHISHING_RESPONSE.version,
        name: 'MetaMask',
        lastUpdated: 0,
      },
      whitelist: [],
      hotlistLastFetched: 0,
      stalelistLastFetched: 0,
    };

    this.initialize();
    this.updatePhishingDetector();
  }

  /**
   * Updates this.detector with an instance of PhishingDetector using the current state.
   */
  updatePhishingDetector() {
    this.detector = new PhishingDetector([
      {
        allowlist: this.state.listState.allowlist,
        blocklist: this.state.listState.blocklist,
        fuzzylist: this.state.listState.fuzzylist,
        tolerance: this.state.listState.tolerance,
        name: `MetaMask`,
        version: this.state.listState.version,
      },
    ]);
  }

  /**
   * Set the interval at which the stale phishing list will be refetched.
   * Fetching will only occur on the next call to test/bypass.
   * For immediate update to the phishing list, call {@link updateStalelist} directly.
   *
   * @param interval - the new interval, in ms.
   */
  setStalelistRefreshInterval(interval: number) {
    this.configure({ stalelistRefreshInterval: interval }, false, false);
  }

  /**
   * Set the interval at which the hot list will be refetched.
   * Fetching will only occur on the next call to test/bypass.
   * For immediate update to the phishing list, call {@link updateHotlist} directly.
   *
   * @param interval - the new interval, in ms.
   */
  setHotlistRefreshInterval(interval: number) {
    this.configure({ hotlistRefreshInterval: interval }, false, false);
  }

  /**
   * Determine if an update to the stalelist configuration is needed.
   *
   * @returns Whether an update is needed
   */
  isStalelistOutOfDate() {
    return (
      fetchTimeNow() - this.state.stalelistLastFetched >=
      this.config.stalelistRefreshInterval
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
      this.config.hotlistRefreshInterval
    );
  }

  /**
   * Conditionally update the phishing configuration.
   *
   * If the stalelist configuration is out of date, this function will call `updateStalelist`
   * to update the configuration. This will automatically grab the hotlist,
   * so it isn't necessary to continue on to download the hotlist.
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
  test(origin: string): EthPhishingDetectResult {
    const punycodeOrigin = toASCII(origin);
    if (this.state.whitelist.indexOf(punycodeOrigin) !== -1) {
      return { result: false, type: 'all' }; // Same as whitelisted match returned by detector.check(...).
    }
    return this.detector.check(punycodeOrigin);
  }

  /**
   * Temporarily marks a given origin as approved.
   *
   * @param origin - The origin to mark as approved.
   */
  bypass(origin: string) {
    const punycodeOrigin = toASCII(origin);
    const { whitelist } = this.state;
    if (whitelist.indexOf(punycodeOrigin) !== -1) {
      return;
    }
    this.update({ whitelist: [...whitelist, punycodeOrigin] });
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
   * Update the stalelist configuration.
   *
   * This should only be called from the `updateStalelist` function, which is a wrapper around
   * this function that prevents redundant configuration updates.
   */
  async #updateStalelist() {
    if (this.disabled) {
      return;
    }

    let stalelist;
    let hotlistDiffs;
    try {
      [stalelist, hotlistDiffs] = await Promise.all([
        this.queryConfig<PhishingStalelist>(METAMASK_STALELIST_URL),
        this.queryConfig<Hotlist>(METAMASK_HOTLIST_DIFF_URL),
      ]);
    } finally {
      // Set `stalelistLastFetched` and `hotlistLastFetched` even for failed requests to prevent server
      // from being overwhelmed with traffic after a network disruption.
      const timeNow = fetchTimeNow();
      this.update({
        stalelistLastFetched: timeNow,
        hotlistLastFetched: timeNow,
      });
    }

    if (!stalelist || !hotlistDiffs) {
      return;
    }
    // Correctly shaping eth-phishing-detect state by applying hotlist diffs to the stalelist.
    const newListState: PhishingListState = applyDiffs(stalelist, hotlistDiffs);

    this.update({
      listState: newListState,
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
    if (this.disabled) {
      return;
    }

    let hotlistDiffs;
    try {
      hotlistDiffs = await this.queryConfig<Hotlist>(METAMASK_HOTLIST_DIFF_URL);
    } finally {
      // Set `stalelistLastFetched` even for failed requests to prevent server from being overwhelmed with
      // traffic after a network disruption.
      this.update({
        hotlistLastFetched: fetchTimeNow(),
      });
    }

    if (!hotlistDiffs) {
      return;
    }
    // Correctly shaping MetaMask config.
    const newListState: PhishingListState = applyDiffs(
      this.state.listState,
      hotlistDiffs,
    );

    this.update({
      listState: newListState,
    });
    this.updatePhishingDetector();
  }

  private async queryConfig<ResponseType>(
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
