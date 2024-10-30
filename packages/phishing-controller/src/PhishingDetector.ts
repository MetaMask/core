import { distance } from 'fastest-levenshtein';

import {
  PhishingDetectorResultType,
  type PhishingDetectorResult,
} from './types';
import {
  domainPartsToDomain,
  domainPartsToFuzzyForm,
  domainToParts,
  generateParentDomains,
  getDefaultPhishingDetectorConfig,
  getHostnameFromUrl,
  matchPartsAgainstList,
  processConfigs,
  sha256Hash,
} from './utils';

const DAPP_SCAN_API_BASE_URL = 'https://dapp-scanning.api.cx.metamask.io';
const DAPP_SCAN_ENDPOINT = '/scan';
const DAPP_SCAN_REQUEST_TIMEOUT = 5000; // 5 seconds in milliseconds

export type LegacyPhishingDetectorList = {
  whitelist?: string[];
  blacklist?: string[];
  c2DomainBlocklist?: string[];
} & FuzzyTolerance;

export type PhishingDetectorList = {
  allowlist?: string[];
  blocklist?: string[];
  c2DomainBlocklist?: string[];
  name?: string;
  version?: string | number;
  tolerance?: number;
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
  c2DomainBlocklist?: string[];
  fuzzylist: string[][];
  tolerance: number;
};

export type DappScanResponse = {
  domainName: string;
  recommendedAction: RecommendedAction;
  riskFactors: {
    type: string;
    severity: string;
    message: string;
  }[];
  verified: boolean;
  status: string;
};

/**
 * RecommendedAction represents the warning type based on the risk factors.
 */
type RecommendedAction = 'NONE' | 'WARN' | 'BLOCK';

/**
 * Enum-like object to provide named constants for RecommendedAction values.
 */
