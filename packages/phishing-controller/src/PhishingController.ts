import { toASCII } from 'punycode/';
import DEFAULT_PHISHING_RESPONSE from 'eth-phishing-detect/src/config.json';
import PhishingDetector from 'eth-phishing-detect/src/detector';
import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';

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
 * @type EthPhishingDetectConfig
 *
 * Interface defining expected input to PhishingDetector.
 * @property allowlist - List of approved origins (legacy naming "whitelist")
 * @property blocklist - List of unapproved origins (legacy naming "blacklist")
 * @property fuzzylist - List of fuzzy-matched unapproved origins
 * @property tolerance - Fuzzy match tolerance level
 */
export interface EthPhishingDetectConfig {
  allowlist: string[];
  blocklist: string[];
  fuzzylist: string[];
  tolerance: number;
  name: string;
  version: number;
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
 * @type PhishingConfig
 *
 * Phishing controller configuration
 * @property interval - Polling interval used to fetch new block / approve lists
 */
export interface PhishingConfig extends BaseConfig {
  refreshInterval: number;
}

/**
 * @type PhishingState
 *
 * Phishing controller state
 * @property phishing - eth-phishing-detect configuration
 * @property whitelist - array of temporarily-approved origins
 */
export interface PhishingState extends BaseState {
  phishing: EthPhishingDetectConfig[];
  whitelist: string[];
  lastFetched: number;
}

export const PHISHING_CONFIG_BASE_URL =
  'https://static.metafi.codefi.network/api/v1/lists';

export const METAMASK_CONFIG_FILE = '/eth_phishing_detect_config.json';

export const PHISHFORT_HOTLIST_FILE = '/phishfort_hotlist.json';

export const METAMASK_CONFIG_URL = `${PHISHING_CONFIG_BASE_URL}${METAMASK_CONFIG_FILE}`;
export const PHISHFORT_HOTLIST_URL = `${PHISHING_CONFIG_BASE_URL}${PHISHFORT_HOTLIST_FILE}`;

/**
 * Controller that manages community-maintained lists of approved and unapproved website origins.
 */
export class PhishingController extends BaseController<
  PhishingConfig,
  PhishingState
> {
  private detector: any;

  #inProgressUpdate: Promise<void> | undefined;

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
      refreshInterval: 60 * 60 * 1000,
    };

    this.defaultState = {
      phishing: [
        {
          allowlist: DEFAULT_PHISHING_RESPONSE.whitelist,
          blocklist: DEFAULT_PHISHING_RESPONSE.blacklist,
          fuzzylist: DEFAULT_PHISHING_RESPONSE.fuzzylist,
          tolerance: DEFAULT_PHISHING_RESPONSE.tolerance,
          name: `MetaMask`,
          version: DEFAULT_PHISHING_RESPONSE.version,
        },
      ],
      whitelist: [],
      lastFetched: 0,
    };

    this.initialize();
    this.detector = new PhishingDetector(this.state.phishing);
  }

  /**
   * Set the interval at which the phishing list will be refetched. Fetching will only occur on the next call to test/bypass. For immediate update to the phishing list, call updatePhishingLists directly.
   *
   * @param interval - the new interval, in ms.
   */
  setRefreshInterval(interval: number) {
    this.configure({ refreshInterval: interval }, false, false);
  }

  /**
   * Determine if an update to the phishing configuration is needed.
   *
   * @returns Whether an update is needed
   */
  isOutOfDate() {
    return Date.now() - this.state.lastFetched >= this.config.refreshInterval;
  }

  /**
   * Determines if a given origin is unapproved.
   *
   * It is strongly recommended that you call {@link isOutOfDate} before calling this,
   * to check whether the phishing configuration is up-to-date. It can be
   * updated by calling {@link updatePhishingLists}.
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
   * Update the phishing configuration.
   *
   * If an update is in progress, no additional update will be made. Instead this will wait until
   * the in-progress update has finished.
   */
  async updatePhishingLists() {
    if (this.#inProgressUpdate) {
      await this.#inProgressUpdate;
      return;
    }

    try {
      this.#inProgressUpdate = this.#updatePhishingLists();
      await this.#inProgressUpdate;
    } finally {
      this.#inProgressUpdate = undefined;
    }
  }

  /**
   * Conditionally update the phishing configuration.
   *
   * If the phishing configuration is out of date, this function will call `updatePhishingLists`
   * to update the configuration.
   */
  async maybeUpdatePhishingLists() {
    const phishingListsAreOutOfDate = this.isOutOfDate();
    if (phishingListsAreOutOfDate) {
      await this.updatePhishingLists();
    }
  }

  /**
   * Update the phishing configuration.
   *
   * This should only be called from the `updatePhishingLists` function, which is a wrapper around
   * this function that prevents redundant configuration updates.
   */
  async #updatePhishingLists() {
    if (this.disabled) {
      return;
    }

    const configs: EthPhishingDetectConfig[] = [];

    let metamaskConfigLegacy;
    let phishfortHotlist;
    try {
      [metamaskConfigLegacy, phishfortHotlist] = await Promise.all([
        this.queryConfig<EthPhishingResponse>(METAMASK_CONFIG_URL),
        this.queryConfig<string[]>(PHISHFORT_HOTLIST_URL),
      ]);
    } finally {
      // Set `lastFetched` even for failed requests to prevent server from being overwhelmed with
      // traffic after a network disruption.
      this.update({
        lastFetched: Date.now(),
      });
    }

    // Correctly shaping MetaMask config.
    const metamaskConfig: EthPhishingDetectConfig = {
      allowlist: metamaskConfigLegacy ? metamaskConfigLegacy.whitelist : [],
      blocklist: metamaskConfigLegacy ? metamaskConfigLegacy.blacklist : [],
      fuzzylist: metamaskConfigLegacy ? metamaskConfigLegacy.fuzzylist : [],
      tolerance: metamaskConfigLegacy ? metamaskConfigLegacy.tolerance : 0,
      name: `MetaMask`,
      version: metamaskConfigLegacy ? metamaskConfigLegacy.version : 0,
    };
    if (metamaskConfigLegacy) {
      configs.push(metamaskConfig);
    }

    // Create Set from metamaskConfig.blocklist to improve look up performance when used within filter.
    const mmConfigBlocklist = new Set(metamaskConfig.blocklist);

    // Correctly shaping PhishFort config.
    const phishfortConfig: EthPhishingDetectConfig = {
      allowlist: [],
      blocklist: (phishfortHotlist || []).filter(
        (i) => !mmConfigBlocklist.has(i),
      ), // Removal of duplicates.
      fuzzylist: [],
      tolerance: 0,
      name: `PhishFort`,
      version: 1,
    };
    if (phishfortHotlist) {
      configs.push(phishfortConfig);
    }

    // Do not update if all configs are unavailable.
    if (!configs.length) {
      return;
    }

    this.detector = new PhishingDetector(configs);
    this.update({
      phishing: configs,
    });
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
