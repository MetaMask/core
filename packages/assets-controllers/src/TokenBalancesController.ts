import { Web3Provider } from '@ethersproject/providers';
import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListAccountsAction,
  AccountsControllerSelectedEvmAccountChangeEvent,
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
  BackendWebSocketServiceActions,
  BalanceUpdate,
  AccountActivityServiceBalanceUpdatedEvent,
  AccountActivityServiceStatusChangedEvent,
} from '@metamask/core-backend';
import { WebSocketState } from '@metamask/core-backend';
import type {
  KeyringControllerAccountRemovedEvent,
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
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
import type {
  TransactionControllerIncomingTransactionsReceivedEvent,
  TransactionControllerTransactionConfirmedEvent,
} from '@metamask/transaction-controller';
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
import { AccountsApiBalanceFetcher } from './multi-chain-accounts-service/api-balance-fetcher';
import type {
  BalanceFetcher,
  ProcessedBalance,
} from './multi-chain-accounts-service/api-balance-fetcher';
import { RpcBalanceFetcher } from './rpc-service/rpc-balance-fetcher';
import type {
  TokenDetectionControllerAddDetectedTokensViaPollingAction,
  TokenDetectionControllerAddDetectedTokensViaWsAction,
  TokenDetectionControllerDetectTokensAction,
} from './TokenDetectionController';
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
  | BackendWebSocketServiceActions
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction
  | TokensControllerGetStateAction
  | TokenDetectionControllerAddDetectedTokensViaPollingAction
  | TokenDetectionControllerAddDetectedTokensViaWsAction
  | TokenDetectionControllerDetectTokensAction
  | PreferencesControllerGetStateAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerListAccountsAction
  | AccountTrackerControllerGetStateAction
  | AccountTrackerUpdateNativeBalancesAction
  | AccountTrackerUpdateStakedBalancesAction
  | KeyringControllerGetStateAction
  | AuthenticationController.AuthenticationControllerGetBearerTokenAction;

export type AllowedEvents =
  | TokensControllerStateChangeEvent
  | PreferencesControllerStateChangeEvent
  | NetworkControllerStateChangeEvent
  | KeyringControllerAccountRemovedEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  | AccountActivityServiceBalanceUpdatedEvent
  | AccountActivityServiceStatusChangedEvent
  | AccountsControllerSelectedEvmAccountChangeEvent
  | TransactionControllerTransactionConfirmedEvent
  | TransactionControllerIncomingTransactionsReceivedEvent;

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
  /** Whether the user has completed onboarding. If false, balance updates are skipped. */
  isOnboarded?: () => boolean;
};

const draft = <State>(base: State, fn: (draftState: State) => void): State =>
  produce(base, fn);

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as ChecksumAddress;

const checksum = (addr: string): ChecksumAddress =>
  toChecksumHexAddress(addr) as ChecksumAddress;

/**
 * Convert CAIP chain ID or hex chain ID to hex chain ID.
 *
 * @param chainId - CAIP chain ID or hex chain ID.
 * @returns Hex chain ID.
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
 * Extract token address from asset type.
 *
 * @param assetType - Asset type string.
 * @returns Tuple of [tokenAddress, isNativeToken] or null if invalid.
 */
export const parseAssetType = (assetType: string): [string, boolean] | null => {
  if (!isCaipAssetType(assetType)) {
    return null;
  }

  const parsed = parseCaipAssetType(assetType);

  if (parsed.assetNamespace === 'erc20') {
    return [parsed.assetReference, false];
  }

  if (parsed.assetNamespace === 'slip44') {
    return [ZERO_ADDRESS, true];
  }

  return null;
};

