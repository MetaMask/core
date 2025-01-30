import type { AccountsControllerSelectedAccountChangeEvent } from '@metamask/accounts-controller';
import {
  BaseController,
  StateMetadata,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BtcScope } from '@metamask/keyring-api';
import type {
  NetworkStatus,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import { CaipAssetType, CaipChainId } from '@metamask/utils';
import { nonEvmNetworkChainIdByAccountAddress } from './utils';

const controllerName = 'MultichainNetworkController';

export type MultichainNetworkMetadata = {
  features: string[];
  status: NetworkStatus;
};

export type MultichainNetworkConfiguration = {
  /**
   * The chain ID of the network.
   */
  chainId: CaipChainId;
  /**
   * The name of the network.
   */
  name: string;
  /**
   * The native asset type of the network.
   */
  nativeAsset: CaipAssetType;
  /**
   * The block explorer URLs of the network.
   */
  blockExplorerUrls: string[];
  /**
   * The default block explorer URL index of the network.
   */
  defaultBlockExplorerUrlIndex?: number;
  /**
   * The last updated timestamp of the network.
   */
  lastUpdated?: number;
  /**
   * Whether the network is an EVM network or non-evm network.
   */
  isEvm: boolean;
};

/**
 * State used by the {@link MultichainNetworkController} to cache network configurations.
 */
export type MultichainNetworkControllerState = {
  /**
   * The network configurations by chain ID.
   */
  multichainNetworkConfigurationsByChainId: Record<
    string,
    MultichainNetworkConfiguration
  >;
  /**
   * The chain ID of the selected network.
   */
  selectedMultichainNetworkChainId: CaipChainId;
  /**
   * The metadata of the networks.
   */
  multichainNetworksMetadata: Record<string, MultichainNetworkMetadata>;
  /**
   * Whether the non-EVM network is selected by the wallet.
   */
  nonEvmSelected: boolean;
};

/**
 * Default state of the {@link MultichainNetworkController}.
 */
export const getDefaultMultichainNetworkControllerState =
  (): MultichainNetworkControllerState => ({
    multichainNetworkConfigurationsByChainId: {},
    selectedMultichainNetworkChainId: BtcScope.Mainnet,
    multichainNetworksMetadata: {},
    nonEvmSelected: false,
  });

/**
 * Returns the state of the {@link MultichainNetworkController}.
 */
export type MultichainNetworkControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    MultichainNetworkControllerState
  >;

export type MultichainNetworkControllerSetActiveNetworkAction = {
  type: `${typeof controllerName}:setActiveNetwork`;
  handler: MultichainNetworkController['setActiveNetwork'];
};

/**
 * Event emitted when the state of the {@link MultichainNetworkController} changes.
 */
export type MultichainNetworkControllerStateChange = ControllerStateChangeEvent<
  typeof controllerName,
  MultichainNetworkControllerState
>;

export type MultichainNetworkSetActiveNetworkEvent = {
  type: `${typeof controllerName}:setActiveNetwork`;
  payload: [
    {
      evmClientId?: string;
      nonEvmChainId?: CaipChainId;
    },
  ];
};

/**
 * Actions exposed by the {@link MultichainNetworkController}.
 */
export type MultichainNetworkControllerActions =
  | MultichainNetworkControllerGetStateAction
  | MultichainNetworkControllerSetActiveNetworkAction;

/**
 * Events emitted by {@link MultichainNetworkController}.
 */
export type MultichainNetworkControllerEvents =
  MultichainNetworkSetActiveNetworkEvent;

/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerSetActiveNetworkAction;

/**
 * Events that this controller is allowed to subscribe.
 */
export type AllowedEvents = AccountsControllerSelectedAccountChangeEvent;

export type MultichainNetworkControllerAllowedActions =
  | MultichainNetworkControllerActions
  | AllowedActions;

export type MultichainNetworkControllerAllowedEvents =
  | MultichainNetworkControllerEvents
  | AllowedEvents;

/**
 * Messenger type for the MultichainNetworkController.
 */
export type MultichainNetworkControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    MultichainNetworkControllerAllowedActions,
    MultichainNetworkControllerAllowedEvents,
    AllowedActions['type'],
    AllowedEvents['type']
  >;

/**
 * {@link MultichainNetworkController}'s metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const multichainNetworkControllerMetadata = {
  multichainNetworkConfigurationsByChainId: { persist: true, anonymous: true },
  selectedMultichainNetworkChainId: { persist: true, anonymous: true },
  multichainNetworksMetadata: { persist: true, anonymous: true },
  nonEvmSelected: { persist: true, anonymous: true },
} satisfies StateMetadata<MultichainNetworkControllerState>;

/**
 * The MultichainNetworkController is responsible for fetching and caching account
 * balances.
 */
export class MultichainNetworkController extends BaseController<
  typeof controllerName,
  MultichainNetworkControllerState,
  MultichainNetworkControllerMessenger
> {
  constructor({
    messenger,
    state = {},
  }: {
    messenger: MultichainNetworkControllerMessenger;
    state?: Partial<MultichainNetworkControllerState>;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: multichainNetworkControllerMetadata,
      state: {
        ...getDefaultMultichainNetworkControllerState(),
        ...state,
      },
    });

    this.#subscribeToMessageEvents();
    this.#registerMessageHandlers();
  }

  /**
   * Handles switching between EVM and non-EVM networks.
   *
   * @param evmClientId - The client ID of the EVM network to set active.
   * @param nonEvmChainId - The chain ID of the non-EVM network to set active.
   */
  async setActiveNetwork({
    evmClientId,
    nonEvmChainId,
  }: {
    evmClientId?: string;
    nonEvmChainId?: CaipChainId;
  }): Promise<void> {
    // Throw an error if both EVM and non-EVM networks are set
    if (evmClientId && nonEvmChainId) {
      throw new Error('Cannot set both EVM and non-EVM networks!');
    }

    // Handle non-EVM networks
    if (nonEvmChainId) {
      // Prevent setting same network
      if (nonEvmChainId === this.state.selectedMultichainNetworkChainId) {
        // Indicate that the non-EVM network is selected
        this.update((state) => {
          state.nonEvmSelected = true;
        });
        return;
      }

      // Check if the non-EVM chain ID is supported
      if (
        !Object.keys(
          this.state.multichainNetworkConfigurationsByChainId,
        ).includes(nonEvmChainId)
      ) {
        throw new Error('Non-EVM chain ID is not supported!');
      }

      this.messagingSystem.publish(
        'MultichainNetworkController:setActiveNetwork',
        { nonEvmChainId },
      );

      this.update((state) => {
        state.selectedMultichainNetworkChainId = nonEvmChainId;
        state.nonEvmSelected = true;
      });

      return;
    }

    // Handle EVM networks
    if (!evmClientId) {
      throw new Error('EVM client ID is required!');
    }

    this.messagingSystem.publish(
      'MultichainNetworkController:setActiveNetwork',
      {
        evmClientId,
      },
    );

    // Indicate that the non-EVM network is not selected
    this.update((state) => {
      state.nonEvmSelected = false;
    });

    // Prevent setting same network
    const { selectedNetworkClientId } = await this.messagingSystem.call(
      'NetworkController:getState',
    );

    if (evmClientId === selectedNetworkClientId) {
      // EVM network is already selected, no need to update NetworkController
      return;
    }

    // Update evm active network
    this.messagingSystem.call(
      'NetworkController:setActiveNetwork',
      evmClientId,
    );
  }

  /**
   * Subscribes to message events.
   * @private
   */
  #subscribeToMessageEvents() {
    // Handle network switch when account is changed
    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      async ({ type: accountType, address: accountAddress }) => {
        const isEvmAccount = isEvmAccountType(accountType);

        // Handle switching to EVM network
        if (isEvmAccount) {
          if (!this.state.nonEvmSelected) {
            // No need to update if already on evm network
            return;
          }

          // Otherwise, switch to EVM network
          const { selectedNetworkClientId } = await this.messagingSystem.call(
            'NetworkController:getState',
          );

          this.messagingSystem.call(
            'NetworkController:setActiveNetwork',
            selectedNetworkClientId,
          );

          this.update((state) => {
            state.nonEvmSelected = false;
          });

          return;
        }

        // Handle switching to non-EVM network
        const nonEvmChainId =
          nonEvmNetworkChainIdByAccountAddress(accountAddress);
        const isSameNonEvmNetwork =
          nonEvmChainId === this.state.selectedMultichainNetworkChainId;

        if (isSameNonEvmNetwork) {
          // No need to update if already on the same non-EVM network
          return;
        }

        this.update((state) => {
          state.selectedMultichainNetworkChainId = nonEvmChainId;
          state.nonEvmSelected = true;
        });
      },
    );
  }

  /**
   * Registers message handlers.
   * @private
   */
  #registerMessageHandlers() {
    this.messagingSystem.registerActionHandler(
      'MultichainNetworkController:setActiveNetwork',
      this.setActiveNetwork.bind(this),
    );
  }
}
