import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
export declare const PHISHING_CONFIG_BASE_URL = "https://phishing-detection.api.cx.metamask.io";
export declare const METAMASK_STALELIST_FILE = "/v1/stalelist";
export declare const METAMASK_HOTLIST_DIFF_FILE = "/v1/diffsSince";
export declare const HOTLIST_REFRESH_INTERVAL: number;
export declare const STALELIST_REFRESH_INTERVAL: number;
export declare const METAMASK_STALELIST_URL: string;
export declare const METAMASK_HOTLIST_DIFF_URL: string;
/**
 * @type ListTypes
 *
 * Type outlining the types of lists provided by aggregating different source lists
 */
export type ListTypes = 'fuzzylist' | 'blocklist' | 'allowlist';
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
 * @type PhishingStalelist
 *
 * type defining expected type of the stalelist.json file.
 * @property eth_phishing_detect_config - Stale list sourced from eth-phishing-detect's config.json.
 * @property phishfort_hotlist - Stale list sourced from phishfort's hotlist.json. Only includes blocklist. Deduplicated entries from eth_phishing_detect_config.
 * @property tolerance - Fuzzy match tolerance level
 * @property lastUpdated - Timestamp of last update.
 * @property version - Stalelist data structure iteration.
 */
export type PhishingStalelist = {
    eth_phishing_detect_config: Record<ListTypes, string[]>;
    phishfort_hotlist: Record<ListTypes, string[]>;
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
 * @property fuzzylist - List of fuzzy-matched unapproved origins
 * @property tolerance - Fuzzy match tolerance level
 * @property lastUpdated - Timestamp of last update.
 * @property version - Version of the phishing list state.
 * @property name - Name of the list. Used for attribution.
 */
export type PhishingListState = {
    allowlist: string[];
    blocklist: string[];
    fuzzylist: string[];
    tolerance: number;
    version: number;
    lastUpdated: number;
    name: ListNames;
};
/**
 * @type EthPhishingDetectResult
 *
 * type that describes the result of the `test` method.
 * @property name - Name of the config on which a match was found.
 * @property version - Version of the config on which a match was found.
 * @property result - Whether a domain was detected as a phishing domain. True means an unsafe domain.
 * @property match - The matching fuzzylist origin when a fuzzylist match is found. Returned as undefined for non-fuzzy true results.
 * @property type - The field of the config on which a match was found.
 */
export type EthPhishingDetectResult = {
    name?: string;
    version?: string;
    result: boolean;
    match?: string;
    type: 'all' | 'fuzzy' | 'blocklist' | 'allowlist';
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
export declare enum ListKeys {
    PhishfortHotlist = "phishfort_hotlist",
    EthPhishingDetectConfig = "eth_phishing_detect_config"
}
/**
 * Enum containing downstream client attribution names.
 */
export declare enum ListNames {
    MetaMask = "MetaMask",
    Phishfort = "Phishfort"
}
/**
 * Maps from list key sourced from upstream data
 * provider to downstream client attribution name.
 */
export declare const phishingListKeyNameMap: {
    eth_phishing_detect_config: ListNames;
    phishfort_hotlist: ListNames;
};
declare const controllerName = "PhishingController";
/**
 * @type PhishingControllerState
 *
 * Phishing controller state
 * @property phishing - eth-phishing-detect configuration
 * @property whitelist - array of temporarily-approved origins
 */
export type PhishingControllerState = {
    phishingLists: PhishingListState[];
    whitelist: string[];
    hotlistLastFetched: number;
    stalelistLastFetched: number;
};
/**
 * @type PhishingControllerOptions
 *
 * Phishing controller options
 * @property stalelistRefreshInterval - Polling interval used to fetch stale list.
 * @property hotlistRefreshInterval - Polling interval used to fetch hotlist diff list.
 */
export type PhishingControllerOptions = {
    stalelistRefreshInterval?: number;
    hotlistRefreshInterval?: number;
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
export type PhishingControllerActions = MaybeUpdateState | TestOrigin;
export type PhishingControllerMessenger = RestrictedControllerMessenger<typeof controllerName, PhishingControllerActions, never, never, never>;
/**
 * Controller that manages community-maintained lists of approved and unapproved website origins.
 */
export declare class PhishingController extends BaseController<typeof controllerName, PhishingControllerState, PhishingControllerMessenger> {
    #private;
    /**
     * Construct a Phishing Controller.
     *
     * @param config - Initial options used to configure this controller.
     * @param config.stalelistRefreshInterval - Polling interval used to fetch stale list.
     * @param config.hotlistRefreshInterval - Polling interval used to fetch hotlist diff list.
     * @param config.messenger - The controller restricted messenger.
     * @param config.state - Initial state to set on this controller.
     */
    constructor({ stalelistRefreshInterval, hotlistRefreshInterval, messenger, state, }: PhishingControllerOptions);
    /**
     * Updates this.detector with an instance of PhishingDetector using the current state.
     */
    updatePhishingDetector(): void;
    /**
     * Set the interval at which the stale phishing list will be refetched.
     * Fetching will only occur on the next call to test/bypass.
     * For immediate update to the phishing list, call {@link updateStalelist} directly.
     *
     * @param interval - the new interval, in ms.
     */
    setStalelistRefreshInterval(interval: number): void;
    /**
     * Set the interval at which the hot list will be refetched.
     * Fetching will only occur on the next call to test/bypass.
     * For immediate update to the phishing list, call {@link updateHotlist} directly.
     *
     * @param interval - the new interval, in ms.
     */
    setHotlistRefreshInterval(interval: number): void;
    /**
     * Determine if an update to the stalelist configuration is needed.
     *
     * @returns Whether an update is needed
     */
    isStalelistOutOfDate(): boolean;
    /**
     * Determine if an update to the hotlist configuration is needed.
     *
     * @returns Whether an update is needed
     */
    isHotlistOutOfDate(): boolean;
    /**
     * Conditionally update the phishing configuration.
     *
     * If the stalelist configuration is out of date, this function will call `updateStalelist`
     * to update the configuration. This will automatically grab the hotlist,
     * so it isn't necessary to continue on to download the hotlist.
     *
     */
    maybeUpdateState(): Promise<void>;
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
    test(origin: string): EthPhishingDetectResult;
    /**
     * Temporarily marks a given origin as approved.
     *
     * @param origin - The origin to mark as approved.
     */
    bypass(origin: string): void;
    /**
     * Update the hotlist.
     *
     * If an update is in progress, no additional update will be made. Instead this will wait until
     * the in-progress update has finished.
     */
    updateHotlist(): Promise<void>;
    /**
     * Update the stalelist.
     *
     * If an update is in progress, no additional update will be made. Instead this will wait until
     * the in-progress update has finished.
     */
    updateStalelist(): Promise<void>;
}
export default PhishingController;
//# sourceMappingURL=PhishingController.d.ts.map