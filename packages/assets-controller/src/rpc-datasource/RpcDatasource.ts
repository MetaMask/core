import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';

import { MulticallClient } from './clients';
import { RpcEventEmitter } from './events';
import { BalanceFetcher, TokenDetector } from './services';
import type {
  AccountId,
  BalanceFetchResult,
  ChainId,
  GetAccountFunction,
  OnAssetsBalanceChangedCallback,
  OnAssetsChangedCallback,
  OnAssetsPriceChangedCallback,
  PollingInput,
  RpcDatasourceConfig,
  RpcDatasourceDependencies,
  TokenDetectionResult,
  TokenListState,
  Unsubscribe,
  UserTokensState,
} from './types';

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: Required<RpcDatasourceConfig> = {
  pollingIntervalMs: 30000, // 30 seconds base polling interval
  balanceIntervalMs: 30000, // 30 seconds for balance fetching
  detectionIntervalMs: 180000, // 3 minutes for token detection
  detectionBatchSize: 300,
  balanceBatchSize: 300,
  rpcTimeoutMs: 30000,
};

/**
 * RpcDatasource - Main orchestrator for RPC-based asset operations.
 *
 * Combines token detection, balance fetching, and event emission
 * into a single polling-based service.
 *
 * Features:
 * - Configurable polling interval
 * - Toggle-able token detection
 * - Batched balance fetching via Multicall3
 * - Event-based notifications for state updates
 *
 * Inherited from StaticIntervalPollingControllerOnly:
 * - `startPolling(input)` - Start polling, returns a token
 * - `stopPollingByPollingToken(token)` - Stop a specific poll
 * - `stopAllPolling()` - Stop all active polls
 * - `setIntervalLength(ms)` / `getIntervalLength()` - Configure interval
 *
 * @example
 * ```typescript
 * const datasource = new RpcDatasource(
 *   {
 *     getAccount: (id) => messenger.call('AccountsController:getAccount', id),
 *     getTokenListState: () => messenger.call('TokenListController:getState'),
 *     getUserTokensState: () => messenger.call('TokensController:getState'),
 *   },
 *   {
 *     pollingIntervalMs: 60000,
 *     detectTokensEnabled: true,
 *   },
 * );
 *
 * // Subscribe to events
 * const unsubAssets = datasource.onAssetsChanged((event) => {
 *   console.log('New tokens:', event.assets);
 * });
 *
 * const unsubBalances = datasource.onAssetsBalanceChanged((event) => {
 *   console.log('Balances:', event.balances);
 * });
 *
 * // Start polling (inherited from base class)
 * const pollToken = datasource.startPolling({
 *   chainId: '0x1',
 *   accountId: 'account-uuid',
 * });
 *
 * // Later: stop and cleanup
 * datasource.stopPollingByPollingToken(pollToken);
 * datasource.destroy(); // Clears event listeners
 * unsubAssets();
 * unsubBalances();
 * ```
 */
export class RpcDatasource extends StaticIntervalPollingControllerOnly<PollingInput>() {
  // ===========================================================================
  // PRIVATE FIELDS
  // ===========================================================================

  readonly #eventEmitter: RpcEventEmitter;

  readonly #getAccount: GetAccountFunction;

  readonly #getTokenListState: () => TokenListState;

  readonly #getUserTokensState: () => UserTokensState;

  /**
   * Dynamic getter for token detection enabled state.
   * Called on each poll cycle to allow runtime toggling.
   */
  readonly #isTokenDetectionEnabled: () => boolean;

  /**
   * Interval for balance fetching (ms).
   */
  readonly #balanceIntervalMs: number;

  /**
   * Interval for token detection (ms).
   */
  readonly #detectionIntervalMs: number;

  /**
   * Track last execution times per polling key (chainId:accountId).
   */
  readonly #lastBalanceTime: Map<string, number> = new Map();

  readonly #lastDetectionTime: Map<string, number> = new Map();

  // ===========================================================================
  // PUBLIC READONLY FIELDS (Components)
  // ===========================================================================

  readonly multicallClient: MulticallClient;

  readonly tokenDetector: TokenDetector;

  readonly balanceFetcher: BalanceFetcher;

  // ===========================================================================
  // CONSTRUCTOR
  // ===========================================================================

