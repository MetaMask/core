import type {
  AccountActivityServiceBalanceUpdatedEvent,
  AccountActivityServiceStatusChangedEvent,
  BalanceUpdate,
} from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { isCaipChainId } from '@metamask/utils';
import BigNumberJS from 'bignumber.js';

import type { AssetsControllerMessenger } from '../AssetsController.js';
import { projectLogger, createModuleLogger } from '../logger.js';
import type {
  AssetBalance,
  ChainId,
  Caip19AssetId,
  DataRequest,
  DataResponse,
} from '../types.js';
import { AbstractDataSource } from './AbstractDataSource.js';
import type { DataSourceState } from './AbstractDataSource.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'AccountActivityDataSource';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// BALANCE UPDATE PROCESSING
// ============================================================================

/**
 * Convert AccountActivityMessage balance updates into a {@link DataResponse}
 * for AssetsController.
 *
 * Only balances are published. The websocket payload's asset `unit` echoes the
 * on-chain contract symbol, which is attacker-controlled for airdropped tokens
 * (e.g. scam-URL token names). Publishing it as metadata poisoned
 * `state.assetsInfo`, marking spam assets as "known" and exempting them from
 * TokenDataSource's spam filtering on all subsequent updates. Metadata is
 * intentionally left for TokenDataSource to resolve from the Token API — the
 * metadata source of truth — during the same pipeline pass. The payload's
 * `decimals` is still used locally to convert raw amounts to human-readable
 * balances.
 *
 * @param updates - Balance updates from account-activity websocket payload.
 * @param accountId - Internal account UUID.
 * @returns DataResponse with merge mode when balances are present.
 */
function processAccountActivityBalanceUpdates(
  updates: BalanceUpdate[],
  accountId: string,
): DataResponse {
  const assetsBalance = Object.create(null) as Record<
    string,
    Record<Caip19AssetId, AssetBalance>
  >;
  assetsBalance[accountId] = Object.create(null) as Record<
    Caip19AssetId,
    AssetBalance
  >;

  for (const update of updates) {
    const { asset, postBalance } = update;

    if (!asset || !postBalance) {
      continue;
    }

    const assetId = asset.type as Caip19AssetId;

    if (asset.decimals === undefined) {
      continue;
    }

    const rawBalanceStr = postBalance.amount.startsWith('0x')
      ? BigInt(postBalance.amount).toString()
      : postBalance.amount;

    const humanReadableAmount = new BigNumberJS(rawBalanceStr)
      .dividedBy(new BigNumberJS(10).pow(asset.decimals))
      .toFixed();

    assetsBalance[accountId][assetId] = {
      amount: humanReadableAmount,
    };
  }

  const response: DataResponse = { updateMode: 'merge' };
  if (Object.keys(assetsBalance[accountId]).length > 0) {
    response.assetsBalance = assetsBalance;
  }

  return response;
}

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
  /**
   * Pushes decoded balance updates to the controller (bound to
   * `AssetsController.handleAssetsUpdate`). AADS is event-driven and never
   * takes part in the controller's subscribe handoff, so it receives this
   * callback directly instead of via a `SubscriptionRequest`.
   */
  onAssetsUpdate: (
    response: DataResponse,
    request?: DataRequest,
  ) => void | Promise<void>;
  state?: Partial<AccountActivityDataSourceState>;
};

// ============================================================================
// ACCOUNT ACTIVITY DATA SOURCE
// ============================================================================

