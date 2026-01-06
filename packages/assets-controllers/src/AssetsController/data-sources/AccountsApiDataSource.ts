import type {
  AccountsApiBalance,
  AccountsApiActions,
  GetV2SupportedNetworksResponse,
  GetV4MultiAccountBalancesResponse,
  GetMultiAccountBalancesOptions,
} from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';
import BN from 'bn.js';

import { projectLogger, createModuleLogger } from '../../logger';
import type {
  ChainId,
  Caip19AssetId,
  AssetBalance,
  DataFetchRequest,
  DataResponse,
} from '../types';
import {
  AbstractDataSource,
  type DataSourceState,
  type SubscriptionRequest,
} from './AbstractDataSource';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'AccountsApiDataSource';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_POLL_INTERVAL = 30_000;

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// MESSENGER TYPES
// ============================================================================

// Action types that AccountsApiDataSource exposes
export type AccountsApiDataSourceGetActiveChainsAction = {
  type: 'AccountsApiDataSource:getActiveChains';
  handler: () => Promise<ChainId[]>;
};

export type AccountsApiDataSourceFetchAction = {
  type: 'AccountsApiDataSource:fetch';
  handler: (request: DataFetchRequest) => Promise<DataResponse>;
};

export type AccountsApiDataSourceSubscribeAction = {
  type: 'AccountsApiDataSource:subscribe';
  handler: (request: SubscriptionRequest) => Promise<void>;
};

export type AccountsApiDataSourceUnsubscribeAction = {
  type: 'AccountsApiDataSource:unsubscribe';
  handler: (subscriptionId: string) => Promise<void>;
};

export type AccountsApiDataSourceActions =
  | AccountsApiDataSourceGetActiveChainsAction
  | AccountsApiDataSourceFetchAction
  | AccountsApiDataSourceSubscribeAction
  | AccountsApiDataSourceUnsubscribeAction;

// Event types that AccountsApiDataSource publishes
export type AccountsApiDataSourceActiveChainsChangedEvent = {
  type: 'AccountsApiDataSource:activeChainsChanged';
  payload: [ChainId[]];
};

export type AccountsApiDataSourceAssetsUpdatedEvent = {
  type: 'AccountsApiDataSource:assetsUpdated';
  payload: [DataResponse, string | undefined];
};

export type AccountsApiDataSourceEvents =
  | AccountsApiDataSourceActiveChainsChangedEvent
  | AccountsApiDataSourceAssetsUpdatedEvent;

// Allowed actions that AccountsApiDataSource can call (from BackendApiClient)
export type AccountsApiDataSourceAllowedActions = AccountsApiActions;

export type AccountsApiDataSourceMessenger = Messenger<
  typeof CONTROLLER_NAME,
  AccountsApiDataSourceActions | AccountsApiDataSourceAllowedActions,
  AccountsApiDataSourceEvents
>;

// ============================================================================
// STATE
// ============================================================================

export type AccountsApiDataSourceState = DataSourceState;

const defaultState: AccountsApiDataSourceState = {
  activeChains: [],
};

// ============================================================================
// OPTIONS
// ============================================================================