const RecommendedAction = {
  None: 'NONE' as RecommendedAction,
  Warn: 'WARN' as RecommendedAction,
  Block: 'BLOCK' as RecommendedAction,
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
          c2DomainBlocklist: opts.c2DomainBlocklist,
          fuzzylist: opts.fuzzylist,
          tolerance: opts.tolerance,
        }),
      ];
      this.#legacyConfig = true;
    }
  }

  /**
   * Check if a url is known to be malicious or similar to a common phishing
   * target. This will check the hostname and IPFS CID that is sometimes
   * located in the path.
   *
   * @param url - The url to check.
   * @returns The result of the check.
   */
  check(url: string): PhishingDetectorResult {
    const result = this.#check(url);

    if (this.#legacyConfig) {
      let legacyType = result.type;
      if (legacyType === PhishingDetectorResultType.Allowlist) {
        legacyType = PhishingDetectorResultType.Whitelist;
      } else if (legacyType === PhishingDetectorResultType.Blocklist) {
        legacyType = PhishingDetectorResultType.Blacklist;
      }
      return {
        match: result.match,
        result: result.result,
        type: legacyType,
      };
    }
    return result;
  }

  #check(url: string): PhishingDetectorResult {
    const ipfsCidMatch = url.match(ipfsCidRegex());

    // Check for IPFS CID related blocklist entries
    if (ipfsCidMatch !== null) {
      // there is a cID string somewhere
      // Determine if any of the entries are ipfs cids
      // Depending on the gateway, the CID is in the path OR a subdomain, so we do a regex match on it all
      const cID = ipfsCidMatch[0];
      for (const { blocklist, name, version } of this.#configs) {
        const blocklistMatch = blocklist
          .filter((entries) => entries.length === 1)
          .find((entries) => {
            return entries[0] === cID;
          });
        if (blocklistMatch) {
          return {
            name,
            match: cID,
            result: true,
            type: PhishingDetectorResultType.Blocklist,
            version: version === undefined ? version : String(version),
          };
        }
      }
    }

    let domain;
    try {
      domain = new URL(url).hostname;
    } catch (error) {
      return {
        result: false,
        type: PhishingDetectorResultType.All,
      };
    }

    const fqdn = this.#normalizeDomain(domain);
    const sourceParts = domainToParts(fqdn);

    const allowlistResult = this.#checkAllowlist(sourceParts);
    if (allowlistResult) {
      return allowlistResult;
    }

    for (const { blocklist, fuzzylist, name, tolerance, version } of this
      .#configs) {
      // if source matches blocklist hostname (or subdomain thereof), FAIL
      const blocklistMatch = matchPartsAgainstList(sourceParts, blocklist);
      if (blocklistMatch) {
        const match = domainPartsToDomain(blocklistMatch);
        return {
          match,
          name,
          result: true,
          type: PhishingDetectorResultType.Blocklist,
          version: version === undefined ? version : String(version),
        };
      }

      if (tolerance > 0) {
        // check if near-match of whitelist domain, FAIL
        let fuzzyForm = domainPartsToFuzzyForm(sourceParts);
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
            type: PhishingDetectorResultType.Fuzzy,
            version: version === undefined ? version : String(version),
          };
        }
      }
    }

    // matched nothing, PASS
    return { result: false, type: PhishingDetectorResultType.All };
  }

  /**
   * Checks if a URL is blocked against the hashed request blocklist.
   * This is done by hashing the URL's hostname and checking it against the hashed request blocklist.
   *
   *
   * @param urlString - The URL to check.
   * @returns An object indicating if the URL is blocked and relevant metadata.
   */
  isMaliciousC2Domain(urlString: string): PhishingDetectorResult {
    const hostname = getHostnameFromUrl(urlString);
    if (!hostname) {
      return {
        result: false,
        type: PhishingDetectorResultType.C2DomainBlocklist,
      };
    }

    const fqdn = this.#normalizeDomain(hostname);
    const sourceParts = domainToParts(fqdn);

    const allowlistResult = this.#checkAllowlist(sourceParts);
    if (allowlistResult) {
      return allowlistResult;
    }

    const hostnameHash = sha256Hash(hostname.toLowerCase());
    const domainsToCheck = generateParentDomains(sourceParts.reverse(), 5);

    for (const { c2DomainBlocklist, name, version } of this.#configs) {
      if (!c2DomainBlocklist || c2DomainBlocklist.length === 0) {
        continue;
      }

      if (c2DomainBlocklist.includes(hostnameHash)) {
        return {
          name,
          result: true,
          type: PhishingDetectorResultType.C2DomainBlocklist,
          version: version === undefined ? version : String(version),
        };
      }

      for (const domain of domainsToCheck) {
        const domainHash = sha256Hash(domain);
        if (c2DomainBlocklist.includes(domainHash)) {
          return {
            name,
            result: true,
            type: PhishingDetectorResultType.C2DomainBlocklist,
            version: version === undefined ? version : String(version),
          };
        }
      }
    }
    // did not match, PASS
    return {
      result: false,
      type: PhishingDetectorResultType.C2DomainBlocklist,
    };
  }

  /**
   * Scans a domain to determine if it is malicious by:
   * 1. Checking against the allowlist, and if found, returning a safe result.
   * 2. Fetching data from the dApp scan API to analyze risk.
   * 3. Checking if the API recommends blocking the domain based on its risk profile.
   *
   * @param punycodeOrigin - The punycode-encoded domain to scan.
   * @returns A PhishingDetectorResult indicating if the domain is safe or malicious.
   */
  async scanDomain(punycodeOrigin: string): Promise<PhishingDetectorResult> {
    const fqdn = this.#normalizeDomain(punycodeOrigin);

    const sourceParts = domainToParts(fqdn);
    const allowlistResult = this.#checkAllowlist(sourceParts);
    if (allowlistResult) {
      return allowlistResult;
    }

    const data = await this.#fetchDappScanResult(fqdn);

    if (data && data.recommendedAction === RecommendedAction.Block) {
      return {
        result: true,
        type: PhishingDetectorResultType.RealTimeDappScan,
        name: 'DappScan',
        version: '1',
        match: fqdn,
      };
    }

    // Otherwise, return a safe result
    return {
      result: false,
      type: PhishingDetectorResultType.RealTimeDappScan,
    };
  }

  /**
   * Fetches the raw dApp scan result data from the external API.
   *
   * @param fqdn - The fully qualified domain name to scan.
   * @returns The raw data from the dApp scan API or null if the request fails.
   */
  async #fetchDappScanResult(fqdn: string): Promise<DappScanResponse | null> {
    const apiUrl = `${DAPP_SCAN_API_BASE_URL}${DAPP_SCAN_ENDPOINT}?url=${fqdn}`;

    try {
      const response = await this.#fetchWithTimeout(
        apiUrl,
        DAPP_SCAN_REQUEST_TIMEOUT,
      );

      if (!response.ok) {
        console.error(
          `dApp Scan API error: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const data: DappScanResponse = await response.json();
      return data;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.error(`dApp Scan fetch error: ${error}`);
      return null;
    }
  }

  /**
   * Checks if the domain is in the allowlist.
   *
   * @param sourceParts - The parts of the domain.
   * @returns A PhishingDetectorResult if matched; otherwise, undefined.
   */
  #checkAllowlist(sourceParts: string[]): PhishingDetectorResult | undefined {
    for (const { allowlist, name, version } of this.#configs) {
      const allowlistMatch = matchPartsAgainstList(sourceParts, allowlist);
      if (allowlistMatch) {
        const match = domainPartsToDomain(allowlistMatch);
        return {
          match,
          name,
          result: false,
          type: PhishingDetectorResultType.Allowlist,
          version: version === undefined ? version : String(version),
        };
      }
    }
    return undefined;
  }

  /**
   * Normalizes the domain by removing any trailing dot.
   *
   * @param domain - The domain to normalize.
   * @returns The normalized domain.
   */
  #normalizeDomain(domain: string): string {
    return domain.endsWith('.') ? domain.slice(0, -1) : domain;
  }

  /**
   * Fetch with a timeout.
   *
   * @param url - The URL to fetch.
   * @param timeout - The timeout in milliseconds.
   * @returns A promise that resolves to the fetch Response.
   */
  async #fetchWithTimeout(url: string, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-cache',
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Runs a regex match to determine if a string is a IPFS CID
 * @returns Regex string for IPFS CID
 */
function ipfsCidRegex() {
  // regex from https://stackoverflow.com/a/67176726
  const reg =
    'Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[A-Za-z2-7]{58,}|B[A-Z2-7]{58,}|z[1-9A-HJ-NP-Za-km-z]{48,}|F[0-9A-F]{50,}';
  return new RegExp(reg, 'u');
}
