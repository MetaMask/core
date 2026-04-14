import { Infer } from '@metamask/superstruct';

import type { NormalizedVaultApyResponse } from './response.types';
import { VaultApyRawResponseStruct } from './structs';

/**
 * Normalizes the raw response from the Veda performance API into the expected
 * format.
 *
 * @param rawResponse - The raw response from the Veda performance API.
 * @returns The normalized response.
 */
export function normalizeVaultApyResponse(
  rawResponse: Infer<typeof VaultApyRawResponseStruct>,
): NormalizedVaultApyResponse {
  const { Response: response } = rawResponse;

  return {
    aggregationPeriod: response.aggregation_period,
    apy: response.apy,
    chainAllocation: response.chain_allocation,
    fees: response.fees,
    globalApyBreakdown: response.global_apy_breakdown
      ? {
          fee: response.global_apy_breakdown.fee,
          maturityApy: response.global_apy_breakdown.maturity_apy,
          realApy: response.global_apy_breakdown.real_apy,
        }
      : undefined,
    performanceFees: response.performance_fees,
    realApyBreakdown: response.real_apy_breakdown?.map((item) => ({
      allocation: item.allocation,
      apy: item.apy,
      apyNet: item.apy_net,
      chain: item.chain,
      protocol: item.protocol,
    })),
    timestamp: response.timestamp,
  };
}
