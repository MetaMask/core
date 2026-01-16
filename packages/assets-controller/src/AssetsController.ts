import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import type { CaipAssetType, Hex } from '@metamask/utils';

import type { PollingAccount } from './AssetsPollingMiddleware';
import { AssetsPollingMiddleware } from './AssetsPollingMiddleware';
import type {
  RpcDatasourceConfig,
  RpcDatasourceDependencies,
} from './rpc-datasource/interfaces';
import { RpcDatasource } from './rpc-datasource/RpcDatasource';
import type {
  AccountId,
  Asset,
  AssetType,
  AssetsBalanceChangedEvent,
  AssetsChangedEvent,
  AssetsPriceChangedEvent,
  ChainId,
  PollingInput,
  TokenListState,
  UserTokensState,
} from './rpc-datasource/types';

// =============================================================================
// EXTERNAL CONTROLLER ACTION TYPES
// =============================================================================

/**
 * TokenListController getState action type.
 */
type TokenListControllerGetStateAction = {
  type: 'TokenListController:getState';
  handler: () => {
    tokensChainsCache: Record<
      Hex,
      {
        timestamp: number;
        data: Record<
          string,
          {
            address: string;
            symbol: string;
            name: string;
            decimals: number;
            iconUrl?: string;
            aggregators?: string[];
            occurrences?: number;
          }
        >;
      }
    >;
    preventPollingOnNetworkRestart: boolean;
  };
};

/**
 * AccountsController getAccount action type.
 */
type AccountsControllerGetAccountAction = {
  type: 'AccountsController:getAccount';
  handler: (accountId: string) => InternalAccount | undefined;
};

// =============================================================================
// STATE TYPES
// =============================================================================

/**
 * Asset metadata stored once per asset.
 * Different asset types may have different attributes.
 */
export type AssetMetadata = {
  /** Asset type */
  type: AssetType;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** Logo image URL */
  image?: string;
  /** Verification status */
  verified?: boolean;
  /** Spam detection flag */
  isSpam?: boolean;
  /** Token list sources / collections */
  collections?: string[];
  /** For NFTs: collection name */
  collectionName?: string;
  /** For NFTs: collection size */
  collectionSize?: number;
  /** For LP tokens: pool identifier */
  pool?: string;
  /** For LP tokens: first token in pair */
  token0?: CaipAssetType;
  /** For LP tokens: second token in pair */
  token1?: CaipAssetType;
  /** For LP tokens: fee percentage */
  fee?: number;
};

/**
 * Asset price data updated frequently.
 * Different asset types may have different price attributes.
 */
export type AssetPriceData = {
  /** Price in fiat currency */
  price: number;
  /** 24h price change percentage */
  priceChange24h?: number;
  /** Market cap (for fungible tokens) */
  marketCap?: number;
  /** 24h volume (for fungible tokens) */
  volume24h?: number;
  /** Floor price in native currency (for NFTs) */
  floorPrice?: number;
  /** Last sale price (for NFTs) */
  lastSalePrice?: number;
  /** Collection volume (for NFTs) */
  collectionVolume?: number;
  /** Total Value Locked (for LP tokens) */
  tvl?: number;
  /** Price of token0 (for LP tokens) */
  token0Price?: number;
  /** Price of token1 (for LP tokens) */
  token1Price?: number;
  /** Last updated timestamp */
  lastUpdated: number;
};

/**
 * Asset balance data per account.
 * Different asset types may have different balance attributes.
 */
export type AssetBalanceData = {
  /** Raw balance as string (for fungible tokens) */
  amount?: string;
  /** Human-readable balance (amount / 10^decimals) */
  formattedBalance?: string;
  /** Token decimals used for formatting */
  decimals?: number;
  /** Token IDs owned (for NFTs) */
  tokenIds?: string[];
  /** Pool share percentage (for LP tokens) */
  share?: number;
  /** Claimable rewards (for LP tokens) */
  claimableRewards?: string;
  /** Last updated timestamp */
  lastUpdated: number;
};

/**
 * The name of the {@link AssetsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'AssetsController';

/**
 * Describes the shape of the state object for {@link AssetsController}.
 */
