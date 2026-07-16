import {
  array,
  enums,
  number,
  optional,
  record,
  string,
  type,
} from '@metamask/superstruct';
import { StrictHexStruct } from '@metamask/utils';

/**
 * Superstruct schema for a single {@link BalanceSource}.
 */
export const BalanceSourceStruct = enums(['rpc', 'api'] as const);

/**
 * Superstruct schema for the balance-source orchestration config feature flag.
 *
 * Uses `type()` (loose validation) and optional fields so partial configs and
 * future additions do not break validation. Missing fields are filled from
 * {@link DEFAULT_BALANCE_SOURCE_CONFIG} by the service.
 */
export const BalanceSourceConfigStruct = type({
  enabledSources: optional(array(BalanceSourceStruct)),
  preferredSource: optional(BalanceSourceStruct),
  maxAttempts: optional(number()),
});

/**
 * Superstruct schema for the `balance` object returned by the Money Account
 * API positions endpoint. Values are raw uint256 strings in the smallest mUSD
 * unit (6 decimals), matching {@link MoneyAccountBalanceResponse}.
 */
export const MoneyApiBalanceStruct = type({
  /* eslint-disable @typescript-eslint/naming-convention */
  musd_balance: string(),
  total_balance: string(),
  vmusd_value_in_musd: string(),
  /* eslint-enable @typescript-eslint/naming-convention */
});

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
