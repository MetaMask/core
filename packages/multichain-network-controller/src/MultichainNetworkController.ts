import { BaseController } from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkClientId } from '@metamask/network-controller';
import { isCaipChainId } from '@metamask/utils';

import {
  MULTICHAIN_NETWORK_CONTROLLER_METADATA,
  getDefaultMultichainNetworkControllerState,
} from './constants';
import {
  MULTICHAIN_NETWORK_CONTROLLER_NAME,
  type MultichainNetworkControllerState,
  type MultichainNetworkControllerMessenger,
  type SupportedCaipChainId,
} from './types';
import {
  checkIfSupportedCaipChainId,
  getChainIdForNonEvmAddress,
} from './utils';

/**
 * The MultichainNetworkController is responsible for fetching and caching account
 * balances.
 */
export class MultichainNetworkController extends BaseController<
  typeof MULTICHAIN_NETWORK_CONTROLLER_NAME,
  MultichainNetworkControllerState,
  MultichainNetworkControllerMessenger
> {
  constructor({
    messenger,
    state,
  }: {
    messenger: MultichainNetworkControllerMessenger;
    state?: Omit<
      Partial<MultichainNetworkControllerState>,
      'multichainNetworkConfigurationsByChainId'
    >;
  }) {
    super({
      messenger,
      name: MULTICHAIN_NETWORK_CONTROLLER_NAME,
      metadata: MULTICHAIN_NETWORK_CONTROLLER_METADATA,
      state: {
        ...getDefaultMultichainNetworkControllerState(),
        ...state,
      },
    });

    this.#subscribeToMessageEvents();
    this.#registerMessageHandlers();
  }

  /**
   * Sets the active EVM network.
   *
   * @param id - The client ID of the EVM network to set active.
   */
  async #setActiveEvmNetwork(id: NetworkClientId): Promise<void> {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );

    const shouldSetEvmActive = !this.state.isEvmSelected;
    const shouldNotifyNetworkChange = id !== selectedNetworkClientId;

    // No changes needed if EVM is active and network is already selected
    if (!shouldSetEvmActive && !shouldNotifyNetworkChange) {
      return;
    }

    // Update EVM selection state if needed
    if (shouldSetEvmActive) {
      this.update((state) => {
        state.isEvmSelected = true;
      });
    }

    // Only notify the network controller if the selected evm network is different
    if (shouldNotifyNetworkChange) {
      await this.messagingSystem.call('NetworkController:setActiveNetwork', id);
    }

    // Only publish the networkDidChange event if either the EVM network is different or we're switching between EVM and non-EVM networks
    if (shouldSetEvmActive || shouldNotifyNetworkChange) {
      this.messagingSystem.publish(
        'MultichainNetworkController:networkDidChange',
        id,
      );
    }
  }

  /**
   * Sets the active non-EVM network.
   *
   * @param id - The chain ID of the non-EVM network to set active.
   */
  #setActiveNonEvmNetwork(id: SupportedCaipChainId): void {
    if (
      id === this.state.selectedMultichainNetworkChainId &&
      !this.state.isEvmSelected
    ) {
      // Same non-EVM network is already selected, no need to update
      return;
    }

    this.update((state) => {
      state.selectedMultichainNetworkChainId = id;
      state.isEvmSelected = false;
    });

    // Notify listeners that the network changed
    this.messagingSystem.publish(
      'MultichainNetworkController:networkDidChange',
      id,
    );
  }

  /**
   * Sets the active network.
   *
   * @param id - The non-EVM Caip chain ID or EVM client ID of the network to set active.
   * @returns - A promise that resolves when the network is set active.
   */
  async setActiveNetwork(
    id: SupportedCaipChainId | NetworkClientId,
  ): Promise<void> {
    if (isCaipChainId(id)) {
      const isSupportedCaipChainId = checkIfSupportedCaipChainId(id);
      if (!isSupportedCaipChainId) {
        throw new Error(`Unsupported Caip chain ID: ${String(id)}`);
      }
      return this.#setActiveNonEvmNetwork(id);
    }

    return await this.#setActiveEvmNetwork(id);
  }

  /**
   * Handles switching between EVM and non-EVM networks when an account is changed
   *
   * @param account - The account that was changed
   */
  #handleOnSelectedAccountChange(account: InternalAccount) {
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

    // No need to publish NetworkController:setActiveNetwork because EVM accounts falls back to use the last selected non-EVM network
    // DO NOT publish MultichainNetworkController:networkDidChange to prevent circular listener loops
  }

  /**
   * Subscribes to message events.
   */
  #subscribeToMessageEvents() {
    // Handle network switch when account is changed
    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      (account) => this.#handleOnSelectedAccountChange(account),
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
