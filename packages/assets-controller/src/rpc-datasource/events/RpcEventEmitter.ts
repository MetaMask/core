import SafeEventEmitter from '@metamask/safe-event-emitter';

import type {
  AssetsBalanceChangedEvent,
  AssetsChangedEvent,
  AssetsPriceChangedEvent,
  OnAssetsBalanceChangedCallback,
  OnAssetsChangedCallback,
  OnAssetsPriceChangedCallback,
  Unsubscribe,
} from '../types';

/**
 * RpcEventEmitter - Event emitter for RPC datasource events.
 *
 * Provides a pub/sub mechanism for consumers to subscribe to
 * asset detection, balance updates, and price changes.
 */
export class RpcEventEmitter extends SafeEventEmitter {
  onAssetsChanged(callback: OnAssetsChangedCallback): Unsubscribe {
    this.on('assetsChanged', callback);
    return () => this.off('assetsChanged', callback);
  }

  onAssetsBalanceChanged(
    callback: OnAssetsBalanceChangedCallback,
  ): Unsubscribe {
    this.on('assetsBalanceChanged', callback);
    return () => this.off('assetsBalanceChanged', callback);
  }

  onAssetsPriceChanged(callback: OnAssetsPriceChangedCallback): Unsubscribe {
    this.on('assetsPriceChanged', callback);
    return () => this.off('assetsPriceChanged', callback);
  }

  emitAssetsChanged(event: AssetsChangedEvent): void {
    this.emit('assetsChanged', event);
  }

  emitAssetsBalanceChanged(event: AssetsBalanceChangedEvent): void {
    this.emit('assetsBalanceChanged', event);
  }

  emitAssetsPriceChanged(event: AssetsPriceChangedEvent): void {
    this.emit('assetsPriceChanged', event);
  }

  override removeAllListeners(event?: string | symbol): this {
    return super.removeAllListeners(event);
  }
}
