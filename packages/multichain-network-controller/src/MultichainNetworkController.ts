import {
  BaseController,
  type StateMetadata,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { isEvmAccountType, SolScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  NetworkStatus,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

import { getChainIdForNonEvmAddress } from './utils';

const controllerName = 'MultichainNetworkController';

export type MultichainNetworkMetadata = {
  features: string[];
  status: NetworkStatus;
};

export type CommonNetworkConfiguration = {
  /**
   * EVM network flag.
   */
  isEvm: boolean;

  /**
   * The block explorers of the network.
   */
  blockExplorers: {
    urls: string[];
    defaultIndex: number;
  };

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
  nativeCurrency: CaipAssetType;
};

export type NonEvmNetworkConfiguration = CommonNetworkConfiguration & {
  isEvm: false;
};

export type EvmNetworkConfiguration = CommonNetworkConfiguration & {
  isEvm: true;

  /**
   * The RPC endpoints of the network.
   */
  rpcEndpoints: {
    urls: string[];
    defaultIndex: number;
  };
};

export type MultichainNetworkConfiguration =
  | EvmNetworkConfiguration
  | NonEvmNetworkConfiguration;

/**
 * State used by the {@link MultichainNetworkController} to cache network configurations.
 */
export type MultichainNetworkControllerState = {
  /**
   * The network configurations by chain ID.
   */
  multichainNetworkConfigurationsByChainId: Record<
    CaipChainId,
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
   * Whether EVM or non-EVM network is selected
   */
  isEvmSelected: boolean;
};

/**
 * Default state of the {@link MultichainNetworkController}.
 *
 * @returns The default state of the {@link MultichainNetworkController}.
 */
export const getDefaultMultichainNetworkControllerState =
  (): MultichainNetworkControllerState => ({
    multichainNetworkConfigurationsByChainId: {},
    selectedMultichainNetworkChainId: SolScope.Mainnet,
    multichainNetworksMetadata: {},
    isEvmSelected: true,
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

export type MultichainNetworkControllerNetworkDidChangeEvent = {
  type: `${typeof controllerName}:networkDidChange`;
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
  MultichainNetworkControllerNetworkDidChangeEvent;

/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerSetActiveNetworkAction;

// Re-define event here to avoid circular dependency with AccountsController
type AccountsControllerSelectedAccountChangeEvent = {
  type: `AccountsController:selectedAccountChange`;
  payload: [InternalAccount];
};

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
  isEvmSelected: { persist: true, anonymous: true },
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
    state,
  }: {
    messenger: MultichainNetworkControllerMessenger;
    state: Partial<MultichainNetworkControllerState>;
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
   * @param args - The arguments to set the active network.
   * @param args.evmClientId - The client ID of the EVM network to set active.
   * @param args.nonEvmChainId - The chain ID of the non-EVM network to set active.
   */
  async setActiveNetwork({
    evmClientId,
    nonEvmChainId,
  }: {
    evmClientId?: string;
    nonEvmChainId?: CaipChainId;
  }): Promise<void> {
    // Throw an error if both EVM and non-EVM networks are set
    if (evmClientId !== undefined && nonEvmChainId !== undefined) {
      throw new Error('Cannot set both EVM and non-EVM networks!');
    }

    // Handle non-EVM networks
    if (nonEvmChainId !== undefined) {
      // Handle EVM networks
      if (nonEvmChainId.length === 0) {
        throw new Error('Non-EVM chain ID is required!');
      }

      // Prevent setting same network
      if (nonEvmChainId === this.state.selectedMultichainNetworkChainId) {
        // Indicate that the non-EVM network is selected
        this.update((state) => {
          state.isEvmSelected = false;
        });

        // Notify listeners that setActiveNetwork was called
        this.messagingSystem.publish(
          'MultichainNetworkController:networkDidChange',
          { nonEvmChainId },
        );
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

      // Notify listeners that setActiveNetwork was called
      this.messagingSystem.publish(
        'MultichainNetworkController:networkDidChange',
        { nonEvmChainId },
      );

      this.update((state) => {
        state.selectedMultichainNetworkChainId = nonEvmChainId;
        state.isEvmSelected = false;
      });

      return;
    }

    // Handle EVM networks
    if (!evmClientId) {
      throw new Error('EVM client ID is required!');
    }

    // Notify listeners that setActiveNetwork was called
    this.messagingSystem.publish(
      'MultichainNetworkController:networkDidChange',
      {
        evmClientId,
      },
    );

    // Indicate that the non-EVM network is not selected
    this.update((state) => {
      state.isEvmSelected = true;
    });

    // Prevent setting same network
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );

    if (evmClientId === selectedNetworkClientId) {
      // EVM network is already selected, no need to update NetworkController
      return;
    }

    // Update evm active network
    await this.messagingSystem.call(
      'NetworkController:setActiveNetwork',
      evmClientId,
    );
  }

  /**
   * Handles switching between EVM and non-EVM networks when an account is changed
   *
   * @param account - The account that was changed
   */
  readonly #handleSelectedAccountChange = (account: InternalAccount) => {
    const { type: accountType, address: accountAddress } = account;
    const isEvmAccount = isEvmAccountType(accountType);

    // Handle switching to EVM network
    if (isEvmAccount) {
      if (this.state.isEvmSelected) {
        // No need to update if already on evm network
        return;
      }

      // Make EVM network active
      this.update((state) => {
        state.isEvmSelected = true;
      });
      return;
    }

    // Handle switching to non-EVM network
    const nonEvmChainId = getChainIdForNonEvmAddress(accountAddress);
    const isSameNonEvmNetwork =
      nonEvmChainId === this.state.selectedMultichainNetworkChainId;

    if (isSameNonEvmNetwork) {
      // No need to update if already on the same non-EVM network
      this.update((state) => {
        state.isEvmSelected = false;
      });
      return;
    }

    this.update((state) => {
      state.selectedMultichainNetworkChainId = nonEvmChainId;
      state.isEvmSelected = false;
    });
  };

  /**
   * Subscribes to message events.
   */
  #subscribeToMessageEvents() {
    // Handle network switch when account is changed
    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      this.#handleSelectedAccountChange,
    );
  }

  /**
   * Registers message handlers.
   */
  #registerMessageHandlers() {
    this.messagingSystem.registerActionHandler(
      'MultichainNetworkController:setActiveNetwork',
      this.setActiveNetwork.bind(this),
    );
  }
}
