/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountBalanceService } from './money-account-balance-service';

/**
 * Fetches the mUSD ERC-20 balance for the given account address via RPC.
 *
 * @param accountAddress - The Money account's Ethereum address.
 * @returns The mUSD balance as a raw uint256 string.
 * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
 */
export type MoneyAccountBalanceServiceGetMusdBalanceAction = {
  type: `MoneyAccountBalanceService:getMusdBalance`;
  handler: MoneyAccountBalanceService['getMusdBalance'];
};

/**
 * Fetches the account's total Money balance inputs in a single batched RPC
 * request via Multicall3's `aggregate3`, reading both values atomically at
 * the same block:
 * - the mUSD wallet balance (`mUSD.balanceOf`), and
 * - the vault shares valued in mUSD (`Lens.balanceOfInAssets`).
 *
 * Both values are denominated in mUSD's decimals, so consumers can sum them
 * directly to obtain the total balance. Sub-calls use `allowFailure: false`,
 * so if either read reverts the whole query rejects rather than reporting a
 * partial (and misleading) balance.
 *
 * @param accountAddress - The Money account's Ethereum address.
 * @returns The mUSD balance and the mUSD-equivalent value of vault shares as
 * raw uint256 strings.
 * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
 */
export type MoneyAccountBalanceServiceGetMoneyAccountBalanceAction = {
  type: `MoneyAccountBalanceService:getMoneyAccountBalance`;
  handler: MoneyAccountBalanceService['getMoneyAccountBalance'];
};

/**
 * Fetches the musdSHFvd (Veda vault share) ERC-20 balance for the given
 * account address via RPC.
 *
 * @param accountAddress - The Money account's Ethereum address.
 * @returns The musdSHFvd balance as a raw uint256 string.
 * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
 */
export type MoneyAccountBalanceServiceGetMusdSHFvdBalanceAction = {
  type: `MoneyAccountBalanceService:getMusdSHFvdBalance`;
  handler: MoneyAccountBalanceService['getMusdSHFvdBalance'];
};

/**
 * Fetches the current exchange rate from the Veda Accountant contract via
 * RPC. The rate represents the conversion factor from musdSHFvd shares to
 * the underlying mUSD asset.
 *
 * @param options - The options for the query.
 * @param options.staleTime - The stale time for the query. Defaults to the
 * remotely-configurable balance stale time (see
 * {@link MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY}).
 * @returns The exchange rate as a raw uint256 string.
 * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
 */
export type MoneyAccountBalanceServiceGetExchangeRateAction = {
  type: `MoneyAccountBalanceService:getExchangeRate`;
  handler: MoneyAccountBalanceService['getExchangeRate'];
};

/**
 * Computes the mUSD-equivalent value of the account's musdSHFvd holdings.
 * Internally fetches the musdSHFvd balance and exchange rate (using cached
 * values when available within their staleTime windows), then multiplies
 * them.
 *
 * @param accountAddress - The Money account's Ethereum address.
 * @returns The musdSHFvd balance, exchange rate, and computed
 * mUSD-equivalent value as raw uint256 strings.
 * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
 */
export type MoneyAccountBalanceServiceGetMusdEquivalentValueAction = {
  type: `MoneyAccountBalanceService:getMusdEquivalentValue`;
  handler: MoneyAccountBalanceService['getMusdEquivalentValue'];
};

/**
 * Fetches the vault's APY and fee breakdown from the Veda performance REST API.
 *
 * @returns The normalized vault APY response.
 * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
 */
export type MoneyAccountBalanceServiceGetVaultApyAction = {
  type: `MoneyAccountBalanceService:getVaultApy`;
  handler: MoneyAccountBalanceService['getVaultApy'];
};

/**
 * Union of all MoneyAccountBalanceService action types.
 */
export type MoneyAccountBalanceServiceMethodActions =
  | MoneyAccountBalanceServiceGetMusdBalanceAction
  | MoneyAccountBalanceServiceGetMoneyAccountBalanceAction
  | MoneyAccountBalanceServiceGetMusdSHFvdBalanceAction
  | MoneyAccountBalanceServiceGetExchangeRateAction
  | MoneyAccountBalanceServiceGetMusdEquivalentValueAction
  | MoneyAccountBalanceServiceGetVaultApyAction;
