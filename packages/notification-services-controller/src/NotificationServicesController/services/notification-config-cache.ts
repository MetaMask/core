type NotificationConfigCache = {
  data: Map<string, boolean>;
  timestamp: number;
};

export const NotificationConfigCacheTTL = 1000 * 60; // 60 seconds

export class OnChainNotificationsCache {
  #cache: NotificationConfigCache | null = null;

  readonly #TTL = NotificationConfigCacheTTL;

  #isExpired(): boolean {
    return !this.#cache || Date.now() - this.#cache.timestamp > this.#TTL;
  }

  #hasAllAddresses(addresses: string[]): boolean {
    if (!this.#cache) {
      return false;
    }
    return addresses.every((address) => this.#cache?.data.has(address));
  }

  get(addresses: string[]): { address: string; enabled: boolean }[] | null {
    if (this.#isExpired() || !this.#hasAllAddresses(addresses)) {
      return null;
    }

    return addresses.map((address) => ({
      address,
      enabled: this.#cache?.data.get(address) ?? false,
    }));
  }

  set(data: { address: string; enabled: boolean }[]): void {
    let map: Map<string, boolean> = new Map<string, boolean>();

    // If we have existing cache, preserve it and update with new data
    if (this.#cache && !this.#isExpired()) {
      map = new Map(this.#cache.data);
    }

    // Update with new data
    data.forEach(({ address, enabled }) => {
      map.set(address, enabled);
    });

    this.#cache = {
      data: map,
      timestamp: Date.now(),
    };
  }

  // Full replace when updateOnChainNotifications is called
  replace(data: { address: string; enabled: boolean }[]): void {
    const map = new Map<string, boolean>();
    data.forEach(({ address, enabled }) => {
      map.set(address, enabled);
    });

    this.#cache = {
      data: map,
      timestamp: Date.now(),
    };
  }

  clear(): void {
    this.#cache = null;
  }
}

export const notificationsConfigCache = new OnChainNotificationsCache();
