import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import type { RampsEnvironment } from '@metamask/ramps-controller';

/**
 * Per-instance options for the wallet's `RampsService`.
 */
export type RampsServiceInstanceOptions = {
  environment?: RampsEnvironment;
  context: string;
  fetch: typeof fetch;
  policyOptions?: CreateServicePolicyOptions;
  baseUrlOverride?: string;
};
