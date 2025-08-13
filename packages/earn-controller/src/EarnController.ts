import { Web3Provider } from '@ethersproject/providers';
import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerSelectedAccountChangeEvent,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { convertHexToDecimal, toHex } from '@metamask/controller-utils';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerNetworkDidChangeEvent,
} from '@metamask/network-controller';
import {
  EarnSdk,
  EarnApiService,
  isSupportedLendingChain,
  type LendingMarket,
  type PooledStake,
  type EarnSdkConfig,
  type VaultData,
  type VaultDailyApy,
  type VaultApyAverages,
  type LendingPosition,
  type GasLimitParams,
  type HistoricLendingMarketApys,
  EarnEnvironments,
  ChainId,
  isSupportedPooledStakingChain,
} from '@metamask/stake-sdk';
import {
  type TransactionController,
  TransactionType,
  type TransactionControllerTransactionConfirmedEvent,
} from '@metamask/transaction-controller';

import type {
  RefreshEarnEligibilityOptions,
  RefreshLendingEligibilityOptions,
  RefreshLendingPositionsOptions,
  RefreshPooledStakesOptions,
  RefreshPooledStakingDataOptions,
  RefreshPooledStakingVaultDailyApysOptions,
} from './types';

export const controllerName = 'EarnController';

export type PooledStakingState = {
  [chainId: number]: {
    pooledStakes: PooledStake;
    exchangeRate: string;
    vaultMetadata: VaultData;
    vaultDailyApys: VaultDailyApy[];
    vaultApyAverages: VaultApyAverages;
  };
  isEligible: boolean;
};

export type LendingPositionWithMarket = LendingPosition & {
  marketId: string;
  marketAddress: string;
  protocol: string;
};

// extends LendingPosition to include a marketId, marketAddress, and protocol reference
export type LendingPositionWithMarketReference = Omit<
  LendingPosition,
  'market'
> & {
  marketId: string;
  marketAddress: string;
  protocol: string;
};

export type LendingMarketWithPosition = LendingMarket & {
  position: LendingPositionWithMarketReference;
};

export type LendingState = {
  markets: LendingMarket[]; // list of markets
  positions: LendingPositionWithMarketReference[]; // list of positions
  isEligible: boolean;
};

type StakingTransactionTypes =
  | TransactionType.stakingDeposit
  | TransactionType.stakingUnstake
  | TransactionType.stakingClaim;

const stakingTransactionTypes = new Set<StakingTransactionTypes>([
  TransactionType.stakingDeposit,
  TransactionType.stakingUnstake,
  TransactionType.stakingClaim,
]);

type LendingTransactionTypes =
  | TransactionType.lendingDeposit
  | TransactionType.lendingWithdraw;

const lendingTransactionTypes = new Set<LendingTransactionTypes>([
  TransactionType.lendingDeposit,
  TransactionType.lendingWithdraw,
]);

/**
 * Metadata for the EarnController.
 */
const earnControllerMetadata: StateMetadata<EarnControllerState> = {
  pooled_staking: {
    persist: true,
    anonymous: false,
  },
  lending: {
    persist: true,
    anonymous: false,
  },
  lastUpdated: {
    persist: false,
    anonymous: true,
  },
};

// === State Types ===
export type EarnControllerState = {
  pooled_staking: PooledStakingState;
  lending: LendingState;
  lastUpdated: number;
};

// === Default State ===
export const DEFAULT_LENDING_MARKET: LendingMarket = {
  id: '',
  chainId: 0,
  protocol: '' as LendingMarket['protocol'],
  name: '',
  address: '',
  tvlUnderlying: '0',
  netSupplyRate: 0,
  totalSupplyRate: 0,
  underlying: {
    address: '',
    chainId: 0,
  },
  outputToken: {
    address: '',
    chainId: 0,
  },
  rewards: [
    {
      token: {
        address: '',
        chainId: 0,
      },
      rate: 0,
    },
  ],
};

export const DEFAULT_LENDING_POSITION: LendingPositionWithMarketReference = {
  id: '',
  chainId: 0,
  assets: '0',
  marketId: '',
  marketAddress: '',
  protocol: '',
};

