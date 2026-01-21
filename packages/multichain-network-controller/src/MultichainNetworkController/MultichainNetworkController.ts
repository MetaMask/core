import { BaseController } from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkClientId } from '@metamask/network-controller';
import { isCaipChainId } from '@metamask/utils';
import type { CaipChainId } from '@metamask/utils';

import {
  toAllowedCaipAccountIds,
  toActiveNetworksByAddress,
} from '../api/accounts-api';
import type { ActiveNetworksByAddress } from '../api/accounts-api';
import {
  AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS,
  MULTICHAIN_NETWORK_CONTROLLER_METADATA,
  getDefaultMultichainNetworkControllerState,
} from '../constants';
import type { AbstractMultichainNetworkService } from '../MultichainNetworkService/AbstractMultichainNetworkService';
import { MULTICHAIN_NETWORK_CONTROLLER_NAME } from '../types';
import type {
  MultichainNetworkControllerState,
  MultichainNetworkControllerMessenger,
  SupportedCaipChainId,
} from '../types';
import {
  checkIfSupportedCaipChainId,
  getChainIdForNonEvm,
  convertEvmCaipToHexChainId,
  isEvmCaipChainId,
} from '../utils';

/**
 * The MultichainNetworkController is responsible for fetching and caching account
 * balances.
 */
export class MultichainNetworkController extends BaseController<
  typeof MULTICHAIN_NETWORK_CONTROLLER_NAME,
  MultichainNetworkControllerState,
  MultichainNetworkControllerMessenger
> {
  readonly #networkService: AbstractMultichainNetworkService;

  constructor({
    messenger,
    state,
    networkService,
  }: {
    messenger: MultichainNetworkControllerMessenger;
    state?: Omit<
      Partial<MultichainNetworkControllerState>,
      'multichainNetworkConfigurationsByChainId'
    >;
    networkService: AbstractMultichainNetworkService;
  }) {
    super({
      messenger,
      name: MULTICHAIN_NETWORK_CONTROLLER_NAME,
      metadata: MULTICHAIN_NETWORK_CONTROLLER_METADATA,
      state: {
        ...getDefaultMultichainNetworkControllerState(),
        ...state,
        // We can keep the current network as a hardcoded value
        // since it is not expected to add/remove networks yet.
        multichainNetworkConfigurationsByChainId:
          AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS,
      },
    });

    this.#networkService = networkService;
    this.#subscribeToMessageEvents();
    this.#registerMessageHandlers();
  }

  /**
   * Sets the active EVM network.
   *
   * @param id - The client ID of the EVM network to set active.
   */
  async #setActiveEvmNetwork(id: NetworkClientId): Promise<void> {
    const { selectedNetworkClientId } = this.messenger.call(
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
      await this.messenger.call('NetworkController:setActiveNetwork', id);
    }

    // Only publish the networkDidChange event if either the EVM network is different or we're switching between EVM and non-EVM networks
    if (shouldSetEvmActive || shouldNotifyNetworkChange) {
      this.messenger.publish(
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
    this.messenger.publish('MultichainNetworkController:networkDidChange', id);
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
   * Returns the active networks for the available EVM addresses (non-EVM networks will be supported in the future).
   * Fetches the data from the API and caches it in state.
   *
   * @returns A promise that resolves to the active networks for the available addresses
   */
  async getNetworksWithTransactionActivityByAccounts(): Promise<ActiveNetworksByAddress> {
    // TODO: We are filtering out non-EVN accounts for now
    // Support for non-EVM networks will be added in the coming weeks
    const evmAccounts = this.messenger
      .call('AccountsController:listMultichainAccounts')
      .filter((account) => isEvmAccountType(account.type));

    if (!evmAccounts || evmAccounts.length === 0) {
      return this.state.networksWithTransactionActivity;
    }

    const formattedAccounts = evmAccounts
      .map((account: InternalAccount) => toAllowedCaipAccountIds(account))
      .flat();

    const activeNetworks =
      await this.#networkService.fetchNetworkActivity(formattedAccounts);
    const formattedNetworks = toActiveNetworksByAddress(activeNetworks);

    this.update((state) => {
      state.networksWithTransactionActivity = formattedNetworks;
    });

    return this.state.networksWithTransactionActivity;
  }

  /**
   * Removes an EVM network from the list of networks.
   * This method re-directs the request to the network-controller.
   *
   * @param chainId - The chain ID of the network to remove.
   * @returns - A promise that resolves when the network is removed.
   */
  async #removeEvmNetwork(chainId: CaipChainId): Promise<void> {
    const hexChainId = convertEvmCaipToHexChainId(chainId);
    const selectedChainId = this.messenger.call(
      'NetworkController:getSelectedChainId',
    );

    if (selectedChainId === hexChainId) {
      // If a non-EVM network is selected, we can delete the currently EVM selected network, but
      // we automatically switch to EVM mainnet.
      const ethereumMainnetHexChainId = '0x1'; // TODO: Should probably be a constant.
      const clientId = this.messenger.call(
        'NetworkController:findNetworkClientIdByChainId',
        ethereumMainnetHexChainId,
      );

      await this.messenger.call('NetworkController:setActiveNetwork', clientId);
    }

    this.messenger.call('NetworkController:removeNetwork', hexChainId);
  }

  /**
   * Removes a non-EVM network from the list of networks.
   * This method is not supported and throws an error.
   *
   * @param _chainId - The chain ID of the network to remove.
   * @throws - An error indicating that removal of non-EVM networks is not supported.
   */
  #removeNonEvmNetwork(_chainId: CaipChainId): void {
    throw new Error('Removal of non-EVM networks is not supported');
  }

  /**
   * Removes a network from the list of networks.
   * It only supports EVM networks.
   *
   * @param chainId - The chain ID of the network to remove.
   * @returns - A promise that resolves when the network is removed.
   */
  async removeNetwork(chainId: CaipChainId): Promise<void> {
    if (isEvmCaipChainId(chainId)) {
      return await this.#removeEvmNetwork(chainId);
    }

    return this.#removeNonEvmNetwork(chainId);
  }

  /**
   * Handles switching between EVM and non-EVM networks when an account is changed
   *
   * @param account - The account that was changed
   */
  #handleOnSelectedAccountChange(account: InternalAccount): void {
    const { type: accountType, scopes } = account;
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
    if (scopes.includes(this.state.selectedMultichainNetworkChainId)) {
      // No need to update if the account's scope includes the active network
      this.update((state) => {
        state.isEvmSelected = false;
      });
      return;
    }

    const nonEvmChainId = getChainIdForNonEvm(scopes);
    this.update((state) => {
      state.selectedMultichainNetworkChainId = nonEvmChainId;
      state.isEvmSelected = false;
    });

    // No need to publish NetworkController:setActiveNetwork because EVM accounts falls back to use the last selected EVM network
    // DO NOT publish MultichainNetworkController:networkDidChange to prevent circular listener loops
  }

  /**
   * Subscribes to message events.
   */
  #subscribeToMessageEvents(): void {
    // Handle network switch when account is changed
    this.messenger.subscribe(
      'AccountsController:selectedAccountChange',
      (account) => this.#handleOnSelectedAccountChange(account),
    );
  }

  /**
   * Registers message handlers.
   */
  #registerMessageHandlers(): void {
    this.messenger.registerActionHandler(
      'MultichainNetworkController:setActiveNetwork',
      this.setActiveNetwork.bind(this),
    );
    this.messenger.registerActionHandler(
      'MultichainNetworkController:getNetworksWithTransactionActivityByAccounts',
      this.getNetworksWithTransactionActivityByAccounts.bind(this),
    );
  }
}
