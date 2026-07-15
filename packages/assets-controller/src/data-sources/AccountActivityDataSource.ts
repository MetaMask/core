import type {
  AccountActivityServiceBalanceUpdatedEvent,
  AccountActivityServiceStatusChangedEvent,
  BalanceUpdate,
} from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { isCaipChainId } from '@metamask/utils';

import type { AssetsControllerMessenger } from '../AssetsController';
import { projectLogger, createModuleLogger } from '../logger';
import type { ChainId, Caip19AssetId, DataRequest } from '../types';
import { processAccountActivityBalanceUpdates } from '../utils/processAccountActivityBalanceUpdates';
import { AbstractDataSource } from './AbstractDataSource';
import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'AccountActivityDataSource';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// MESSENGER TYPES
// ============================================================================

/** Allowed events that AccountActivityDataSource subscribes to. */
export type AccountActivityDataSourceAllowedEvents =
  | AccountActivityServiceBalanceUpdatedEvent
  | AccountActivityServiceStatusChangedEvent;

// ============================================================================
// STATE
// ============================================================================

export type AccountActivityDataSourceState = DataSourceState;

const defaultState: AccountActivityDataSourceState = {
  activeChains: [],
};

// ============================================================================
// OPTIONS
// ============================================================================

export type AccountActivityDataSourceOptions = {
  /** The AssetsController messenger (shared by all data sources). */
  messenger: AssetsControllerMessenger;
  /** Called when active chains are updated. Pass dataSourceName so the controller knows the source. */
  onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;
  /** Returns the asset type ('native' | 'erc20' | 'spl') for a given CAIP-19 asset ID. */
  getAssetType: (assetId: Caip19AssetId) => 'native' | 'erc20' | 'spl';
  state?: Partial<AccountActivityDataSourceState>;
};

// ============================================================================
// ACCOUNT ACTIVITY DATA SOURCE
// ============================================================================

/**
 * Data source that consumes real-time updates from `AccountActivityService`.
 *
 * Unlike {@link BackendWebsocketDataSource}, which owns its own WebSocket
 * channel subscriptions, this data source is a thin consumer of the two
 * high-level events that `AccountActivityService` publishes:
 *
 * - `AccountActivityService:balanceUpdated` — post-transaction balances for the
 *   subscribed account(s). The address is resolved against the accounts in the
 *   active subscription(s), transformed into a {@link DataResponse} (via
 *   {@link processAccountActivityBalanceUpdates}), and pushed to the controller
 *   through the subscription's `onAssetsUpdate` callback.
 * - `AccountActivityService:statusChanged` — per-chain "up"/"down" notifications.
 *   A chain reported "up" is claimed as an active chain (WebSocket is providing
 *   real-time data); a chain reported "down" is released so polling data sources
 *   can take over. Each change is applied directly via `updateActiveChains`,
 *   which notifies the controller through `onActiveChainsUpdated`.
 *
 * This data source does NOT debounce, jitter, or gate chain updates itself.
 * Coalescing (collapsing bursts) and jitter (staggering the WS-subscribe herd
 * across clients) live in `AssetsController`, where the expensive re-subscribe
 * happens and where updates from all data sources converge. `activeChains` also
 * are never seeded from the accounts API the way `BackendWebsocketDataSource`
 * does; they only ever reflect live `statusChanged` events (the service flushes
 * all tracked chains as "down" when the WebSocket disconnects, releasing them).
 *
 * It subscribes to these events in its constructor (the same way
 * `TokenBalancesController` does) and is wired into the controller's balance
 * subscription flow so incoming balance updates can be routed to the right
 * account.
 */
export class AccountActivityDataSource extends AbstractDataSource<
  typeof CONTROLLER_NAME,
  AccountActivityDataSourceState