export const DEFAULT_POOLED_STAKING_VAULT_APY_AVERAGES: VaultApyAverages = {
  oneDay: '0',
  oneWeek: '0',
  oneMonth: '0',
  threeMonths: '0',
  sixMonths: '0',
  oneYear: '0',
};

export const DEFAULT_POOLED_STAKING_CHAIN_STATE = {
  pooledStakes: {
    account: '',
    lifetimeRewards: '0',
    assets: '0',
    exitRequests: [],
  },
  exchangeRate: '1',
  vaultMetadata: {
    apy: '0',
    capacity: '0',
    feePercent: 0,
    totalAssets: '0',
    vaultAddress: '0x0000000000000000000000000000000000000000',
  },
  vaultDailyApys: [],
  vaultApyAverages: DEFAULT_POOLED_STAKING_VAULT_APY_AVERAGES,
};

/**
 * Gets the default state for the EarnController.
 *
 * @returns The default EarnController state.
 */
export function getDefaultEarnControllerState(): EarnControllerState {
  return {
    pooled_staking: {
      isEligible: false,
    },
    lending: {
      markets: [DEFAULT_LENDING_MARKET],
      positions: [DEFAULT_LENDING_POSITION],
      isEligible: false,
    },
    lastUpdated: 0,
  };
}

// === MESSENGER ===

/**
 * The action which can be used to retrieve the state of the EarnController.
 */
export type EarnControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  EarnControllerState
>;

/**
 * All actions that EarnController registers, to be called externally.
 */
export type EarnControllerActions = EarnControllerGetStateAction;

/**
 * All actions that EarnController calls internally.
 */
export type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | AccountsControllerGetSelectedAccountAction;

/**
 * The event that EarnController publishes when updating state.
 */
export type EarnControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  EarnControllerState
>;

/**
 * All events that EarnController publishes, to be subscribed to externally.
 */
export type EarnControllerEvents = EarnControllerStateChangeEvent;

/**
 * All events that EarnController subscribes to internally.
 */
export type AllowedEvents =
  | AccountsControllerSelectedAccountChangeEvent
  | TransactionControllerTransactionConfirmedEvent
  | NetworkControllerNetworkDidChangeEvent;

/**
 * The messenger which is restricted to actions and events accessed by
 * EarnController.
 */
export type EarnControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  EarnControllerActions | AllowedActions,
  EarnControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

// === CONTROLLER DEFINITION ===

/**
 * EarnController manages DeFi earning opportunities across different protocols and chains.
 */
export class EarnController extends BaseController<
  typeof controllerName,
  EarnControllerState,
  EarnControllerMessenger
