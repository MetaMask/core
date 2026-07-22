import type { Env } from '@metamask/claims-controller';

export type ClaimsServiceInstanceOptions = {
  /**
   * Claims API environment. Supplied by the consumer per build flavor
   * (dev, uat, production).
   */
  env: Env;

  /**
   * Platform fetch implementation used for Claims API requests.
   */
  fetchFunction: typeof fetch;
};
