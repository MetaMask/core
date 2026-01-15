import type {
  AssetsChangedEvent,
  AssetsBalanceChangedEvent,
  AssetsPriceChangedEvent,
  OnAssetsChangedCallback,
  OnAssetsBalanceChangedCallback,
  OnAssetsPriceChangedCallback,
  Unsubscribe,
} from '../types';

/**
 * Event emitter interface for RPC datasource events.
 *
 * Provides subscription methods for consumers to listen to
 * asset, balance, and price changes.
 */
export type IRpcEventEmitter = {
  /**
   * Subscribe to asset changes (new tokens detected).
   *
   * @param callback - Called when new assets are detected.
   * @returns Unsubscribe function.
   */
  onAssetsChanged(callback: OnAssetsChangedCallback): Unsubscribe;

  /**
   * Subscribe to balance changes.
   *
   * @param callback - Called when balances are updated.
   * @returns Unsubscribe function.
   */
  onAssetsBalanceChanged(callback: OnAssetsBalanceChangedCallback): Unsubscribe;

  /**
   * Subscribe to price changes.
   *
   * @param callback - Called when prices are updated.
   * @returns Unsubscribe function.
   */
  onAssetsPriceChanged(callback: OnAssetsPriceChangedCallback): Unsubscribe;

  /**
   * Emit an assets changed event.
   *
   * @param event - The event payload.
   */
  emitAssetsChanged(event: AssetsChangedEvent): void;

  /**
   * Emit a balance changed event.
   *
   * @param event - The event payload.
   */
  emitAssetsBalanceChanged(event: AssetsBalanceChangedEvent): void;

  /**
   * Emit a price changed event.
   *
   * @param event - The event payload.
   */
  emitAssetsPriceChanged(event: AssetsPriceChangedEvent): void;

  /**
   * Remove all subscriptions.
   */
  removeAllListeners(): void;
};
