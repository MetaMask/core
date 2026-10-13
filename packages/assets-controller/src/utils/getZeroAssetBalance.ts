import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';

import type { Caip19AssetId, ChainId, FungibleAssetBalance } from '../types.js';
import { isNativeAssetId } from './native-assets.js';

/**
 * Balance-row metadata the Accounts API attaches to Stellar native XLM.
 * Seeded at zero so an unfunded account still has a well-formed native row
 * instead of a bare `{ amount: '0' }`.
 */
export const STELLAR_NATIVE_ZERO_BALANCE_METADATA = {
  minimumReserveBalance: '0',
  spendableBalance: '0',
} as const;

/**
 * Balance-row metadata the Accounts API attaches to Stellar trustlines.
 * Seeded at zero so a pinned asset is a well-formed token row instead of a
 * bare `{ amount: '0' }`.
 */
export const STELLAR_TOKEN_ZERO_BALANCE_METADATA = {
  authorized: false,
  limit: '0',
  sponsored: false,
} as const;

const ZERO_AMOUNT_BALANCE: FungibleAssetBalance = { amount: '0' };

/**
 * Zero-balance row for a chain's native asset.
 * Stellar natives include spendable / reserve metadata at 0; other natives
 * are a plain zero amount.
 *
 * @param chainId - CAIP-2 chain ID of the native asset.
 * @returns A zero-balance entry for that native.
 */
export function getZeroNativeAssetBalance(
  chainId: ChainId,
): FungibleAssetBalance {
  if (isStellarChain(chainId)) {
    return {
      amount: '0',
      metadata: { ...STELLAR_NATIVE_ZERO_BALANCE_METADATA },
    };
  }

  return { ...ZERO_AMOUNT_BALANCE };
}

/**
 * Zero-balance row for a non-native token on a chain.
 * Stellar trustlines include `limit` / `authorized` / `sponsored` at empty
 * defaults; other tokens are a plain zero amount.
 *
 * @param chainId - CAIP-2 chain ID of the token.
 * @returns A zero-balance entry for that token.
 */
export function getZeroTokenAssetBalance(
  chainId: ChainId,
): FungibleAssetBalance {
  if (isStellarChain(chainId)) {
    return {
      amount: '0',
      metadata: { ...STELLAR_TOKEN_ZERO_BALANCE_METADATA },
    };
  }

  return { ...ZERO_AMOUNT_BALANCE };
}

/**
 * Zero-balance row for a CAIP-19 asset. IDs recognized by
 * {@link isNativeAssetId} use {@link getZeroNativeAssetBalance}; every other
 * ID uses {@link getZeroTokenAssetBalance}.
 *
 * @param assetId - CAIP-19 asset ID being seeded.
 * @returns A zero-balance entry for that asset.
 */
export function getZeroAssetBalance(
  assetId: Caip19AssetId,
): FungibleAssetBalance {
  try {
    const { chainId } = parseCaipAssetType(assetId);
    return isNativeAssetId(assetId)
      ? getZeroNativeAssetBalance(chainId)
      : getZeroTokenAssetBalance(chainId);
  } catch {
    return { ...ZERO_AMOUNT_BALANCE };
  }
}

/**
 * Default native balance to insert when a data source (typically Accounts API)
 * returns no row for the chain's native asset.
 *
 * @param nativeAssetId - The CAIP-19 native asset ID being seeded.
 * @returns A zero-balance entry for that native.
 */
export function getDefaultNativeAssetBalance(
  nativeAssetId: Caip19AssetId,
): FungibleAssetBalance {
  try {
    return getZeroNativeAssetBalance(parseCaipAssetType(nativeAssetId).chainId);
  } catch {
    return { ...ZERO_AMOUNT_BALANCE };
  }
}

function isStellarChain(chainId: ChainId): boolean {
  try {
    return parseCaipChainId(chainId).namespace === 'stellar';
  } catch {
    return false;
  }
}
