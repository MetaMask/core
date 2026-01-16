import type { AssetsController } from './AssetsController';
import type { ChainId, AccountId } from './rpc-datasource/types';

/**
 * Configuration for the polling middleware.
 */
export type AssetsPollingMiddlewareConfig = {
  /** Whether to auto-start polling on initialization */
  autoStart?: boolean;
  /** Polling interval in milliseconds */
  pollingIntervalMs?: number;
};

/**
 * Account info for polling.
 */
export type PollingAccount = {
  id: AccountId;
  address: string;
};

/**
 * Middleware that manages polling lifecycle for AssetsController.
 *
 * This middleware:
 * - Starts/stops polling when accounts or chains change
 * - Manages polling tokens for cleanup
 * - Provides a simple interface for UI integration
 *
 * @example
 * ```typescript
 * const middleware = new AssetsPollingMiddleware(assetsController);
 *
 * // Start polling for all accounts on all chains
 * middleware.startPollingForAllAccountsOnChains(
 *   ['0x1', '0x89'],
 *   [{ id: 'uuid', address: '0x...' }]
 * );
 *
 * // Or start for specific account/chain
 * middleware.startPollingForAccount('uuid', ['0x1', '0x89']);
 *
 * // Stop all polling
 * middleware.stopAllPolling();
 * ```
 */
export class AssetsPollingMiddleware {
  readonly #controller: AssetsController;

  readonly #pollingTokens: Map<string, string> = new Map();

  readonly #config: Required<AssetsPollingMiddlewareConfig>;

  constructor(
    controller: AssetsController,
    config?: AssetsPollingMiddlewareConfig,
  ) {
    this.#controller = controller;
    this.#config = {
      autoStart: config?.autoStart ?? false,
      pollingIntervalMs: config?.pollingIntervalMs ?? 30000,
    };

    console.log('[AssetsPollingMiddleware] Created with config:', this.#config);
  }

  // ===========================================================================
  // POLLING MANAGEMENT
  // ===========================================================================

  /**
   * Start polling for all accounts on specified chains.
   *
   * @param chainIds - Array of chain IDs to poll.
   * @param accounts - Array of accounts to poll for.
   */
  startPollingForAllAccountsOnChains(
    chainIds: ChainId[],
    accounts: PollingAccount[],
  ): void {
    console.log(
      '[AssetsPollingMiddleware] startPollingForAllAccountsOnChains:',
      {
        chainIds,
        accounts: accounts.map((a) => a.id),
      },
    );

    for (const account of accounts) {
      for (const chainId of chainIds) {
        this.#startPolling(chainId, account.id);
      }
    }
  }

  /**
   * Start polling for a specific account on specified chains.
   *
   * @param accountId - Account ID to poll for.
   * @param chainIds - Array of chain IDs to poll.
   */
  startPollingForAccount(accountId: AccountId, chainIds: ChainId[]): void {
    console.log('[AssetsPollingMiddleware] startPollingForAccount:', {
      accountId,
      chainIds,
    });

    for (const chainId of chainIds) {
      this.#startPolling(chainId, accountId);
    }
  }

  /**
   * Start polling for all accounts on a specific chain.
   *
   * @param chainId - Chain ID to poll.
   * @param accounts - Array of accounts to poll for.
   */
  startPollingForChain(chainId: ChainId, accounts: PollingAccount[]): void {
    console.log('[AssetsPollingMiddleware] startPollingForChain:', {
      chainId,
      accounts: accounts.map((a) => a.id),
    });

    for (const account of accounts) {
      this.#startPolling(chainId, account.id);
    }
  }

