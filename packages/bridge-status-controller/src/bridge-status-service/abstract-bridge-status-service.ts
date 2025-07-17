import type { ServicePolicy } from '@metamask/controller-utils';

import type { StatusResponse, StatusRequestWithSrcTxHash } from '../types';

/**
 * A service object responsible for fetching bridge transaction status.
 */
export type AbstractBridgeStatusService = Partial<
  Pick<ServicePolicy, 'onBreak' | 'onDegraded'>
> & {
  /**
   * Fetches the status of a bridge transaction from the API.
   * Provides structured error handling, including retries and circuit breaking.
   *
   * @param statusRequest - The status request parameters including transaction hash and bridge details.
   * @returns The bridge transaction status response.
   */
  fetchBridgeStatus(
    statusRequest: StatusRequestWithSrcTxHash,
  ): Promise<StatusResponse>;
};