> {
  #earnSDK: EarnSdk | null = null;

  #selectedNetworkClientId: string;

  readonly #earnApiService: EarnApiService;

  readonly #addTransactionFn: typeof TransactionController.prototype.addTransaction;

  readonly #supportedPooledStakingChains: number[];

  readonly #env: EarnEnvironments;

  constructor({
    messenger,
    state = {},
    addTransactionFn,
    selectedNetworkClientId,
    env = EarnEnvironments.PROD,
  }: {
    messenger: EarnControllerMessenger;
    state?: Partial<EarnControllerState>;
    addTransactionFn: typeof TransactionController.prototype.addTransaction;
    selectedNetworkClientId: string;
    env?: EarnEnvironments;
  }) {
    super({
      name: controllerName,
      metadata: earnControllerMetadata,
      messenger,
      state: {
        ...getDefaultEarnControllerState(),
        ...state,
      },
    });

    this.#env = env;

    this.#earnApiService = new EarnApiService(this.#env);

    // temporary array of supported chains
    // TODO: remove this once we export a supported chains list from the sdk
    // from sdk or api to get lending and pooled staking chains
    this.#supportedPooledStakingChains = [ChainId.ETHEREUM, ChainId.HOODI];

    this.#addTransactionFn = addTransactionFn;

    this.#selectedNetworkClientId = selectedNetworkClientId;

    this.#initializeSDK(selectedNetworkClientId).catch(console.error);
    this.refreshPooledStakingData().catch(console.error);
    this.refreshLendingData().catch(console.error);

    // Listen for network changes
    this.messagingSystem.subscribe(
      'NetworkController:networkDidChange',
      (networkControllerState) => {
        this.#selectedNetworkClientId =
          networkControllerState.selectedNetworkClientId;

        this.#initializeSDK(this.#selectedNetworkClientId).catch(console.error);

        // refresh pooled staking data
        this.refreshPooledStakingVaultMetadata().catch(console.error);
        this.refreshPooledStakingVaultDailyApys().catch(console.error);
        this.refreshPooledStakingVaultApyAverages().catch(console.error);
        this.refreshPooledStakes().catch(console.error);

        // refresh lending data for all chains
        this.refreshLendingMarkets().catch(console.error);
        this.refreshLendingPositions().catch(console.error);
      },
    );

    // Listen for account changes
    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      (account) => {
        const address = account?.address;
        /**
         * TEMP: There's a race condition where the account state isn't updated immediately.
         * Until this has been fixed, we rely on the event payload for the latest account instead of #getCurrentAccount().
         * Issue: https://github.com/MetaMask/accounts-planning/issues/887
         */

        // TODO: temp solution, this will refresh lending eligibility also
        // we could have a more general check, as what is happening is a compliance address check
        this.refreshEarnEligibility({ address }).catch(console.error);
        this.refreshPooledStakes({ address }).catch(console.error);
        this.refreshLendingPositions({ address }).catch(console.error);
      },
    );

    // Listen for confirmed staking transactions
    this.messagingSystem.subscribe(
      'TransactionController:transactionConfirmed',
      (transactionMeta) => {
        /**
         * When we speed up a transaction, we set the type as Retry and we lose
         * information about type of transaction that is being set up, so we use
         * original type to track that information.
         */
        const { type, originalType } = transactionMeta;

        const isStakingTransaction =
          stakingTransactionTypes.has(type as StakingTransactionTypes) ||
          stakingTransactionTypes.has(originalType as StakingTransactionTypes);

        const isLendingTransaction =
          lendingTransactionTypes.has(type as LendingTransactionTypes) ||
          lendingTransactionTypes.has(originalType as LendingTransactionTypes);

        const sender = transactionMeta.txParams.from;

        if (isStakingTransaction) {
          this.refreshPooledStakes({ resetCache: true, address: sender }).catch(
            console.error,
          );
        }
        if (isLendingTransaction) {
          this.refreshLendingPositions({ address: sender }).catch(
            console.error,
          );
        }
      },
    );
  }

  /**
   * Initializes the Earn SDK.
   *
   * @param networkClientId - The network client id to initialize the Earn SDK for.
   */
  async #initializeSDK(networkClientId: string) {
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );

    if (!networkClient?.provider) {
      this.#earnSDK = null;
      return;
    }

    const provider = new Web3Provider(networkClient.provider);
    const { chainId } = networkClient.configuration;

    // Initialize appropriate contracts based on chainId
    const config: EarnSdkConfig = {
      chainId: convertHexToDecimal(chainId),
      env: this.#env,
    };

    try {
      this.#earnSDK = await EarnSdk.create(provider, config);
    } catch (error) {
      this.#earnSDK = null;
      // Only log unexpected errors, not unsupported chain errors
      if (
        !(
          error instanceof Error &&
          error.message.includes('Unsupported chainId')
        )
      ) {
        console.error('Earn SDK initialization failed:', error);
      }
    }
  }

  /**
   * Gets the current account.
   *
   * @returns The current account.
   */
  #getCurrentAccount() {
    return this.messagingSystem.call('AccountsController:getSelectedAccount');
  }

  /**
   * Refreshes the pooled stakes data for the current account.
   * Fetches updated stake information including lifetime rewards, assets, and exit requests
   * from the staking API service and updates the state.
   *
   * @param options - Optional arguments
   * @param [options.resetCache] - Control whether the BE cache should be invalidated (optional).
   * @param [options.address] - The address to refresh pooled stakes for (optional).
   * @param [options.chainId] - The chain id to refresh pooled stakes for (optional).
   * @returns A promise that resolves when the stakes data has been updated
   */
  async refreshPooledStakes({
    resetCache = false,
    address,
    chainId = ChainId.ETHEREUM,
  }: RefreshPooledStakesOptions = {}): Promise<void> {
    const addressToUse = address ?? this.#getCurrentAccount()?.address;

    if (!addressToUse) {
      return;
    }

    const chainIdToUse = isSupportedPooledStakingChain(chainId)
      ? chainId
      : ChainId.ETHEREUM;

    const { accounts, exchangeRate } =
      await this.#earnApiService.pooledStaking.getPooledStakes(
        [addressToUse],
        chainIdToUse,
        resetCache,
      );

    this.update((state) => {
      const chainState =
        state.pooled_staking[chainIdToUse] ??
        DEFAULT_POOLED_STAKING_CHAIN_STATE;
      state.pooled_staking[chainIdToUse] = {
        ...chainState,
        pooledStakes: accounts[0],
        exchangeRate,
      };
    });
  }

  /**
   * Refreshes the earn eligibility status for the current account.
   * Updates the eligibility status in the controller state based on the location and address blocklist for compliance.
   *
   * Note: Pooled-staking and Lending used the same result since there isn't a need to split these up right now.
   *
   * @param options - Optional arguments
   * @param [options.address] - Address to refresh earn eligibility for (optional).
   * @returns A promise that resolves when the eligibility status has been updated
   */
  async refreshEarnEligibility({
    address,
  }: RefreshEarnEligibilityOptions = {}): Promise<void> {
    const addressToCheck = address ?? this.#getCurrentAccount()?.address;

    if (!addressToCheck) {
      return;
    }

    const { eligible: isEligible } =
      await this.#earnApiService.pooledStaking.getPooledStakingEligibility([
        addressToCheck,
      ]);

    this.update((state) => {
      state.pooled_staking.isEligible = isEligible;
      state.lending.isEligible = isEligible;
    });
  }

  /**
   * Refreshes pooled staking vault metadata for the current chain.
   * Updates the vault metadata in the controller state including APY, capacity,
   * fee percentage, total assets, and vault address.
   *
   * @param [chainId] - The chain id to refresh pooled staking vault metadata for (optional).
   * @returns A promise that resolves when the vault metadata has been updated
   */
  async refreshPooledStakingVaultMetadata(
    chainId: number = ChainId.ETHEREUM,
  ): Promise<void> {
    const chainIdToUse = isSupportedPooledStakingChain(chainId)
      ? chainId
      : ChainId.ETHEREUM;

    const vaultMetadata =
      await this.#earnApiService.pooledStaking.getVaultData(chainIdToUse);

    this.update((state) => {
      const chainState =
        state.pooled_staking[chainIdToUse] ??
        DEFAULT_POOLED_STAKING_CHAIN_STATE;
      state.pooled_staking[chainIdToUse] = {
        ...chainState,
        vaultMetadata,
      };
    });
  }

  /**
   * Refreshes pooled staking vault daily apys for the current chain.
   * Updates the pooled staking vault daily apys controller state.
   *
   * @param [options] - The options for refreshing pooled staking vault daily apys.
   * @param [options.chainId] - The chain id to refresh pooled staking vault daily apys for (defaults to Ethereum).
   * @param [options.days] - The number of days to fetch pooled staking vault daily apys for (defaults to 365).
   * @param [options.order] - The order in which to fetch pooled staking vault daily apys. Descending order fetches the latest N days (latest working backwards). Ascending order fetches the oldest N days (oldest working forwards) (defaults to 'desc').
   * @returns A promise that resolves when the pooled staking vault daily apys have been updated.
   */
  async refreshPooledStakingVaultDailyApys({
    chainId = ChainId.ETHEREUM,
    days = 365,
    order = 'desc',
  }: RefreshPooledStakingVaultDailyApysOptions = {}): Promise<void> {
    const chainIdToUse = isSupportedPooledStakingChain(chainId)
      ? chainId
      : ChainId.ETHEREUM;

    const vaultDailyApys =
      await this.#earnApiService.pooledStaking.getVaultDailyApys(
        chainIdToUse,
        days,
        order,
      );

    this.update((state) => {
      const chainState =
        state.pooled_staking[chainIdToUse] ??
        DEFAULT_POOLED_STAKING_CHAIN_STATE;
      state.pooled_staking[chainIdToUse] = {
        ...chainState,
        vaultDailyApys,
      };
    });
  }

  /**
   * Refreshes pooled staking vault apy averages for the current chain.
   * Updates the pooled staking vault apy averages controller state.
   *
   * @param [chainId] - The chain id to refresh pooled staking vault apy averages for (optional).
   * @returns A promise that resolves when the pooled staking vault apy averages have been updated.
   */
  async refreshPooledStakingVaultApyAverages(
    chainId: number = ChainId.ETHEREUM,
  ) {
    const chainIdToUse = isSupportedPooledStakingChain(chainId)
      ? chainId
      : ChainId.ETHEREUM;

    const vaultApyAverages =
      await this.#earnApiService.pooledStaking.getVaultApyAverages(
        chainIdToUse,
      );

    this.update((state) => {
      const chainState =
        state.pooled_staking[chainIdToUse] ??
        DEFAULT_POOLED_STAKING_CHAIN_STATE;
      state.pooled_staking[chainIdToUse] = {
        ...chainState,
        vaultApyAverages,
      };
    });
  }

  /**
   * Refreshes all pooled staking related data including stakes, eligibility, and vault data.
   * This method allows partial success, meaning some data may update while other requests fail.
   * All errors are collected and thrown as a single error message.
   *
   * @param options - Optional arguments
   * @param [options.resetCache] - Control whether the BE cache should be invalidated (optional).
   * @param [options.address] - The address to refresh pooled stakes for (optional).
   * @returns A promise that resolves when all possible data has been updated
   * @throws {Error} If any of the refresh operations fail, with concatenated error messages
   */
  async refreshPooledStakingData({
    resetCache,
    address,
  }: RefreshPooledStakingDataOptions = {}): Promise<void> {
    const errors: Error[] = [];

    // Refresh earn eligibility once since it's not chain-specific
    await this.refreshEarnEligibility({ address }).catch((error) => {
      errors.push(error);
    });

    for (const chainId of this.#supportedPooledStakingChains) {
      await Promise.all([
        this.refreshPooledStakes({ resetCache, address, chainId }).catch(
          (error) => {
            errors.push(error);
          },
        ),
        this.refreshPooledStakingVaultMetadata(chainId).catch((error) => {
          errors.push(error);
        }),
        this.refreshPooledStakingVaultDailyApys({ chainId }).catch((error) => {
          errors.push(error);
        }),
        this.refreshPooledStakingVaultApyAverages(chainId).catch((error) => {
          errors.push(error);
        }),
      ]);
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to refresh some staking data: ${errors
          .map((e) => e.message)
          .join(', ')}`,
      );
    }
  }

  /**
   * Refreshes the lending markets data for all chains.
   * Updates the lending markets in the controller state.
   *
   * @returns A promise that resolves when the lending markets have been updated
   */
  async refreshLendingMarkets(): Promise<void> {
    const markets = await this.#earnApiService.lending.getMarkets();

    this.update((state) => {
      state.lending.markets = markets;
    });
  }

  /**
   * Refreshes the lending positions for the current account.
   * Updates the lending positions in the controller state.
   *
   * @param options - Optional arguments
   * @param [options.address] - The address to refresh lending positions for (optional).
   * @returns A promise that resolves when the lending positions have been updated
   */
  async refreshLendingPositions({
    address,
  }: RefreshLendingPositionsOptions = {}): Promise<void> {
    const addressToUse = address ?? this.#getCurrentAccount()?.address;

    if (!addressToUse) {
      return;
    }

    // linter complaining about this not being a promise, but it is
    // TODO: figure out why this is not seen as a promise
    const positions = await Promise.resolve(
      this.#earnApiService.lending.getPositions(addressToUse),
    );

    this.update((state) => {
      state.lending.positions = positions.map((position) => ({
        ...position,
        marketId: position.market.id,
        marketAddress: position.market.address,
        protocol: position.market.protocol,
      }));
    });
  }

  /**
   * Refreshes the lending eligibility status for the current account.
   * Updates the eligibility status in the controller state based on the location and address blocklist for compliance.
   *
   * @param options - Optional arguments
   * @param [options.address] - The address to refresh lending eligibility for (optional).
   * @returns A promise that resolves when the eligibility status has been updated
   */
  async refreshLendingEligibility({
    address,
  }: RefreshLendingEligibilityOptions = {}): Promise<void> {
    const addressToUse = address ?? this.#getCurrentAccount()?.address;
    // TODO: this is a temporary solution to refresh lending eligibility as
    // the eligibility check is not yet implemented for lending
    // this check will check the address against the same blocklist as the
    // staking eligibility check

    if (!addressToUse) {
      return;
    }

    const { eligible: isEligible } =
      await this.#earnApiService.pooledStaking.getPooledStakingEligibility([
        addressToUse,
      ]);

    this.update((state) => {
      state.lending.isEligible = isEligible;
      state.pooled_staking.isEligible = isEligible;
    });
  }

  /**
   * Refreshes all lending related data including markets, positions, and eligibility.
   * This method allows partial success, meaning some data may update while other requests fail.
   * All errors are collected and thrown as a single error message.
   *
   * @returns A promise that resolves when all possible data has been updated
   * @throws {Error} If any of the refresh operations fail, with concatenated error messages
   */
  async refreshLendingData(): Promise<void> {
    const errors: Error[] = [];

    await Promise.all([
      this.refreshLendingMarkets().catch((error) => {
        errors.push(error);
      }),
      this.refreshLendingPositions().catch((error) => {
        errors.push(error);
      }),
      this.refreshLendingEligibility().catch((error) => {
        errors.push(error);
      }),
    ]);

    if (errors.length > 0) {
      throw new Error(
        `Failed to refresh some lending data: ${errors
          .map((e) => e.message)
          .join(', ')}`,
      );
    }
  }

  /**
   * Gets the lending position history for the current account.
   *
   * @param options - Optional arguments
   * @param [options.address] - The address to get lending position history for (optional).
   * @param options.chainId - The chain id to get lending position history for.
   * @param [options.positionId] - The position id to get lending position history for.
   * @param [options.marketId] - The market id to get lending position history for.
   * @param [options.marketAddress] - The market address to get lending position history for.
   * @param [options.protocol] - The protocol to get lending position history for.
   * @param [options.days] - The number of days to get lending position history for (optional).
   * @returns A promise that resolves when the lending position history has been updated
   */
  getLendingPositionHistory({
    address,
    chainId,
    positionId,
    marketId,
    marketAddress,
    protocol,
    days = 730,
  }: {
    address?: string;
    chainId: number;
    positionId: string;
    marketId: string;
    marketAddress: string;
    protocol: string;
    days?: number;
  }) {
    const addressToUse = address ?? this.#getCurrentAccount()?.address;

    if (!addressToUse || !isSupportedLendingChain(chainId)) {
      return [];
    }

    return this.#earnApiService.lending.getPositionHistory(
      addressToUse,
      chainId,
      protocol,
      marketId,
      marketAddress,
      positionId,
      days,
    );
  }

  /**
   * Gets the lending market daily apys and averages for the current chain.
   *
   * @param options - Optional arguments
   * @param options.chainId - The chain id to get lending market daily apys and averages for.
   * @param [options.protocol] - The protocol to get lending market daily apys and averages for.
   * @param [options.marketId] - The market id to get lending market daily apys and averages for.
   * @param [options.days] - The number of days to get lending market daily apys and averages for (optional).
   * @returns A promise that resolves when the lending market daily apys and averages have been updated
   */
  getLendingMarketDailyApysAndAverages({
    chainId,
    protocol,
    marketId,
    days = 365,
  }: {
    chainId: number;
    protocol: string;
    marketId: string;
    days?: number;
  }): Promise<HistoricLendingMarketApys> | undefined {
    if (!isSupportedLendingChain(chainId)) {
      return undefined;
    }

    return this.#earnApiService.lending.getHistoricMarketApys(
      chainId,
      protocol,
      marketId,
      days,
    );
  }

  /**
   * Executes a lending deposit transaction.
   *
   * @param options - The options for the lending deposit transaction.
   * @param options.amount - The amount to deposit.
   * @param options.chainId - The chain ID for the lending deposit transaction.
   * @param options.protocol - The protocol of the lending market.
   * @param options.underlyingTokenAddress - The address of the underlying token.
   * @param options.gasOptions - The gas options for the transaction.
   * @param options.gasOptions.gasLimit - The gas limit for the transaction.
   * @param options.gasOptions.gasBufferPct - The gas buffer percentage for the transaction.
   * @param options.txOptions - The transaction options for the transaction.
   * @returns A promise that resolves to the transaction hash.
   */
  async executeLendingDeposit({
    amount,
    chainId,
    protocol,
    underlyingTokenAddress,
    gasOptions,
    txOptions,
  }: {
    amount: string;
    chainId: string;
    protocol: LendingMarket['protocol'];
    underlyingTokenAddress: string;
    gasOptions: {
      gasLimit?: GasLimitParams;
      gasBufferPct?: number;
    };
    txOptions: Parameters<
      typeof TransactionController.prototype.addTransaction
    >[1];
  }) {
    const address = this.#getCurrentAccount()?.address;

    const transactionData = await this.#earnSDK?.contracts?.lending?.[
      protocol
    ]?.[underlyingTokenAddress]?.encodeDepositTransactionData(
      amount,
      address,
      gasOptions,
    );

    if (!transactionData) {
      throw new Error('Transaction data not found');
    }
    if (!this.#selectedNetworkClientId) {
      throw new Error('Selected network client id not found');
    }

    const gasLimit = !transactionData.gasLimit
      ? undefined
      : toHex(transactionData.gasLimit);

    const txHash = await this.#addTransactionFn(
      {
        ...transactionData,
        value: transactionData.value.toString(),
        chainId: toHex(chainId),
        gasLimit,
      },
      {
        ...txOptions,
        networkClientId: this.#selectedNetworkClientId,
      },
    );

    return txHash;
  }

  /**
   * Executes a lending withdraw transaction.
   *
   * @param options - The options for the lending withdraw transaction.
   * @param options.amount - The amount to withdraw.
   * @param options.chainId - The chain ID for the lending withdraw transaction.
   * @param options.protocol - The protocol of the lending market.
   * @param options.underlyingTokenAddress - The address of the underlying token.
   * @param options.gasOptions - The gas options for the transaction.
   * @param options.gasOptions.gasLimit - The gas limit for the transaction.
   * @param options.gasOptions.gasBufferPct - The gas buffer percentage for the transaction.
   * @param options.txOptions - The transaction options for the transaction.
   * @returns A promise that resolves to the transaction hash.
   */
  async executeLendingWithdraw({
    amount,
    chainId,
    protocol,
    underlyingTokenAddress,
    gasOptions,
    txOptions,
  }: {
    amount: string;
    chainId: string;
    protocol: LendingMarket['protocol'];
    underlyingTokenAddress: string;
    gasOptions: {
      gasLimit?: GasLimitParams;
      gasBufferPct?: number;
    };
    txOptions: Parameters<
      typeof TransactionController.prototype.addTransaction
    >[1];
  }) {
    const address = this.#getCurrentAccount()?.address;

    const transactionData = await this.#earnSDK?.contracts?.lending?.[
      protocol
    ]?.[underlyingTokenAddress]?.encodeWithdrawTransactionData(
      amount,
      address,
      gasOptions,
    );

    if (!transactionData) {
      throw new Error('Transaction data not found');
    }

    if (!this.#selectedNetworkClientId) {
      throw new Error('Selected network client id not found');
    }

    const gasLimit = !transactionData.gasLimit
      ? undefined
      : toHex(transactionData.gasLimit);

    const txHash = await this.#addTransactionFn(
      {
        ...transactionData,
        value: transactionData.value.toString(),
        chainId: toHex(chainId),
        gasLimit,
      },
      {
        ...txOptions,
        networkClientId: this.#selectedNetworkClientId,
      },
    );

    return txHash;
  }

  /**
   * Executes a lending token approve transaction.
   *
   * @param options - The options for the lending token approve transaction.
   * @param options.amount - The amount to approve.
   * @param options.chainId - The chain ID for the lending token approve transaction.
   * @param options.protocol - The protocol of the lending market.
   * @param options.underlyingTokenAddress - The address of the underlying token.
   * @param options.gasOptions - The gas options for the transaction.
   * @param options.gasOptions.gasLimit - The gas limit for the transaction.
   * @param options.gasOptions.gasBufferPct - The gas buffer percentage for the transaction.
   * @param options.txOptions - The transaction options for the transaction.
   * @returns A promise that resolves to the transaction hash.
   */
  async executeLendingTokenApprove({
    protocol,
    amount,
    chainId,
    underlyingTokenAddress,
    gasOptions,
    txOptions,
  }: {
    protocol: LendingMarket['protocol'];
    amount: string;
    chainId: string;
    underlyingTokenAddress: string;
    gasOptions: {
      gasLimit?: GasLimitParams;
      gasBufferPct?: number;
    };
    txOptions: Parameters<
      typeof TransactionController.prototype.addTransaction
    >[1];
  }) {
    const address = this.#getCurrentAccount()?.address;

    const transactionData = await this.#earnSDK?.contracts?.lending?.[
      protocol
    ]?.[underlyingTokenAddress]?.encodeUnderlyingTokenApproveTransactionData(
      amount,
      address,
      gasOptions,
    );

    if (!transactionData) {
      throw new Error('Transaction data not found');
    }

    if (!this.#selectedNetworkClientId) {
      throw new Error('Selected network client id not found');
    }

    const gasLimit = !transactionData.gasLimit
      ? undefined
      : toHex(transactionData.gasLimit);

    const txHash = await this.#addTransactionFn(
      {
        ...transactionData,
        value: transactionData.value.toString(),
        chainId: toHex(chainId),
        gasLimit,
      },
      {
        ...txOptions,
        networkClientId: this.#selectedNetworkClientId,
      },
    );

    return txHash;
  }

  /**
   * Gets the allowance for a lending token.
   *
   * @param protocol - The protocol of the lending market.
   * @param underlyingTokenAddress - The address of the underlying token.
   * @returns A promise that resolves to the allowance.
   */
  async getLendingTokenAllowance(
    protocol: LendingMarket['protocol'],
    underlyingTokenAddress: string,
  ) {
    const address = this.#getCurrentAccount()?.address;

    const allowance =
      await this.#earnSDK?.contracts?.lending?.[protocol]?.[
        underlyingTokenAddress
      ]?.underlyingTokenAllowance(address);

    return allowance;
  }

  /**
   * Gets the maximum withdraw amount for a lending token's output token or shares if no output token.
   *
   * @param protocol - The protocol of the lending market.
   * @param underlyingTokenAddress - The address of the underlying token.
   * @returns A promise that resolves to the maximum withdraw amount.
   */
  async getLendingTokenMaxWithdraw(
    protocol: LendingMarket['protocol'],
    underlyingTokenAddress: string,
  ) {
    const address = this.#getCurrentAccount()?.address;

    const maxWithdraw =
      await this.#earnSDK?.contracts?.lending?.[protocol]?.[
        underlyingTokenAddress
      ]?.maxWithdraw(address);

    return maxWithdraw;
  }

  /**
   * Gets the maximum deposit amount for a lending token.
   *
   * @param protocol - The protocol of the lending market.
   * @param underlyingTokenAddress - The address of the underlying token.
   * @returns A promise that resolves to the maximum deposit amount.
   */
  async getLendingTokenMaxDeposit(
    protocol: LendingMarket['protocol'],
    underlyingTokenAddress: string,
  ) {
    const address = this.#getCurrentAccount()?.address;

    const maxDeposit =
      await this.#earnSDK?.contracts?.lending?.[protocol]?.[
        underlyingTokenAddress
      ]?.maxDeposit(address);

    return maxDeposit;
  }
}
