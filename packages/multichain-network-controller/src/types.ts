import type { AccountsControllerListMultichainAccountsAction } from '@metamask/accounts-controller';
import {
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedMessenger,
} from '@metamask/base-controller';
import type { BtcScope, CaipChainId, SolScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  NetworkStatus,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerGetStateAction,
  NetworkControllerRemoveNetworkAction,
  NetworkControllerGetSelectedChainIdAction,
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkClientId,
} from '@metamask/network-controller';
import { type Infer, array, object } from '@metamask/superstruct';
import { CaipAccountIdStruct } from '@metamask/utils';
import type {
  CaipAssetType,
  CaipAccountAddress,
  CaipNamespace,
  CaipReference,
} from '@metamask/utils';

import type { MultichainNetworkController } from './MultichainNetworkController/MultichainNetworkController';

export const MULTICHAIN_NETWORK_CONTROLLER_NAME = 'MultichainNetworkController';

export type MultichainNetworkMetadata = {
  features: string[];
  status: NetworkStatus;
};

export type SupportedCaipChainId = BtcScope.Mainnet | SolScope.Mainnet;

export type CommonNetworkConfiguration = {
  /**
   * EVM network flag.
   */
  isEvm: boolean;
  /**
   * The chain ID of the network.
   *
   */
  chainId: CaipChainId;
  /**
   * The name of the network.
   */
  name: string;
};

export type NonEvmNetworkConfiguration = CommonNetworkConfiguration & {
  /**
   * EVM network flag.
   */
  isEvm: false;
  /**
   * The native asset type of the network.
   */
  nativeCurrency: CaipAssetType;
};

// TODO: The controller only supports non-EVM network configurations at the moment
// Once we support Caip chain IDs for EVM networks, we can re-enable EVM network configurations
export type EvmNetworkConfiguration = CommonNetworkConfiguration & {
  /**
   * EVM network flag.
   */
  isEvm: true;
  /**
   * The native asset type of the network.
   * For EVM, this is the network ticker since there is no standard between
   * tickers and Caip IDs.
   */
  nativeCurrency: string;
  /**
   * The block explorers of the network.
   */
  blockExplorerUrls: string[];
  /**
   * The index of the default block explorer URL.
   */
  defaultBlockExplorerUrlIndex: number;
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
  selectedMultichainNetworkChainId: SupportedCaipChainId;
  /**
   * Whether EVM or non-EVM network is selected
   */
  isEvmSelected: boolean;
  /**
   * The active networks for the available EVM addresses (non-EVM networks will be supported in the future).
   */
  networksWithTransactionActivity: ActiveNetworksByAddress;
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

export type MultichainNetworkControllerGetNetworksWithTransactionActivityByAccountsAction =
  {
    type: `${typeof MULTICHAIN_NETWORK_CONTROLLER_NAME}:getNetworksWithTransactionActivityByAccounts`;
    handler: MultichainNetworkController['getNetworksWithTransactionActivityByAccounts'];
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
  | MultichainNetworkControllerSetActiveNetworkAction
  | MultichainNetworkControllerGetNetworksWithTransactionActivityByAccountsAction;

/**
 * Events emitted by {@link MultichainNetworkController}.
 */
export type MultichainNetworkControllerEvents =
  | MultichainNetworkControllerStateChange
  | MultichainNetworkControllerNetworkDidChangeEvent;

/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerSetActiveNetworkAction
  | AccountsControllerListMultichainAccountsAction
  | NetworkControllerRemoveNetworkAction
  | NetworkControllerGetSelectedChainIdAction
  | NetworkControllerFindNetworkClientIdByChainIdAction;

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

export const ActiveNetworksResponseStruct = object({
  activeNetworks: array(CaipAccountIdStruct),
});

export type ActiveNetworksResponse = Infer<typeof ActiveNetworksResponseStruct>;

/**
 * The active networks for the currently selected account.
 */
export type ActiveNetworksByAddress = Record<
  CaipAccountAddress,
  {
    // CAIP-2 namespace of the network.
    namespace: CaipNamespace;
    // Active chain IDs (CAIP-2 references) on that network (primarily used for EVM networks).
    activeChains: CaipReference[];
  }
>;
