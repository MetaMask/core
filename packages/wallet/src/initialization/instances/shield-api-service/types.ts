import type { ShieldApiService } from '@metamask/shield-controller';

type ShieldApiServiceOptions = ConstructorParameters<
  typeof ShieldApiService
>[0];

type ShieldApiServiceCommonOptions = Pick<
  ShieldApiServiceOptions,
  | 'baseUrl'
  | 'captureException'
  | 'getCoverageResultTimeout'
  | 'getCoverageResultPollInterval'
  | 'queryClientConfig'
  | 'policyOptions'
>;

/**
 * Per-instance options for the wallet's `ShieldApiService`.
 */
export type ShieldApiServiceInstanceOptions = ShieldApiServiceCommonOptions & {
  fetchFunction?: ShieldApiServiceOptions['fetch'];
};
