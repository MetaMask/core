import {
  CONNECTIVITY_STATUSES,
  ConnectivityAdapter,
  ConnectivityStatus,
} from '@metamask/connectivity-controller';

/**
 * A connectivity adapter that unconditionally reports the device as online.
 *
 * This is a temporary placeholder until a real platform-specific adapter
 * (one that observes actual network events) is injected by the consumer.
 */
export class AlwaysOnlineAdapter implements ConnectivityAdapter {
  /**
   * Returns the current connectivity status.
   *
   * @returns A promise that always resolves to the online status.
   */
  async getStatus(): Promise<ConnectivityStatus> {
    return CONNECTIVITY_STATUSES.Online;
  }

  /**
   * Registers a callback for connectivity changes.
   *
   * This adapter never changes status, so the callback is never invoked.
   *
   * @param _callback - The callback to register.
   */
  onConnectivityChange(_callback: (status: ConnectivityStatus) => void): void {
    // no-op
  }

  /**
   * Cleans up any resources held by this adapter.
   *
   * This adapter holds no resources, so this is a no-op.
   */
  destroy(): void {
    // no-op
  }
}
