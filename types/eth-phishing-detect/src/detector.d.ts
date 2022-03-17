declare module 'eth-phishing-detect/src/detector' {
  type Check =
    | { type: 'whitelist'; result: false }
    | { type: 'blacklist'; result: true }
    | { type: 'fuzzy'; result: true; match: string }
    | { type: 'all'; result: true };

  export default class PhishingDetector {
    constructor(opts: {
      whitelist?: string[];
      blacklist?: string[];
      fuzzylist?: string[];
      tolerance?: number;
    });

    check(domain: string): Check;
  }
}
