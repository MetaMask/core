import type { ChainId, DataRequest } from '../types';

// ============================================================================
// DATA SOURCE BASE TYPES
// ============================================================================

/**
 * Subscription request from AssetsController.
 */
export type SubscriptionRequest = {
  request: DataRequest;
  subscriptionId: string;
  isUpdate: boolean;
};

/**
 * Base state for all data sources.
 */
export type DataSourceState = {
  /** Currently active chains (supported AND available) */
  activeChains: ChainId[];
};

// ============================================================================
// ABSTRACT DATA SOURCE
// ============================================================================

/**
 * Abstract base class for data sources.
 *
 * Data sources communicate with AssetsController via Messenger:
 * - Register actions that AssetsController can call
 * - Publish events that AssetsController subscribes to
 */
export abstract class AbstractDataSource<
  Name extends string,
  State extends DataSourceState = DataSourceState,
> {
  protected readonly name: Name;

  protected state: State;

  /** Active subscriptions by ID */
  protected readonly activeSubscriptions: Map<
    string,
    { cleanup: () => void; chains: ChainId[] }
  > = new Map();

  constructor(name: Name, initialState: State) {
    this.name = name;
    this.state = initialState;
  }

  /**
   * Get the data source name/ID.
   *
   * @returns The name of this data source.
   */
  getName(): Name {
    return this.name;
  }

  /**
   * Get currently active chains (supported AND available).
   *
   * @returns Array of currently active chain IDs.
   */
  async getActiveChains(): Promise<ChainId[]> {
    return this.state.activeChains;
  }

  /**
   * Subscribe to updates for the given request.
   */
  abstract subscribe(request: SubscriptionRequest): Promise<void>;

  /**
   * Unsubscribe from updates.
   *
   * @param subscriptionId - The ID of the subscription to cancel.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.activeSubscriptions.get(subscriptionId);
    if (subscription) {
      subscription.cleanup();
      this.activeSubscriptions.delete(subscriptionId);
    }
  }

  /**
   * Update active chains and notify listeners only if changed.
   *
   * @param chains - Array of chain IDs to set as active.
   * @param publishEvent - Callback to publish chain changes to listeners.
   */
  protected updateActiveChains(
    chains: ChainId[],
    publishEvent: (chains: ChainId[]) => void,
  ): void {
    const previousChains = new Set(this.state.activeChains);
    const newChains = new Set(chains);

    // Check if chains have actually changed
    const hasChanges =
      previousChains.size !== newChains.size ||
      chains.some((chain) => !previousChains.has(chain));

    // Always update state
    this.state.activeChains = chains;

    // Only publish event if there are actual changes
    if (hasChanges) {
      publishEvent(chains);
    }
  }

  /**
   * Add a chain to active chains.
   *
   * @param chainId - The chain ID to add.
   * @param publishEvent - Callback to publish chain changes to listeners.
   */
  protected addActiveChain(
    chainId: ChainId,
    publishEvent: (chains: ChainId[]) => void,
  ): void {
    if (!this.state.activeChains.includes(chainId)) {
      this.state.activeChains = [...this.state.activeChains, chainId];
      publishEvent(this.state.activeChains);
    }
  }

  /**
   * Remove a chain from active chains.
   *
   * @param chainId - The chain ID to remove.
   * @param publishEvent - Callback to publish chain changes to listeners.
   */
  protected removeActiveChain(
    chainId: ChainId,
    publishEvent: (chains: ChainId[]) => void,
  ): void {
    if (this.state.activeChains.includes(chainId)) {
      this.state.activeChains = this.state.activeChains.filter(
        (chain) => chain !== chainId,
      );
      publishEvent(this.state.activeChains);
    }
  }

  /**
   * Destroy the data source and clean up resources.
   */
  destroy(): void {
    for (const subscription of this.activeSubscriptions.values()) {
      subscription.cleanup();
    }
    this.activeSubscriptions.clear();
  }
}
