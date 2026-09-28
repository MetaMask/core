import { BigNumber } from 'bignumber.js';

import v6MultiAccountBalancesBsc from './api-responses/accounts-api/v6-multiaccount-balances-bsc.js';
import v6MultiAccountBalancesMainnet from './api-responses/accounts-api/v6-multiaccount-balances-mainnet.js';
import type { V6BalanceEntry } from './api-responses/index.js';

/** A captured balance plus the decimals it is denominated at. */
export type CapturedBalance = { balance: string; decimals: number };

/**
 * Double a decimal balance string, exactly. The doubled balances model the
 * wallet's holdings moving between the two pipeline passes of a scenario:
 * the Accounts API seed pass reports the captured amounts, and the RPC
 * fallback pass reports the doubled ones.
 *
 * @param balance - The decimal balance string, as captured.
 * @returns The doubled balance string.
 */
export function doubleBalance(balance: string): string {
  return new BigNumber(balance).multipliedBy(2).toFixed();
}

/**
 * Convert a decimal balance string to its smallest-unit integer amount,
 * exactly, as an `eth_call` / `aggregate3` response would carry it.
 *
 * @param balance - The decimal balance string.
 * @param decimals - The asset's smallest-unit precision.
 * @returns The integer amount as a decimal string.
 */
export function toSmallestUnits(balance: string, decimals: number): string {
  return new BigNumber(balance).multipliedBy(10 ** decimals).toFixed(0);
}

/**
 * The native row of the BNB Chain capture.
 *
 * @returns The capture's `native` entry.
 */
function getBscNativeEntry(): V6BalanceEntry {
  const native = v6MultiAccountBalancesBsc.balances.find(
    (entry) => entry.type === 'native',
  );
  if (!native) {
    throw new Error('BSC capture is missing its native balance row');
  }
  return native;
}

/**
 * The captured BNB Chain balances, keyed by lower-cased asset ID, as the
 * Accounts API seed pass should land them (before normalization).
 *
 * @returns The captured raw amounts.
 */
export function buildCapturedBscBalances(): Record<string, CapturedBalance> {
  const balances: Record<string, CapturedBalance> = {};
  for (const entry of v6MultiAccountBalancesBsc.balances) {
    balances[entry.assetId.toLowerCase()] = {
      balance: entry.balance,
      decimals: entry.decimals,
    };
  }
  return balances;
}

/**
 * The captured mainnet balances, keyed by lower-cased asset ID, as the
 * Accounts API seed pass should land them (before normalization).
 *
 * @returns The captured raw amounts.
 */
export function buildCapturedMainnetBalances(): Record<
  string,
  CapturedBalance
> {
  const balances: Record<string, CapturedBalance> = {};
  for (const entry of v6MultiAccountBalancesMainnet.balances) {
    balances[entry.assetId.toLowerCase()] = {
      balance: entry.balance,
      decimals: entry.decimals,
    };
  }
  return balances;
}

/**
 * The state amounts a doubled-BNB Chain RPC pass should land, keyed by
 * lower-cased asset ID, before normalization.
 *
 * @returns The expected raw amounts.
 */
export function buildDoubledBscBalances(): Record<string, CapturedBalance> {
  const balances: Record<string, CapturedBalance> = {};
  for (const entry of v6MultiAccountBalancesBsc.balances) {
    balances[entry.assetId.toLowerCase()] = {
      balance: doubleBalance(entry.balance),
      decimals: entry.decimals,
    };
  }
  return balances;
}

/**
 * Token balances for the BNB Chain provider state, modeled as the wallet's
 * captured ERC-20 holdings doubled: every token has exactly twice what the
 * Accounts API seed pass reported.
 *
 * @returns Balances in smallest units, keyed by lower-cased token address.
 */
export function buildDoubledBscTokenBalances(): Record<string, string> {
  const tokenBalancesWei: Record<string, string> = {};
  for (const entry of v6MultiAccountBalancesBsc.balances) {
    if (entry.type !== 'erc20') {
      continue;
    }
    const contract = entry.assetId.split(':').pop() as string;
    tokenBalancesWei[contract.toLowerCase()] = toSmallestUnits(
      doubleBalance(entry.balance),
      entry.decimals,
    );
  }
  return tokenBalancesWei;
}

/**
 * The smallest-unit amount of the BNB Chain native balance, doubled, as the
 * provider state's `nativeBalanceWei`.
 *
 * @returns The doubled native balance, in wei.
 */
export function buildDoubledBscNativeBalance(): string {
  const native = getBscNativeEntry();
  return toSmallestUnits(doubleBalance(native.balance), native.decimals);
}