export type AssetsControllerState = {
  /**
   * Shared metadata stored once per asset.
   * Key: CAIP-19 asset identifier
   */
  assetsMetadata: Record<CaipAssetType, AssetMetadata>;

  /**
   * Price data per asset, updated frequently.
   * Key: CAIP-19 asset identifier
   */
  assetsPrice: Record<CaipAssetType, AssetPriceData>;

  /**
   * Per-account balances.
   * Key: Account ID -> CAIP-19 asset identifier -> balance data
   */
  assetsBalance: Record<AccountId, Record<CaipAssetType, AssetBalanceData>>;

  /**
   * Assets that have been explicitly ignored by the user.
   * Key: Account ID -> Set of CAIP-19 asset identifiers
   */
  ignoredAssets: Record<AccountId, CaipAssetType[]>;
};

/**
 * The metadata for each property in {@link AssetsControllerState}.
 */
const assetsControllerMetadata: StateMetadata<AssetsControllerState> = {
  assetsMetadata: {
    persist: true,
    includeInStateLogs: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  assetsPrice: {
    persist: true,
    includeInStateLogs: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  assetsBalance: {
    persist: true,
    includeInStateLogs: false, // May contain sensitive balance info
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  ignoredAssets: {
    persist: true,
    includeInStateLogs: false,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
};

/**
 * Constructs the default {@link AssetsController} state.
 *
 * @returns The default {@link AssetsController} state.
 */
export function getDefaultAssetsControllerState(): AssetsControllerState {
  return {
    assetsMetadata: {},
    assetsPrice: {},
    assetsBalance: {},
    ignoredAssets: {},
  };
}

/**
 * Retrieves the state of the {@link AssetsController}.
 */
export type AssetsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AssetsControllerState
>;

/**
 * Actions that {@link AssetsControllerMessenger} exposes to other consumers.
 */
export type AssetsControllerActions = AssetsControllerGetStateAction;

/**
 * Actions from other messengers that {@link AssetsControllerMessenger} calls.
 */
type AllowedActions =
  | TokenListControllerGetStateAction
  | AccountsControllerGetAccountAction;

/**
 * Published when the state of {@link AssetsController} changes.
 */
export type AssetsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AssetsControllerState
>;

/**
 * Events that {@link AssetsControllerMessenger} exposes to other consumers.
 */
export type AssetsControllerEvents = AssetsControllerStateChangeEvent;

/**
 * Events from other messengers that {@link AssetsControllerMessenger} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link AssetsController}.
 */
export type AssetsControllerMessenger = Messenger<
  typeof controllerName,
  AssetsControllerActions | AllowedActions,
  AssetsControllerEvents | AllowedEvents
>;

/**
 * Polling target (chain + account pair).
 */
export type PollingTarget = PollingInput;

/**
 * Options for constructing an AssetsController.
 */
export type AssetsControllerOptions = {
  /** The messenger suited for this controller */
  messenger: AssetsControllerMessenger;
  /** Initial state */
  state?: Partial<AssetsControllerState>;
  /**
   * Optional additional dependencies for RpcDatasource.
   * If not provided, the controller will use messenger calls to get
   * TokenListController, TokensController, and AccountsController state.
   */
  rpcDatasourceDependencies?: Partial<RpcDatasourceDependencies>;
  /** Optional RpcDatasource configuration */
  rpcDatasourceConfig?: RpcDatasourceConfig;
  /**
   * Function to get selected account.
   * Used by polling middleware to determine which account to poll.
   */
  getSelectedAccount?: () => PollingAccount | undefined;
  /**
   * Function to get selected/enabled chain IDs.
   * Used by polling middleware to determine which chains to poll.
   */
  getSelectedChainIds?: () => ChainId[];

  /**
   * Function to check if token detection is enabled.
   * Used by polling middleware to determine if token detection should be enabled.
   */
  isTokenDetectionEnabled?: () => boolean;
};

/**
 * `AssetsController` manages asset tracking for accounts.
 *
 * This controller consolidates asset tracking functionality including:
 * - Asset metadata (stored once per asset)
 * - Asset prices (updated frequently)
 * - Per-account balances
 *
 * It owns and manages an internal RpcDatasource that handles:
 * - Polling for balance updates
 * - Token detection via Multicall3
 * - Event emission for state updates
 *
 * @example
 * ```typescript
 * const assetsController = new AssetsController({
 *   messenger,
 *   rpcDatasourceDependencies: {
 *     getAccount: (id) => accountsController.getAccount(id),
 *     getTokenListState: () => tokenListController.state,
 *     getUserTokensState: () => tokensController.state,
 *     getProvider: (chainId) => networkController.getProvider(chainId),
 *   },
 *   rpcDatasourceConfig: {
 *     pollingIntervalMs: 30000,
 *     detectTokensEnabled: true,
 *   },
 * });
 *
 * // Start polling for an account on a chain
 * assetsController.startPolling({ chainId: '0x1', accountId: 'uuid' });
 *
 * // Read state
 * const assets = assetsController.getAccountAssets(accountId);
 * ```
 */
export class AssetsController extends BaseController<
  typeof controllerName,
  AssetsControllerState,
  AssetsControllerMessenger
> {
  /**
   * Internal RpcDatasource instance that handles polling and RPC calls.
   */
  readonly #rpcDatasource: RpcDatasource;

  /**
   * Internal polling middleware that manages polling lifecycle.
   */
  readonly #pollingMiddleware: AssetsPollingMiddleware;

  /**
   * Function to get selected account.
   */
  readonly #getSelectedAccount: (() => PollingAccount | undefined) | undefined;

  /**
   * Function to get selected chain IDs.
   */
  readonly #getSelectedChainIds: (() => ChainId[]) | undefined;

  /**
   * Function to check if token detection is enabled.
   */
  readonly #isTokenDetectionEnabled: (() => boolean) | undefined;

  /**
   * Constructs a new {@link AssetsController}.
   *
   * @param options - The options for this controller.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - The desired state with which to initialize this
   * controller. Missing properties will be filled in with defaults.
   * @param options.rpcDatasourceDependencies - Dependencies for RpcDatasource.
   * @param options.rpcDatasourceConfig - Optional RpcDatasource configuration.
   * @param options.getSelectedAccount - Function to get selected account.
   * @param options.getSelectedChainIds - Function to get selected chain IDs.
   * @param options.isTokenDetectionEnabled - Function to check if token detection is enabled.
   */
  constructor({
    messenger,
    state,
    rpcDatasourceDependencies,
    rpcDatasourceConfig,
    getSelectedAccount,
    getSelectedChainIds,
    isTokenDetectionEnabled,
  }: AssetsControllerOptions) {
    super({
      messenger,
      metadata: assetsControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultAssetsControllerState(),
        ...state,
      },
    });

    console.log('[AssetsController] Constructor called');
    console.log('[AssetsController] rpcDatasourceConfig:', rpcDatasourceConfig);

    // Store getters
    this.#getSelectedAccount = getSelectedAccount;
    this.#getSelectedChainIds = getSelectedChainIds;
    this.#isTokenDetectionEnabled = isTokenDetectionEnabled;

    // Build RpcDatasource dependencies using messenger calls
    // These can be overridden by the caller if needed
    const dependencies: RpcDatasourceDependencies = {
      // Get account info via messenger
      getAccount: (accountId: AccountId) => {
        const account = this.messenger.call(
          'AccountsController:getAccount',
          accountId,
        );
        if (!account) {
          return undefined;
        }
        return {
          id: account.id,
          address: account.address as Hex,
          type: account.type,
        };
      },

      // Get token list state via messenger
      getTokenListState: (): TokenListState => {
        console.log('[AssetsController] getTokenListState called');
        const rawState = this.messenger.call('TokenListController:getState');

        console.log('[AssetsController] rawState ++++++++++++++:', rawState);

        // Extract 'data' from each chain entry
        const tokensChainsCache: TokenListState['tokensChainsCache'] = {};
        for (const [chainId, cacheEntry] of Object.entries(
          rawState.tokensChainsCache,
        )) {
          tokensChainsCache[chainId as Hex] =
            (cacheEntry.data as TokenListState['tokensChainsCache'][Hex]) ?? {};
        }

        console.log(
          '[AssetsController] tokensChainsCache ++++++++++++++:',
          tokensChainsCache,
        );

        return { tokensChainsCache };
      },

      // Get user tokens state derived from AssetsController's own state
      getUserTokensState: (): UserTokensState => {
        // Derive UserTokensState from our internal state
        // We use assetsBalance to know which tokens we already track
        // and ignoredAssets for tokens the user has dismissed
        return this.#deriveUserTokensState();
      },

      // Pass through token detection enabled getter
      // This allows runtime toggling of token detection
      isTokenDetectionEnabled: this.#isTokenDetectionEnabled,
    };

    // Apply any caller-provided overrides AFTER our defaults
    if (rpcDatasourceDependencies) {
      if (rpcDatasourceDependencies.getAccount) {
        dependencies.getAccount = rpcDatasourceDependencies.getAccount;
      }
      if (rpcDatasourceDependencies.multicallClient) {
        dependencies.multicallClient =
          rpcDatasourceDependencies.multicallClient;
      }
      if (rpcDatasourceDependencies.tokenDetector) {
        dependencies.tokenDetector = rpcDatasourceDependencies.tokenDetector;
      }
      if (rpcDatasourceDependencies.balanceFetcher) {
        dependencies.balanceFetcher = rpcDatasourceDependencies.balanceFetcher;
      }
      // Note: We intentionally do NOT allow overriding getTokenListState
      // and getUserTokensState since they must come from our internal state
    }

    console.log('[AssetsController] Built dependencies from messenger');

    // Create and wire up internal RpcDatasource
    this.#rpcDatasource = new RpcDatasource(dependencies, rpcDatasourceConfig);

    console.log('[AssetsController] RpcDatasource created');

    // Create polling middleware
    this.#pollingMiddleware = new AssetsPollingMiddleware(this);

    console.log('[AssetsController] Polling middleware created');

    // Wire up event handlers
    this.#rpcDatasource.onAssetsChanged((event) => {
      console.log('[AssetsController] onAssetsChanged event received:', event);
      this.#handleAssetsChanged(event);
    });

    this.#rpcDatasource.onAssetsBalanceChanged((event) => {
      console.log(
        '[AssetsController] onAssetsBalanceChanged event received:',
        event,
      );
      this.#handleAssetsBalanceChanged(event);
    });

    this.#rpcDatasource.onAssetsPriceChanged((event) => {
      console.log(
        '[AssetsController] onAssetsPriceChanged event received:',
        event,
      );
      this.#handleAssetsPriceChanged(event);
    });

    console.log('[AssetsController] Event handlers wired up');

    // Auto-start polling for selected account on selected chains
    this.#autoStartPolling();
  }

  /**
   * Auto-start polling based on provided getters.
   */
  #autoStartPolling(): void {
    const account = this.#getSelectedAccount?.();
    const chainIds = this.#getSelectedChainIds?.() ?? [];

    console.log('[AssetsController] Auto-start polling check:', {
      account,
      chainIds,
    });

    if (account && chainIds.length > 0) {
      console.log(
        '[AssetsController] Starting polling for selected account on selected chains',
      );
      this.#pollingMiddleware.startPollingForAccount(account.id, chainIds);
    } else {
      console.log(
        '[AssetsController] No selected account or chains, polling not auto-started',
      );
    }
  }

  /**
   * Derive UserTokensState from AssetsController's internal state.
   * This converts our CAIP-19 based state to the format expected by TokenDetector.
   *
   * @returns UserTokensState derived from internal state.
   */
  #deriveUserTokensState(): UserTokensState {
    const { assetsBalance, assetsMetadata, ignoredAssets } = this.state;

    // Initialize result structure
    const allTokens: UserTokensState['allTokens'] = {};
    const allDetectedTokens: UserTokensState['allDetectedTokens'] = {};
    const allIgnoredTokens: UserTokensState['allIgnoredTokens'] = {};

    // Process balances to build token lists
    // CAIP-19 format: eip155:{chainId}/erc20:{address} or eip155:{chainId}/slip44:60
    for (const [accountId, accountBalances] of Object.entries(assetsBalance)) {
      for (const assetId of Object.keys(accountBalances)) {
        // Parse CAIP-19 asset ID
        const parsed = this.#parseCaipAssetId(assetId as CaipAssetType);
        if (!parsed || parsed.type === 'native') {
          // Skip native tokens and unparseable IDs
          continue;
        }

        const { chainId, address } = parsed;

        // Get metadata for this asset
        const metadata = assetsMetadata[assetId as CaipAssetType];

        // Get account address (we need to look it up)
        const accountInfo = this.messenger.call(
          'AccountsController:getAccount',
          accountId,
        );
        const accountAddress = accountInfo?.address?.toLowerCase() as Hex;
        if (!accountAddress) {
          continue;
        }

        // Build token entry
        const tokenEntry = {
          address: address.toLowerCase() as Hex,
          symbol: metadata?.symbol ?? '',
          name: metadata?.name,
          decimals: metadata?.decimals ?? 18,
          image: metadata?.image,
          aggregators: metadata?.collections,
        };

        // Add to allDetectedTokens (all tokens we know about are "detected")
        if (!allDetectedTokens[chainId]) {
          allDetectedTokens[chainId] = {};
        }
        if (!allDetectedTokens[chainId][accountAddress]) {
          allDetectedTokens[chainId][accountAddress] = [];
        }
        allDetectedTokens[chainId][accountAddress].push(tokenEntry);
      }
    }

    // Process ignored assets
    for (const [accountId, ignoredAssetIds] of Object.entries(ignoredAssets)) {
      // Get account address
      const accountInfo = this.messenger.call(
        'AccountsController:getAccount',
        accountId,
      );
      const accountAddress = accountInfo?.address?.toLowerCase() as Hex;
      if (!accountAddress) {
        continue;
      }

      for (const assetId of ignoredAssetIds) {
        const parsed = this.#parseCaipAssetId(assetId);
        if (!parsed) {
          continue;
        }

        const { chainId, address } = parsed;

        if (!allIgnoredTokens[chainId]) {
          allIgnoredTokens[chainId] = {};
        }
        if (!allIgnoredTokens[chainId][accountAddress]) {
          allIgnoredTokens[chainId][accountAddress] = [];
        }
        allIgnoredTokens[chainId][accountAddress].push(
          address.toLowerCase() as Hex,
        );
      }
    }

    return {
      allTokens, // Empty for now - we treat all as detected
      allDetectedTokens,
      allIgnoredTokens,
    };
  }

  /**
   * Parse a CAIP-19 asset ID into components.
   *
   * @param assetId - CAIP-19 asset identifier.
   * @returns Parsed components or undefined if invalid.
   */
  #parseCaipAssetId(assetId: CaipAssetType):
    | {
        chainId: Hex;
        address: Hex;
        type: 'native' | 'erc20';
      }
    | undefined {
    // CAIP-19 format examples:
    // Native: eip155:1/slip44:60
    // ERC20: eip155:1/erc20:0x...
    const match = assetId.match(/^eip155:(\d+)\/(\w+):(.+)$/u);
    if (!match) {
      return undefined;
    }

    const [, chainIdDecimal, assetType, addressOrCoinType] = match;
    const chainId = `0x${parseInt(chainIdDecimal, 10).toString(16)}`;

    if (assetType === 'slip44') {
      // Native token
      return {
        chainId: chainId as Hex,
        address: '0x0000000000000000000000000000000000000000' as Hex,
        type: 'native',
      };
    }

    if (assetType === 'erc20') {
      return {
        chainId: chainId as Hex,
        address: addressOrCoinType as Hex,
        type: 'erc20',
      };
    }

    return undefined;
  }

  // ===========================================================================
  // POLLING CONTROL (delegated to RpcDatasource)
  // ===========================================================================

  /**
   * Start polling for an account on a specific chain.
   *
   * @param input - The polling input containing chainId and accountId.
   * @returns A polling token that can be used to stop this specific poll.
   */
  startPolling(input: PollingInput): string {
    console.log('[AssetsController] startPolling called:', input);
    const token = this.#rpcDatasource.startPolling(input);
    console.log('[AssetsController] startPolling returned token:', token);
    return token;
  }

  /**
   * Stop a specific polling session.
   *
   * @param pollingToken - The token returned from startPolling.
   */
  stopPollingByPollingToken(pollingToken: string): void {
    this.#rpcDatasource.stopPollingByPollingToken(pollingToken);
  }

  /**
   * Stop all active polling sessions.
   */
  stopAllPolling(): void {
    this.#pollingMiddleware.stopAllPolling();
  }

  /**
   * Set the polling interval.
   *
   * @param intervalMs - The polling interval in milliseconds.
   */
  setPollingInterval(intervalMs: number): void {
    this.#rpcDatasource.setIntervalLength(intervalMs);
  }

  // ===========================================================================
  // POLLING MIDDLEWARE METHODS (high-level polling control)
  // ===========================================================================

  /**
   * Handle account selection change.
   * Stops polling for old account and starts for new account on current chains.
   *
   * @param newAccountId - New account ID.
   * @param oldAccountId - Previous account ID (optional).
   */
  onAccountChanged(newAccountId: AccountId, oldAccountId?: AccountId): void {
    const chainIds = this.#getSelectedChainIds?.() ?? [];
    this.#pollingMiddleware.onAccountChanged(
      oldAccountId,
      newAccountId,
      chainIds,
    );
  }

  /**
   * Handle chain enabled/disabled.
   *
   * @param chainId - Chain ID.
   * @param enabled - Whether chain is enabled.
   */
  onChainToggled(chainId: ChainId, enabled: boolean): void {
    const account = this.#getSelectedAccount?.();
    if (account) {
      this.#pollingMiddleware.onChainToggled(chainId, enabled, [account]);
    }
  }

  /**
   * Refresh polling - restarts polling for current account on current chains.
   * Useful after settings change or when resuming from background.
   */
  refreshPolling(): void {
    console.log('[AssetsController] refreshPolling called');

    // Stop all current polling
    this.#pollingMiddleware.stopAllPolling();

    // Restart with current state
    this.#autoStartPolling();
  }

  /**
   * Get the number of active polling sessions.
   *
   * @returns Number of active polls.
   */
  getActivePollingCount(): number {
    return this.#pollingMiddleware.getActivePollingCount();
  }

  // ===========================================================================
  // MANUAL OPERATIONS
  // ===========================================================================

  /**
   * Manually trigger token detection for an account on a chain.
   *
   * @param chainId - The chain ID.
   * @param accountId - The account ID.
   * @returns The detection result.
   */
  async detectTokens(chainId: ChainId, accountId: AccountId): Promise<void> {
    const result = await this.#rpcDatasource.detectTokens(chainId, accountId);

    if (result.detectedAssets.length > 0) {
      this.#handleAssetsChanged({
        chainId,
        accountId,
        assets: result.detectedAssets,
        timestamp: Date.now(),
      });

      if (result.detectedBalances.length > 0) {
        this.#handleAssetsBalanceChanged({
          chainId,
          accountId,
          balances: result.detectedBalances,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Manually trigger balance fetching for an account on a chain.
   *
   * @param chainId - The chain ID.
   * @param accountId - The account ID.
   */
  async fetchBalances(chainId: ChainId, accountId: AccountId): Promise<void> {
    const result = await this.#rpcDatasource.fetchBalances(chainId, accountId);

    if (result.balances.length > 0) {
      this.#handleAssetsBalanceChanged({
        chainId,
        accountId,
        balances: result.balances,
        timestamp: Date.now(),
      });
    }
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Cleanup: stop all polling and release resources.
   */
  destroy(): void {
    this.#pollingMiddleware.destroy();
    this.#rpcDatasource.destroy();
  }

  // ===========================================================================
  // PRIVATE EVENT HANDLERS (called by internal RpcDatasource)
  // ===========================================================================

  /**
   * Handle assets changed event - updates asset metadata.
   * Only updates metadata if it doesn't exist or has changed.
   *
   * @param event - The assets changed event.
   */
  #handleAssetsChanged(event: AssetsChangedEvent): void {
    const { assets } = event;

    if (assets.length === 0) {
      return;
    }

    this.update((state) => {
      for (const asset of assets) {
        const existingMetadata = state.assetsMetadata[asset.assetId];

        // Only update if metadata doesn't exist or has changed
        if (
          !existingMetadata ||
          this.#hasMetadataChanged(existingMetadata, asset)
        ) {
          state.assetsMetadata[asset.assetId] = this.#assetToMetadata(asset);
        }
      }
    });
  }

  /**
   * Handle balance changed event - updates per-account balances.
   * Only updates if balance has changed from previous value.
   *
   * @param event - The balance changed event.
   */
  #handleAssetsBalanceChanged(event: AssetsBalanceChangedEvent): void {
    const { accountId, balances } = event;

    if (balances.length === 0) {
      return;
    }

    this.update((state) => {
      // Initialize account balance map if needed
      if (!state.assetsBalance[accountId]) {
        state.assetsBalance[accountId] = {};
      }

      for (const balance of balances) {
        const existingBalance = state.assetsBalance[accountId][balance.assetId];
        const newBalanceData: AssetBalanceData = {
          amount: balance.balance,
          formattedBalance: balance.formattedBalance,
          decimals: balance.decimals,
          lastUpdated: balance.timestamp,
        };

        // Only update if balance has changed
        if (
          !existingBalance ||
          existingBalance.amount !== newBalanceData.amount
        ) {
          state.assetsBalance[accountId][balance.assetId] = newBalanceData;
        }
      }
    });
  }

  /**
   * Handle price changed event - updates asset prices.
   * Only updates if price has changed from previous value.
   *
   * @param event - The price changed event.
   */
  #handleAssetsPriceChanged(event: AssetsPriceChangedEvent): void {
    const { prices } = event;

    if (prices.length === 0) {
      return;
    }

    this.update((state) => {
      for (const price of prices) {
        const existingPrice = state.assetsPrice[price.assetId];
        const newPriceData: AssetPriceData = {
          price: price.price,
          priceChange24h: price.priceChange24h,
          marketCap: price.marketCap,
          volume24h: price.volume24h,
          lastUpdated: price.timestamp,
        };

        // Only update if price has changed
        if (!existingPrice || existingPrice.price !== newPriceData.price) {
          state.assetsPrice[price.assetId] = newPriceData;
        }
      }
    });
  }

  // ===========================================================================
  // QUERY METHODS
  // ===========================================================================

  /**
   * Get metadata for a specific asset.
   *
   * @param assetId - The CAIP-19 asset identifier.
   * @returns The asset metadata or undefined.
   */
  getAssetMetadata(assetId: CaipAssetType): AssetMetadata | undefined {
    return this.state.assetsMetadata[assetId];
  }

  /**
   * Get price for a specific asset.
   *
   * @param assetId - The CAIP-19 asset identifier.
   * @returns The asset price data or undefined.
   */
  getAssetPrice(assetId: CaipAssetType): AssetPriceData | undefined {
    return this.state.assetsPrice[assetId];
  }

  /**
   * Get balance for a specific account and asset.
   *
   * @param accountId - The account ID.
   * @param assetId - The CAIP-19 asset identifier.
   * @returns The balance data or undefined.
   */
  getAssetBalance(
    accountId: AccountId,
    assetId: CaipAssetType,
  ): AssetBalanceData | undefined {
    return this.state.assetsBalance[accountId]?.[assetId];
  }

  /**
   * Get all balances for a specific account.
   *
   * @param accountId - The account ID.
   * @returns Map of asset ID to balance data.
   */
  getAccountBalances(
    accountId: AccountId,
  ): Record<CaipAssetType, AssetBalanceData> {
    return this.state.assetsBalance[accountId] ?? {};
  }

  /**
   * Get all assets with their metadata, price, and balance for an account.
   *
   * @param accountId - The account ID.
   * @returns Array of combined asset data.
   */
  getAccountAssets(accountId: AccountId): {
    assetId: CaipAssetType;
    metadata?: AssetMetadata;
    price?: AssetPriceData;
    balance?: AssetBalanceData;
  }[] {
    const accountBalances = this.state.assetsBalance[accountId] ?? {};
    const result: {
      assetId: CaipAssetType;
      metadata?: AssetMetadata;
      price?: AssetPriceData;
      balance?: AssetBalanceData;
    }[] = [];

    for (const assetId of Object.keys(accountBalances) as CaipAssetType[]) {
      result.push({
        assetId,
        metadata: this.state.assetsMetadata[assetId],
        price: this.state.assetsPrice[assetId],
        balance: accountBalances[assetId],
      });
    }

    return result;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Convert Asset to AssetMetadata.
   *
   * @param asset - The asset to convert.
   * @returns The asset metadata.
   */
  #assetToMetadata(asset: Asset): AssetMetadata {
    return {
      type: asset.type,
      symbol: asset.symbol ?? '',
      name: asset.name ?? '',
      decimals: asset.decimals ?? 0,
      image: asset.image,
      verified: asset.verified,
      isSpam: asset.isSpam,
      collections: asset.aggregators,
    };
  }

  /**
   * Check if metadata has changed.
   *
   * @param existing - Existing metadata.
   * @param asset - New asset data.
   * @returns True if metadata has changed.
   */
  #hasMetadataChanged(existing: AssetMetadata, asset: Asset): boolean {
    return (
      existing.symbol !== asset.symbol ||
      existing.name !== asset.name ||
      existing.decimals !== asset.decimals ||
      existing.image !== asset.image ||
      existing.verified !== asset.verified ||
      existing.isSpam !== asset.isSpam
    );
  }
}
