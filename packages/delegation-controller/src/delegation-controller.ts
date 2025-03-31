import { BaseController } from '@metamask/base-controller';
import type { StateMetadata } from '@metamask/base-controller';
import type { Hex } from '@metamask/utils';
import { getDelegationHashOffchain } from '@metamask-private/delegator-core-viem';
import type { Address } from 'viem';

import type {
  DelegationControllerMessenger,
  DelegationControllerState,
  DelegationEntry,
} from './types';
import { parseDelegation } from './utils';

export const controllerName = 'DelegationController';

export type AllowedActions = SignatureControllerSignDelegationAction;

type FilterByHash = {
  hash: Hex;
};

type FilterByDelegator = {
  delegator: Address;
  delegate?: Address;
  label?: string;
  chains?: number[];
};

type FilterByDelegate = {
  delegate: Address;
  delegator?: Address;
  label?: string;
  chains?: number[];
};

type DelegationFilter = FilterByHash | FilterByDelegator | FilterByDelegate;

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

  sign(
    delegation: Delegation,
    options?: { skipConfirmation: boolean } = {
      skipConfirmation: false,
    },
  ) {
    const parsed = parseDelegation(delegation);
    this.messagingSystem.call(`SignatureController:signDelegation`);
  }

  /**
   * Stores a delegation entry in the controller state.
   *
   * @param entry - The delegation entry to add.
   * @param entry.data - The delegation data.
   * @param entry.meta - The delegation metadata.
   * @param skipConfirmation
   */
  store(entry: DelegationEntry, skipConfirmation = false) {
    const { data, meta } = entry;
    const hash = getDelegationHashOffchain({
      ...data,
      salt: BigInt(data.salt),
    });
    this.update((state) => {
      state.delegations[hash] = {
        data,
        meta,
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

    if (filter.chains && filter.chains.length > 0) {
      list = list.filter((entry) =>
        filter.chains?.some((chain) => entry.meta.chains.includes(chain)),
      );
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
