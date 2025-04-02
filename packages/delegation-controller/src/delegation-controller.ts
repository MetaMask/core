import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { TypedMessageParams } from '@metamask/keyring-controller';
import { SignTypedDataVersion } from '@metamask/keyring-controller';

import { SIGNABLE_DELEGATION_TYPED_DATA } from './constants';
import { getDelegationHashOffchain, getDeleGatorEnvironment } from './sdk';
import type {
  Delegation,
  DelegationControllerMessenger,
  DelegationControllerState,
  DelegationEntry,
  DelegationFilter,
} from './types';
import { parseDelegation } from './utils';

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

  async sign(delegation: Delegation) {
    // TODO: Obtain this from `NetworkController:getSelectedChainId` once
    // available.
    const chainId = 11155111; // sepolia

    const account = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );

    if (!chainId || !account) {
      throw new Error('No chainId or account selected');
    }

    const delegatorEnv = getDeleGatorEnvironment(chainId);

    const data: TypedMessageParams = {
      data: {
        types: SIGNABLE_DELEGATION_TYPED_DATA,
        primaryType: 'Delegation',
        domain: {
          chainId,
          name: 'DelegationManager',
          version: '1',
          verifyingContract: delegatorEnv.DelegationManager,
        },
        message: delegation,
      },
      from: account.address,
    };

    const signature: string = await this.messagingSystem.call(
      'KeyringController:signTypedMessage',
      data,
      SignTypedDataVersion.V4,
    );

    return signature;
  }

  store(delegation: Delegation) {
    const hash = getDelegationHashOffchain(parseDelegation(delegation));
    this.update((state) => {
      state.delegations[hash] = {
        data: delegation,
        meta: {
          label: '',
          chainId: 1,
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
   * Deletes delegation entries from the controller state.
   *
   * @param filter - The filter to use to delete the delegation entries.
   * @returns A list of delegation entries that were deleted.
   */
  delete(filter: DelegationFilter): DelegationEntry[] {
    const list = this.retrieve(filter);
    const deleted: DelegationEntry[] = [];
    list.forEach((entry) => {
      const hash = getDelegationHashOffchain(parseDelegation(entry.data));
      deleted.push(entry);
      delete this.state.delegations[hash];
    });
    return deleted;
  }
}
