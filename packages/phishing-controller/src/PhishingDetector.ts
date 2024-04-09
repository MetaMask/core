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
  whitelist: string[];
  blacklist: string[];
  fuzzylist: string[];
  tolerance: number;
};

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

export type PhishingDetectorResult = {
  name?: string;
  version?: string;
  result: boolean;
  match?: string;
  type: 'all' | 'fuzzy' | 'blocklist' | 'allowlist' | 'blacklist' | 'whitelist';
};

export class PhishingDetector {
  configs: PhishingDetectorConfiguration[];

  legacyConfig: boolean;

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
      this.configs = processConfigs(opts);
      this.legacyConfig = false;
      // legacy configuration
    } else {
      this.configs = [
        getDefaultPhishingDetectorConfig({
          allowlist: opts.whitelist,
          blocklist: opts.blacklist,
          fuzzylist: opts.fuzzylist,
          tolerance: opts.tolerance,
        }),
      ];
      this.legacyConfig = true;
    }
  }

  check(domain: string): PhishingDetectorResult {
    const result = this.#check(domain);

    if (this.legacyConfig) {
      let legacyType = result.type as PhishingDetectorResult['type'];
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

    for (const { allowlist, name, version } of this.configs) {
      // if source matches allowlist hostname (or subdomain thereof), PASS
      const allowlistMatch = matchPartsAgainstList(source, allowlist);
      if (allowlistMatch) {
        const match = domainPartsToDomain(allowlistMatch);
        return {
          match,
          name,
          result: false,
          type: 'allowlist',
          version: String(version),
        };
      }
    }

    for (const { blocklist, fuzzylist, name, tolerance, version } of this
      .configs) {
      // if source matches blocklist hostname (or subdomain thereof), FAIL
      const blocklistMatch = matchPartsAgainstList(source, blocklist);
      if (blocklistMatch) {
        const match = domainPartsToDomain(blocklistMatch);
        return {
          match,
          name,
          result: true,
          type: 'blocklist',
          version: String(version),
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
            version: String(version),
          };
        }
      }
    }

    // matched nothing, PASS
    return { result: false, type: 'all' };
  }
}
