import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';

import { BalanceFetcher } from './BalanceFetcher';
import type {
  BalanceFetchResult,
  IBalanceFetcher,
  IMulticallClient,
  ITokenDetector,
  RpcDatasourceConfig,
  RpcDatasourceDependencies,
  TokenDetectionResult,
} from './interfaces';
import { MulticallClient } from './MulticallClient';
import { RpcEventEmitter } from './RpcEventEmitter';
import { TokenDetector } from './TokenDetector';
import type {
  AccountId,
  ChainId,
  GetAccountFunction,
  OnAssetsBalanceChangedCallback,
  OnAssetsChangedCallback,
  OnAssetsPriceChangedCallback,
  PollingInput,
  TokenListState,
  Unsubscribe,
  UserTokensState,
} from './types';

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: Required<RpcDatasourceConfig> = {
  pollingIntervalMs: 10000, // 10 seconds for faster debugging
  detectionBatchSize: 100,
  balanceBatchSize: 100,
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

  // ===========================================================================
  // PUBLIC READONLY FIELDS (Components)
  // ===========================================================================

  readonly multicallClient: IMulticallClient;

  readonly tokenDetector: ITokenDetector;

  readonly balanceFetcher: IBalanceFetcher;

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

    console.log(
      '[RpcDatasource] isTokenDetectionEnabled provided:',
      Boolean(dependencies.isTokenDetectionEnabled),
    );

    // Set polling interval (inherited from base class)
    this.setIntervalLength(mergedConfig.pollingIntervalMs);
    console.log(
      '[RpcDatasource] Polling interval set to:',
      mergedConfig.pollingIntervalMs,
    );

    // Initialize event emitter
    this.#eventEmitter = new RpcEventEmitter();

    // Initialize or use provided multicall client
    // TODO: Pass actual provider getter
    this.multicallClient =
      dependencies.multicallClient ??
      new MulticallClient(() => {
        throw new Error('Provider not configured');
      });

    // Initialize or use provided token detector
    this.tokenDetector =
      dependencies.tokenDetector ?? new TokenDetector(this.multicallClient);
    this.tokenDetector.setTokenListStateGetter(this.#getTokenListState);
    this.tokenDetector.setUserTokensStateGetter(this.#getUserTokensState);

    // Initialize or use provided balance fetcher
    this.balanceFetcher =
      dependencies.balanceFetcher ?? new BalanceFetcher(this.multicallClient);
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

    // Check token detection enabled state dynamically each poll
    const isTokenDetectionEnabled = this.#isTokenDetectionEnabled();

    console.log('[RpcDatasource] _executePoll called:', { chainId, accountId });
    console.log(
      '[RpcDatasource] isTokenDetectionEnabled:',
      isTokenDetectionEnabled,
    );

    try {
      const accountAddress = this.#getAccountAddress(accountId);
      console.log('[RpcDatasource] accountAddress:', accountAddress);

      if (!accountAddress) {
        console.warn(`[RpcDatasource] Account not found: ${accountId}`);
        return;
      }

      // Token detection (if enabled - checked dynamically each poll)
      if (isTokenDetectionEnabled) {
        console.log('[RpcDatasource] Starting token detection...');
        const detectionResult = await this.tokenDetector.detectTokens(
          chainId,
          accountId,
          accountAddress as `0x${string}`,
        );

        console.log('[RpcDatasource] Detection result:', {
          detectedAssets: detectionResult.detectedAssets.length,
          detectedBalances: detectionResult.detectedBalances.length,
          zeroBalanceAddresses: detectionResult.zeroBalanceAddresses.length,
          failedAddresses: detectionResult.failedAddresses.length,
        });

        if (detectionResult.detectedAssets.length > 0) {
          // Emit assetsChanged for newly detected tokens
          this.#eventEmitter.emitAssetsChanged({
            chainId,
            accountId,
            assets: detectionResult.detectedAssets,
            timestamp: Date.now(),
          });

          // Also emit assetsBalanceChanged for detected token balances
          // (we already have the balances from the detection process)
          if (detectionResult.detectedBalances.length > 0) {
            this.#eventEmitter.emitAssetsBalanceChanged({
              chainId,
              accountId,
              balances: detectionResult.detectedBalances,
              timestamp: Date.now(),
            });
          }
        }
      } else {
        console.log('[RpcDatasource] Token detection is disabled');
      }

      // Balance fetching (always enabled)
      console.log('[RpcDatasource] Starting balance fetching...');
      const balanceResult = await this.balanceFetcher.fetchBalances(
        chainId,
        accountId,
        accountAddress as `0x${string}`,
      );

      console.log('[RpcDatasource] Balance result:', {
        balances: balanceResult.balances.length,
        failedAddresses: balanceResult.failedAddresses.length,
      });

      if (balanceResult.balances.length > 0) {
        this.#eventEmitter.emitAssetsBalanceChanged({
          chainId,
          accountId,
          balances: balanceResult.balances,
          timestamp: Date.now(),
        });
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
