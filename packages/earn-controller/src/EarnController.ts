import { Web3Provider } from '@ethersproject/providers';
import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerSelectedAccountChangeEvent,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { convertHexToDecimal } from '@metamask/controller-utils';
import type { NetworkControllerNetworkDidChangeEvent } from '@metamask/network-controller';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import {
  StakeSdk,
  StakingApiService,
  type PooledStake,
  type StakeSdkConfig,
  type VaultData,
} from '@metamask/stake-sdk';

export const controllerName = 'EarnController';

export type PooledStakingState = {
  pooledStakes: PooledStake;
  exchangeRate: string;
  vaultData: VaultData;
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
      vaultData: {
        apy: '0',
        capacity: '0',
        feePercent: 0,
        totalAssets: '0',
        vaultAddress: '0x0000000000000000000000000000000000000000',
      },
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
  | NetworkControllerNetworkDidChangeEvent
  | AccountsControllerSelectedAccountChangeEvent;

/**
 * The messenger which is restricted to actions and events accessed by
 * EarnController.
 */
export type EarnControllerMessenger = RestrictedControllerMessenger<
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

    // Initialize with current network
    this.#initializeSDK();

    // Listen for network changes
    this.messagingSystem.subscribe(
      'NetworkController:networkDidChange',
      ({ selectedNetworkClientId }) => {
        this.#initializeSDK(selectedNetworkClientId);
        this.refreshPooledStakingData().catch(console.error);
      },
    );

    // Listen for account changes
    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      () => {
        this.refreshPooledStakingData().catch(console.error);
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

  async refreshPooledStakingData(): Promise<void> {
    const currentAccount = this.#getCurrentAccount();
    if (!currentAccount?.address) {
      return;
    }

    const chainId = this.#getCurrentChainId();
    const apiService = this.#stakingApiService;

    try {
      const { accounts, exchangeRate } = await apiService.getPooledStakes(
        [currentAccount.address],
        chainId,
      );

      this.update((state) => {
        state.pooled_staking.pooledStakes = accounts[0];
        state.pooled_staking.exchangeRate = exchangeRate;
      });
    } catch (error) {
      console.error('Failed to fetch pooled stakes:', error);
    }

    try {
      const { eligible: isEligible } =
        await apiService.getPooledStakingEligibility([currentAccount.address]);

      this.update((state) => {
        state.pooled_staking.isEligible = isEligible;
      });
    } catch (error) {
      console.error('Failed to fetch staking eligibility:', error);
    }

    try {
      const vaultData = await apiService.getVaultData(chainId);

      this.update((state) => {
        state.pooled_staking.vaultData = vaultData;
      });
    } catch (error) {
      console.error('Failed to fetch vault data:', error);
    }
  }
}