/**
 * Data source that consumes real-time updates from `AccountActivityService`.
 *
 * `AccountActivityService` owns the WebSocket connection and channel
 * subscriptions; this data source is a thin consumer of the two high-level
 * events that it publishes:
 *
 * - `AccountActivityService:balanceUpdated` — post-transaction balances for the
 *   subscribed account(s). The address is resolved against the wallet's
 *   selected account group, transformed into a {@link DataResponse} (via
 *   {@link processAccountActivityBalanceUpdates}), and pushed to the controller
 *   through the injected `onAssetsUpdate` callback.
 * - `AccountActivityService:statusChanged` — per-chain "up"/"down" notifications.
 *   A chain reported "up" is claimed as an active chain (WebSocket is providing
 *   real-time data); a chain reported "down" is released so polling data sources
 *   can take over. Each change is applied directly via `updateActiveChains`,
 *   which notifies the controller through `onActiveChainsUpdated`.
 *
 * This data source does NOT debounce, jitter, or gate chain updates itself.
 * Coalescing (collapsing bursts) and jitter (staggering the WS-subscribe herd
 * across clients) live in `AssetsController`, where the expensive re-subscribe
 * happens and where updates from all data sources converge. `activeChains` are
 * never seeded from the accounts API; they only ever reflect live
 * `statusChanged` events (the service flushes all tracked chains as "down" when
 * the WebSocket disconnects, releasing them).
 *
 * It subscribes to these events in its constructor (the same way
 * `TokenBalancesController` does). Unlike the polling data sources it does not
 * take part in the controller's subscribe/unsubscribe handoff: `subscribe` is a
 * no-op, balance updates are routed by resolving the address against the
 * wallet, and updates are pushed through the injected `onAssetsUpdate` callback.
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

  readonly #onAssetsUpdate: (
    response: DataResponse,
    request?: DataRequest,
  ) => void | Promise<void>;

  readonly #onBalanceUpdatedBound: (event: {
    address: string;
    chain: string;
    updates: BalanceUpdate[];
  }) => void;

  constructor(options: AccountActivityDataSourceOptions) {
    super(CONTROLLER_NAME, {
      ...defaultState,
      ...options.state,
    });

    this.#messenger = options.messenger;
    this.#onActiveChainsUpdated = options.onActiveChainsUpdated;
    this.#onAssetsUpdate = options.onAssetsUpdate;
    this.#onBalanceUpdatedBound = this.#onBalanceUpdated.bind(this);

    this.#subscribeToEvents();
  }

  // ============================================================================
  // EVENT SUBSCRIPTIONS
  // ============================================================================

  #subscribeToEvents(): void {
    this.#messenger.subscribe(
      'AccountActivityService:balanceUpdated',
      this.#onBalanceUpdatedBound,
    );
    this.#messenger.subscribe(
      'AccountActivityService:statusChanged',
      this.#onAccountActivityStatusChanged,
    );
  }

  // ============================================================================
  // SUBSCRIBE / UNSUBSCRIBE
  // ============================================================================

  /**
   * AADS is event-driven and chain-agnostic: it never participates in the
   * controller's subscribe/unsubscribe handoff. Incoming `balanceUpdated`
   * events are routed by resolving the address against the wallet's accounts
   * (see `#onBalanceUpdated`), and updates are pushed through the injected
   * `#onAssetsUpdate` callback. This override exists only to satisfy the
   * abstract contract and is intentionally a no-op.
   */
  async subscribe(): Promise<void> {
    // Intentionally empty — see method doc.
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

      const account = this.#findAccountForAddress(address);
      if (!account) {
        return;
      }

      const chainId = chain as ChainId;

      const response = processAccountActivityBalanceUpdates(
        updates,
        account.id,
      );

      if (!response.assetsBalance) {
        return;
      }

      const request: DataRequest = {
        accountsWithSupportedChains: [{ account, supportedChains: [chainId] }],
        chainIds: [chainId],
        dataTypes: ['balance', 'metadata'],
      };

      Promise.resolve(this.#onAssetsUpdate(response, request)).catch(
        (error) => {
          log('Failed to report balance update', { error });
        },
      );
    } catch (error) {
      log('Error handling balance update', error);
    }
  }

  /**
   * Find the wallet account matching the given activity address. EVM addresses
   * are matched case-insensitively; other namespaces are matched exactly.
   *
   * The candidate set is the accounts of the selected account group, resolved
   * from the wallet at event time (rather than from a stored subscription), so
   * AADS does not need to be re-subscribed whenever the account set changes.
   *
   * @param address - The account address from the activity message.
   * @returns The matching account, or null.
   */
  #findAccountForAddress(address: string): InternalAccount | null {
    const isEvm = address.startsWith('0x');

    return (
      this.#getWalletAccounts().find((candidate) =>
        isEvm
          ? candidate.address.toLowerCase() === address.toLowerCase()
          : candidate.address === address,
      ) ?? null
    );
  }

  /**
   * Resolve the accounts of the selected account group from the wallet,
   * mirroring `AssetsController.#getSelectedAccounts`.
   *
   * @returns The accounts of the selected account group.
   */
  #getWalletAccounts(): InternalAccount[] {
    const accounts = this.#messenger.call(
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
    );
    if (accounts.length > 0) {
      return accounts;
    }

    const selectedAccount = this.#messenger.call(
      'AccountsController:getSelectedAccount',
    );
    return selectedAccount ? [selectedAccount] : [];
  }

  // ============================================================================
  // STATUS CHANGES
  // ============================================================================

  /**
   * Handle a `statusChanged` notification. Chains reported "up" are claimed as
   * active (WebSocket provides real-time data); chains reported "down" are
   * released so polling data sources take over. The change is applied directly;
   * coalescing and jitter are handled by `AssetsController`.
   *
   * @param options - The status change notification.
   * @param options.chainIds - The CAIP-2 chain IDs whose status changed.
   * @param options.status - Whether the chains are `up` or `down`.
   * @param options.timestamp - Optional timestamp of the status change.
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
    try {
      this.#messenger.unsubscribe(
        'AccountActivityService:balanceUpdated',
        this.#onBalanceUpdatedBound,
      );
    } catch (error) {
      log('Failed to unsubscribe from balanceUpdated', { error });
    }

    try {
      this.#messenger.unsubscribe(
        'AccountActivityService:statusChanged',
        this.#onAccountActivityStatusChanged,
      );
    } catch (error) {
      log('Failed to unsubscribe from statusChanged', { error });
    }

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
