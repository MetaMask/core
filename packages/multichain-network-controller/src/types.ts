import {
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedMessenger,
} from '@metamask/base-controller';
import type { BtcScope, SolScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  NetworkStatus,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerGetStateAction,
  NetworkClientId,
} from '@metamask/network-controller';
import { type CaipAssetType } from '@metamask/utils';

export const MULTICHAIN_NETWORK_CONTROLLER_NAME = 'MultichainNetworkController';

export type MultichainNetworkMetadata = {
  features: string[];
  status: NetworkStatus;
};

export type SupportedCaipChainId = SolScope.Mainnet | BtcScope.Mainnet;

export type CommonNetworkConfiguration = {
  /**
   * EVM network flag.
   */
  isEvm: boolean;
  /**
   * The block explorers of the network.
   */
  blockExplorerUrls: string[];
  /**
   * The index of the default block explorer URL.
   */
  defaultBlockExplorerUrlIndex: number;
  /**
   * The chain ID of the network.
   */
  chainId: SupportedCaipChainId;
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

// TODO: The controller only supports non-EVM network configurations at the moment
// Once we support Caip chain IDs for EVM networks, we can re-enable EVM network configurations
// export type EvmNetworkConfiguration = CommonNetworkConfiguration & {
//   isEvm: true;
//   /**
//    * The RPC endpoints of the network.
//    */
//   rpcEndpoints: string[];
//   /**
//    * The index of the default RPC endpoint.
//    */
//   defaultRpcEndpointIndex: number;
// };

export type MultichainNetworkConfiguration =
  // | EvmNetworkConfiguration
  NonEvmNetworkConfiguration;

/**
 * State used by the {@link MultichainNetworkController} to cache network configurations.
 */
export type MultichainNetworkControllerState = {
  /**
   * The network configurations by chain ID.
   */
  multichainNetworkConfigurationsByChainId: Record<
    SupportedCaipChainId,
    MultichainNetworkConfiguration
  >;
  /**
   * The chain ID of the selected network.
   */
  selectedMultichainNetworkChainId: SupportedCaipChainId;
  /**
   * Whether EVM or non-EVM network is selected
   */
  isEvmSelected: boolean;
};

/**
 * Returns the state of the {@link MultichainNetworkController}.
 */
export type MultichainNetworkControllerGetStateAction =
  ControllerGetStateAction<
    typeof MULTICHAIN_NETWORK_CONTROLLER_NAME,
    MultichainNetworkControllerState
  >;

export type SetActiveNetworkMethod = (
  id: SupportedCaipChainId | NetworkClientId,
) => Promise<void>;

export type MultichainNetworkControllerSetActiveNetworkAction = {
  type: `${typeof MULTICHAIN_NETWORK_CONTROLLER_NAME}:setActiveNetwork`;
  handler: SetActiveNetworkMethod;
};

/**
 * Event emitted when the state of the {@link MultichainNetworkController} changes.
 */
export type MultichainNetworkControllerStateChange = ControllerStateChangeEvent<
  typeof MULTICHAIN_NETWORK_CONTROLLER_NAME,
  MultichainNetworkControllerState
>;

export type MultichainNetworkControllerNetworkDidChangeEvent = {
  type: `${typeof MULTICHAIN_NETWORK_CONTROLLER_NAME}:networkDidChange`;
  payload: [NetworkClientId | SupportedCaipChainId];
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
export type AccountsControllerSelectedAccountChangeEvent = {
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
export type MultichainNetworkControllerMessenger = RestrictedMessenger<
  typeof MULTICHAIN_NETWORK_CONTROLLER_NAME,
  MultichainNetworkControllerAllowedActions,
  MultichainNetworkControllerAllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
