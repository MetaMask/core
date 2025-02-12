import { BaseController } from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkClientId } from '@metamask/network-controller';

import {
  checkIfSupportedCaipChainId,
  getChainIdForNonEvmAddress,
} from './utils';
import {
  MULTICHAIN_NETWORK_CONTROLLER_NAME,
  type MultichainNetworkControllerState,
  type MultichainNetworkControllerMessenger,
  type SupportedCaipChainId,
} from './types';
import {
  MULTICHAIN_NETWORK_CONTROLLER_METADATA,
  DEFAULT_MULTICHAIN_NETWORK_CONTROLLER_STATE,
} from './constants';
import { isCaipChainId } from '@metamask/utils';

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
        ...DEFAULT_MULTICHAIN_NETWORK_CONTROLLER_STATE,
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
    // Notify listeners that setActiveNetwork was called
    this.messagingSystem.publish(
      'MultichainNetworkController:networkDidChange',
      id,
    );

    // Indicate that the non-EVM network is not selected
    this.update((state) => {
      state.isEvmSelected = true;
    });

    // Prevent setting same network
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );

    if (id === selectedNetworkClientId) {
      // EVM network is already selected, no need to update NetworkController
      return;
    }

    // Update evm active network
    await this.messagingSystem.call('NetworkController:setActiveNetwork', id);
  }

  /**
   * Sets the active non-EVM network.
   *
   * @param id - The chain ID of the non-EVM network to set active.
   */
  #setActiveNonEvmNetwork(id: SupportedCaipChainId): void {
    if (id === this.state.selectedMultichainNetworkChainId) {
      if (!this.state.isEvmSelected) {
        // Same non-EVM network is already selected, no need to update
        return;
      }

      // Indicate that the non-EVM network is selected
      this.update((state) => {
        state.isEvmSelected = false;
      });

      // Notify listeners that setActiveNetwork was called
      this.messagingSystem.publish(
        'MultichainNetworkController:networkDidChange',
        id,
      );
    }

    // Notify listeners that setActiveNetwork was called
    this.messagingSystem.publish(
      'MultichainNetworkController:networkDidChange',
      id,
    );

    this.update((state) => {
      state.selectedMultichainNetworkChainId = id;
      state.isEvmSelected = false;
    });
  }

  /**
   * Switches to a non-EVM network.
   *
   * @param nonEvmChainId - The chain ID of the non-EVM network to set active.
   */
  async setActiveNetwork(nonEvmChainId: SupportedCaipChainId): Promise<void>;

  /**
   * Switches to an EVM network.
   *
   * @param evmNetworkClientId - The client ID of the EVM network to set active.
   */
  async setActiveNetwork(evmNetworkClientId: NetworkClientId): Promise<void>;

  async setActiveNetwork(
    id: SupportedCaipChainId | NetworkClientId,
  ): Promise<void> {
    if (isCaipChainId(id)) {
      const isSupportedCaipChainId = checkIfSupportedCaipChainId(id);
      if (!isSupportedCaipChainId) {
        throw new Error(`Unsupported Caip chain ID: ${id}`);
      }
      this.#setActiveNonEvmNetwork(id);
    } else {
      this.#setActiveEvmNetwork(id);
    }
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
