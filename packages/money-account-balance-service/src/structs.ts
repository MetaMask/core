import {
  array,
  number,
  optional,
  record,
  string,
  type,
} from '@metamask/superstruct';

/**
 * Superstruct schema for {@link NormalizedVaultApyResponse}.
 *
 * Uses `type()` (loose validation) so that unknown fields returned by the
 * Veda API do not cause validation failures.
 *
 * Only `apy` and `timestamp` are required — all other fields are optional
 * because the Veda API omits some fields when the vault has no activity.
 */
export const VaultApyRawResponseStruct = type({
  Response: type({
    aggregation_period: optional(string()),
    apy: number(),
    chain_allocation: optional(record(string(), number())),
    fees: optional(number()),
    global_apy_breakdown: optional(
      type({
        fee: optional(number()),
        maturity_apy: optional(number()),
        real_apy: optional(number()),
      }),
    ),
    performance_fees: optional(number()),
    real_apy_breakdown: optional(
      array(
        type({
          allocation: optional(number()),
          apy: optional(number()),
          apy_net: optional(number()),
          chain: optional(string()),
          protocol: optional(string()),
        }),
      ),
    ),
    timestamp: string(),
  }),
});
