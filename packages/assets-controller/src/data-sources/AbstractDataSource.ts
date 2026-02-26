import type {
  ChainId,
  DataRequest,
  DataResponse,
  AssetsControllerStateInternal,
} from '../types';

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
  /** Called when this data source has new asset data. Passed by the controller when subscribing. Optional request describes the update scope (e.g. dataTypes: ['balance'] to skip enrichment). */
  onAssetsUpdate: (
    response: DataResponse,
    request?: DataRequest,
  ) => void | Promise<void>;
  /**
   * Optional state access (e.g. for price/token data sources that need assetsBalance).
   * Provided by the controller when subscribing.
   */
  getAssetsState?: () => AssetsControllerStateInternal;
};

/**
 * Active subscription entry stored by data sources.
 * Data sources can extend this with additional fields as needed.
 */
export type ActiveSubscription = {
  /** Cleanup function to unsubscribe */
  cleanup: () => void;
  /** Currently subscribed chains */
  chains: ChainId[];
  /** Original request (for polling data sources to handle account changes) */
  request?: DataRequest;
  /** Account addresses (for WebSocket data sources to detect account changes) */
  addresses?: string[];
  /** Callback to report asset updates (from SubscriptionRequest) */
  onAssetsUpdate: (
    response: DataResponse,
    request?: DataRequest,
  ) => void | Promise<void>;
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
  protected readonly activeSubscriptions: Map<string, ActiveSubscription> =
    new Map();

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
   * Get currently active chains synchronously (no state duplication in controller).
   *
   * @returns Array of currently active chain IDs.
   */
  getActiveChainsSync(): ChainId[] {
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
