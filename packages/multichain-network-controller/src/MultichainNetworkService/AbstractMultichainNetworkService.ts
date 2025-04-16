import type { PublicInterface } from '@metamask/utils';

import type { MultichainNetworkService } from './MultichainNetworkService';

/**
 * A service object which is responsible for fetching network activity data.
 */
export type AbstractMultichainNetworkService =
  PublicInterface<MultichainNetworkService>;
