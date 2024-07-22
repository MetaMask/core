import type { Hotlist, ListKeys, PhishingListState } from './PhishingController';
import type { PhishingDetectorList, PhishingDetectorConfiguration } from './PhishingDetector';
/**
 * Fetches current epoch time in seconds.
 *
 * @returns the Date.now() time in seconds instead of miliseconds. backend files rely on timestamps in seconds since epoch.
 */
export declare const fetchTimeNow: () => number;
/**
 * Determines which diffs are applicable to the listState, then applies those diffs.
 *
 * @param listState - the stalelist or the existing liststate that diffs will be applied to.
 * @param hotlistDiffs - the diffs to apply to the listState if valid.
 * @param listKey - the key associated with the input/output phishing list state.
 * @returns the new list state
 */
export declare const applyDiffs: (listState: PhishingListState, hotlistDiffs: Hotlist, listKey: ListKeys) => PhishingListState;
/**
 * Validates the configuration object for the phishing detector.
 *
 * @param config - the configuration object to validate.
 * @throws an error if the configuration is invalid.
 */
export declare function validateConfig(config: unknown): asserts config is PhishingListState;
/**
 * Converts a domain string to a list of domain parts.
 *
 * @param domain - the domain string to convert.
 * @returns the list of domain parts.
 */
export declare const domainToParts: (domain: string) => string[];
/**
 * Converts a list of domain strings to a list of domain parts.
 *
 * @param list - the list of domain strings to convert.
 * @returns the list of domain parts.
 */
export declare const processDomainList: (list: string[]) => string[][];
/**
 * Gets the default phishing detector configuration.
 *
 * @param override - the optional override for the configuration.
 * @param override.allowlist - the optional allowlist to override.
 * @param override.blocklist - the optional blocklist to override.
 * @param override.fuzzylist - the optional fuzzylist to override.
 * @param override.tolerance - the optional tolerance to override.
 * @returns the default phishing detector configuration.
 */
export declare const getDefaultPhishingDetectorConfig: ({ allowlist, blocklist, fuzzylist, tolerance, }: {
    allowlist?: string[] | undefined;
    blocklist?: string[] | undefined;
    fuzzylist?: string[] | undefined;
    tolerance?: number | undefined;
}) => PhishingDetectorConfiguration;
/**
 * Processes the configurations for the phishing detector.
 *
 * @param configs - the configurations to process.
 * @returns the processed configurations.
 */
export declare const processConfigs: (configs?: PhishingDetectorList[]) => {
    name: string;
    version: string | number;
    allowlist: string[][];
    blocklist: string[][];
    fuzzylist: string[][];
    tolerance: number;
    lastUpdated: number;
}[];
/**
 * Converts a list of domain parts to a domain string.
 *
 * @param domainParts - the list of domain parts.
 * @returns the domain string.
 */
export declare const domainPartsToDomain: (domainParts: string[]) => string;
/**
 * Converts a list of domain parts to a fuzzy form.
 *
 * @param domainParts - the list of domain parts.
 * @returns the fuzzy form of the domain.
 */
export declare const domainPartsToFuzzyForm: (domainParts: string[]) => string;
/**
 * Matches the target parts, ignoring extra subdomains on source.
 *
 * @param source - the source domain parts.
 * @param list - the list of domain parts to match against.
 * @returns the parts for the first found matching entry.
 */
export declare const matchPartsAgainstList: (source: string[], list: string[][]) => string[] | undefined;
//# sourceMappingURL=utils.d.ts.map