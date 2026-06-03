import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAssetType } from '@metamask/utils';
import BigNumber from 'bignumber.js';

import { isStellarClassicAssetCaip19 } from './stellarTrustline';

/** Stellar snap clientRequest method for trust-line enrichment. */
export const STELLAR_GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD =
  'getAccountAssetInfo' as const;

/** Optional balance fields for Stellar classic trust lines (unify-ready `extra`). */
export type StellarAccountAssetInfoExtra = {
  limit?: string;
  authorized?: boolean;
  sponsored?: boolean;
};

export type StellarGetAccountAssetInfoResponse = Record<
  CaipAssetType,
  StellarAccountAssetInfoExtra
>;

/**
 * Returns true when the account is a Stellar snap-backed multichain account.
 *
 * @param account - Internal account from AccountsController.
 */
export function isStellarMultichainAccount(account: InternalAccount): boolean {
  return account.type.startsWith('stellar:');
}

/**
 * Converts snap trust-line extra into JSON-safe balance `extra`.
 *
 * @param extra - Trust-line fields from the Stellar snap.
 * @returns Record suitable for MultichainBalancesController balance rows.
 */
export function stellarAssetInfoExtraToBalanceExtra(
  extra: StellarAccountAssetInfoExtra | undefined,
): StellarAccountAssetInfoExtra | undefined {
  if (extra === undefined) {
    return undefined;
  }
  const result: StellarAccountAssetInfoExtra = {};
  if (extra.limit !== undefined) {
    result.limit = extra.limit;
  }
  if (extra.authorized !== undefined) {
    result.authorized = extra.authorized;
  }
  if (extra.sponsored !== undefined) {
    result.sponsored = extra.sponsored;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Whether a Stellar classic asset should show the “no trustline” state from balance `extra`.
 * Missing `extra` or zero/absent `limit` means inactive; active when `limit` &gt; 0.
 *
 * @param extra - Balance `extra` from MultichainBalancesController.
 */
export function isStellarTrustlineInactiveFromBalanceExtra(
  extra: StellarAccountAssetInfoExtra | undefined,
): boolean {
  if (extra?.limit === undefined) {
    return true;
  }
  const { limit } = extra;
  if (typeof limit !== 'string') {
    return true;
  }
  try {
    return new BigNumber(limit).lte(0);
  } catch {
    return true;
  }
}

/**
 * Whether a portfolio Stellar classic should be treated as trustline-inactive.
 * Uses balance `extra` when present. Portfolio import with no balance row is inactive.
 * A balance row without `extra` is treated as pending (not inactive) until enrich merges `extra`.
 *
 * @param assetId - CAIP-19 asset id.
 * @param balanceExtra - Optional `extra` on the balance row.
 * @param hasBalanceRow - Whether MultichainBalancesController has a row for this asset.
 */
export function isStellarClassicTrustlineInactiveForAsset(
  assetId: CaipAssetType,
  balanceExtra: StellarAccountAssetInfoExtra | undefined,
  hasBalanceRow = false,
): boolean {
  if (!isStellarClassicAssetCaip19(assetId)) {
    return false;
  }
  if (!hasBalanceRow) {
    return true;
  }
  if (balanceExtra === undefined) {
    return false;
  }
  return isStellarTrustlineInactiveFromBalanceExtra(balanceExtra);
}
