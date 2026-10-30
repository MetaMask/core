import type { ClientConfigApiService } from '@metamask/remote-feature-flag-controller';

type ClientConfigApiServiceOptions = ConstructorParameters<
  typeof ClientConfigApiService
>[0];

/**
 * Per-instance options for the wallet's `ClientConfigApiService`. `fetch` and
 * `config` are required: each client supplies its own client type,
 * distribution, and environment, so there is no platform-agnostic default.
 */
export type ClientConfigApiServiceInstanceOptions = {
  fetch: ClientConfigApiServiceOptions['fetch'];
  config: ClientConfigApiServiceOptions['config'];
  policyOptions?: ClientConfigApiServiceOptions['policyOptions'];
};
