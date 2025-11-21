import { Web3Provider } from '@ethersproject/providers';
import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListAccountsAction,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import {
  BNToHex,
  isValidHexAddress,
  safelyExecuteWithTimeout,
  toChecksumHexAddress,
  toHex,
} from '@metamask/controller-utils';
import type {
  BalanceUpdate,
  AccountActivityServiceBalanceUpdatedEvent,
  AccountActivityServiceStatusChangedEvent,
} from '@metamask/core-backend';
import type { KeyringControllerAccountRemovedEvent } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
  NetworkState,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  PreferencesControllerGetStateAction,
  PreferencesControllerStateChangeEvent,
} from '@metamask/preferences-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { Hex } from '@metamask/utils';
import {
  isCaipAssetType,
  isCaipChainId,
  isStrictHexString,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';
import { produce } from 'immer';
import { isEqual } from 'lodash';

import type {
  AccountTrackerControllerGetStateAction,
  AccountTrackerUpdateNativeBalancesAction,
  AccountTrackerUpdateStakedBalancesAction,
} from './AccountTrackerController';
import { STAKING_CONTRACT_ADDRESS_BY_CHAINID } from './AssetsContractController';
import {
  AccountsApiBalanceFetcher,
  type BalanceFetcher,
  type ProcessedBalance,
} from './multi-chain-accounts-service/api-balance-fetcher';
import { RpcBalanceFetcher } from './rpc-service/rpc-balance-fetcher';
import type { TokenDetectionControllerAddDetectedTokensViaWsAction } from './TokenDetectionController';
import type {
  TokensControllerGetStateAction,
  TokensControllerState,
  TokensControllerStateChangeEvent,
} from './TokensController';

export type ChainIdHex = Hex;
export type ChecksumAddress = Hex;

const CONTROLLER = 'TokenBalancesController' as const;
const DEFAULT_INTERVAL_MS = 30_000; // 30 seconds
const DEFAULT_WEBSOCKET_ACTIVE_POLLING_INTERVAL_MS = 300_000; // 5 minutes

const metadata: StateMetadata<TokenBalancesControllerState> = {
  tokenBalances: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

// account → chain → token → balance
export type TokenBalances = Record<
  ChecksumAddress,
  Record<ChainIdHex, Record<ChecksumAddress, Hex>>
>;

export type TokenBalancesControllerState = {
  tokenBalances: TokenBalances;
};

export type TokenBalancesControllerGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER,
  TokenBalancesControllerState
>;

export type TokenBalancesControllerUpdateChainPollingConfigsAction = {
  type: `TokenBalancesController:updateChainPollingConfigs`;
  handler: TokenBalancesController['updateChainPollingConfigs'];
};

export type TokenBalancesControllerGetChainPollingConfigAction = {
  type: `TokenBalancesController:getChainPollingConfig`;
  handler: TokenBalancesController['getChainPollingConfig'];
};

export type TokenBalancesControllerActions =
  | TokenBalancesControllerGetStateAction
  | TokenBalancesControllerUpdateChainPollingConfigsAction
  | TokenBalancesControllerGetChainPollingConfigAction;

export type TokenBalancesControllerStateChangeEvent =
  ControllerStateChangeEvent<typeof CONTROLLER, TokenBalancesControllerState>;

export type NativeBalanceEvent = {
  type: `${typeof CONTROLLER}:updatedNativeBalance`;
  payload: unknown[];
};

export type TokenBalancesControllerEvents =
  | TokenBalancesControllerStateChangeEvent
  | NativeBalanceEvent;

export type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction
  | TokensControllerGetStateAction
  | TokenDetectionControllerAddDetectedTokensViaWsAction
  | PreferencesControllerGetStateAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerListAccountsAction
  | AccountTrackerControllerGetStateAction
  | AccountTrackerUpdateNativeBalancesAction
  | AccountTrackerUpdateStakedBalancesAction
  | AuthenticationController.AuthenticationControllerGetBearerToken;

export type AllowedEvents =
  | TokensControllerStateChangeEvent
  | PreferencesControllerStateChangeEvent
  | NetworkControllerStateChangeEvent
  | KeyringControllerAccountRemovedEvent
  | AccountActivityServiceBalanceUpdatedEvent
  | AccountActivityServiceStatusChangedEvent;

export type TokenBalancesControllerMessenger = Messenger<
  typeof CONTROLLER,
  TokenBalancesControllerActions | AllowedActions,
  TokenBalancesControllerEvents | AllowedEvents
>;

export type ChainPollingConfig = {
  /** Polling interval in milliseconds for this chain */
  interval: number;
};

export type UpdateChainPollingConfigsOptions = {
  /** Whether to immediately fetch balances after updating configs (default: true) */
  immediateUpdate?: boolean;
};

export type TokenBalancesControllerOptions = {
  messenger: TokenBalancesControllerMessenger;
  /** Default interval for chains not specified in chainPollingIntervals */
  interval?: number;
  /** Per-chain polling configuration */
  chainPollingIntervals?: Record<ChainIdHex, ChainPollingConfig>;
  state?: Partial<TokenBalancesControllerState>;
  /** When `true`, balances for *all* known accounts are queried. */
  queryMultipleAccounts?: boolean;
  /** Array of chainIds that should use Accounts-API strategy (if supported by API). */
  accountsApiChainIds?: () => ChainIdHex[];
  /** Disable external HTTP calls (privacy / offline mode). */
  allowExternalServices?: () => boolean;
  /** Custom logger. */
  log?: (...args: unknown[]) => void;
  platform?: 'extension' | 'mobile';
  /** Polling interval when WebSocket is active and providing real-time updates */
  websocketActivePollingInterval?: number;
};
// endregion

// ────────────────────────────────────────────────────────────────────────────
// region: Helper utilities
const draft = <T>(base: T, fn: (d: T) => void): T => produce(base, fn);

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as ChecksumAddress;

const checksum = (addr: string): ChecksumAddress =>
  toChecksumHexAddress(addr) as ChecksumAddress;

/**
 * Convert CAIP chain ID or hex chain ID to hex chain ID
 * Handles both CAIP-2 format (e.g., "eip155:1") and hex format (e.g., "0x1")
 *
 * @param chainId - CAIP chain ID (e.g., "eip155:1") or hex chain ID (e.g., "0x1")
 * @returns Hex chain ID (e.g., "0x1")
 * @throws {Error} If chainId is neither a valid CAIP-2 chain ID nor a hex string
 */
export const caipChainIdToHex = (chainId: string): ChainIdHex => {
  if (isStrictHexString(chainId)) {
    return chainId;
  }

  if (isCaipChainId(chainId)) {
    return toHex(parseCaipChainId(chainId).reference);
  }

  throw new Error('caipChainIdToHex - Failed to provide CAIP-2 or Hex chainId');
};

/**
 * Extract token address from asset type
 * Returns tuple of [tokenAddress, isNativeToken] or null if invalid
 *
 * @param assetType - Asset type string (e.g., 'eip155:1/erc20:0x...' or 'eip155:1/slip44:60')
 * @returns Tuple of [tokenAddress, isNativeToken] or null if invalid
 */
export const parseAssetType = (assetType: string): [string, boolean] | null => {
  if (!isCaipAssetType(assetType)) {
    return null;
  }

  const parsed = parseCaipAssetType(assetType);

  // ERC20 token (e.g., "eip155:1/erc20:0x...")
  if (parsed.assetNamespace === 'erc20') {
    return [parsed.assetReference, false];
  }

  // Native token (e.g., "eip155:1/slip44:60")
  if (parsed.assetNamespace === 'slip44') {
    return [ZERO_ADDRESS, true];
  }

  return null;
};
// endregion

// ────────────────────────────────────────────────────────────────────────────
// region: Main controller
export class TokenBalancesController extends StaticIntervalPollingController<{
  chainIds: ChainIdHex[];
}>()<
  typeof CONTROLLER,
  TokenBalancesControllerState,
  TokenBalancesControllerMessenger
> {
  readonly #platform: 'extension' | 'mobile';

  readonly #queryAllAccounts: boolean;

  readonly #accountsApiChainIds: () => ChainIdHex[];

  readonly #balanceFetchers: BalanceFetcher[];

  #allTokens: TokensControllerState['allTokens'] = {};

  #detectedTokens: TokensControllerState['allDetectedTokens'] = {};

  #allIgnoredTokens: TokensControllerState['allIgnoredTokens'] = {};

  /** Default polling interval for chains without specific configuration */
  readonly #defaultInterval: number;

  /** Polling interval when WebSocket is active and providing real-time updates */
  readonly #websocketActivePollingInterval: number;

  /** Per-chain polling configuration */
  readonly #chainPollingConfig: Record<ChainIdHex, ChainPollingConfig>;

  /** Active polling timers grouped by interval */
  readonly #intervalPollingTimers: Map<number, NodeJS.Timeout> = new Map();

  /** Track if controller-level polling is active */
  #isControllerPollingActive = false;

  /** Store original chainIds from startPolling to preserve intent */
  #requestedChainIds: ChainIdHex[] = [];

  /** Debouncing for rapid status changes to prevent excessive HTTP calls */
  readonly #statusChangeDebouncer: {
    timer: NodeJS.Timeout | null;
    pendingChanges: Map<string, 'up' | 'down'>;
  } = {
    timer: null,
    pendingChanges: new Map(),
  };

  constructor({
    messenger,
    interval = DEFAULT_INTERVAL_MS,
    websocketActivePollingInterval = DEFAULT_WEBSOCKET_ACTIVE_POLLING_INTERVAL_MS,
    chainPollingIntervals = {},
    state = {},
    queryMultipleAccounts = true,
    accountsApiChainIds = () => [],
    allowExternalServices = () => true,
    platform,
  }: TokenBalancesControllerOptions) {
    super({
      name: CONTROLLER,
      messenger,
      metadata,
      state: { tokenBalances: {}, ...state },
    });

    this.#platform = platform ?? 'extension';
    this.#queryAllAccounts = queryMultipleAccounts;
    this.#accountsApiChainIds = accountsApiChainIds;
    this.#defaultInterval = interval;
    this.#websocketActivePollingInterval = websocketActivePollingInterval;
    this.#chainPollingConfig = { ...chainPollingIntervals };

    // Strategy order: API first, then RPC fallback
    this.#balanceFetchers = [
      ...(accountsApiChainIds().length > 0 && allowExternalServices()
        ? [this.#createAccountsApiFetcher()]
        : []),
      new RpcBalanceFetcher(this.#getProvider, this.#getNetworkClient, () => ({
        allTokens: this.#allTokens,
        allDetectedTokens: this.#detectedTokens,
      })),
    ];

    this.setIntervalLength(interval);

    // initial token state & subscriptions
    const { allTokens, allDetectedTokens, allIgnoredTokens } =
      this.messenger.call('TokensController:getState');
    this.#allTokens = allTokens;
    this.#detectedTokens = allDetectedTokens;
    this.#allIgnoredTokens = allIgnoredTokens;

    this.messenger.subscribe(
      'TokensController:stateChange',
      (tokensState: TokensControllerState) => {
        this.#onTokensChanged(tokensState).catch((error) => {
          console.warn('Error handling token state change:', error);
        });
      },
    );
    this.messenger.subscribe(
      'NetworkController:stateChange',
      this.#onNetworkChanged,
    );
    this.messenger.subscribe(
      'KeyringController:accountRemoved',
      this.#onAccountRemoved,
    );

    // Register action handlers for polling interval control
    this.messenger.registerActionHandler(
      `TokenBalancesController:updateChainPollingConfigs`,
      this.updateChainPollingConfigs.bind(this),
    );

    this.messenger.registerActionHandler(
      `TokenBalancesController:getChainPollingConfig`,
      this.getChainPollingConfig.bind(this),
    );

    // Subscribe to AccountActivityService balance updates for real-time updates
    this.messenger.subscribe(
      'AccountActivityService:balanceUpdated',
      this.#onAccountActivityBalanceUpdate.bind(this),
    );

    // Subscribe to AccountActivityService status changes for dynamic polling management
    this.messenger.subscribe(
      'AccountActivityService:statusChanged',
      this.#onAccountActivityStatusChanged.bind(this),
    );
  }

  #chainIdsWithTokens(): ChainIdHex[] {
    return [
      ...new Set([
        ...Object.keys(this.#allTokens),
        ...Object.keys(this.#detectedTokens),
      ]),
    ] as ChainIdHex[];
  }

  readonly #getProvider = (chainId: ChainIdHex): Web3Provider => {
    const { networkConfigurationsByChainId } = this.messenger.call(
      'NetworkController:getState',
    );
    const cfg = networkConfigurationsByChainId[chainId];
    const { networkClientId } = cfg.rpcEndpoints[cfg.defaultRpcEndpointIndex];
    const client = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    return new Web3Provider(client.provider);
  };

  readonly #getNetworkClient = (chainId: ChainIdHex) => {
    const { networkConfigurationsByChainId } = this.messenger.call(
      'NetworkController:getState',
    );
    const cfg = networkConfigurationsByChainId[chainId];
    const { networkClientId } = cfg.rpcEndpoints[cfg.defaultRpcEndpointIndex];
    return this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
  };

  /**
   * Creates an AccountsApiBalanceFetcher that only supports chains in the accountsApiChainIds array
   *
   * @returns A BalanceFetcher that wraps AccountsApiBalanceFetcher with chainId filtering
   */
  readonly #createAccountsApiFetcher = (): BalanceFetcher => {
    const originalFetcher = new AccountsApiBalanceFetcher(
      this.#platform,
      this.#getProvider,
    );

    return {
      supports: (chainId: ChainIdHex): boolean => {
        // Only support chains that are both:
        // 1. In our specified accountsApiChainIds array
        // 2. Actually supported by the AccountsApi
        return (
          this.#accountsApiChainIds().includes(chainId) &&
          originalFetcher.supports(chainId)
        );
      },
      fetch: originalFetcher.fetch.bind(originalFetcher),
    };
  };

  /**
   * Override to support per-chain polling intervals by grouping chains by interval
   *
   * @param options0 - The polling options
   * @param options0.chainIds - Chain IDs to start polling for
   */
  override _startPolling({ chainIds }: { chainIds: ChainIdHex[] }) {
    // Store the original chainIds to preserve intent across config updates
    this.#requestedChainIds = [...chainIds];
    this.#isControllerPollingActive = true;
    this.#startIntervalGroupPolling(chainIds, true);
  }

  /**
   * Start or restart interval-based polling for multiple chains
   *
   * @param chainIds - Chain IDs to start polling for
   * @param immediate - Whether to poll immediately before starting timers (default: true)
   */
  #startIntervalGroupPolling(chainIds: ChainIdHex[], immediate = true) {
    // Stop any existing interval timers
    this.#intervalPollingTimers.forEach((timer) => clearInterval(timer));
    this.#intervalPollingTimers.clear();

    // Group chains by their polling intervals
    const intervalGroups = new Map<number, ChainIdHex[]>();

    for (const chainId of chainIds) {
      const config = this.getChainPollingConfig(chainId);
      const existing = intervalGroups.get(config.interval) || [];
      existing.push(chainId);
      intervalGroups.set(config.interval, existing);
    }

    // Start separate polling loop for each interval group
    for (const [interval, chainIdsGroup] of intervalGroups) {
      this.#startPollingForInterval(interval, chainIdsGroup, immediate);
    }
  }

  /**
   * Start polling loop for chains that share the same interval
   *
   * @param interval - The polling interval in milliseconds
   * @param chainIds - Chain IDs that share this interval
   * @param immediate - Whether to poll immediately before starting the timer (default: true)
   */
  #startPollingForInterval(
    interval: number,
    chainIds: ChainIdHex[],
    immediate = true,
  ) {
    const pollFunction = async () => {
      if (!this.#isControllerPollingActive) {
        return;
      }
      try {
        await this._executePoll({ chainIds });
      } catch (error) {
        console.warn(
          `Polling failed for chains ${chainIds.join(', ')} with interval ${interval}:`,
          error,
        );
      }
    };

    // Poll immediately first if requested
    if (immediate) {
      pollFunction().catch((error) => {
        console.warn(
          `Immediate polling failed for chains ${chainIds.join(', ')}:`,
          error,
        );
      });
    }

    // Then start regular interval polling
    this.#setPollingTimer(interval, chainIds, pollFunction);
  }

  /**
   * Helper method to set up polling timer
   *
   * @param interval - The polling interval in milliseconds
   * @param chainIds - Chain IDs for this interval
   * @param pollFunction - The function to call on each poll
   */
  #setPollingTimer(
    interval: number,
    chainIds: ChainIdHex[],
    pollFunction: () => Promise<void>,
  ) {
    // Clear any existing timer for this interval first
    const existingTimer = this.#intervalPollingTimers.get(interval);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    const timer = setInterval(() => {
      pollFunction().catch((error) => {
        console.warn(
          `Interval polling failed for chains ${chainIds.join(', ')}:`,
          error,
        );
      });
    }, interval);
    this.#intervalPollingTimers.set(interval, timer);
  }

  /**
   * Override to handle our custom polling approach
   *
   * @param tokenSetId - The token set ID to stop polling for
   */
  override _stopPollingByPollingTokenSetId(tokenSetId: string) {
    let parsedTokenSetId;
    let chainsToStop: ChainIdHex[] = [];

    try {
      parsedTokenSetId = JSON.parse(tokenSetId);
      chainsToStop = parsedTokenSetId.chainIds || [];
    } catch (error) {
      console.warn('Failed to parse tokenSetId, stopping all polling:', error);
      // Fallback: stop all polling if we can't parse the tokenSetId
      this.#isControllerPollingActive = false;
      this.#requestedChainIds = [];
      this.#intervalPollingTimers.forEach((timer) => clearInterval(timer));
      this.#intervalPollingTimers.clear();
      return;
    }

    // Compare with current chains - only stop if it matches our current session
    const currentChainsSet = new Set(this.#requestedChainIds);
    const stopChainsSet = new Set(chainsToStop);

    // Check if this stop request is for our current session
    const isCurrentSession =
      currentChainsSet.size === stopChainsSet.size &&
      [...currentChainsSet].every((chain) => stopChainsSet.has(chain));

    if (isCurrentSession) {
      this.#isControllerPollingActive = false;
      this.#requestedChainIds = [];
      this.#intervalPollingTimers.forEach((timer) => clearInterval(timer));
      this.#intervalPollingTimers.clear();
    }
  }

  /**
   * Get polling configuration for a chain (includes default fallback)
   *
   * @param chainId - The chain ID to get config for
   * @returns The polling configuration for the chain
   */
  getChainPollingConfig(chainId: ChainIdHex): ChainPollingConfig {
    return (
      this.#chainPollingConfig[chainId] ?? {
        interval: this.#defaultInterval,
      }
    );
  }

  override async _executePoll({
    chainIds,
    queryAllAccounts = false,
  }: {
    chainIds: ChainIdHex[];
    queryAllAccounts?: boolean;
  }) {
    // This won't be called with our custom implementation, but keep for compatibility
    await this.updateBalances({ chainIds, queryAllAccounts });
  }

  /**
   * Update multiple chain polling configurations at once
   *
   * @param configs - Object mapping chain IDs to polling configurations
   * @param options - Optional configuration for the update behavior
   * @param options.immediateUpdate - Whether to immediately fetch balances after updating configs (default: true)
   */
  updateChainPollingConfigs(
    configs: Record<ChainIdHex, ChainPollingConfig>,
    options: UpdateChainPollingConfigsOptions = { immediateUpdate: true },
  ): void {
    Object.assign(this.#chainPollingConfig, configs);

    // If polling is currently active, restart with new interval groupings
    if (this.#isControllerPollingActive) {
      // Restart polling with immediate fetch by default, unless explicitly disabled
      this.#startIntervalGroupPolling(
        this.#requestedChainIds,
        options.immediateUpdate,
      );
    }
  }

  async updateBalances({
    chainIds,
    queryAllAccounts = false,
  }: { chainIds?: ChainIdHex[]; queryAllAccounts?: boolean } = {}) {
    const targetChains = chainIds ?? this.#chainIdsWithTokens();
    if (!targetChains.length) {
      return;
    }

    const { address: selected } = this.messenger.call(
      'AccountsController:getSelectedAccount',
    );
    const allAccounts = this.messenger.call('AccountsController:listAccounts');

    const jwtToken = await safelyExecuteWithTimeout<string | undefined>(
      () => {
        return this.messenger.call('AuthenticationController:getBearerToken');
      },
      false,
      5000,
    );

    const aggregated: ProcessedBalance[] = [];
    let remainingChains = [...targetChains];

    // Try each fetcher in order, removing successfully processed chains
    for (const fetcher of this.#balanceFetchers) {
      const supportedChains = remainingChains.filter((c) =>
        fetcher.supports(c),
      );
      if (!supportedChains.length) {
        continue;
      }

      try {
        const result = await fetcher.fetch({
          chainIds: supportedChains,
          queryAllAccounts: queryAllAccounts ?? this.#queryAllAccounts,
          selectedAccount: selected as ChecksumAddress,
          allAccounts,
          jwtToken,
        });

        if (result.balances && result.balances.length > 0) {
          aggregated.push(...result.balances);
          // Remove chains that were successfully processed
          const processedChains = new Set(
            result.balances.map((b) => b.chainId),
          );
          remainingChains = remainingChains.filter(
            (chain) => !processedChains.has(chain),
          );
        }

        // Add unprocessed chains back to remainingChains for next fetcher
        if (
          result.unprocessedChainIds &&
          result.unprocessedChainIds.length > 0
        ) {
          const currentRemainingChains = remainingChains;
          const chainsToAdd = result.unprocessedChainIds.filter(
            (chainId) =>
              supportedChains.includes(chainId) &&
              !currentRemainingChains.includes(chainId),
          );
          remainingChains.push(...chainsToAdd);
        }
      } catch (error) {
        console.warn(
          `Balance fetcher failed for chains ${supportedChains.join(', ')}: ${String(error)}`,
        );
        // Continue to next fetcher (fallback)
      }

      // If all chains have been processed, break early
      if (remainingChains.length === 0) {
        break;
      }
    }

    // Determine which accounts to process based on queryAllAccounts parameter
    const accountsToProcess =
      (queryAllAccounts ?? this.#queryAllAccounts)
        ? allAccounts.map((a) => a.address as ChecksumAddress)
        : [selected as ChecksumAddress];

    const prev = this.state;
    const next = draft(prev, (d) => {
      // Initialize account and chain structures if they don't exist, but preserve existing balances
      for (const chainId of targetChains) {
        for (const account of accountsToProcess) {
          // Ensure the nested structure exists without overwriting existing balances
          d.tokenBalances[account] ??= {};
          d.tokenBalances[account][chainId] ??= {};
          // Initialize tokens from allTokens only if they don't exist yet
          const chainTokens = this.#allTokens[chainId];
          if (chainTokens?.[account]) {
            Object.values(chainTokens[account]).forEach(
              (token: { address: string }) => {
                const tokenAddress = checksum(token.address);
                // Only initialize if the token balance doesn't exist yet
                if (!(tokenAddress in d.tokenBalances[account][chainId])) {
                  d.tokenBalances[account][chainId][tokenAddress] = '0x0';
                }
              },
            );
          }

          // Initialize tokens from allDetectedTokens only if they don't exist yet
          const detectedChainTokens = this.#detectedTokens[chainId];
          if (detectedChainTokens?.[account]) {
            Object.values(detectedChainTokens[account]).forEach(
              (token: { address: string }) => {
                const tokenAddress = checksum(token.address);
                // Only initialize if the token balance doesn't exist yet
                if (!(tokenAddress in d.tokenBalances[account][chainId])) {
                  d.tokenBalances[account][chainId][tokenAddress] = '0x0';
                }
              },
            );
          }
        }
      }

      // Update with actual fetched balances only if the value has changed
      aggregated.forEach(({ success, value, account, token, chainId }) => {
        if (success && value !== undefined) {
          // Ensure all accounts we add/update are in lower-case
          const lowerCaseAccount = account.toLowerCase() as ChecksumAddress;
          const newBalance = toHex(value);
          const tokenAddress = checksum(token);
          const currentBalance =
            d.tokenBalances[lowerCaseAccount]?.[chainId]?.[tokenAddress];

          // Only update if the balance has actually changed
          if (currentBalance !== newBalance) {
            ((d.tokenBalances[lowerCaseAccount] ??= {})[chainId] ??= {})[
              tokenAddress
            ] = newBalance;
          }
        }
      });
    });

    if (!isEqual(prev, next)) {
      this.update(() => next);

      const nativeBalances = aggregated.filter(
        (r) => r.success && r.token === ZERO_ADDRESS,
      );

      // Get current AccountTracker state to compare existing balances
      const accountTrackerState = this.messenger.call(
        'AccountTrackerController:getState',
      );

      // Update native token balances only if they have changed
      if (nativeBalances.length > 0) {
        const balanceUpdates = nativeBalances
          .map((balance) => ({
            address: balance.account,
            chainId: balance.chainId,
            balance: balance.value ? BNToHex(balance.value) : '0x0',
          }))
          .filter((update) => {
            const currentBalance =
              accountTrackerState.accountsByChainId[update.chainId]?.[
                checksum(update.address)
              ]?.balance;
            // Only include if the balance has actually changed
            return currentBalance !== update.balance;
          });

        if (balanceUpdates.length > 0) {
          this.messenger.call(
            'AccountTrackerController:updateNativeBalances',
            balanceUpdates,
          );
        }
      }

      // Filter and update staked balances in a single batch operation for better performance
      const stakedBalances = aggregated.filter((r) => {
        if (!r.success || r.token === ZERO_ADDRESS) {
          return false;
        }

        // Check if the chainId and token address match any staking contract
        const stakingContractAddress =
          STAKING_CONTRACT_ADDRESS_BY_CHAINID[
            r.chainId as keyof typeof STAKING_CONTRACT_ADDRESS_BY_CHAINID
          ];
        return (
          stakingContractAddress &&
          stakingContractAddress.toLowerCase() === r.token.toLowerCase()
        );
      });

      if (stakedBalances.length > 0) {
        const stakedBalanceUpdates = stakedBalances
          .map((balance) => ({
            address: balance.account,
            chainId: balance.chainId,
            stakedBalance: balance.value ? toHex(balance.value) : '0x0',
          }))
          .filter((update) => {
            const currentStakedBalance =
              accountTrackerState.accountsByChainId[update.chainId]?.[
                checksum(update.address)
              ]?.stakedBalance;
            // Only include if the staked balance has actually changed
            return currentStakedBalance !== update.stakedBalance;
          });

        if (stakedBalanceUpdates.length > 0) {
          this.messenger.call(
            'AccountTrackerController:updateStakedBalances',
            stakedBalanceUpdates,
          );
        }
      }
    }
  }

  resetState() {
    this.update(() => ({ tokenBalances: {} }));
  }

  /**
   * Helper method to check if a token is tracked (exists in allTokens or allIgnoredTokens)
   *
   * @param tokenAddress - The token address to check
   * @param account - The account address
   * @param chainId - The chain ID
   * @returns True if the token is tracked (imported or ignored)
   */
  #isTokenTracked(
    tokenAddress: string,
    account: ChecksumAddress,
    chainId: ChainIdHex,
  ): boolean {
    // Check if token exists in allTokens
    if (
      this.#allTokens?.[chainId]?.[account.toLowerCase()]?.some(
        (token) => token.address === tokenAddress,
      )
    ) {
      return true;
    }

    // Check if token exists in allIgnoredTokens
    if (
      this.#allIgnoredTokens?.[chainId]?.[account.toLowerCase()]?.some(
        (token) => token === tokenAddress,
      )
    ) {
      return true;
    }

    return false;
  }

  readonly #onTokensChanged = async (state: TokensControllerState) => {
    const changed: ChainIdHex[] = [];
    let hasChanges = false;

    // Get chains that have existing balances
    const chainsWithBalances = new Set<ChainIdHex>();
    for (const address of Object.keys(this.state.tokenBalances)) {
      const addressKey = address as ChecksumAddress;
      for (const chainId of Object.keys(
        this.state.tokenBalances[addressKey] || {},
      )) {
        chainsWithBalances.add(chainId as ChainIdHex);
      }
    }

    // Only process chains that are explicitly mentioned in the incoming state change
    const incomingChainIds = new Set([
      ...Object.keys(state.allTokens),
      ...Object.keys(state.allDetectedTokens),
    ]);

    // Only proceed if there are actual changes to chains that have balances or are being added
    const relevantChainIds = Array.from(incomingChainIds).filter((chainId) => {
      const id = chainId as ChainIdHex;

      const hasTokensNow =
        (state.allTokens[id] && Object.keys(state.allTokens[id]).length > 0) ||
        (state.allDetectedTokens[id] &&
          Object.keys(state.allDetectedTokens[id]).length > 0);
      const hadTokensBefore =
        (this.#allTokens[id] && Object.keys(this.#allTokens[id]).length > 0) ||
        (this.#detectedTokens[id] &&
          Object.keys(this.#detectedTokens[id]).length > 0);

      // Check if there's an actual change in token state
      const hasTokenChange =
        !isEqual(state.allTokens[id], this.#allTokens[id]) ||
        !isEqual(state.allDetectedTokens[id], this.#detectedTokens[id]);

      // Process chains that have actual changes OR are new chains getting tokens
      return hasTokenChange || (!hadTokensBefore && hasTokensNow);
    });

    if (relevantChainIds.length === 0) {
      // No relevant changes, just update internal state
      this.#allTokens = state.allTokens;
      this.#detectedTokens = state.allDetectedTokens;
      return;
    }

    // Handle both cleanup and updates in a single state update
    this.update((s) => {
      for (const chainId of relevantChainIds) {
        const id = chainId as ChainIdHex;
        const hasTokensNow =
          (state.allTokens[id] &&
            Object.keys(state.allTokens[id]).length > 0) ||
          (state.allDetectedTokens[id] &&
            Object.keys(state.allDetectedTokens[id]).length > 0);
        const hadTokensBefore =
          (this.#allTokens[id] &&
            Object.keys(this.#allTokens[id]).length > 0) ||
          (this.#detectedTokens[id] &&
            Object.keys(this.#detectedTokens[id]).length > 0);

        if (
          !isEqual(state.allTokens[id], this.#allTokens[id]) ||
          !isEqual(state.allDetectedTokens[id], this.#detectedTokens[id])
        ) {
          if (hasTokensNow) {
            // Chain still has tokens - mark for async balance update
            changed.push(id);
          } else if (hadTokensBefore) {
            // Chain had tokens before but doesn't now - clean up balances immediately
            for (const address of Object.keys(s.tokenBalances)) {
              const addressKey = address as ChecksumAddress;
              if (s.tokenBalances[addressKey]?.[id]) {
                s.tokenBalances[addressKey][id] = {};
                hasChanges = true;
              }
            }
          }
        }
      }
    });

    this.#allTokens = state.allTokens;
    this.#detectedTokens = state.allDetectedTokens;
    this.#allIgnoredTokens = state.allIgnoredTokens;

    // Only update balances for chains that still have tokens (and only if we haven't already updated state)
    if (changed.length && !hasChanges) {
      this.updateBalances({ chainIds: changed }).catch((error) => {
        console.warn('Error updating balances after token change:', error);
      });
    }
  };

  readonly #onNetworkChanged = (state: NetworkState) => {
    // Check if any networks were removed by comparing with previous state
    const currentNetworks = new Set(
      Object.keys(state.networkConfigurationsByChainId),
    );

    // Get all networks that currently have balances
    const networksWithBalances = new Set<string>();
    for (const address of Object.keys(this.state.tokenBalances)) {
      const addressKey = address as ChecksumAddress;
      for (const network of Object.keys(
        this.state.tokenBalances[addressKey] || {},
      )) {
        networksWithBalances.add(network);
      }
    }

    // Find networks that were removed
    const removedNetworks = Array.from(networksWithBalances).filter(
      (network) => !currentNetworks.has(network),
    );

    if (removedNetworks.length > 0) {
      this.update((s) => {
        // Remove balances for all accounts on the deleted networks
        for (const address of Object.keys(s.tokenBalances)) {
          const addressKey = address as ChecksumAddress;
          for (const removedNetwork of removedNetworks) {
            const networkKey = removedNetwork as ChainIdHex;
            if (s.tokenBalances[addressKey]?.[networkKey]) {
              delete s.tokenBalances[addressKey][networkKey];
            }
          }
        }
      });
    }
  };

  readonly #onAccountRemoved = (addr: string) => {
    if (!isStrictHexString(addr) || !isValidHexAddress(addr)) {
      return;
    }
    this.update((s) => {
      delete s.tokenBalances[addr as ChecksumAddress];
    });
  };

  // ────────────────────────────────────────────────────────────────────────────
  // AccountActivityService integration helpers

  /**
   * Prepare balance updates from AccountActivityService
   * Processes all updates and returns categorized results
   * Throws an error if any updates have validation/parsing issues
   *
   * @param updates - Array of balance updates from AccountActivityService
   * @param account - Lowercase account address (for consistency with tokenBalances state format)
   * @param chainId - Hex chain ID
   * @returns Object containing arrays of token balances, new token addresses to add, and native balance updates
   * @throws Error if any balance update has validation or parsing errors
   */
  #prepareBalanceUpdates(
    updates: BalanceUpdate[],
    account: ChecksumAddress,
    chainId: ChainIdHex,
  ): {
    tokenBalances: { tokenAddress: ChecksumAddress; balance: Hex }[];
    newTokens: string[];
    nativeBalanceUpdates: { address: string; chainId: Hex; balance: Hex }[];
  } {
    const tokenBalances: { tokenAddress: ChecksumAddress; balance: Hex }[] = [];
    const newTokens: string[] = [];
    const nativeBalanceUpdates: {
      address: string;
      chainId: Hex;
      balance: Hex;
    }[] = [];

    for (const update of updates) {
      const { asset, postBalance } = update;

      // Throw if balance update has an error
      if (postBalance.error) {
        throw new Error('Balance update has error');
      }

      // Parse token address from asset type
      const parsed = parseAssetType(asset.type);
      if (!parsed) {
        throw new Error('Failed to parse asset type');
      }

      const [tokenAddress, isNativeToken] = parsed;

      // Validate token address
      if (
        !isStrictHexString(tokenAddress) ||
        !isValidHexAddress(tokenAddress)
      ) {
        throw new Error('Invalid token address');
      }

      const checksumTokenAddress = checksum(tokenAddress);
      const isTracked = this.#isTokenTracked(
        checksumTokenAddress,
        account,
        chainId,
      );

      // postBalance.amount is in hex format (raw units)
      const balanceHex = postBalance.amount as Hex;

      // Add token balance (tracked tokens, ignored tokens, and native tokens all get balance updates)
      tokenBalances.push({
        tokenAddress: checksumTokenAddress,
        balance: balanceHex,
      });

      // Add native balance update if this is a native token
      if (isNativeToken) {
        nativeBalanceUpdates.push({
          address: account,
          chainId,
          balance: balanceHex,
        });
      }

      // Handle untracked ERC20 tokens - queue for import
      if (!isNativeToken && !isTracked) {
        newTokens.push(checksumTokenAddress);
      }
    }

    return { tokenBalances, newTokens, nativeBalanceUpdates };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // AccountActivityService event handlers

  /**
   * Handle real-time balance updates from AccountActivityService
   * Processes balance updates and updates the token balance state
   * If any balance update has an error, triggers fallback polling for the chain
   *
   * @param options0 - Balance update parameters
   * @param options0.address - Account address
   * @param options0.chain - CAIP chain identifier
   * @param options0.updates - Array of balance updates for the account
   */
  readonly #onAccountActivityBalanceUpdate = async ({
    address,
    chain,
    updates,
  }: {
    address: string;
    chain: string;
    updates: BalanceUpdate[];
  }) => {
    const chainId = caipChainIdToHex(chain);
    const checksummedAccount = checksum(address);

    try {
      // Process all balance updates at once
      const { tokenBalances, newTokens, nativeBalanceUpdates } =
        this.#prepareBalanceUpdates(updates, checksummedAccount, chainId);

      // Update state once with all token balances
      if (tokenBalances.length > 0) {
        this.update((state) => {
          // Temporary until ADR to normalize all keys - tokenBalances state requires: account in lowercase, token in checksum
          const lowercaseAccount =
            checksummedAccount.toLowerCase() as ChecksumAddress;
          state.tokenBalances[lowercaseAccount] ??= {};
          state.tokenBalances[lowercaseAccount][chainId] ??= {};

          // Apply all token balance updates
          for (const { tokenAddress, balance } of tokenBalances) {
            state.tokenBalances[lowercaseAccount][chainId][tokenAddress] =
              balance;
          }
        });
      }

      // Update native balances in AccountTrackerController
      if (nativeBalanceUpdates.length > 0) {
        this.messenger.call(
          'AccountTrackerController:updateNativeBalances',
          nativeBalanceUpdates,
        );
      }

      // Import any new tokens that were discovered (balance already updated from websocket)
      if (newTokens.length > 0) {
        await this.messenger.call(
          'TokenDetectionController:addDetectedTokensViaWs',
          {
            tokensSlice: newTokens,
            chainId: chainId as Hex,
          },
        );
      }
    } catch (error) {
      console.warn(
        `Error updating balances from AccountActivityService for chain ${chain}, account ${address}:`,
        error,
      );
      console.warn('Balance update data:', JSON.stringify(updates, null, 2));

      // On error, trigger fallback polling
      await this.updateBalances({ chainIds: [chainId] }).catch(() => {
        // Silently handle polling errors
      });
    }
  };

  /**
   * Handle status changes from AccountActivityService
   * Uses aggressive debouncing to prevent excessive HTTP calls from rapid up/down changes
   *
   * @param options0 - Status change event data
   * @param options0.chainIds - Array of chain identifiers
   * @param options0.status - Connection status ('up' for connected, 'down' for disconnected)
   */
  readonly #onAccountActivityStatusChanged = ({
    chainIds,
    status,
  }: {
    chainIds: string[];
    status: 'up' | 'down';
  }) => {
    // Update pending changes (latest status wins for each chain)
    for (const chainId of chainIds) {
      this.#statusChangeDebouncer.pendingChanges.set(chainId, status);
    }

    // Clear existing timer to extend debounce window
    if (this.#statusChangeDebouncer.timer) {
      clearTimeout(this.#statusChangeDebouncer.timer);
    }

    // Set new timer - only process changes after activity settles
    this.#statusChangeDebouncer.timer = setTimeout(() => {
      this.#processAccumulatedStatusChanges();
    }, 5000); // 5-second debounce window
  };

  /**
   * Process all accumulated status changes in one batch to minimize HTTP calls
   */
  #processAccumulatedStatusChanges(): void {
    const changes = Array.from(
      this.#statusChangeDebouncer.pendingChanges.entries(),
    );
    this.#statusChangeDebouncer.pendingChanges.clear();
    this.#statusChangeDebouncer.timer = null;

    if (changes.length === 0) {
      return;
    }

    // Calculate final polling configurations
    const chainConfigs: Record<ChainIdHex, { interval: number }> = {};

    for (const [chainId, status] of changes) {
      // Convert CAIP format (eip155:1) to hex format (0x1)
      // chainId is always in CAIP format from AccountActivityService
      const hexChainId = caipChainIdToHex(chainId);

      if (status === 'down') {
        // Chain is down - use default polling since no real-time updates available
        chainConfigs[hexChainId] = { interval: this.#defaultInterval };
      } else {
        // Chain is up - use longer intervals since WebSocket provides real-time updates
        chainConfigs[hexChainId] = {
          interval: this.#websocketActivePollingInterval,
        };
      }
    }

    // Add jitter to prevent synchronized requests across instances
    const jitterDelay = Math.random() * this.#defaultInterval; // 0 to default interval

    setTimeout(() => {
      this.updateChainPollingConfigs(chainConfigs, { immediateUpdate: true });
    }, jitterDelay);
  }

  /**
   * Clean up all timers and resources when controller is destroyed
   */
  override destroy(): void {
    this.#isControllerPollingActive = false;
    this.#intervalPollingTimers.forEach((timer) => clearInterval(timer));
    this.#intervalPollingTimers.clear();

    // Clean up debouncing timer
    if (this.#statusChangeDebouncer.timer) {
      clearTimeout(this.#statusChangeDebouncer.timer);
      this.#statusChangeDebouncer.timer = null;
    }

    // Unregister action handlers
    this.messenger.unregisterActionHandler(
      `TokenBalancesController:updateChainPollingConfigs`,
    );
    this.messenger.unregisterActionHandler(
      `TokenBalancesController:getChainPollingConfig`,
    );

    super.destroy();
  }
}

export default TokenBalancesController;
