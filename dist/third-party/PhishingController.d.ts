import { BaseController, BaseConfig, BaseState } from '../BaseController';
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
    match?: string;
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
}
export declare const PHISHING_CONFIG_BASE_URL = "https://static.metafi.codefi.network/api/v1/lists";
export declare const METAMASK_CONFIG_FILE = "/eth_phishing_detect_config.json";
export declare const PHISHFORT_HOTLIST_FILE = "/phishfort_hotlist.json";
export declare const METAMASK_CONFIG_URL: string;
export declare const PHISHFORT_HOTLIST_URL: string;
/**
 * Controller that manages community-maintained lists of approved and unapproved website origins.
 */
export declare class PhishingController extends BaseController<PhishingConfig, PhishingState> {
    #private;
    private detector;
    private lastFetched;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a PhishingController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config?: Partial<PhishingConfig>, state?: Partial<PhishingState>);
    /**
     * Set the interval at which the phishing list will be refetched. Fetching will only occur on the next call to test/bypass. For immediate update to the phishing list, call updatePhishingLists directly.
     *
     * @param interval - the new interval, in ms.
     */
    setRefreshInterval(interval: number): void;
    /**
     * Determine if an update to the phishing configuration is needed.
     *
     * @returns Whether an update is needed
     */
    isOutOfDate(): boolean;
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
    test(origin: string): EthPhishingDetectResult;
    /**
     * Temporarily marks a given origin as approved.
     *
     * @param origin - The origin to mark as approved.
     */
    bypass(origin: string): void;
    /**
     * Update the phishing configuration.
     *
     * If an update is in progress, no additional update will be made. Instead this will wait until
     * the in-progress update has finished.
     */
    updatePhishingLists(): Promise<void>;
    private queryConfig;
}
export default PhishingController;