export interface AccountsApiDataSourceOptions {
  messenger: AccountsApiDataSourceMessenger;
  pollInterval?: number;
  state?: Partial<AccountsApiDataSourceState>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function decimalToChainId(decimalChainId: number | string): ChainId {
  // Handle both decimal numbers and already-formatted CAIP chain IDs
  if (typeof decimalChainId === 'string') {
    // If already a CAIP chain ID (e.g., "eip155:1"), return as-is
    if (decimalChainId.startsWith('eip155:')) {
      return decimalChainId as ChainId;
    }
    // If it's a string number, convert
    return `eip155:${decimalChainId}` as ChainId;
  }
  return `eip155:${decimalChainId}` as ChainId;
}

function chainIdToDecimal(chainId: ChainId): number {
  const parts = chainId.split(':');
  return parseInt(parts[1], 10);
}

function buildAssetId(
  chainId: ChainId,
  tokenAddress: string,
  isNative: boolean,
): Caip19AssetId {
  if (isNative) {
    return `${chainId}/slip44:60` as Caip19AssetId;
  }
  // Address is normalized (checksummed) at the AssetsController level
  return `${chainId}/erc20:${tokenAddress}` as Caip19AssetId;
}

function balanceToRawAmount(balanceStr: string, decimals: number): string {
  try {
    const [integerPart = '0', decimalPart = ''] = balanceStr.split('.');
    const paddedDecimalPart = decimalPart
      .padEnd(decimals, '0')
      .slice(0, decimals);
    const fullIntegerStr = integerPart + paddedDecimalPart;
    return new BN(fullIntegerStr).toString();
  } catch {
    return '0';
  }
}

// ============================================================================
// ACCOUNTS API DATA SOURCE
// ============================================================================

/**
 * Data source for fetching balances from the MetaMask Accounts API.
 *
 * Uses Messenger pattern for all interactions:
 * - Calls BackendApiClient methods via messenger actions
 * - Exposes its own actions for AssetsController to call
 * - Publishes events for AssetsController to subscribe to
 *
 * Actions exposed:
 * - AccountsApiDataSource:getActiveChains
 * - AccountsApiDataSource:fetch
 * - AccountsApiDataSource:subscribe
 * - AccountsApiDataSource:unsubscribe
 *
 * Events published:
 * - AccountsApiDataSource:activeChainsChanged
 * - AccountsApiDataSource:assetsUpdated
 *
 * Actions called (from BackendApiClient):
 * - BackendApiClient:Accounts:getV2SupportedNetworks
 * - BackendApiClient:Accounts:getV4MultiAccountBalances
 */
export class AccountsApiDataSource extends AbstractDataSource<
  typeof CONTROLLER_NAME,
  AccountsApiDataSourceState
> {
  readonly #messenger: AccountsApiDataSourceMessenger;

  readonly #pollInterval: number;

  /** WebSocket connection for real-time updates */
  #websocket: WebSocket | null = null;

  /** Chains refresh timer */
  #chainsRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: AccountsApiDataSourceOptions) {
    super(CONTROLLER_NAME, {
      ...defaultState,
      ...options.state,
    });

    this.#messenger = options.messenger;
    this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;

    log('Initializing AccountsApiDataSource', {
      pollInterval: this.#pollInterval,
    });

    this.#registerActionHandlers();
    this.#initializeActiveChains();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  #registerActionHandlers(): void {
    // Define strongly-typed handlers
    const getActiveChainsHandler: AccountsApiDataSourceGetActiveChainsAction['handler'] =
      async () => this.getActiveChains();

    const fetchHandler: AccountsApiDataSourceFetchAction['handler'] = async (
      request,
    ) => this.fetch(request);

    const subscribeHandler: AccountsApiDataSourceSubscribeAction['handler'] =
      async (request) => this.subscribe(request);

    const unsubscribeHandler: AccountsApiDataSourceUnsubscribeAction['handler'] =
      async (subscriptionId) => this.unsubscribe(subscriptionId);

    // Register handlers
    this.#messenger.registerActionHandler(
      'AccountsApiDataSource:getActiveChains',
      getActiveChainsHandler,
    );

