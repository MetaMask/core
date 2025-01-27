import { Web3Provider } from '@ethersproject/providers';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { convertHexToDecimal } from '@metamask/controller-utils';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerNetworkDidChangeEvent,
} from '@metamask/network-controller';
import { StakeSdk as EarnSDK, type StakeSdkConfig } from '@metamask/stake-sdk';

export const controllerName = 'EarnController';

// === STATE ===

/**
 * EarnOpportunity - Represents an earning opportunity
 */
export type EarnOpportunity = {
  protocol: string;
  type: 'stake' | 'lend' | 'farm';
  apy: number;
  token: {
    address: string;
    symbol: string;
    decimals: number;
  };
  network: {
    chainId: number;
    name: string;
  };
};

/**
 * Describes the shape of the state object for EarnController.
 */
export type EarnControllerState = {
  /**
   * List of earn opportunities
   */
  opportunities: EarnOpportunity[];
  /**
   * Whether the controller is currently loading data
   */
  isLoading: boolean;
  /**
   * Last error message if any
   */
  error: string | null;
};

/**
 * The metadata for each property in EarnControllerState.
 */
const earnControllerMetadata = {
  opportunities: { persist: true, anonymous: false },
  isLoading: { persist: false, anonymous: false },
  error: { persist: false, anonymous: false },
} satisfies StateMetadata<EarnControllerState>;

// === MESSENGER ===

/**
 * The action which can be used to retrieve the state of the EarnController.
 */
export type EarnControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  EarnControllerState
>;

/**
 * The action which can be used to fetch opportunities.
 */
export type EarnControllerFetchOpportunitiesAction = {
  type: `${typeof controllerName}:fetchOpportunities`;
  handler: (chainId?: number) => Promise<void>;
};

/**
 * All actions that EarnController registers, to be called externally.
 */
export type EarnControllerActions =
  | EarnControllerGetStateAction
  | EarnControllerFetchOpportunitiesAction;

/**
 * All actions that EarnController calls internally.
 */
type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction;

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
type AllowedEvents = NetworkControllerNetworkDidChangeEvent;

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

/**
 * Constructs the default EarnController state.
 *
 * @returns The default EarnController state.
 */
export function getDefaultEarnControllerState(): EarnControllerState {
  return {
    opportunities: [],
    isLoading: false,
    error: null,
  };
}

// === CONTROLLER DEFINITION ===

/**
 * EarnController manages DeFi earning opportunities across different protocols and chains.
 */
export class EarnController extends BaseController<
  typeof controllerName,
  EarnControllerState,
  EarnControllerMessenger
> {
  private earnSDK: EarnSDK | null = null;

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
      this.earnSDK = null;
      return;
    }

    const provider = new Web3Provider(networkClient.provider);
    const { chainId } = networkClient.configuration;

    // Initialize appropriate contracts based on chainId
    const config: StakeSdkConfig = {
      chainId: convertHexToDecimal(chainId),
    };

    try {
      this.earnSDK = EarnSDK.create(config);
      this.earnSDK.pooledStakingContract.connectSignerOrProvider(provider);
    } catch (error) {
      this.earnSDK = null;
      throw error;
    }
  }

  #getSDK(): EarnSDK {
    if (!this.earnSDK) {
      throw new Error('EarnSDK not initialized');
    }
    return this.earnSDK;
  }

  // Add getter methods for specific contracts
  private getPooledStakingContract() {
    const sdk = this.#getSDK();

    return sdk.pooledStakingContract;
  }
}
