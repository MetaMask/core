import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import type { TransakEnvironment } from '@metamask/ramps-controller';

/**
 * Per-instance options for the wallet's `TransakService`.
 */
export type TransakServiceInstanceOptions = {
  environment?: TransakEnvironment;
  context: string;
  fetch: typeof fetch;
  apiKey?: string;
  policyOptions?: CreateServicePolicyOptions;
  orderRetryDelayMs?: number;
};
