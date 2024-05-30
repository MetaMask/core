import { distance } from 'fastest-levenshtein';

import {
  domainPartsToDomain,
  domainPartsToFuzzyForm,
  domainToParts,
  getDefaultPhishingDetectorConfig,
  matchPartsAgainstList,
  processConfigs,
} from './utils';

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

export type FuzzyTolerance =
  | {
      tolerance?: number;
      fuzzylist: string[];
    }
  | {
      tolerance?: never;
      fuzzylist?: never;
    };

export type PhishingDetectorOptions =
  | LegacyPhishingDetectorList
  | PhishingDetectorList[];

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

export class PhishingDetector {
  #configs: PhishingDetectorConfiguration[];

  #legacyConfig: boolean;

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
  constructor(opts: PhishingDetectorOptions) {
    // recommended configuration
    if (Array.isArray(opts)) {
      this.#configs = processConfigs(opts);
      this.#legacyConfig = false;
      // legacy configuration
    } else {
      this.#configs = [
        getDefaultPhishingDetectorConfig({
          allowlist: opts.whitelist,
          blocklist: opts.blacklist,
          fuzzylist: opts.fuzzylist,
          tolerance: opts.tolerance,
        }),
      ];
      this.#legacyConfig = true;
    }
  }

  /**
   * Check if a domain is known to be malicious or similar to a common phishing
   * target.
   *
   * @param domain - The domain to check.
   * @returns The result of the check.
   */
  check(domain: string): PhishingDetectorResult {
    const result = this.#check(domain);

    if (this.#legacyConfig) {
      let legacyType = result.type;
      if (legacyType === 'allowlist') {
        legacyType = 'whitelist';
      } else if (legacyType === 'blocklist') {
        legacyType = 'blacklist';
      }
      return {
        match: result.match,
        result: result.result,
        type: legacyType,
      };
    }
    return result;
  }

  #check(domain: string): PhishingDetectorResult {
    const fqdn = domain.endsWith('.') ? domain.slice(0, -1) : domain;

    const source = domainToParts(fqdn);

    for (const { allowlist, name, version } of this.#configs) {
      // if source matches allowlist hostname (or subdomain thereof), PASS
      const allowlistMatch = matchPartsAgainstList(source, allowlist);
      if (allowlistMatch) {
        const match = domainPartsToDomain(allowlistMatch);
        return {
          match,
          name,
          result: false,
          type: 'allowlist',
          version: version === undefined ? version : String(version),
        };
      }
    }

    for (const { blocklist, fuzzylist, name, tolerance, version } of this
      .#configs) {
      // if source matches blocklist hostname (or subdomain thereof), FAIL
      const blocklistMatch = matchPartsAgainstList(source, blocklist);
      if (blocklistMatch) {
        const match = domainPartsToDomain(blocklistMatch);
        return {
          match,
          name,
          result: true,
          type: 'blocklist',
          version: version === undefined ? version : String(version),
        };
      }

      if (tolerance > 0) {
        // check if near-match of whitelist domain, FAIL
        let fuzzyForm = domainPartsToFuzzyForm(source);
        // strip www
        fuzzyForm = fuzzyForm.replace(/^www\./u, '');
        // check against fuzzylist
        const levenshteinMatched = fuzzylist.find((targetParts) => {
          const fuzzyTarget = domainPartsToFuzzyForm(targetParts);
          const dist = distance(fuzzyForm, fuzzyTarget);
          return dist <= tolerance;
        });
        if (levenshteinMatched) {
          const match = domainPartsToDomain(levenshteinMatched);
          return {
            name,
            match,
            result: true,
            type: 'fuzzy',
            version: version === undefined ? version : String(version),
          };
        }
      }
    }

    // matched nothing, PASS
    return { result: false, type: 'all' };
  }
}
