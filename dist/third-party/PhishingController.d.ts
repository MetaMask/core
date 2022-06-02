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
    interval: number;
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
/**
 * Controller that passively polls on a set interval for approved and unapproved website origins
 */
export declare class PhishingController extends BaseController<PhishingConfig, PhishingState> {
    private configUrlMetaMask;
    private configUrlPhishFortHotlist;
    private detector;
    private handle?;
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
     * Starts a new polling interval.
     *
     * @param interval - Polling interval used to fetch new approval lists.
     */
    poll(interval?: number): Promise<void>;
    /**
     * Determines if a given origin is unapproved.
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
     * Updates lists of approved and unapproved website origins.
     */
    updatePhishingLists(): Promise<void>;
    private queryConfig;
}
export default PhishingController;