  constructor(
    dependencies: RpcDatasourceDependencies,
    config?: RpcDatasourceConfig,
  ) {
    super();

    console.log('[RpcDatasource] Constructor called');
    console.log('[RpcDatasource] Dependencies:', dependencies);
    console.log('[RpcDatasource] Config:', config);

    // Validate dependencies
    if (!dependencies) {
      throw new Error('[RpcDatasource] dependencies is required');
    }
    if (!dependencies.getAccount) {
      throw new Error('[RpcDatasource] dependencies.getAccount is required');
    }
    if (!dependencies.getTokenListState) {
      throw new Error(
        '[RpcDatasource] dependencies.getTokenListState is required',
      );
    }
    if (!dependencies.getUserTokensState) {
      throw new Error(
        '[RpcDatasource] dependencies.getUserTokensState is required',
      );
    }

    // Merge config with defaults
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    console.log('[RpcDatasource] Merged config:', mergedConfig);

    // Store dependencies
    this.#getAccount = dependencies.getAccount;
    this.#getTokenListState = dependencies.getTokenListState;
    this.#getUserTokensState = dependencies.getUserTokensState;

    // Store token detection getter (defaults to disabled if not provided)
    this.#isTokenDetectionEnabled =
      dependencies.isTokenDetectionEnabled ?? ((): boolean => false);

    // Store interval config
    this.#balanceIntervalMs = mergedConfig.balanceIntervalMs;
    this.#detectionIntervalMs = mergedConfig.detectionIntervalMs;

    console.log(
      '[RpcDatasource] isTokenDetectionEnabled provided:',
      Boolean(dependencies.isTokenDetectionEnabled),
    );
    console.log('[RpcDatasource] balanceIntervalMs:', this.#balanceIntervalMs);
    console.log(
      '[RpcDatasource] detectionIntervalMs:',
      this.#detectionIntervalMs,
    );

    // Set polling interval (inherited from base class)
    this.setIntervalLength(mergedConfig.pollingIntervalMs);
    console.log(
      '[RpcDatasource] Polling interval set to:',
      mergedConfig.pollingIntervalMs,
    );

    // Initialize event emitter
    this.#eventEmitter = new RpcEventEmitter();

    // Initialize multicall client with provider getter from dependencies
    this.multicallClient = new MulticallClient(dependencies.getProvider);

    // Initialize token detector
    this.tokenDetector = new TokenDetector(this.multicallClient);
    this.tokenDetector.setTokenListStateGetter(this.#getTokenListState);
    this.tokenDetector.setUserTokensStateGetter(this.#getUserTokensState);

    // Initialize balance fetcher
    this.balanceFetcher = new BalanceFetcher(this.multicallClient);
    this.balanceFetcher.setUserTokensStateGetter(this.#getUserTokensState);

    console.log('[RpcDatasource] Constructor complete');
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Cleanup: stop all polling and remove event listeners.
   */
  destroy(): void {
    this.stopAllPolling();
    this.#eventEmitter.removeAllListeners();
  }

  // ===========================================================================
  // MANUAL OPERATIONS
  // ===========================================================================

  async detectTokens(
    chainId: ChainId,
    accountId: AccountId,
  ): Promise<TokenDetectionResult> {
    const accountAddress = this.#getAccountAddress(accountId);
    if (!accountAddress) {
      throw new Error(`Account not found: ${accountId}`);
    }

    return this.tokenDetector.detectTokens(
      chainId,
      accountId,
      accountAddress as `0x${string}`,
    );
  }

  async fetchBalances(
    chainId: ChainId,
    accountId: AccountId,
  ): Promise<BalanceFetchResult> {
    const accountAddress = this.#getAccountAddress(accountId);
    if (!accountAddress) {
      throw new Error(`Account not found: ${accountId}`);
    }

    return this.balanceFetcher.fetchBalances(
      chainId,
      accountId,
      accountAddress as `0x${string}`,
    );
  }

  // ===========================================================================
  // SUBSCRIPTIONS (delegated to event emitter)
  // ===========================================================================

  onAssetsChanged(callback: OnAssetsChangedCallback): Unsubscribe {
    return this.#eventEmitter.onAssetsChanged(callback);
  }

  onAssetsBalanceChanged(
    callback: OnAssetsBalanceChangedCallback,
  ): Unsubscribe {
    return this.#eventEmitter.onAssetsBalanceChanged(callback);
  }

  onAssetsPriceChanged(callback: OnAssetsPriceChangedCallback): Unsubscribe {
    return this.#eventEmitter.onAssetsPriceChanged(callback);
  }

  // ===========================================================================
  // POLLING EXECUTION (required by base class)
  // ===========================================================================

  async _executePoll(input: PollingInput): Promise<void> {
    const { chainId, accountId } = input;
    const now = Date.now();
    const pollKey = `${chainId}:${accountId}`;

    // Check token detection enabled state dynamically each poll
    const isTokenDetectionEnabled = this.#isTokenDetectionEnabled();

    // Check if enough time has passed for each operation
    const lastBalanceTime = this.#lastBalanceTime.get(pollKey) ?? 0;
    const lastDetectionTime = this.#lastDetectionTime.get(pollKey) ?? 0;

    const shouldFetchBalances =
      now - lastBalanceTime >= this.#balanceIntervalMs;
    const shouldRunDetection =
      isTokenDetectionEnabled &&
      now - lastDetectionTime >= this.#detectionIntervalMs;

    console.log('[RpcDatasource] _executePoll called:', {
      chainId,
      accountId,
      shouldFetchBalances,
      shouldRunDetection,
      timeSinceLastBalance: now - lastBalanceTime,
      timeSinceLastDetection: now - lastDetectionTime,
    });

    // Skip if nothing to do
    if (!shouldFetchBalances && !shouldRunDetection) {
      console.log('[RpcDatasource] Skipping poll - intervals not reached');
      return;
    }

    try {
      const accountAddress = this.#getAccountAddress(accountId);
      console.log('[RpcDatasource] accountAddress:', accountAddress);

      if (!accountAddress) {
        console.warn(`[RpcDatasource] Account not found: ${accountId}`);
        return;
      }

      // Token detection (if enabled and interval reached)
      if (shouldRunDetection) {
        console.log('[RpcDatasource] Starting token detection...');
        const detectionStartTime = performance.now();

        try {
          const detectionResult = await this.tokenDetector.detectTokens(
            chainId,
            accountId,
            accountAddress as `0x${string}`,
          );

          const detectionDuration = performance.now() - detectionStartTime;
          console.log(
            `[RpcDatasource] Token detection completed in ${detectionDuration.toFixed(2)}ms`,
          );

          // Update last detection time
          this.#lastDetectionTime.set(pollKey, now);

          console.log('[RpcDatasource] Detection result:', {
            detectedAssets: detectionResult.detectedAssets.length,
            detectedBalances: detectionResult.detectedBalances.length,
            zeroBalanceAddresses: detectionResult.zeroBalanceAddresses.length,
            failedAddresses: detectionResult.failedAddresses.length,
            durationMs: detectionDuration.toFixed(2),
          });

          if (detectionResult.detectedAssets.length > 0) {
            console.log(
              '[RpcDatasource] Emitting assetsChanged event with',
              detectionResult.detectedAssets.length,
              'assets',
            );
            // Emit assetsChanged for newly detected tokens
            this.#eventEmitter.emitAssetsChanged({
              chainId,
              accountId,
              assets: detectionResult.detectedAssets,
              timestamp: now,
            });

            // Also emit assetsBalanceChanged for detected token balances
            // (we already have the balances from the detection process)
            if (detectionResult.detectedBalances.length > 0) {
              console.log(
                '[RpcDatasource] Emitting assetsBalanceChanged event with',
                detectionResult.detectedBalances.length,
                'balances',
              );
              this.#eventEmitter.emitAssetsBalanceChanged({
                chainId,
                accountId,
                balances: detectionResult.detectedBalances,
                timestamp: now,
              });
            }
          } else {
            console.log('[RpcDatasource] No new assets detected');
          }
        } catch (detectionError) {
          console.error(
            '[RpcDatasource] Token detection error:',
            detectionError,
          );
        }
      } else if (isTokenDetectionEnabled) {
        console.log(
          '[RpcDatasource] Token detection skipped - interval not reached',
        );
      } else {
        console.log('[RpcDatasource] Token detection is disabled');
      }

      // Balance fetching (if interval reached)
      if (shouldFetchBalances) {
        console.log('[RpcDatasource] Starting balance fetching...');
        const balanceStartTime = performance.now();

        try {
          const balanceResult = await this.balanceFetcher.fetchBalances(
            chainId,
            accountId,
            accountAddress as `0x${string}`,
          );

          const balanceDuration = performance.now() - balanceStartTime;
          console.log(
            `[RpcDatasource] Balance fetching completed in ${balanceDuration.toFixed(2)}ms`,
          );

          // Update last balance time
          this.#lastBalanceTime.set(pollKey, now);

          console.log('[RpcDatasource] Balance result:', {
            balances: balanceResult.balances.length,
            failedAddresses: balanceResult.failedAddresses.length,
            durationMs: balanceDuration.toFixed(2),
          });

          if (balanceResult.balances.length > 0) {
            console.log(
              '[RpcDatasource] Emitting assetsBalanceChanged event with',
              balanceResult.balances.length,
              'balances',
            );
            this.#eventEmitter.emitAssetsBalanceChanged({
              chainId,
              accountId,
              balances: balanceResult.balances,
              timestamp: now,
            });
          } else {
            console.log('[RpcDatasource] No balance updates to emit');
          }
        } catch (balanceError) {
          console.error(
            '[RpcDatasource] Balance fetching error:',
            balanceError,
          );
        }
      } else {
        console.log(
          '[RpcDatasource] Balance fetching skipped - interval not reached',
        );
      }
    } catch (error) {
      console.error('[RpcDatasource] Poll error:', error);
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  #getAccountAddress(accountId: AccountId): string | undefined {
    const account = this.#getAccount(accountId);
    return account?.address;
  }
}
