import { Infer } from '@metamask/superstruct';

import { VaultApyResponseStruct } from './structs';
import { VaultApyResponse } from './response.types';

/**
 * Normalizes the raw response from the Veda performance API into the expected
 * format.
 *
 * @param rawResponse - The raw response from the Veda performance API.
 * @returns The normalized response.
 */
export function normalizeVaultApyResponse(
  rawResponse: Infer<typeof VaultApyResponseStruct>,
): VaultApyResponse {
  const { Response: response } = rawResponse;

  return {
    aggregationPeriod: response.aggregation_period,
    apy: response.apy,
    chainAllocation: response.chain_allocation,
    fees: response.fees,
    globalApyBreakdown: {
      fee: response.global_apy_breakdown.fee,
      maturityApy: response.global_apy_breakdown.maturity_apy,
      realApy: response.global_apy_breakdown.real_apy,
    },
    performanceFees: response.performance_fees,
    realApyBreakdown: response.real_apy_breakdown.map((item) => ({
      allocation: item.allocation,
      apy: item.apy,
      apyNet: item.apy_net,
      chain: item.chain,
      protocol: item.protocol,
    })),
    timestamp: response.timestamp,
  };
}
