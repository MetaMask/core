declare module 'eth-phishing-detect/src/config.json' {
  export type EthPhishingDetectorConfiguration = {
    version: number;
    tolerance: number;
    fuzzylist: string[];
    whitelist: string[];
    blacklist: string[];
  };

  const config: EthPhishingDetectorConfiguration;

  export default config;
}
