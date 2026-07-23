import type { Messenger } from '@metamask/messenger';
import type {
  NormalizeSignatureRequestFn,
  ShieldControllerActions,
  ShieldControllerEvents,
  ShieldRemoteBackend,
} from '@metamask/shield-controller';
import type { SignatureStateChange } from '@metamask/signature-controller';
import type { TransactionControllerStateChangeEvent } from '@metamask/transaction-controller';

export type ShieldBackend = Pick<
  ShieldRemoteBackend,
  'checkCoverage' | 'checkSignatureCoverage' | 'logSignature' | 'logTransaction'
>;

type AuthenticationControllerGetBearerTokenAction = {
  type: 'AuthenticationController:getBearerToken';
  handler: (entropySourceId?: string) => Promise<string>;
};

export type ShieldControllerInitializationMessenger = Messenger<
  'ShieldController',
  ShieldControllerActions | AuthenticationControllerGetBearerTokenAction,
  | ShieldControllerEvents
  | SignatureStateChange
  | TransactionControllerStateChangeEvent
>;

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
