import { array, number, record, string, type } from '@metamask/superstruct';

/**
 * Superstruct schema for {@link VaultApyResponse}.
 *
 * Uses `type()` (loose validation) so that unknown fields returned by the
 * Veda API do not cause validation failures.
 */
export const VaultApyResponseStruct = type({
  Response: type({
    aggregation_period: string(),
    apy: number(),
    chain_allocation: record(string(), number()),
    fees: number(),
    global_apy_breakdown: type({
      fee: number(),
      maturity_apy: number(),
      real_apy: number(),
    }),
    performance_fees: number(),
    real_apy_breakdown: array(
      type({
        allocation: number(),
        apy: number(),
        apy_net: number(),
        chain: string(),
        protocol: string(),
      }),
    ),
    timestamp: string(),
  }),
});