> {
  readonly #messenger: AssetsControllerMessenger;

  readonly #onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;

  readonly #getAssetType: (
    assetId: Caip19AssetId,
  ) => 'native' | 'erc20' | 'spl';

  /** Stored subscription requests (used to route incoming balance updates). */
  readonly #subscriptionRequests: Map<string, SubscriptionRequest> = new Map();

  /** Unsubscribe handles for messenger event subscriptions. */
  readonly #eventUnsubscribes: (() => void)[] = [];

  constructor(options: AccountActivityDataSourceOptions) {
    super(CONTROLLER_NAME, {
      ...defaultState,
      ...options.state,
    });

    this.#messenger = options.messenger;
    this.#onActiveChainsUpdated = options.onActiveChainsUpdated;
    this.#getAssetType = options.getAssetType;

    this.#subscribeToEvents();
  }

  // ============================================================================
  // EVENT SUBSCRIPTIONS
  // ============================================================================

  #subscribeToEvents(): void {
    const unsubscribeBalance = this.#messenger.subscribe(
      'AccountActivityService:balanceUpdated',
      (event) => this.#onBalanceUpdated(event),
    );
    const unsubscribeStatus = this.#messenger.subscribe(
      'AccountActivityService:statusChanged',
      this.#onAccountActivityStatusChanged,
    );

    if (typeof unsubscribeBalance === 'function') {
      this.#eventUnsubscribes.push(unsubscribeBalance);
    }
    if (typeof unsubscribeStatus === 'function') {
      this.#eventUnsubscribes.push(unsubscribeStatus);
    }
  }

  // ============================================================================
  // SUBSCRIBE / UNSUBSCRIBE
  // ============================================================================

  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { subscriptionId, request } = subscriptionRequest;

    // Store the request so incoming `balanceUpdated` events can be routed to the
    // matching account and reported through its `onAssetsUpdate` callback.
    this.#subscriptionRequests.set(subscriptionId, subscriptionRequest);
    this.activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        this.#subscriptionRequests.delete(subscriptionId);
      },
      chains: request.chainIds,
      addresses: request.accountsWithSupportedChains.map(
        (entry) => entry.account.address,
      ),
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
    });
  }

  // ============================================================================
  // BALANCE UPDATES
  // ============================================================================

  #onBalanceUpdated({
    address,
    chain,
    updates,
  }: {
    address: string;
    chain: string;
    updates: BalanceUpdate[];
  }): void {
    try {
      if (!address || !chain || !updates || updates.length === 0) {
        return;
      }

      const match = this.#findAccountForAddress(address);
      if (!match) {
        return;
      }

      const { account, onAssetsUpdate } = match;
      const chainId = chain as ChainId;

      const response = processAccountActivityBalanceUpdates(
        updates,
        account.id,
        (assetId) => this.#getAssetType(assetId),
      );

      if (!response.assetsBalance) {
        return;
      }

      const request: DataRequest = {
        accountsWithSupportedChains: [{ account, supportedChains: [chainId] }],
        chainIds: [chainId],
        dataTypes: ['balance', 'metadata'],
      };

      Promise.resolve(onAssetsUpdate(response, request)).catch((error) => {
        log('Failed to report balance update', { error });
      });
    } catch (error) {
      log('Error handling balance update', error);
    }
  }

  /**
   * Find the internal account matching the given activity address across all
   * active subscription requests, along with the callback used to report its
   * updates. EVM addresses are matched case-insensitively; other namespaces are
   * matched exactly.
   *
   * @param address - The account address from the activity message.
   * @returns The matching account and its `onAssetsUpdate` callback, or null.
   */
  #findAccountForAddress(address: string): {
    account: InternalAccount;
    onAssetsUpdate: SubscriptionRequest['onAssetsUpdate'];
  } | null {
    const isEvm = address.startsWith('0x');

    for (const subscriptionRequest of this.#subscriptionRequests.values()) {
      const account = subscriptionRequest.request.accountsWithSupportedChains
        .map((entry) => entry.account)
        .find((candidate) =>
          isEvm
            ? candidate.address.toLowerCase() === address.toLowerCase()
            : candidate.address === address,
        );

      if (account) {
        return {
          account,
          onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
        };
      }
    }

    return null;
  }

  // ============================================================================
  // STATUS CHANGES
  // ============================================================================

  /**
   * Handle a `statusChanged` notification. Chains reported "up" are claimed as
   * active (WebSocket provides real-time data); chains reported "down" are
   * released so polling data sources take over. The change is applied directly;
   * coalescing and jitter are handled by `AssetsController`.
   */
  readonly #onAccountActivityStatusChanged = ({
    chainIds,
    status,
  }: {
    chainIds: string[];
    status: 'up' | 'down';
    timestamp?: number;
  }): void => {
    try {
      // Act on every namespace (eip155, solana, etc.); AssetsController is
      // multichain. Only skip identifiers that are not valid CAIP-2 chain IDs.
      const validChains = chainIds.filter((chainId) =>
        isCaipChainId(chainId),
      ) as ChainId[];

      if (validChains.length === 0) {
        return;
      }

      const next = new Set(this.state.activeChains);
      if (status === 'up') {
        for (const chainId of validChains) {
          next.add(chainId);
        }
      } else {
        for (const chainId of validChains) {
          next.delete(chainId);
        }
      }

      const previous = [...this.state.activeChains];
      this.updateActiveChains(Array.from(next), (updatedChains) =>
        this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
      );
    } catch (error) {
      log('Error handling status change', error);
    }
  };

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    for (const unsubscribe of this.#eventUnsubscribes) {
      unsubscribe();
    }
    this.#eventUnsubscribes.length = 0;

    this.#subscriptionRequests.clear();

    super.destroy();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates an AccountActivityDataSource instance.
 *
 * @param options - Configuration options for the data source.
 * @returns A new AccountActivityDataSource instance.
 */
export function createAccountActivityDataSource(
  options: AccountActivityDataSourceOptions,
): AccountActivityDataSource {
  return new AccountActivityDataSource(options);
}
