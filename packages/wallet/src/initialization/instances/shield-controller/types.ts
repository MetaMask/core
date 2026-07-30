import type {
  NormalizeSignatureRequestFn,
  ShieldBackend,
} from '@metamask/shield-controller';

export type ShieldControllerInstanceOptions = {
  /**
   * When set, used as-is; `baseUrl`, `fetchFunction`, `getAccessToken`, and
   * `captureException` are ignored for backend construction.
   */
  backend?: ShieldBackend;
  /** Required when building the default `ShieldRemoteBackend`. */
  baseUrl: string;
  fetchFunction: typeof fetch;
  getAccessToken?: () => Promise<string>;
  captureException?: (error: Error) => void;
  getCoverageResultTimeout?: number;
  getCoverageResultPollInterval?: number;
  transactionHistoryLimit?: number;
  coverageHistoryLimit?: number;
  normalizeSignatureRequest?: NormalizeSignatureRequestFn;
};
