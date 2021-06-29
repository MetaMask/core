import BaseController, { BaseConfig, BaseState } from '../BaseController';
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
export interface EthPhishingResponse {
    blacklist: string[];
    fuzzylist: string[];
    tolerance: number;
    version: number;
    whitelist: string[];
}
/**
 * @type PhishingConfig
 *
 * Phishing controller configuration
 *
 * @property interval - Polling interval used to fetch new block / approve lists
 */
export interface PhishingConfig extends BaseConfig {
    interval: number;
}
/**
 * @type PhishingState
 *
 * Phishing controller state
 *
 * @property phishing - eth-phishing-detect configuration
 * @property whitelist - array of temporarily-approved origins
 */
export interface PhishingState extends BaseState {
    phishing: EthPhishingResponse;
    whitelist: string[];
}
/**
 * Controller that passively polls on a set interval for approved and unapproved website origins
 */
export declare class PhishingController extends BaseController<PhishingConfig, PhishingState> {
    private configUrl;
    private detector;
    private handle?;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a PhishingController instance
     *
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor(config?: Partial<PhishingConfig>, state?: Partial<PhishingState>);
    /**
     * Starts a new polling interval
     *
     * @param interval - Polling interval used to fetch new approval lists
     */
    poll(interval?: number): Promise<void>;
    /**
     * Determines if a given origin is unapproved
     *
     * @param origin - Domain origin of a website
     * @returns - True if the origin is an unapproved origin
     */
    test(origin: string): boolean;
    /**
     * Temporarily marks a given origin as approved
     */
    bypass(origin: string): void;
    /**
     * Updates lists of approved and unapproved website origins
     *
     * @returns Promise resolving when this operation completes
     */
    updatePhishingLists(): Promise<void>;
    private queryConfig;
}
export default PhishingController;
