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
 * Fetches the account's total Money balance, orchestrating across the
 * configured balance sources (RPC / Money API) with fallback.
 *
 * @param accountAddress - The Money account's Ethereum address.
 * @returns The mUSD balance, mUSD-equivalent vault-share value, and total, as
 * raw uint256 strings.
 */
export type MoneyAccountBalanceServiceGetBalanceAction = {
  type: `MoneyAccountBalanceService:getBalance`;
  handler: MoneyAccountBalanceService['getBalance'];
};

/**
 * Fetches the account's total Money balance inputs in a single batched RPC
 * request via Multicall3's `aggregate3`
 *
 * @param accountAddress - The Money account's Ethereum address.
 * @returns The mUSD balance and the mUSD-equivalent value of vault shares as
 * raw uint256 strings. The total balance is the sum of the mUSD balance and the mUSD-equivalent value of vault shares.
 * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
 */
export type MoneyAccountBalanceServiceGetMoneyAccountBalanceAction = {
  type: `MoneyAccountBalanceService:getMoneyAccountBalance`;
  handler: MoneyAccountBalanceService['getMoneyAccountBalance'];
};

/**
 * Fetches the vmUSD (Veda vault share) ERC-20 balance for the given
 * account address via RPC.
 *
 * @param accountAddress - The Money account's Ethereum address.
 * @returns The vmUSD balance as a raw uint256 string.
 * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
 */
export type MoneyAccountBalanceServiceGetVmusdBalanceAction = {
  type: `MoneyAccountBalanceService:getVmusdBalance`;
  handler: MoneyAccountBalanceService['getVmusdBalance'];
};

/**
 * Fetches the current exchange rate from the Veda Accountant contract via
 * RPC. The rate represents the conversion factor from vmUSD shares to
 * the underlying mUSD asset.
 *
 * @param options - The options for the query.
 * @param options.staleTime - Cache stale time override for this query.
 * @returns The exchange rate as a raw uint256 string.
 * @throws {@link VaultConfigNotAvailableError} if vault config has not been loaded.
 */
export type MoneyAccountBalanceServiceGetExchangeRateAction = {
  type: `MoneyAccountBalanceService:getExchangeRate`;
  handler: MoneyAccountBalanceService['getExchangeRate'];
};

/**
 * Fetches the mUSD-equivalent value of the account's vmUSD vault shares
 * via `Lens.balanceOfInAssets` RPC.
 *
 * @param accountAddress - The Money account's Ethereum address.
 * @returns The mUSD-equivalent value of vault shares as a raw uint256 string.
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
  | MoneyAccountBalanceServiceGetBalanceAction
  | MoneyAccountBalanceServiceGetMusdBalanceAction
  | MoneyAccountBalanceServiceGetMoneyAccountBalanceAction
  | MoneyAccountBalanceServiceGetVmusdBalanceAction
  | MoneyAccountBalanceServiceGetExchangeRateAction
  | MoneyAccountBalanceServiceGetMusdEquivalentValueAction
  | MoneyAccountBalanceServiceGetVaultApyAction;
