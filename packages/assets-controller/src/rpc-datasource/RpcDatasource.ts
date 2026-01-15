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
  pollingIntervalMs: 30000,
  detectTokensEnabled: false,
  fetchBalancesEnabled: true,
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

  #detectTokensEnabled: boolean;

  #fetchBalancesEnabled: boolean;

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

    // Merge config with defaults
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // Store dependencies
    this.#getAccount = dependencies.getAccount;
    this.#getTokenListState = dependencies.getTokenListState;
    this.#getUserTokensState = dependencies.getUserTokensState;

    // Initialize state
    this.#detectTokensEnabled = mergedConfig.detectTokensEnabled;
    this.#fetchBalancesEnabled = mergedConfig.fetchBalancesEnabled;

    // Set polling interval (inherited from base class)
    this.setIntervalLength(mergedConfig.pollingIntervalMs);

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
  // CONFIGURATION
  // ===========================================================================

  setDetectTokensEnabled(enabled: boolean): void {
    this.#detectTokensEnabled = enabled;
  }

  setFetchBalancesEnabled(enabled: boolean): void {
    this.#fetchBalancesEnabled = enabled;
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

    return this.tokenDetector.detectTokens(chainId, accountId, accountAddress);
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
      accountAddress,
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

    try {
      const accountAddress = this.#getAccountAddress(accountId);
      if (!accountAddress) {
        console.warn(`RpcDatasource: Account not found: ${accountId}`);
        return;
      }

      // Token detection (if enabled)
      if (this.#detectTokensEnabled) {
        const detectionResult = await this.tokenDetector.detectTokens(
          chainId,
          accountId,
          accountAddress,
        );

        if (detectionResult.detectedAssets.length > 0) {
          this.#eventEmitter.emitAssetsChanged({
            chainId,
            accountId,
            assets: detectionResult.detectedAssets,
            timestamp: Date.now(),
          });
        }
      }

      // Balance fetching (if enabled)
      if (this.#fetchBalancesEnabled) {
        const balanceResult = await this.balanceFetcher.fetchBalances(
          chainId,
          accountId,
          accountAddress,
        );

        if (balanceResult.balances.length > 0) {
          this.#eventEmitter.emitAssetsBalanceChanged({
            chainId,
            accountId,
            balances: balanceResult.balances,
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error('RpcDatasource: Poll error:', error);
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
