export type LegacyPhishingDetectorList = {
    whitelist?: string[];
    blacklist?: string[];
} & FuzzyTolerance;
export type PhishingDetectorList = {
    allowlist?: string[];
    blocklist?: string[];
    name?: string;
    version?: string | number;
} & FuzzyTolerance;
export type FuzzyTolerance = {
    tolerance?: number;
    fuzzylist: string[];
} | {
    tolerance?: never;
    fuzzylist?: never;
};
export type PhishingDetectorOptions = LegacyPhishingDetectorList | PhishingDetectorList[];
export type PhishingDetectorConfiguration = {
    name?: string;
    version?: number | string;
    allowlist: string[][];
    blocklist: string[][];
    fuzzylist: string[][];
    tolerance: number;
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
    type: 'all' | 'fuzzy' | 'blocklist' | 'allowlist' | 'blacklist' | 'whitelist';
};
export declare class PhishingDetector {
    #private;
    /**
     * Construct a phishing detector, which can check whether origins are known
     * to be malicious or similar to common phishing targets.
     *
     * A list of configurations is accepted. Each origin checked is processed
     * using each configuration in sequence, so the order defines which
     * configurations take precedence.
     *
     * @param opts - Phishing detection options
     */
    constructor(opts: PhishingDetectorOptions);
    /**
     * Check if a url is known to be malicious or similar to a common phishing
     * target. This will check the hostname and IPFS CID that is sometimes
     * located in the path.
     *
     * @param url - The url to check.
     * @returns The result of the check.
     */
    check(url: string): PhishingDetectorResult;
}
//# sourceMappingURL=PhishingDetector.d.ts.map