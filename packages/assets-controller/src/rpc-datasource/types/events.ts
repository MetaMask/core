import type { Asset, AssetBalance, AssetPrice } from './assets';
import type { AccountId, ChainId } from './core';

/**
 * Event payload for asset changes (new tokens detected).
 */
export type AssetsChangedEvent = {
  /** Chain ID */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Newly detected/changed assets */
  assets: Asset[];
  /** Timestamp */
  timestamp: number;
};

/**
 * Event payload for balance changes.
 */
export type AssetsBalanceChangedEvent = {
  /** Chain ID */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Updated balances */
  balances: AssetBalance[];
  /** Timestamp */
  timestamp: number;
};

/**
 * Event payload for price changes.
 */
export type AssetsPriceChangedEvent = {
  /** Chain ID */
  chainId: ChainId;
  /** Updated prices */
  prices: AssetPrice[];
  /** Timestamp */
  timestamp: number;
};

/**
 * Callback for assets changed event.
 */
export type OnAssetsChangedCallback = (event: AssetsChangedEvent) => void;

/**
 * Callback for balance changed event.
 */
export type OnAssetsBalanceChangedCallback = (
  event: AssetsBalanceChangedEvent,
) => void;

/**
 * Callback for price changed event.
 */
export type OnAssetsPriceChangedCallback = (
  event: AssetsPriceChangedEvent,
) => void;

/**
 * Unsubscribe function returned by subscription methods.
 */
export type Unsubscribe = () => void;
