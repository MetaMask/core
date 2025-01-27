import type { AccountsControllerSetSelectedAccountAction } from '@metamask/accounts-controller';
import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import type {
  NetworkStatus,
  NetworkControllerGetNetworkConfigurationByNetworkClientId,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import type { Draft } from 'immer';

import {
  bitcoinCaip2ChainId,
  multichainNetworkConfigurations,
  networksMetadata,
} from './constants';

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
  MultichainNetworkControllerGetStateAction;

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
    MultichainNetworkStateControllerActions | AllowedActions,
    MultichainNetworkControllerEvents | AllowedEvents,
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
  }

  async setActiveNetwork(clientId: string, chainId?: string): Promise<void> {
    if (chainId && Object.keys(this.state).includes(chainId)) {
      this.update((state: Draft<MultichainNetworkControllerState>) => {
        state.selectedMultichainNetworkChainId = chainId;
        state.nonEvmSelected = true;
      });
      return;
    }

    this.update((state: Draft<MultichainNetworkControllerState>) => {
      state.nonEvmSelected = false;
    });

    await this.messagingSystem.call(
      'NetworkController:setActiveNetwork',
      clientId,
    );

    // TO DO: Should emit event to notify that the network has changed
    // so the accounts-controller can update the selected account
  }
}
