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
 */
export type MoneyAccountBalanceServiceGetMusdBalanceAction = {
  type: `MoneyAccountBalanceService:getMusdBalance`;
  handler: MoneyAccountBalanceService['getMusdBalance'];
};

/**
 * Fetches the musdSHFvd (Veda vault share) ERC-20 balance for the given
 * account address via RPC.
 *
 * @param accountAddress - The Money account's Ethereum address.
 * @returns The musdSHFvd balance as a raw uint256 string.
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
 * @param options.staleTime - The stale time for the query. Defaults to 30 seconds.
 * @returns The exchange rate as a raw uint256 string.
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
 */
export type MoneyAccountBalanceServiceGetMusdEquivalentValueAction = {
  type: `MoneyAccountBalanceService:getMusdEquivalentValue`;
  handler: MoneyAccountBalanceService['getMusdEquivalentValue'];
};

/**
 * Fetches the vault's APY and fee breakdown from the Veda performance REST API.
 *
 * @returns The normalized vault APY response.
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
  | MoneyAccountBalanceServiceGetMusdSHFvdBalanceAction
  | MoneyAccountBalanceServiceGetExchangeRateAction
  | MoneyAccountBalanceServiceGetMusdEquivalentValueAction
  | MoneyAccountBalanceServiceGetVaultApyAction;
