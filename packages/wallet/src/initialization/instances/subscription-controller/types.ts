import type {
  Env,
  ISubscriptionService,
} from '@metamask/subscription-controller';

export type SubscriptionControllerInstanceOptions = {
  /**
   * When set, used as-is; `env`, `fetchFunction`, `getAccessToken`, and
   * `captureException` are ignored for service construction.
   */
  subscriptionService?: ISubscriptionService;
  /** Required when building the default `SubscriptionService`. */
  env: Env;
  fetchFunction: typeof fetch;
  getAccessToken?: () => Promise<string>;
  captureException?: (error: Error) => void;
  pollingInterval?: number;
};
