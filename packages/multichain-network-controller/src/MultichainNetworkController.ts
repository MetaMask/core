import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerGetSelectedMultichainAccountAction,
  AccountsControllerSetSelectedAccountAction,
} from '@metamask/accounts-controller';
import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import type {
  NetworkStatus,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import type { Draft } from 'immer';
import { bitcoinCaip2ChainId } from './constants';
import { CaipChainId } from '@metamask/utils';

const controllerName = 'MultichainNetworkController';

export type MultichainNetworkMetadata = {
  features: string[];
  status: NetworkStatus;
};

export type MultichainNetworkConfiguration = {
  chainId: string; // Should be Caip2 type
  name: string;
  nativeCurrency: string; // Should be Caip19 type
  blockExplorerUrls: string[];
  defaultBlockExplorerUrlIndex?: number;
  lastUpdated?: number;
  isEvm?: false;
};

/**
 * State used by the {@link MultichainNetworkController} to cache network configurations.
 */
export type MultichainNetworkControllerState = {
  multichainNetworkConfigurationsByChainId: Record<
    string,
    MultichainNetworkConfiguration
  >;
  selectedMultichainNetworkChainId: string;
  multichainNetworksMetadata: Record<string, MultichainNetworkMetadata>;
  nonEvmSelected: boolean;
};

/**
 * Default state of the {@link MultichainNetworkController}.
 */
export const defaultState: MultichainNetworkControllerState = {
  multichainNetworkConfigurationsByChainId: {},
  selectedMultichainNetworkChainId: bitcoinCaip2ChainId,
  multichainNetworksMetadata: {},
  nonEvmSelected: false,
};

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
export type MultichainNetworkStateControllerStateChange =
  ControllerStateChangeEvent<
    typeof controllerName,
    MultichainNetworkControllerState
  >;

/**
 * Actions exposed by the {@link MultichainNetworkController}.
 */
export type MultichainNetworkStateControllerActions =
  | MultichainNetworkControllerGetStateAction
  | MultichainNetworkControllerSetActiveNetworkAction;

/**
 * Events emitted by {@link MultichainNetworkController}.
 */
export type MultichainNetworkControllerEvents =
  MultichainNetworkStateControllerStateChange;

/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerSetActiveNetworkAction
  | AccountsControllerSetSelectedAccountAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerGetSelectedMultichainAccountAction;

/**
 * Messenger type for the MultichainNetworkController.
 */
export type MultichainNetworkControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    MultichainNetworkStateControllerActions | AllowedActions,
    MultichainNetworkControllerEvents,
    AllowedActions['type'],
    never
  >;

/**
 * {@link MultichainNetworkController}'s metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const multichainNetworkControllerMetadata = {
  multichainNetworkConfigurationsByChainId: { persist: true, anonymous: false },
  selectedMultichainNetworkChainId: { persist: true, anonymous: false },
  multichainNetworksMetadata: { persist: true, anonymous: false },
  nonEvmSelected: { persist: true, anonymous: false },
};

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
    state,
  }: {
    messenger: MultichainNetworkControllerMessenger;
    state: MultichainNetworkControllerState;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: multichainNetworkControllerMetadata,
      state: {
        ...defaultState,
        ...state,
      },
    });

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
        this.update((state: Draft<MultichainNetworkControllerState>) => {
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

      // Update selected account to non evm account
      const lastSelectedNonEvmAccount = await this.messagingSystem.call(
        'AccountsController:getSelectedMultichainAccount',
        nonEvmChainId,
      );

      if (!lastSelectedNonEvmAccount?.id) {
        throw new Error('No non-EVM account found!');
      }

      this.messagingSystem.call(
        'AccountsController:setSelectedAccount',
        lastSelectedNonEvmAccount.id,
      );

      this.update((state: Draft<MultichainNetworkControllerState>) => {
        state.selectedMultichainNetworkChainId = nonEvmChainId;
        state.nonEvmSelected = true;
      });

      return;
    }

    // Handle EVM networks
    if (!evmClientId) {
      throw new Error('EVM client ID is required!');
    }

    // Update evm selected account
    const lastSelectedEvmAccount = await this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );

    this.messagingSystem.call(
      'AccountsController:setSelectedAccount',
      lastSelectedEvmAccount.id,
    );

    // Indicate that the non-EVM network is not selected
    this.update((state: Draft<MultichainNetworkControllerState>) => {
      state.nonEvmSelected = false;
    });

    // Prevent setting same network
    const { selectedNetworkClientId } = await this.messagingSystem.call(
      'NetworkController:getState',
    );

    if (evmClientId === selectedNetworkClientId) {
      return;
    }

    // Update evm active network
    this.messagingSystem.call(
      'NetworkController:setActiveNetwork',
      evmClientId,
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
