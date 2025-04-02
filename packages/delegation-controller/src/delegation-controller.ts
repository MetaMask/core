import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { SignTypedDataVersion } from '@metamask/keyring-controller';

import { getDelegationHash } from './sdk';
import type {
  Address,
  Delegation,
  DelegationControllerMessenger,
  DelegationControllerState,
  DelegationEntry,
  DelegationFilter,
} from './types';
import { createTypedMessageParams } from './utils';

export const controllerName = 'DelegationController';

const delegationControllerMetadata = {
  delegations: {
    persist: true,
    anonymous: false,
  },
} satisfies StateMetadata<DelegationControllerState>;

/**
 * Constructs the default {@link DelegationController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link DelegationController} state.
 */
export function getDefaultDelegationControllerState(): DelegationControllerState {
  return {
    delegations: {},
  };
}

/**
 * The {@link DelegationController} class.
 * This controller is meant to be a centralized place to store and sign delegations.
 */
export class DelegationController extends BaseController<
  typeof controllerName,
  DelegationControllerState,
  DelegationControllerMessenger
> {
  constructor({
    messenger,
    state,
  }: {
    messenger: DelegationControllerMessenger;
    state?: Partial<DelegationControllerState>;
  }) {
    super({
      messenger,
      metadata: delegationControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultDelegationControllerState(),
        ...state,
      },
    });
  }

  /**
   * Signs a delegation.
   *
   * @param delegation - The delegation to sign.
   * @returns The signature of the delegation.
   */
  async sign(delegation: Delegation) {
    // TODO: Obtain this from `NetworkController:getSelectedChainId` once
    // available.
    // Ref: https://github.com/MetaMask/metamask-extension/issues/31150
    const chainId = 11155111; // sepolia

    const account = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );

    if (!chainId || !account) {
      throw new Error('No chainId or account selected');
    }

    const data = createTypedMessageParams({
      chainId,
      from: account.address as Address,
      delegation,
    });

    // TODO:: Replace with `SignatureController:newUnsignedTypedMessage`.
    // Waiting on confirmations team to implement this.
    const signature: string = await this.messagingSystem.call(
      'KeyringController:signTypedMessage',
      data,
      SignTypedDataVersion.V4,
    );

    return signature;
  }

  /**
   * Stores a delegation in storage.
   *
   * @param delegation - The delegation to store.
   */
  store(delegation: Delegation) {
    const hash = getDelegationHash(delegation);
    this.update((state) => {
      state.delegations[hash] = {
        data: delegation,
        meta: {
          label: '',
          // TODO: Obtain this from `NetworkController:getSelectedChainId` once
          // available.
          // Ref: https://github.com/MetaMask/metamask-extension/issues/31150
          chainId: 11155111,
        },
      };
    });
  }

  /**
   * Retrieves the delegation entry for a given delegation hash.
   *
   * @param filter - The filter to use to retrieve the delegation entry.
   * @returns A list of delegation entries that match the filter.
   */
  retrieve(filter: DelegationFilter) {
    if ('hash' in filter) {
      const delegation = this.state.delegations[filter.hash];
      if (!delegation) {
        return [];
      }
      return [delegation];
    }

    let list: DelegationEntry[] = [];

    if ('delegator' in filter) {
      list = Object.values(this.state.delegations).filter(
        (entry) => entry.data.delegator === filter.delegator,
      );
      if (filter.delegate) {
        list = list.filter((entry) => entry.data.delegate === filter.delegate);
      }
    } else if ('delegate' in filter) {
      list = Object.values(this.state.delegations).filter(
        (entry) => entry.data.delegate === filter.delegate,
      );
      if (filter.delegator) {
        list = list.filter(
          (entry) => entry.data.delegator === filter.delegator,
        );
      }
    }

    if (filter.label) {
      list = list.filter((entry) => entry.meta.label === filter.label);
    }

    return list;
  }

  /**
   * Deletes delegation entries from storage.
   *
   * @param filter - The filter to use to delete the delegation entries.
   * @returns A list of delegation entries that were deleted.
   */
  delete(filter: DelegationFilter): DelegationEntry[] {
    const list = this.retrieve(filter);
    const deleted: DelegationEntry[] = [];
    list.forEach((entry) => {
      const hash = getDelegationHash(entry.data);
      deleted.push(entry);
      delete this.state.delegations[hash];
    });
    return deleted;
  }
}