    this.#messenger.registerActionHandler(
      'AccountsApiDataSource:fetch',
      fetchHandler,
    );

    this.#messenger.registerActionHandler(
      'AccountsApiDataSource:subscribe',
      subscribeHandler,
    );

    this.#messenger.registerActionHandler(
      'AccountsApiDataSource:unsubscribe',
      unsubscribeHandler,
    );
  }

  async #initializeActiveChains(): Promise<void> {
    log('Initializing active chains');
    try {
      const chains = await this.#fetchActiveChains();
      log('Active chains fetched', { chainCount: chains.length, chains });
      this.updateActiveChains(chains, (c) =>
        this.#messenger.publish('AccountsApiDataSource:activeChainsChanged', c),
      );

      // Periodically refresh active chains (every 5 minutes)
      this.#chainsRefreshTimer = setInterval(
        () => this.#refreshActiveChains(),
        5 * 60 * 1000,
      );
    } catch (error) {
      log('Failed to fetch active chains', error);
    }
  }

  async #refreshActiveChains(): Promise<void> {
    log('Refreshing active chains');
    try {
      const chains = await this.#fetchActiveChains();
      const previousChains = new Set(this.state.activeChains);
      const newChains = new Set(chains);

      // Check if chains changed
      const added = chains.filter((c) => !previousChains.has(c));
      const removed = Array.from(previousChains).filter(
        (c) => !newChains.has(c),
      );

      if (added.length > 0 || removed.length > 0) {
        log('Active chains changed', { added, removed });
        this.updateActiveChains(chains, (c) =>
          this.#messenger.publish(
            'AccountsApiDataSource:activeChainsChanged',
            c,
          ),
        );
      }
    } catch (error) {
      log('Failed to refresh active chains', error);
    }
  }

  async #fetchActiveChains(): Promise<ChainId[]> {
    // Call BackendApiClient via messenger (v2 provides fullSupport and partialSupport)
    const response = (await this.#messenger.call(
      'BackendApiClient:Accounts:getV2SupportedNetworks',
    )) as GetV2SupportedNetworksResponse;
    // Use fullSupport networks as active chains
    return response.fullSupport.map(decimalToChainId);
  }

  // ============================================================================
  // FETCH
  // ============================================================================

  async fetch(request: DataFetchRequest): Promise<DataResponse> {
    const response: DataResponse = {};

    // Filter to active chains only
    const chainsToFetch = request.chainIds.filter((chainId) =>
      this.state.activeChains.includes(chainId),
    );

    log('Fetch requested', {
      accountIds: request.accountIds,
      addresses: request.addresses,
      requestedChains: request.chainIds,
      chainsToFetch,
    });

    if (chainsToFetch.length === 0) {
      log('No active chains to fetch');
      return response;
    }

    try {
      // Build CAIP-10 account addresses
      const networkIds = chainsToFetch.map(chainIdToDecimal);
      const caipAddresses = request.addresses.flatMap((address) =>
        chainsToFetch.map((chainId) => `${chainId}:${address}`),
      );

      log('Calling Accounts API', {
        networkCount: networkIds.length,
        addressCount: caipAddresses.length,
      });

      // Call BackendApiClient via messenger
      const apiResponse = (await this.#messenger.call(
        'BackendApiClient:Accounts:getV4MultiAccountBalances',
        {
          accountAddresses: caipAddresses,
          networks: networkIds,
        } as GetMultiAccountBalancesOptions,
      )) as GetV4MultiAccountBalancesResponse;

      log('Accounts API response received', {
        balanceCount: apiResponse.balances.length,
        unprocessedNetworks: apiResponse.unprocessedNetworks,
      });

      // Remove unprocessed networks from active chains
      if (apiResponse.unprocessedNetworks.length > 0) {
        const unprocessedChainIds =
          apiResponse.unprocessedNetworks.map(decimalToChainId);
        log('Unprocessed networks detected', { unprocessedChainIds });
        const updatedActiveChains = this.state.activeChains.filter(
          (c) => !unprocessedChainIds.includes(c),
        );
        if (updatedActiveChains.length !== this.state.activeChains.length) {
          this.updateActiveChains(updatedActiveChains, (c) =>
            this.#messenger.publish(
              'AccountsApiDataSource:activeChainsChanged',
              c,
            ),
          );
        }
      }

      // Process balances (metadata is fetched separately via metadata enrichment)
      const { assetsBalance } = this.#processBalances(
        apiResponse.balances,
        request,
      );

      // Log detailed balance information
      for (const [accountId, balances] of Object.entries(assetsBalance)) {
        const balanceDetails = Object.entries(balances).map(
          ([assetId, balance]) => ({
            assetId,
            amount: balance.amount,
          }),
        );
        log('Fetch result - account balances', {
          accountId,
          balances: balanceDetails,
        });
      }

      log('Fetch SUCCESS', {
        accountCount: Object.keys(assetsBalance).length,
        assetCount: Object.keys(
          Object.values(assetsBalance).reduce(
            (acc, b) => ({ ...acc, ...b }),
            {},
          ),
        ).length,
        chains: chainsToFetch,
      });

      response.assetsBalance = assetsBalance;
    } catch (error) {
      log('Fetch FAILED', { error, chains: chainsToFetch });

      // On error, remove failed chains from active chains
      const updatedActiveChains = this.state.activeChains.filter(
        (c) => !chainsToFetch.includes(c),
      );
      if (updatedActiveChains.length !== this.state.activeChains.length) {
        this.updateActiveChains(updatedActiveChains, (c) =>
          this.#messenger.publish(
            'AccountsApiDataSource:activeChainsChanged',
            c,
          ),
        );
      }
    }

    return response;
  }

  #processBalances(
    balances: AccountsApiBalance[],
    request: DataFetchRequest,
  ): {
    assetsBalance: Record<string, Record<Caip19AssetId, AssetBalance>>;
  } {
    const assetsBalance: Record<
      string,
      Record<Caip19AssetId, AssetBalance>
    > = {};

    for (const balance of balances) {
      const accountParts = balance.accountAddress?.split(':');
      if (!accountParts || accountParts.length < 3) {
        continue;
      }
      const address = accountParts[2].toLowerCase();

      const accountIndex = request.addresses.findIndex(
        (addr) => addr.toLowerCase() === address,
      );
      if (accountIndex === -1) {
        continue;
      }
      const accountId = request.accountIds[accountIndex];

      const chainId = decimalToChainId(balance.chainId);
      const isNative =
        balance.type === 'native' ||
        balance.address.toLowerCase() === ZERO_ADDRESS.toLowerCase();
      const assetId = buildAssetId(chainId, balance.address, isNative);

      if (!assetsBalance[accountId]) {
        assetsBalance[accountId] = {};
      }

      assetsBalance[accountId][assetId] = {
        amount: balanceToRawAmount(balance.balance, balance.decimals),
      };
    }

    return { assetsBalance };
  }

  // ============================================================================
  // SUBSCRIBE
  // ============================================================================

  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    // Filter to active chains
    const chainsToSubscribe = request.chainIds.filter((chainId) =>
      this.state.activeChains.includes(chainId),
    );

    log('Subscribe requested', {
      subscriptionId,
      isUpdate,
      accountIds: request.accountIds,
      requestedChains: request.chainIds,
      chainsToSubscribe,
    });

    if (chainsToSubscribe.length === 0) {
      log('No active chains to subscribe');
      return;
    }

    // Handle subscription update
    if (isUpdate) {
      const existing = this.activeSubscriptions.get(subscriptionId);
      if (existing) {
        log('Updating existing subscription', {
          subscriptionId,
          chainsToSubscribe,
        });
        existing.chains = chainsToSubscribe;
        return;
      }
    }

    // Clean up existing subscription if any
    await this.unsubscribe(subscriptionId);

    const pollInterval = request.updateInterval ?? this.#pollInterval;
    log('Setting up polling subscription', { subscriptionId, pollInterval });

    // Create poll function for this subscription
    const pollFn = async () => {
      try {
        const subscription = this.activeSubscriptions.get(subscriptionId);
        if (!subscription) {
          return;
        }

        const fetchResponse = await this.fetch({
          ...request,
          chainIds: subscription.chains,
        });

        // Publish update
        this.#messenger.publish(
          'AccountsApiDataSource:assetsUpdated',
          fetchResponse,
          CONTROLLER_NAME,
        );
      } catch (error) {
        log('Subscription poll failed', { subscriptionId, error });
      }
    };

    // Set up polling
    const timer = setInterval(pollFn, pollInterval);

    // Store subscription
    this.activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        log('Cleaning up subscription', { subscriptionId });
        clearInterval(timer);
      },
      chains: chainsToSubscribe,
    });

    log('Subscription SUCCESS', { subscriptionId, chains: chainsToSubscribe });

    // Initial fetch
    await pollFn();
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    log('Destroying AccountsApiDataSource');

    // Clean up timers
    if (this.#chainsRefreshTimer) {
      clearInterval(this.#chainsRefreshTimer);
    }

    // Clean up WebSocket
    if (this.#websocket) {
      this.#websocket.close();
    }

    // Clean up subscriptions
    super.destroy();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates an AccountsApiDataSource instance.
 */
export function createAccountsApiDataSource(
  options: AccountsApiDataSourceOptions,
): AccountsApiDataSource {
  return new AccountsApiDataSource(options);
}
