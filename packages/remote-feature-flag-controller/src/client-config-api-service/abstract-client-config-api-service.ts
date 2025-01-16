import type { PublicInterface } from '@metamask/utils';

import type { ClientConfigApiService } from './client-config-api-service';

/**
 * A service object responsible for fetching feature flags.
 */
export type AbstractClientConfigApiService =
  PublicInterface<ClientConfigApiService>;
