import type { AccountsControllerSetSelectedAccountAction } from '@metamask/accounts-controller';
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
  NetworkControllerGetNetworkConfigurationByNetworkClientId,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';


import {  CaipAssetType, CaipChainId, KnownCaipNamespace, parseCaipChainId } from '@metamask/utils';

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
export const getDefaultMultichainNetworkControllerState = (): MultichainNetworkControllerState => ({
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

/**
 * Event emitted when the state of the {@link MultichainNetworkController} changes.
 */
export type MultichainNetworkControllerStateChange =
  ControllerStateChangeEvent<
    typeof controllerName,
    MultichainNetworkControllerState
  >;

/**
 * Actions exposed by the {@link MultichainNetworkController}.
 */
export type MultichainNetworkControllerActions =
  MultichainNetworkControllerGetStateAction;

/**
 * Events emitted by {@link MultichainNetworkController}.
 */
export type MultichainNetworkControllerEvents =
  MultichainNetworkControllerStateChange;

export type MultichainNetworkControllerAllowedActions = MultichainNetworkControllerActions | AllowedActions;

export type MultichainNetworkControllerAllowedEvents = MultichainNetworkControllerEvents | AllowedEvents;


/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerSetActiveNetworkAction
  | AccountsControllerSetSelectedAccountAction
  | NetworkControllerGetNetworkConfigurationByNetworkClientId;

/**
 * Events that this controller is allowed to subscribe.
 */
export type AllowedEvents = NetworkControllerStateChangeEvent;

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
  }
  /**
   * Sets the active network.
   *
   * @param clientId - The client ID of the evm network.
   * @param caipChainId - The chain ID of the non-evm network.
   */
  async setActiveNetwork(clientId: string, caipChainId?: CaipChainId): Promise<void> {
    if (caipChainId && Object.keys(this.state.multichainNetworkConfigurationsByChainId).includes(caipChainId)) {
      this.update((state) => {
        state.selectedMultichainNetworkChainId = caipChainId;
        state.nonEvmSelected = true;
      });
      return;
    }

    await this.messagingSystem.call(
      'NetworkController:setActiveNetwork',
      clientId,
    );

    this.update((state) => {
      state.nonEvmSelected = false;
    });
  }
}

