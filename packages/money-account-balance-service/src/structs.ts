import {
  array,
  number,
  optional,
  record,
  string,
  type,
} from '@metamask/superstruct';
import { StrictHexStruct } from '@metamask/utils';

/**
 * Superstruct schema for {@link VaultConfig}.
 *
 * Uses `type()` (loose validation) so that extra keys added to the feature
 * flag in future do not break existing clients.
 */
export const VaultConfigStruct = type({
  accountantAddress: StrictHexStruct,
  boringVault: StrictHexStruct,
  lensAddress: StrictHexStruct,
  tellerAddress: StrictHexStruct,
  chainId: StrictHexStruct,
  // Optional so flags deployed before this field existed still validate. When
  // present it lets the service skip the on-chain `Accountant.base()` read.
  underlyingToken: optional(StrictHexStruct),
});

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
