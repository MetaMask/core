import type { Env, ClaimsService } from '@metamask/claims-controller';

type ClaimsServiceOptions = ConstructorParameters<typeof ClaimsService>[0];

type ClaimsServiceCommonOptions = Pick<
  ClaimsServiceOptions,
  'captureException' | 'queryClientConfig' | 'policyOptions'
>;

/**
 * Per-instance options for the wallet's `ClaimsService`.
 */
export type ClaimsServiceInstanceOptions = ClaimsServiceCommonOptions & {
  fetchFunction: ClaimsServiceOptions['fetchFunction'];
  env?: Env;
};