  /**
   * Stop polling for a specific account on all chains.
   *
   * @param accountId - Account ID to stop polling for.
   */
  stopPollingForAccount(accountId: AccountId): void {
    console.log('[AssetsPollingMiddleware] stopPollingForAccount:', accountId);

    const keysToRemove: string[] = [];

    for (const [key, token] of this.#pollingTokens) {
      if (key.includes(`:${accountId}`)) {
        this.#controller.stopPollingByPollingToken(token);
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.#pollingTokens.delete(key);
    }
  }

  /**
   * Stop polling for all accounts on a specific chain.
   *
   * @param chainId - Chain ID to stop polling for.
   */
  stopPollingForChain(chainId: ChainId): void {
    console.log('[AssetsPollingMiddleware] stopPollingForChain:', chainId);

    const keysToRemove: string[] = [];

    for (const [key, token] of this.#pollingTokens) {
      if (key.startsWith(`${chainId}:`)) {
        this.#controller.stopPollingByPollingToken(token);
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.#pollingTokens.delete(key);
    }
  }

  /**
   * Stop all active polling.
   */
  stopAllPolling(): void {
    console.log('[AssetsPollingMiddleware] stopAllPolling');

    for (const token of this.#pollingTokens.values()) {
      this.#controller.stopPollingByPollingToken(token);
    }

    this.#pollingTokens.clear();
  }

  /**
   * Get active polling count.
   *
   * @returns Number of active polling sessions.
   */
  getActivePollingCount(): number {
    return this.#pollingTokens.size;
  }

  /**
   * Check if polling is active for a specific chain/account pair.
   *
   * @param chainId - Chain ID.
   * @param accountId - Account ID.
   * @returns True if polling is active.
   */
  isPollingActive(chainId: ChainId, accountId: AccountId): boolean {
    const key = this.#makeKey(chainId, accountId);
    return this.#pollingTokens.has(key);
  }

  // ===========================================================================
  // LIFECYCLE HANDLERS (for UI integration)
  // ===========================================================================

  /**
   * Handle account selection change.
   * Stops polling for old account and starts for new account.
   *
   * @param oldAccountId - Previous account ID (optional).
   * @param newAccountId - New account ID.
   * @param chainIds - Chain IDs to poll.
   */
  onAccountChanged(
    oldAccountId: AccountId | undefined,
    newAccountId: AccountId,
    chainIds: ChainId[],
  ): void {
    console.log('[AssetsPollingMiddleware] onAccountChanged:', {
      oldAccountId,
      newAccountId,
      chainIds,
    });

    if (oldAccountId) {
      this.stopPollingForAccount(oldAccountId);
    }

    this.startPollingForAccount(newAccountId, chainIds);
  }

  /**
   * Handle chain enabled/disabled.
   *
   * @param chainId - Chain ID.
   * @param enabled - Whether chain is enabled.
   * @param accounts - Accounts to poll for if enabling.
   */
  onChainToggled(
    chainId: ChainId,
    enabled: boolean,
    accounts: PollingAccount[],
  ): void {
    console.log('[AssetsPollingMiddleware] onChainToggled:', {
      chainId,
      enabled,
      accounts: accounts.map((a) => a.id),
    });

    if (enabled) {
      this.startPollingForChain(chainId, accounts);
    } else {
      this.stopPollingForChain(chainId);
    }
  }

  /**
   * Handle app going to background (pause polling).
   */
  onAppBackground(): void {
    console.log(
      '[AssetsPollingMiddleware] onAppBackground - stopping all polling',
    );
    this.stopAllPolling();
  }

  /**
   * Handle app coming to foreground (resume polling).
   *
   * @param chainIds - Chain IDs to poll.
   * @param accounts - Accounts to poll for.
   */
  onAppForeground(chainIds: ChainId[], accounts: PollingAccount[]): void {
    console.log('[AssetsPollingMiddleware] onAppForeground - resuming polling');
    this.startPollingForAllAccountsOnChains(chainIds, accounts);
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Destroy the middleware and stop all polling.
   */
  destroy(): void {
    console.log('[AssetsPollingMiddleware] destroy');
    this.stopAllPolling();
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  #makeKey(chainId: ChainId, accountId: AccountId): string {
    return `${chainId}:${accountId}`;
  }

  #startPolling(chainId: ChainId, accountId: AccountId): void {
    const key = this.#makeKey(chainId, accountId);

    console.log('[AssetsPollingMiddleware] #startPolling called:', {
      chainId,
      accountId,
      key,
    });

    // Skip if already polling
    if (this.#pollingTokens.has(key)) {
      console.log('[AssetsPollingMiddleware] Already polling for:', key);
      return;
    }

    try {
      const token = this.#controller.startPolling({ chainId, accountId });
      this.#pollingTokens.set(key, token);

      console.log('[AssetsPollingMiddleware] Started polling:', {
        key,
        token,
        totalActivePolls: this.#pollingTokens.size,
      });
    } catch (error) {
      console.error('[AssetsPollingMiddleware] Error starting polling:', error);
    }
  }
}
