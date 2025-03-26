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
import { convertHexToDecimal } from '@metamask/controller-utils';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import {
  StakeSdk,
  StakingApiService,
  type PooledStake,
  type StakeSdkConfig,
  type VaultData,
  type VaultDailyApy,
  type VaultApyAverages,
} from '@metamask/stake-sdk';

import type {
  RefreshPooledStakesOptions,
  RefreshPooledStakingDataOptions,
  RefreshStakingEligibilityOptions,
} from './types';

export const controllerName = 'EarnController';

export type PooledStakingState = {
  pooledStakes: PooledStake;
  exchangeRate: string;
  vaultMetadata: VaultData;
  vaultDailyApys: VaultDailyApy[];
  vaultApyAverages: VaultApyAverages;
  isEligible: boolean;
};

export type StablecoinLendingState = {
  vaults: StablecoinVault[];
};

export type StablecoinVault = {
  symbol: string;
  name: string;
  chainId: number;
  tokenAddress: string;
  vaultAddress: string;
  currentAPY: string;
  supply: string;
  liquidity: string;
};

/**
 * Metadata for the EarnController.
 */
const earnControllerMetadata: StateMetadata<EarnControllerState> = {
  pooled_staking: {
    persist: true,
    anonymous: false,
  },
  stablecoin_lending: {
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
  stablecoin_lending?: StablecoinLendingState;
  lastUpdated: number;
};

// === Default State ===
const DEFAULT_STABLECOIN_VAULT: StablecoinVault = {
  symbol: '',
  name: '',
  chainId: 0,
  tokenAddress: '',
  vaultAddress: '',
  currentAPY: '0',
  supply: '0',
  liquidity: '0',
};

const DEFAULT_POOLED_STAKING_VAULT_APY_AVERAGES: VaultApyAverages = {
  oneDay: '0',
  oneWeek: '0',
  oneMonth: '0',
  threeMonths: '0',
  sixMonths: '0',
  oneYear: '0',
};

/**
 * Gets the default state for the EarnController.
 *
 * @returns The default EarnController state.
 */
export function getDefaultEarnControllerState(): EarnControllerState {
  return {
    pooled_staking: {
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
      isEligible: false,
    },
    stablecoin_lending: {
      vaults: [DEFAULT_STABLECOIN_VAULT],
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
  | NetworkControllerGetStateAction
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
  | NetworkControllerStateChangeEvent;

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
  #stakeSDK: StakeSdk | null = null;

  #selectedNetworkClientId?: string;

  readonly #stakingApiService: StakingApiService = new StakingApiService();

  constructor({
    messenger,
    state = {},
  }: {
    messenger: EarnControllerMessenger;
    state?: Partial<EarnControllerState>;
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

    this.#initializeSDK();
    this.refreshPooledStakingData().catch(console.error);

    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    this.#selectedNetworkClientId = selectedNetworkClientId;

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      (networkControllerState) => {
        if (
          networkControllerState.selectedNetworkClientId !==
          this.#selectedNetworkClientId
        ) {
          this.#initializeSDK(networkControllerState.selectedNetworkClientId);
          this.refreshPooledStakingVaultMetadata().catch(console.error);
          this.refreshPooledStakingVaultDailyApys().catch(console.error);
          this.refreshPooledStakingVaultApyAverages().catch(console.error);
          this.refreshPooledStakes().catch(console.error);
        }
        this.#selectedNetworkClientId =
          networkControllerState.selectedNetworkClientId;
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
        this.refreshStakingEligibility({ address }).catch(console.error);
        this.refreshPooledStakes({ address }).catch(console.error);
      },
    );
  }

  #initializeSDK(networkClientId?: string) {
    const { selectedNetworkClientId } = networkClientId
      ? { selectedNetworkClientId: networkClientId }
      : this.messagingSystem.call('NetworkController:getState');

    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );

    if (!networkClient?.provider) {
      this.#stakeSDK = null;
      return;
    }

    const provider = new Web3Provider(networkClient.provider);
    const { chainId } = networkClient.configuration;

    // Initialize appropriate contracts based on chainId
    const config: StakeSdkConfig = {
      chainId: convertHexToDecimal(chainId),
    };

    try {
      this.#stakeSDK = StakeSdk.create(config);
      this.#stakeSDK.pooledStakingContract.connectSignerOrProvider(provider);
    } catch (error) {
      this.#stakeSDK = null;
      // Only log unexpected errors, not unsupported chain errors
      if (
        !(
          error instanceof Error &&
          error.message.includes('Unsupported chainId')
        )
      ) {
        console.error('Stake SDK initialization failed:', error);
      }
    }
  }

  #getCurrentAccount() {
    return this.messagingSystem.call('AccountsController:getSelectedAccount');
  }

  #getCurrentChainId(): number {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
    return convertHexToDecimal(chainId);
  }

  /**
   * Refreshes the pooled stakes data for the current account.
   * Fetches updated stake information including lifetime rewards, assets, and exit requests
   * from the staking API service and updates the state.
   *
   * @param options - Optional arguments
   * @param [options.resetCache] - Control whether the BE cache should be invalidated (optional).
   * @param [options.address] - The address to refresh pooled stakes for (optional).
   * @returns A promise that resolves when the stakes data has been updated
   */
  async refreshPooledStakes({
    resetCache = false,
    address,
  }: RefreshPooledStakesOptions = {}): Promise<void> {
    const addressToUse = address ?? this.#getCurrentAccount()?.address;

    if (!addressToUse) {
      return;
    }

    const chainId = this.#getCurrentChainId();

    const { accounts, exchangeRate } =
      await this.#stakingApiService.getPooledStakes(
        [addressToUse],
        chainId,
        resetCache,
      );

    this.update((state) => {
      state.pooled_staking.pooledStakes = accounts[0];
      state.pooled_staking.exchangeRate = exchangeRate;
    });
  }

  /**
   * Refreshes the staking eligibility status for the current account.
   * Updates the eligibility status in the controller state based on the location and address blocklist for compliance.
   *
   * @param options - Optional arguments
   * @param [options.address] - Address to refresh staking eligibility for (optional).
   * @returns A promise that resolves when the eligibility status has been updated
   */
  async refreshStakingEligibility({
    address,
  }: RefreshStakingEligibilityOptions = {}): Promise<void> {
    const addressToCheck = address ?? this.#getCurrentAccount()?.address;

    if (!addressToCheck) {
      return;
    }

    const { eligible: isEligible } =
      await this.#stakingApiService.getPooledStakingEligibility([
        addressToCheck,
      ]);

    this.update((state) => {
      state.pooled_staking.isEligible = isEligible;
    });
  }

  /**
   * Refreshes pooled staking vault metadata for the current chain.
   * Updates the vault metadata in the controller state including APY, capacity,
   * fee percentage, total assets, and vault address.
   *
   * @returns A promise that resolves when the vault metadata has been updated
   */
  async refreshPooledStakingVaultMetadata(): Promise<void> {
    const chainId = this.#getCurrentChainId();
    const vaultMetadata = await this.#stakingApiService.getVaultData(chainId);

    this.update((state) => {
      state.pooled_staking.vaultMetadata = vaultMetadata;
    });
  }

  /**
   * Refreshes pooled staking vault daily apys for the current chain.
   * Updates the pooled staking vault daily apys controller state.
   *
   * @param days - The number of days to fetch pooled staking vault daily apys for (defaults to 365).
   * @param order - The order in which to fetch pooled staking vault daily apys. Descending order fetches the latest N days (latest working backwards). Ascending order fetches the oldest N days (oldest working forwards) (defaults to 'desc').
   * @returns A promise that resolves when the pooled staking vault daily apys have been updated.
   */
  async refreshPooledStakingVaultDailyApys(
    days = 365,
    order: 'asc' | 'desc' = 'desc',
  ): Promise<void> {
    const chainId = this.#getCurrentChainId();
    const vaultDailyApys = await this.#stakingApiService.getVaultDailyApys(
      chainId,
      days,
      order,
    );

    this.update((state) => {
      state.pooled_staking.vaultDailyApys = vaultDailyApys;
    });
  }

  /**
   * Refreshes pooled staking vault apy averages for the current chain.
   * Updates the pooled staking vault apy averages controller state.
   *
   * @returns A promise that resolves when the pooled staking vault apy averages have been updated.
   */
  async refreshPooledStakingVaultApyAverages() {
    const chainId = this.#getCurrentChainId();
    const vaultApyAverages =
      await this.#stakingApiService.getVaultApyAverages(chainId);

    this.update((state) => {
      state.pooled_staking.vaultApyAverages = vaultApyAverages;
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

    await Promise.all([
      this.refreshPooledStakes({ resetCache, address }).catch((error) => {
        errors.push(error);
      }),
      this.refreshStakingEligibility({ address }).catch((error) => {
        errors.push(error);
      }),
      this.refreshPooledStakingVaultMetadata().catch((error) => {
        errors.push(error);
      }),
      this.refreshPooledStakingVaultDailyApys().catch((error) => {
        errors.push(error);
      }),
      this.refreshPooledStakingVaultApyAverages().catch((error) => {
        errors.push(error);
      }),
    ]);

    if (errors.length > 0) {
      throw new Error(
        `Failed to refresh some staking data: ${errors
          .map((e) => e.message)
          .join(', ')}`,
      );
    }
  }
}
