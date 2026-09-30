import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  isCaipAssetType,
  isCaipChainId,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';

import type { AccountId, AssetBalance, Caip19AssetId } from '../types.js';

/**
 * Remove balance entries the given accounts cannot own.
 *
 * Ownership is the chain namespace of the account's scopes, not the
 * currently enabled chains. `eip155:0` keeps every EVM chain, including
 * ones the user has turned off. An account with no scopes is left untouched,
 * as is any account that is not in `accounts`.
 *
 * Mutates `balances`. Intended to run inside an Immer `update` draft, once
 * per unlock, the same way spam cleanup is applied.
 *
 * @param balances - `assetsBalance` being updated.
 * @param accounts - Accounts whose scopes define the namespaces to keep.
 * @returns True when at least one balance entry was removed.
 */
export function dropBalancesOutsideAccountScopes(
  balances: Record<AccountId, Record<Caip19AssetId, AssetBalance>>,
  accounts: readonly InternalAccount[],
): boolean {
  let removed = false;
  for (const account of accounts) {
    if (dropAccountBalancesOutsideScopes(balances, account)) {
      removed = true;
    }
  }
  return removed;
}

/**
 * Remove one account's balances whose chain namespace is outside its scopes.
 *
 * @param balances - `assetsBalance` being updated.
 * @param account - Account whose scopes define the namespaces to keep.
 * @returns True when at least one balance entry was removed.
 */
function dropAccountBalancesOutsideScopes(
  balances: Record<AccountId, Record<Caip19AssetId, AssetBalance>>,
  account: InternalAccount,
): boolean {
  // Persisted accounts can omit `scopes` even though the type requires it.
  const scopes = account.scopes ?? [];
  if (scopes.length === 0) {
    return false;
  }

  const accountBalances = balances[account.id];
  if (!accountBalances) {
    return false;
  }

  const namespaces = new Set<string>();
  for (const scope of scopes) {
    if (isCaipChainId(scope)) {
      namespaces.add(parseCaipChainId(scope).namespace);
    }
  }
  if (namespaces.size === 0) {
    return false;
  }

  let removed = false;
  for (const assetId of Object.keys(accountBalances) as Caip19AssetId[]) {
    // Malformed keys are left alone; this cleanup only targets valid CAIP-19
    // entries stamped onto the wrong account.
    if (!isCaipAssetType(assetId)) {
      continue;
    }
    if (!namespaces.has(parseCaipAssetType(assetId).chain.namespace)) {
      delete accountBalances[assetId];
      removed = true;
    }
  }
  return removed;
}
