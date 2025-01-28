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
  StakeSdk as EarnSDK,
  StakingApiService,
  type PooledStake,
  type StakeSdkConfig,
  type VaultData,
} from '@metamask/stake-sdk';

export const controllerName = 'EarnController';

// === Enums and Identifiers ===
export enum EarnProductType {
  POOLED_STAKING = 'pooled_staking',
  STABLECOIN_LENDING = 'stablecoin_lending',
}

// === Product Types ===
export type PooledStakingProduct = {
  pooledStakes: PooledStake;
  exchangeRate: string;
  vaultData: VaultData;
  isEligible: boolean;
};

export type StablecoinLendingProduct = {
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
export const earnControllerMetadata: StateMetadata<EarnControllerState> = {
  [EarnProductType.POOLED_STAKING]: {
    persist: true,
    anonymous: false,
  },
  [EarnProductType.STABLECOIN_LENDING]: {
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
  [EarnProductType.POOLED_STAKING]?: PooledStakingProduct;
  [EarnProductType.STABLECOIN_LENDING]?: StablecoinLendingProduct;
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
    [EarnProductType.POOLED_STAKING]: {
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
    [EarnProductType.STABLECOIN_LENDING]: {
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
type AllowedActions =
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
type AllowedEvents =
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
  #earnSDK: EarnSDK | null = null;

  #earnApiService: StakingApiService | null = null;

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
        this.fetchAndUpdateStakingData().catch(console.error);
      },
    );

    // Listen for account changes
    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      () => {
        this.fetchAndUpdateStakingData().catch(console.error);
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
      this.#earnSDK = null;
      return;
    }

    const provider = new Web3Provider(networkClient.provider);
    const { chainId } = networkClient.configuration;

    // Initialize appropriate contracts based on chainId
    const config: StakeSdkConfig = {
      chainId: convertHexToDecimal(chainId),
    };

    try {
      this.#earnSDK = EarnSDK.create(config);
      this.#earnSDK.pooledStakingContract.connectSignerOrProvider(provider);
      this.#earnApiService = new StakingApiService();
    } catch (error) {
      this.#earnSDK = null;
      throw error;
    }
  }

  #getSDK(): EarnSDK {
    if (!this.#earnSDK) {
      throw new Error('EarnSDK not initialized');
    }
    return this.#earnSDK;
  }

  // Add getter methods for specific contracts
  private getPooledStakingContract() {
    const sdk = this.#getSDK();

    return sdk.pooledStakingContract;
  }

  #getEarnApiService() {
    if (!this.#earnApiService) {
      throw new Error('EarnApiService not initialized');
    }
    return this.#earnApiService;
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

  async fetchAndUpdateStakingData(): Promise<void> {
    const currentAccount = this.#getCurrentAccount();
    if (!currentAccount?.address) {
      return;
    }

    const chainId = this.#getCurrentChainId();
    const apiService = this.#getEarnApiService();

    try {
      const { accounts, exchangeRate } = await apiService.getPooledStakes(
        [currentAccount.address],
        chainId,
      );

      const pooledStakes = accounts[0];

      const { eligible: isEligible } =
        await apiService.getPooledStakingEligibility([currentAccount.address]);

      const vaultData = await apiService.getVaultData(chainId);

      const pooledStakingData: PooledStakingProduct = {
        pooledStakes,
        exchangeRate,
        vaultData,
        isEligible,
      };

      this.update((state) => {
        state[EarnProductType.POOLED_STAKING] = pooledStakingData;
        state.lastUpdated = Date.now();
      });
    } catch (error) {
      console.error('Failed to fetch staking data:', error);
    }
  }
}
