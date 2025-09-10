import { Web3Provider } from '@ethersproject/providers';
import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListAccountsAction,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import {
  BNToHex,
  isValidHexAddress,
  toChecksumHexAddress,
  toHex,
} from '@metamask/controller-utils';
import type { KeyringControllerAccountRemovedEvent } from '@metamask/keyring-controller';
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
import type { Hex } from '@metamask/utils';
import { isStrictHexString } from '@metamask/utils';
import { produce } from 'immer';
import { isEqual } from 'lodash';

import type {
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
import type {
  TokensControllerGetStateAction,
  TokensControllerState,
  TokensControllerStateChangeEvent,
} from './TokensController';

export type ChainIdHex = Hex;
export type ChecksumAddress = Hex;

const CONTROLLER = 'TokenBalancesController' as const;
const DEFAULT_INTERVAL_MS = 180_000; // 3 minutes

const metadata = {
  tokenBalances: { persist: true, anonymous: false },
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
  | PreferencesControllerGetStateAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerListAccountsAction
  | AccountTrackerUpdateNativeBalancesAction
  | AccountTrackerUpdateStakedBalancesAction;

export type AllowedEvents =
  | TokensControllerStateChangeEvent
  | PreferencesControllerStateChangeEvent
  | NetworkControllerStateChangeEvent
  | KeyringControllerAccountRemovedEvent;

export type TokenBalancesControllerMessenger = RestrictedMessenger<
  typeof CONTROLLER,
  TokenBalancesControllerActions | AllowedActions,
  TokenBalancesControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
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
  accountsApiChainIds?: ChainIdHex[];
  /** Disable external HTTP calls (privacy / offline mode). */
  allowExternalServices?: () => boolean;
  /** Custom logger. */
  log?: (...args: unknown[]) => void;
};
// endregion

// ────────────────────────────────────────────────────────────────────────────
// region: Helper utilities
const draft = <T>(base: T, fn: (d: T) => void): T => produce(base, fn);

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as ChecksumAddress;

const checksum = (addr: string): ChecksumAddress =>
  toChecksumHexAddress(addr) as ChecksumAddress;
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
  readonly #queryAllAccounts: boolean;

  readonly #accountsApiChainIds: ChainIdHex[];

  readonly #balanceFetchers: BalanceFetcher[];

  #allTokens: TokensControllerState['allTokens'] = {};

  #detectedTokens: TokensControllerState['allDetectedTokens'] = {};

  /** Default polling interval for chains without specific configuration */
  readonly #defaultInterval: number;

  /** Per-chain polling configuration */
  readonly #chainPollingConfig: Record<ChainIdHex, ChainPollingConfig>;

  /** Active polling timers grouped by interval */
  readonly #intervalPollingTimers: Map<number, NodeJS.Timeout> = new Map();

  /** Track if controller-level polling is active */
  #isControllerPollingActive = false;

  /** Store original chainIds from startPolling to preserve intent */
  #requestedChainIds: ChainIdHex[] = [];

  constructor({
    messenger,
    interval = DEFAULT_INTERVAL_MS,
    chainPollingIntervals = {},
    state = {},
    queryMultipleAccounts = true,
    accountsApiChainIds = [],
    allowExternalServices = () => true,
  }: TokenBalancesControllerOptions) {
    super({
      name: CONTROLLER,
      messenger,
      metadata,
      state: { tokenBalances: {}, ...state },
    });

    this.#queryAllAccounts = queryMultipleAccounts;
    this.#accountsApiChainIds = [...accountsApiChainIds];
    this.#defaultInterval = interval;
    this.#chainPollingConfig = { ...chainPollingIntervals };

    // Strategy order: API first, then RPC fallback
    this.#balanceFetchers = [
      ...(accountsApiChainIds.length > 0 && allowExternalServices()
        ? [this.#createAccountsApiFetcher()]
        : []),
      new RpcBalanceFetcher(this.#getProvider, this.#getNetworkClient, () => ({
        allTokens: this.#allTokens,
        allDetectedTokens: this.#detectedTokens,
      })),
    ];

    this.setIntervalLength(interval);

    // initial token state & subscriptions
    const { allTokens, allDetectedTokens } = this.messagingSystem.call(
      'TokensController:getState',
    );
    this.#allTokens = allTokens;
    this.#detectedTokens = allDetectedTokens;

    this.messagingSystem.subscribe(
      'TokensController:stateChange',
      (tokensState: TokensControllerState) => {
        this.#onTokensChanged(tokensState).catch((error) => {
          console.warn('Error handling token state change:', error);
        });
      },
    );
    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      this.#onNetworkChanged,
    );
    this.messagingSystem.subscribe(
      'KeyringController:accountRemoved',
      this.#onAccountRemoved,
    );

    // Register action handlers for polling interval control
    this.messagingSystem.registerActionHandler(
      `TokenBalancesController:updateChainPollingConfigs`,
      this.updateChainPollingConfigs.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `TokenBalancesController:getChainPollingConfig`,
      this.getChainPollingConfig.bind(this),
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
    const { networkConfigurationsByChainId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const cfg = networkConfigurationsByChainId[chainId];
    const { networkClientId } = cfg.rpcEndpoints[cfg.defaultRpcEndpointIndex];
    const client = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    return new Web3Provider(client.provider);
  };

  readonly #getNetworkClient = (chainId: ChainIdHex) => {
    const { networkConfigurationsByChainId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const cfg = networkConfigurationsByChainId[chainId];
    const { networkClientId } = cfg.rpcEndpoints[cfg.defaultRpcEndpointIndex];
    return this.messagingSystem.call(
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
      'extension',
      this.#getProvider,
    );

    return {
      supports: (chainId: ChainIdHex): boolean => {
        // Only support chains that are both:
        // 1. In our specified accountsApiChainIds array
        // 2. Actually supported by the AccountsApi
        return (
          this.#accountsApiChainIds.includes(chainId) &&
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
   */
  override _stopPollingByPollingTokenSetId() {
    this.#isControllerPollingActive = false;
    this.#requestedChainIds = []; // Clear original intent when stopping
    this.#intervalPollingTimers.forEach((timer) => clearInterval(timer));
    this.#intervalPollingTimers.clear();
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

  override async _executePoll({ chainIds }: { chainIds: ChainIdHex[] }) {
    // This won't be called with our custom implementation, but keep for compatibility
    await this.updateBalances({ chainIds });
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

  async updateBalances({ chainIds }: { chainIds?: ChainIdHex[] } = {}) {
    const targetChains = chainIds ?? this.#chainIdsWithTokens();
    if (!targetChains.length) {
      return;
    }

    const { address: selected } = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );
    const allAccounts = this.messagingSystem.call(
      'AccountsController:listAccounts',
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
        const balances = await fetcher.fetch({
          chainIds: supportedChains,
          queryAllAccounts: this.#queryAllAccounts,
          selectedAccount: selected as ChecksumAddress,
          allAccounts,
        });

        if (balances && balances.length > 0) {
          aggregated.push(...balances);
          // Remove chains that were successfully processed
          const processedChains = new Set(balances.map((b) => b.chainId));
          remainingChains = remainingChains.filter(
            (chain) => !processedChains.has(chain),
          );
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

    // Determine which accounts to process
    const accountsToProcess = this.#queryAllAccounts
      ? allAccounts.map((a) => a.address as ChecksumAddress)
      : [selected as ChecksumAddress];

    const prev = this.state;
    const next = draft(prev, (d) => {
      // First, initialize all tokens from allTokens state with balance 0
      // for the accounts and chains we're processing
      for (const chainId of targetChains) {
        for (const account of accountsToProcess) {
          // Initialize tokens from allTokens
          const chainTokens = this.#allTokens[chainId];
          if (chainTokens?.[account]) {
            Object.values(chainTokens[account]).forEach(
              (token: { address: string }) => {
                const tokenAddress = checksum(token.address);
                ((d.tokenBalances[account] ??= {})[chainId] ??= {})[
                  tokenAddress
                ] = '0x0';
              },
            );
          }

          // Initialize tokens from allDetectedTokens
          const detectedChainTokens = this.#detectedTokens[chainId];
          if (detectedChainTokens?.[account]) {
            Object.values(detectedChainTokens[account]).forEach(
              (token: { address: string }) => {
                const tokenAddress = checksum(token.address);
                ((d.tokenBalances[account] ??= {})[chainId] ??= {})[
                  tokenAddress
                ] = '0x0';
              },
            );
          }
        }
      }

      // Then update with actual fetched balances where available
      aggregated.forEach(({ success, value, account, token, chainId }) => {
        if (success && value !== undefined) {
          ((d.tokenBalances[account] ??= {})[chainId] ??= {})[checksum(token)] =
            toHex(value);
        }
      });
    });

    if (!isEqual(prev, next)) {
      this.update(() => next);

      const nativeBalances = aggregated.filter(
        (r) => r.success && r.token === ZERO_ADDRESS,
      );

      // Update native token balances in a single batch operation for better performance
      if (nativeBalances.length > 0) {
        const balanceUpdates = nativeBalances.map((balance) => ({
          address: balance.account,
          chainId: balance.chainId,
          balance: balance.value ? BNToHex(balance.value) : '0x0',
        }));

        this.messagingSystem.call(
          'AccountTrackerController:updateNativeBalances',
          balanceUpdates,
        );
      }

      // Get staking contract addresses for filtering
      const stakingContractAddresses = Object.values(
        STAKING_CONTRACT_ADDRESS_BY_CHAINID,
      ).map((addr) => addr.toLowerCase());

      // Filter and update staked balances in a single batch operation for better performance
      const stakedBalances = aggregated.filter((r) => {
        return (
          r.success &&
          r.token !== ZERO_ADDRESS &&
          stakingContractAddresses.includes(r.token.toLowerCase())
        );
      });

      if (stakedBalances.length > 0) {
        const stakedBalanceUpdates = stakedBalances.map((balance) => ({
          address: balance.account,
          chainId: balance.chainId,
          stakedBalance: balance.value ? toHex(balance.value) : '0x0',
        }));

        this.messagingSystem.call(
          'AccountTrackerController:updateStakedBalances',
          stakedBalanceUpdates,
        );
      }
    }
  }

  resetState() {
    this.update(() => ({ tokenBalances: {} }));
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

  /**
   * Clean up all timers and resources when controller is destroyed
   */
  override destroy(): void {
    this.#isControllerPollingActive = false;
    this.#intervalPollingTimers.forEach((timer) => clearInterval(timer));
    this.#intervalPollingTimers.clear();

    // Unregister action handlers
    this.messagingSystem.unregisterActionHandler(
      `TokenBalancesController:updateChainPollingConfigs`,
    );
    this.messagingSystem.unregisterActionHandler(
      `TokenBalancesController:getChainPollingConfig`,
    );

    super.destroy();
  }
}

export default TokenBalancesController;