type NativeBalanceUpdate = { address: string; chainId: Hex; balance: Hex };
type StakedBalanceUpdate = {
  address: string;
  chainId: Hex;
  stakedBalance: Hex;
};
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

  readonly #allowExternalServices: () => boolean;

  readonly #isOnboarded: () => boolean;

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

  /** Track if the keyring is unlocked */
  #isUnlocked = false;

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
    accountsApiChainIds = (): ChainIdHex[] => [],
    allowExternalServices = (): boolean => true,
    platform,
    isOnboarded = (): boolean => true,
  }: TokenBalancesControllerOptions) {
    super({
      name: CONTROLLER,
      messenger,
      metadata,
      state: { tokenBalances: {}, ...state },
    });

    this.#normalizeAccountAddresses();

    this.#platform = platform ?? 'extension';
    this.#queryAllAccounts = queryMultipleAccounts;
    this.#accountsApiChainIds = accountsApiChainIds;
    this.#allowExternalServices = allowExternalServices;
    this.#isOnboarded = isOnboarded;
    this.#defaultInterval = interval;
    this.#websocketActivePollingInterval = websocketActivePollingInterval;
    this.#chainPollingConfig = { ...chainPollingIntervals };

    // Always include AccountsApiFetcher - it dynamically checks allowExternalServices() in supports()
    this.#balanceFetchers = [
      this.#createAccountsApiFetcher(),
      new RpcBalanceFetcher(this.#getProvider, this.#getNetworkClient, () => ({
        allTokens: this.#allTokens,
        allDetectedTokens: this.#detectedTokens,
      })),
    ];

    this.setIntervalLength(interval);

    const { allTokens, allDetectedTokens, allIgnoredTokens } =
      this.messenger.call('TokensController:getState');

    this.#allTokens = allTokens;
    this.#detectedTokens = allDetectedTokens;
    this.#allIgnoredTokens = allIgnoredTokens;

    const { isUnlocked } = this.messenger.call('KeyringController:getState');
    this.#isUnlocked = isUnlocked;

    this.#subscribeToControllers();
    this.#registerActions();
  }

  #subscribeToControllers(): void {
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

    this.messenger.subscribe('KeyringController:unlock', () => {
      this.#isUnlocked = true;
    });

    this.messenger.subscribe('KeyringController:lock', () => {
      this.#isUnlocked = false;
    });

    this.messenger.subscribe(
      'KeyringController:accountRemoved',
      this.#onAccountRemoved,
    );

    this.messenger.subscribe(
      'AccountsController:selectedEvmAccountChange',
      this.#onAccountChanged,
    );

    this.messenger.subscribe(
      'AccountActivityService:balanceUpdated',
      (event) => {
        this.#onAccountActivityBalanceUpdate(event).catch((error) => {
          console.warn('Error handling balance update:', error);
        });
      },
    );

    this.messenger.subscribe(
      'AccountActivityService:statusChanged',
      this.#onAccountActivityStatusChanged.bind(this),
    );

    this.messenger.subscribe(
      'TransactionController:transactionConfirmed',
      (transactionMeta) => {
        this.updateBalances({
          chainIds: [transactionMeta.chainId],
        }).catch(() => {
          // Silently handle balance update errors
        });
      },
    );

    this.messenger.subscribe(
      'TransactionController:incomingTransactionsReceived',
      (incomingTransactions) => {
        this.updateBalances({
          chainIds: incomingTransactions.map((tx) => tx.chainId),
        }).catch(() => {
          // Silently handle balance update errors
        });
      },
    );
  }

  #registerActions(): void {
    this.messenger.registerActionHandler(
      `TokenBalancesController:updateChainPollingConfigs`,
      this.updateChainPollingConfigs.bind(this),
    );

    this.messenger.registerActionHandler(
      `TokenBalancesController:getChainPollingConfig`,
      this.getChainPollingConfig.bind(this),
    );
  }

  /**
   * Whether the controller is active (keyring is unlocked and user is onboarded).
   * When locked or not onboarded, balance updates should be skipped.
   *
   * @returns Whether the controller should perform balance updates.
   */
  get isActive(): boolean {
    return this.#isUnlocked && this.#isOnboarded();
  }

  /**
   * Normalize all account addresses to lowercase and merge duplicates
   * Handles migration from old state where addresses might be checksummed.
   */
  #normalizeAccountAddresses(): void {
    const currentState = this.state.tokenBalances;
    const normalizedBalances: TokenBalances = {};

    for (const address of Object.keys(currentState)) {
      const lowercaseAddress = address.toLowerCase() as ChecksumAddress;
      const accountBalances = currentState[address as ChecksumAddress];

      if (!accountBalances) {
        continue;
      }

      normalizedBalances[lowercaseAddress] ??= {};

      for (const chainId of Object.keys(accountBalances)) {
        const chainIdKey = chainId as ChainIdHex;
        normalizedBalances[lowercaseAddress][chainIdKey] ??= {};

        Object.assign(
          normalizedBalances[lowercaseAddress][chainIdKey],
          accountBalances[chainIdKey],
        );
      }
    }

    if (
      Object.keys(currentState).length !==
        Object.keys(normalizedBalances).length ||
      Object.keys(currentState).some((addr) => addr !== addr.toLowerCase())
    ) {
      this.update(() => ({ tokenBalances: normalizedBalances }));
    }
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
    const networkConfig = networkConfigurationsByChainId[chainId];
    const { networkClientId } =
      networkConfig.rpcEndpoints[networkConfig.defaultRpcEndpointIndex];
    const client = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    return new Web3Provider(client.provider);
  };

  readonly #getNetworkClient = (
    chainId: ChainIdHex,
  ): ReturnType<NetworkControllerGetNetworkClientByIdAction['handler']> => {
    const { networkConfigurationsByChainId } = this.messenger.call(
      'NetworkController:getState',
    );
    const networkConfig = networkConfigurationsByChainId[chainId];
    const { networkClientId } =
      networkConfig.rpcEndpoints[networkConfig.defaultRpcEndpointIndex];
    return this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
  };

  readonly #createAccountsApiFetcher = (): BalanceFetcher => {
    const originalFetcher = new AccountsApiBalanceFetcher(
      this.#platform,
      this.#getProvider,
      () => this.state.tokenBalances, // list of existing user tokens
      () => this.getIsWebSocketActive(),
    );

    return {
      // Dynamically check allowExternalServices() at call time, not just at construction time
      supports: (chainId: ChainIdHex): boolean =>
        this.#allowExternalServices() &&
        this.#accountsApiChainIds().includes(chainId) &&
        originalFetcher.supports(chainId),
      fetch: originalFetcher.fetch.bind(originalFetcher),
    };
  };

  override _startPolling({ chainIds }: { chainIds: ChainIdHex[] }): void {
    this.#requestedChainIds = [...chainIds];
    this.#isControllerPollingActive = true;
    this.#startIntervalGroupPolling(chainIds, true);
  }

  #startIntervalGroupPolling(chainIds: ChainIdHex[], immediate = true): void {
    this.#intervalPollingTimers.forEach((timer) => clearInterval(timer));
    this.#intervalPollingTimers.clear();

    const intervalGroups = new Map<number, ChainIdHex[]>();

    for (const chainId of chainIds) {
      const config = this.getChainPollingConfig(chainId);
      const group = intervalGroups.get(config.interval) ?? [];
      group.push(chainId);
      intervalGroups.set(config.interval, group);
    }

    for (const [interval, chainIdsGroup] of intervalGroups) {
      this.#startPollingForInterval(interval, chainIdsGroup, immediate);
    }
  }

  #startPollingForInterval(
    interval: number,
    chainIds: ChainIdHex[],
    immediate = true,
  ): void {
    const pollFunction = async (): Promise<void> => {
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

    if (immediate) {
      pollFunction().catch((error) => {
        console.warn(
          `Immediate polling failed for chains ${chainIds.join(', ')}:`,
          error,
        );
      });
    }

    this.#setPollingTimer(interval, chainIds, pollFunction);
  }

  #setPollingTimer(
    interval: number,
    chainIds: ChainIdHex[],
    pollFunction: () => Promise<void>,
  ): void {
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

  override _stopPollingByPollingTokenSetId(tokenSetId: string): void {
    let chainsToStop: ChainIdHex[] = [];

    try {
      const parsedTokenSetId = JSON.parse(tokenSetId);
      chainsToStop = parsedTokenSetId.chainIds ?? [];
    } catch (error) {
      console.warn('Failed to parse tokenSetId, stopping all polling:', error);
      this.#stopAllPolling();
      return;
    }

    const currentChainsSet = new Set(this.#requestedChainIds);
    const stopChainsSet = new Set(chainsToStop);

    const isCurrentSession =
      currentChainsSet.size === stopChainsSet.size &&
      [...currentChainsSet].every((chain) => stopChainsSet.has(chain));

    if (isCurrentSession) {
      this.#stopAllPolling();
    }
  }

  #stopAllPolling(): void {
    this.#isControllerPollingActive = false;
    this.#requestedChainIds = [];
    this.#intervalPollingTimers.forEach((timer) => clearInterval(timer));
    this.#intervalPollingTimers.clear();
  }

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
  }): Promise<void> {
    await this.updateBalances({ chainIds, queryAllAccounts });
  }

  /**
   * Returns whether the WebSocket for real-time balance updates is currently connected.
   *
   * @returns True if the WebSocket is connected, false otherwise.
   */
  getIsWebSocketActive(): boolean {
    const connectionInfo = this.messenger.call(
      'BackendWebSocketService:getConnectionInfo',
    );
    return connectionInfo.state === WebSocketState.CONNECTED;
  }

  updateChainPollingConfigs(
    configs: Record<ChainIdHex, ChainPollingConfig>,
    options: UpdateChainPollingConfigsOptions = { immediateUpdate: true },
  ): void {
    Object.assign(this.#chainPollingConfig, configs);

    if (this.#isControllerPollingActive) {
      this.#startIntervalGroupPolling(
        this.#requestedChainIds,
        options.immediateUpdate,
      );
    }
  }

  async updateBalances({
    chainIds,
    tokenAddresses,
    queryAllAccounts = false,
  }: {
    chainIds?: ChainIdHex[];
    tokenAddresses?: string[];
    queryAllAccounts?: boolean;
  } = {}): Promise<void> {
    if (!this.isActive) {
      return;
    }

    const targetChains = this.#getTargetChains(chainIds);
    if (!targetChains.length) {
      return;
    }

    const { selectedAccount, allAccounts, jwtToken } =
      await this.#getAccountsAndJwt();

    const aggregatedBalances = await this.#fetchAllBalances({
      targetChains,
      selectedAccount,
      allAccounts,
      jwtToken,
      queryAllAccounts: queryAllAccounts ?? this.#queryAllAccounts,
    });

    const filteredAggregated = this.#filterByTokenAddresses(
      aggregatedBalances,
      tokenAddresses,
    );

    const accountsToProcess = this.#getAccountsToProcess(
      queryAllAccounts,
      allAccounts,
      selectedAccount,
    );

    const prev = this.state;
    const next = this.#applyTokenBalancesToState({
      prev,
      targetChains,
      accountsToProcess,
      balances: filteredAggregated,
    });

    if (!isEqual(prev, next)) {
      this.update(() => next);

      const accountTrackerState = this.messenger.call(
        'AccountTrackerController:getState',
      );

      const nativeUpdates = this.#buildNativeBalanceUpdates(
        filteredAggregated,
        accountTrackerState,
      );

      if (nativeUpdates.length > 0) {
        this.messenger.call(
          'AccountTrackerController:updateNativeBalances',
          nativeUpdates,
        );
      }

      const stakedUpdates = this.#buildStakedBalanceUpdates(
        filteredAggregated,
        accountTrackerState,
      );

      if (stakedUpdates.length > 0) {
        this.messenger.call(
          'AccountTrackerController:updateStakedBalances',
          stakedUpdates,
        );
      }
    }

    await this.#importUntrackedTokens(filteredAggregated);
  }

  #getTargetChains(chainIds?: ChainIdHex[]): ChainIdHex[] {
    return chainIds?.length ? chainIds : this.#chainIdsWithTokens();
  }

  async #getAccountsAndJwt(): Promise<{
    selectedAccount: ChecksumAddress;
    allAccounts: InternalAccount[];
    jwtToken: string | undefined;
  }> {
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

    return {
      selectedAccount: selected as ChecksumAddress,
      allAccounts,
      jwtToken,
    };
  }

  async #fetchAllBalances({
    targetChains,
    selectedAccount,
    allAccounts,
    jwtToken,
    queryAllAccounts,
  }: {
    targetChains: ChainIdHex[];
    selectedAccount: ChecksumAddress;
    allAccounts: InternalAccount[];
    jwtToken?: string;
    queryAllAccounts: boolean;
  }): Promise<ProcessedBalance[]> {
    const aggregated: ProcessedBalance[] = [];
    let remainingChains = [...targetChains];

    for (const fetcher of this.#balanceFetchers) {
      const supportedChains = remainingChains.filter((chain) =>
        fetcher.supports(chain),
      );
      if (!supportedChains.length) {
        continue;
      }

      try {
        const result = await fetcher.fetch({
          chainIds: supportedChains,
          queryAllAccounts,
          selectedAccount,
          allAccounts,
          jwtToken,
        });

        if (result.balances?.length) {
          aggregated.push(...result.balances);

          const processed = new Set(result.balances.map((b) => b.chainId));
          remainingChains = remainingChains.filter(
            (chain) => !processed.has(chain),
          );
        }

        if (result.unprocessedChainIds?.length) {
          const currentRemaining = [...remainingChains];
          const chainsToAdd = result.unprocessedChainIds.filter(
            (chainId) =>
              supportedChains.includes(chainId) &&
              !currentRemaining.includes(chainId),
          );
          remainingChains.push(...chainsToAdd);

          this.messenger
            .call('TokenDetectionController:detectTokens', {
              chainIds: result.unprocessedChainIds,
              forceRpc: true,
            })
            .catch(() => {
              // Silently handle token detection errors
            });
        }
      } catch (error) {
        console.warn(
          `Balance fetcher failed for chains ${supportedChains.join(', ')}: ${String(error)}`,
        );

        this.messenger
          .call('TokenDetectionController:detectTokens', {
            chainIds: supportedChains,
            forceRpc: true,
          })
          .catch(() => {
            // Silently handle token detection errors
          });
      }

      if (!remainingChains.length) {
        break;
      }
    }

    return aggregated;
  }

  #filterByTokenAddresses(
    balances: ProcessedBalance[],
    tokenAddresses?: string[],
  ): ProcessedBalance[] {
    if (!tokenAddresses?.length) {
      return balances;
    }

    const lowered = tokenAddresses.map((a) => a.toLowerCase());
    return balances.filter((balance) =>
      lowered.includes(balance.token.toLowerCase()),
    );
  }

  #getAccountsToProcess(
    queryAllAccountsParam: boolean | undefined,
    allAccounts: InternalAccount[],
    selectedAccount: ChecksumAddress,
  ): ChecksumAddress[] {
    const effectiveQueryAll =
      queryAllAccountsParam ?? this.#queryAllAccounts ?? false;

    if (!effectiveQueryAll) {
      return [selectedAccount];
    }

    return allAccounts.map((account) => account.address as ChecksumAddress);
  }

  #applyTokenBalancesToState({
    prev,
    targetChains,
    accountsToProcess,
    balances,
  }: {
    prev: TokenBalancesControllerState;
    targetChains: ChainIdHex[];
    accountsToProcess: ChecksumAddress[];
    balances: ProcessedBalance[];
  }): TokenBalancesControllerState {
    return draft(prev, (draftState) => {
      for (const chainId of targetChains) {
        for (const account of accountsToProcess) {
          draftState.tokenBalances[account] ??= {};
          draftState.tokenBalances[account][chainId] ??= {};

          const chainTokens = this.#allTokens[chainId];
          if (chainTokens?.[account]) {
            Object.values(chainTokens[account]).forEach(
              (token: { address: string }) => {
                const tokenAddress = checksum(token.address);
                draftState.tokenBalances[account][chainId][tokenAddress] ??=
                  '0x0';
              },
            );
          }

          const detectedChainTokens = this.#detectedTokens[chainId];
          if (detectedChainTokens?.[account]) {
            Object.values(detectedChainTokens[account]).forEach(
              (token: { address: string }) => {
                const tokenAddress = checksum(token.address);
                draftState.tokenBalances[account][chainId][tokenAddress] ??=
                  '0x0';
              },
            );
          }
        }
      }

      balances.forEach(({ success, value, account, token, chainId }) => {
        if (!success || value === undefined) {
          return;
        }

        const lowerCaseAccount = account.toLowerCase() as ChecksumAddress;
        const newBalance = toHex(value);
        const tokenAddress = checksum(token);

        const currentBalance =
          draftState.tokenBalances[lowerCaseAccount]?.[chainId]?.[tokenAddress];

        if (currentBalance !== newBalance) {
          ((draftState.tokenBalances[lowerCaseAccount] ??= {})[chainId] ??= {})[
            tokenAddress
          ] = newBalance;
        }
      });
    });
  }

  #buildNativeBalanceUpdates(
    balances: ProcessedBalance[],
    accountTrackerState: {
      accountsByChainId: Record<
        string,
        Record<string, { balance?: string; stakedBalance?: string }>
      >;
    },
  ): NativeBalanceUpdate[] {
    const nativeBalances = balances.filter(
      (balance) => balance.success && balance.token === ZERO_ADDRESS,
    );

    if (!nativeBalances.length) {
      return [];
    }

    return nativeBalances
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
        return currentBalance !== update.balance;
      });
  }

  #buildStakedBalanceUpdates(
    balances: ProcessedBalance[],
    accountTrackerState: {
      accountsByChainId: Record<
        string,
        Record<string, { balance?: string; stakedBalance?: string }>
      >;
    },
  ): StakedBalanceUpdate[] {
    const stakedBalances = balances.filter((balance) => {
      if (!balance.success || balance.token === ZERO_ADDRESS) {
        return false;
      }

      const stakingContractAddress =
        STAKING_CONTRACT_ADDRESS_BY_CHAINID[balance.chainId];
      return (
        stakingContractAddress?.toLowerCase() === balance.token.toLowerCase()
      );
    });

    if (!stakedBalances.length) {
      return [];
    }

    return stakedBalances
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
        return currentStakedBalance !== update.stakedBalance;
      });
  }

  /**
   * Import untracked tokens that have non-zero balances.
   * This mirrors the v2 behavior where only tokens with actual balances are added.
   * Delegates to TokenDetectionController:addDetectedTokensViaPolling which handles:
   * - Checking if useTokenDetection preference is enabled
   * - Filtering tokens already in allTokens or allIgnoredTokens
   * - Token metadata lookup and addition via TokensController
   *
   * @param balances - Array of processed balance results from fetchers
   */
  async #importUntrackedTokens(balances: ProcessedBalance[]): Promise<void> {
    const tokensByChain = new Map<ChainIdHex, string[]>();

    for (const balance of balances) {
      // Skip failed fetches, native tokens, and zero balances (like v2 did)
      if (
        !balance.success ||
        balance.token === ZERO_ADDRESS ||
        !balance.value ||
        balance.value.isZero()
      ) {
        continue;
      }

      const tokenAddress = checksum(balance.token);
      const existing = tokensByChain.get(balance.chainId) ?? [];
      if (!existing.includes(tokenAddress)) {
        existing.push(tokenAddress);
        tokensByChain.set(balance.chainId, existing);
      }
    }

    // Add detected tokens via TokenDetectionController (handles preference check,
    // filtering of allTokens/allIgnoredTokens, and metadata lookup)
    for (const [chainId, tokenAddresses] of tokensByChain) {
      if (tokenAddresses.length) {
        await this.messenger.call(
          'TokenDetectionController:addDetectedTokensViaPolling',
          {
            tokensSlice: tokenAddresses,
            chainId,
          },
        );
      }
    }
  }

  resetState(): void {
    this.update(() => ({ tokenBalances: {} }));
  }

  #isTokenTracked(
    tokenAddress: string,
    account: ChecksumAddress,
    chainId: ChainIdHex,
  ): boolean {
    const normalizedAccount = account.toLowerCase();

    if (
      this.#allTokens?.[chainId]?.[normalizedAccount]?.some(
        (token) => token.address === tokenAddress,
      )
    ) {
      return true;
    }

    if (
      this.#allIgnoredTokens?.[chainId]?.[normalizedAccount]?.some(
        (token) => token === tokenAddress,
      )
    ) {
      return true;
    }

    return false;
  }

  readonly #onTokensChanged = async (
    state: TokensControllerState,
  ): Promise<void> => {
    const changed: ChainIdHex[] = [];
    let hasChanges = false;

    const incomingChainIds = new Set([
      ...Object.keys(state.allTokens),
      ...Object.keys(state.allDetectedTokens),
    ]);

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

      const hasTokenChange =
        !isEqual(state.allTokens[id], this.#allTokens[id]) ||
        !isEqual(state.allDetectedTokens[id], this.#detectedTokens[id]);

      return hasTokenChange || (!hadTokensBefore && hasTokensNow);
    });

    if (!relevantChainIds.length) {
      this.#allTokens = state.allTokens;
      this.#detectedTokens = state.allDetectedTokens;
      return;
    }

    this.update((currentState) => {
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

        const tokensChanged =
          !isEqual(state.allTokens[id], this.#allTokens[id]) ||
          !isEqual(state.allDetectedTokens[id], this.#detectedTokens[id]);

        if (!tokensChanged) {
          continue;
        }

        if (hasTokensNow) {
          changed.push(id);
        } else if (hadTokensBefore) {
          for (const address of Object.keys(currentState.tokenBalances)) {
            const addressKey = address as ChecksumAddress;
            if (currentState.tokenBalances[addressKey]?.[id]) {
              currentState.tokenBalances[addressKey][id] = {};
              hasChanges = true;
            }
          }
        }
      }
    });

    this.#allTokens = state.allTokens;
    this.#detectedTokens = state.allDetectedTokens;
    this.#allIgnoredTokens = state.allIgnoredTokens;

    if (changed.length && !hasChanges) {
      this.updateBalances({ chainIds: changed }).catch((error) => {
        console.warn('Error updating balances after token change:', error);
      });
    }
  };

  readonly #onNetworkChanged = (state: NetworkState): void => {
    const currentNetworks = new Set(
      Object.keys(state.networkConfigurationsByChainId),
    );

    const networksWithBalances = new Set<string>();
    for (const address of Object.keys(this.state.tokenBalances)) {
      const addressKey = address as ChecksumAddress;
      for (const network of Object.keys(
        this.state.tokenBalances[addressKey] || {},
      )) {
        networksWithBalances.add(network);
      }
    }

    const removedNetworks = Array.from(networksWithBalances).filter(
      (network) => !currentNetworks.has(network),
    );

    if (!removedNetworks.length) {
      return;
    }

    this.update((currentState) => {
      for (const address of Object.keys(currentState.tokenBalances)) {
        const addressKey = address as ChecksumAddress;
        for (const removedNetwork of removedNetworks) {
          const networkKey = removedNetwork as ChainIdHex;
          if (currentState.tokenBalances[addressKey]?.[networkKey]) {
            delete currentState.tokenBalances[addressKey][networkKey];
          }
        }
      }
    });
  };

  readonly #onAccountRemoved = (addr: string): void => {
    if (!isStrictHexString(addr) || !isValidHexAddress(addr)) {
      return;
    }
    this.update((currentState) => {
      delete currentState.tokenBalances[addr];
    });
  };

  readonly #onAccountChanged = (): void => {
    const chainIds = this.#chainIdsWithTokens();
    if (!chainIds.length) {
      return;
    }

    this.updateBalances({ chainIds }).catch(() => {
      // Silently handle polling errors
    });
  };

  #prepareBalanceUpdates(
    updates: BalanceUpdate[],
    account: ChecksumAddress,
    chainId: ChainIdHex,
  ): {
    tokenBalances: { tokenAddress: ChecksumAddress; balance: Hex }[];
    newTokens: string[];
    nativeBalanceUpdates: NativeBalanceUpdate[];
  } {
    const tokenBalances: { tokenAddress: ChecksumAddress; balance: Hex }[] = [];
    const newTokens: string[] = [];
    const nativeBalanceUpdates: NativeBalanceUpdate[] = [];

    for (const update of updates) {
      const { asset, postBalance } = update;

      if (postBalance.error) {
        throw new Error('Balance update has error');
      }

      const parsed = parseAssetType(asset.type);
      if (!parsed) {
        throw new Error('Failed to parse asset type');
      }

      const [tokenAddress, isNativeToken] = parsed;

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

      const balanceHex = postBalance.amount as Hex;

      tokenBalances.push({
        tokenAddress: checksumTokenAddress,
        balance: balanceHex,
      });

      if (isNativeToken) {
        nativeBalanceUpdates.push({
          address: account,
          chainId,
          balance: balanceHex,
        });
      }

      if (!isNativeToken && !isTracked) {
        newTokens.push(checksumTokenAddress);
      }
    }

    return { tokenBalances, newTokens, nativeBalanceUpdates };
  }

  readonly #onAccountActivityBalanceUpdate = async ({
    address,
    chain,
    updates,
  }: {
    address: string;
    chain: string;
    updates: BalanceUpdate[];
  }): Promise<void> => {
    const chainId = caipChainIdToHex(chain);
    const checksummedAccount = checksum(address);

    try {
      const { tokenBalances, newTokens, nativeBalanceUpdates } =
        this.#prepareBalanceUpdates(updates, checksummedAccount, chainId);

      if (tokenBalances.length > 0) {
        this.update((state) => {
          const lowercaseAccount =
            checksummedAccount.toLowerCase() as ChecksumAddress;
          state.tokenBalances[lowercaseAccount] ??= {};
          state.tokenBalances[lowercaseAccount][chainId] ??= {};

          for (const { tokenAddress, balance } of tokenBalances) {
            state.tokenBalances[lowercaseAccount][chainId][tokenAddress] =
              balance;
          }
        });
      }

      if (nativeBalanceUpdates.length > 0) {
        this.messenger.call(
          'AccountTrackerController:updateNativeBalances',
          nativeBalanceUpdates,
        );
      }

      if (newTokens.length > 0) {
        await this.messenger.call(
          'TokenDetectionController:addDetectedTokensViaWs',
          {
            tokensSlice: newTokens,
            chainId,
          },
        );
      }
    } catch (error) {
      console.warn(
        `Error updating balances from AccountActivityService for chain ${chain}, account ${address}:`,
        error,
      );
      console.warn('Balance update data:', JSON.stringify(updates, null, 2));

      await this.updateBalances({ chainIds: [chainId] }).catch(() => {
        // Silently handle polling errors
      });
    }
  };

  readonly #onAccountActivityStatusChanged = ({
    chainIds,
    status,
  }: {
    chainIds: string[];
    status: 'up' | 'down';
  }): void => {
    for (const chainId of chainIds) {
      this.#statusChangeDebouncer.pendingChanges.set(chainId, status);
    }

    if (this.#statusChangeDebouncer.timer) {
      clearTimeout(this.#statusChangeDebouncer.timer);
    }

    this.#statusChangeDebouncer.timer = setTimeout(() => {
      this.#processAccumulatedStatusChanges();
    }, 5000);
  };

  #processAccumulatedStatusChanges(): void {
    const changes = Array.from(
      this.#statusChangeDebouncer.pendingChanges.entries(),
    );
    this.#statusChangeDebouncer.pendingChanges.clear();
    this.#statusChangeDebouncer.timer = null;

    if (!changes.length) {
      return;
    }

    const chainConfigs: Record<ChainIdHex, { interval: number }> = {};

    for (const [chainId, status] of changes) {
      const hexChainId = caipChainIdToHex(chainId);

      chainConfigs[hexChainId] =
        status === 'down'
          ? { interval: this.#defaultInterval }
          : { interval: this.#websocketActivePollingInterval };
    }

    const jitterDelay = Math.random() * this.#defaultInterval;

    setTimeout(() => {
      this.updateChainPollingConfigs(chainConfigs, { immediateUpdate: true });
    }, jitterDelay);
  }

  override destroy(): void {
    this.#isControllerPollingActive = false;
    this.#intervalPollingTimers.forEach((timer) => clearInterval(timer));
    this.#intervalPollingTimers.clear();

    if (this.#statusChangeDebouncer.timer) {
      clearTimeout(this.#statusChangeDebouncer.timer);
      this.#statusChangeDebouncer.timer = null;
    }

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
