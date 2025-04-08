import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { isAddressEqual } from 'viem';

import {
  type Delegation,
  getDelegationHashOffchain,
  ROOT_AUTHORITY,
} from './sdk';
import type {
  Address,
  DelegationControllerMessenger,
  DelegationControllerState,
  DelegationEntry,
  DelegationFilter,
  Hex,
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
   * @param entry - The delegation entry to store.
   */
  store(entry: DelegationEntry) {
    const hash = getDelegationHashOffchain(entry.data);
    this.update((state) => {
      state.delegations[hash] = entry;
    });
  }

  /**
   * Lists delegation entries.
   *
   * @param filter - The filter to use to list the delegation entries.
   * @returns A list of delegation entries that match the filter.
   */
  list(filter?: DelegationFilter) {
    const account = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );
    const requester = account.address as Address;

    let list: DelegationEntry[] = Object.values(this.state.delegations);

    if (filter?.from) {
      list = list.filter((entry) =>
        isAddressEqual(entry.data.delegator, filter.from as Address),
      );
    }

    if (
      !filter?.from ||
      (filter?.from && !isAddressEqual(filter.from, requester))
    ) {
      list = list.filter((entry) =>
        isAddressEqual(entry.data.delegate, requester),
      );
    }

    if (filter?.chainId) {
      list = list.filter((entry) => entry.chainId === filter.chainId);
    }

    if (filter?.tags) {
      list = list.filter((entry) =>
        entry.tags.some((tag) => filter.tags?.includes(tag)),
      );
    }

    return list;
  }

  /**
   * Retrieves the delegation entry for a given delegation hash.
   *
   * @param hash - The hash of the delegation to retrieve.
   * @returns The delegation entry, or null if not found.
   */
  retrieve(hash: Hex) {
    return this.state.delegations[hash] ?? null;
  }

  /**
   * Retrieves a delegation chain from a delegation hash.
   *
   * @param hash - The hash of the delegation to retrieve.
   * @returns The delegation chain, or null if not found.
   */
  chain(hash: Hex) {
    const chain: DelegationEntry[] = [];

    const entry = this.retrieve(hash);
    if (!entry) {
      return null;
    }
    chain.push(entry);

    for (let _hash = entry.data.authority; _hash !== ROOT_AUTHORITY; ) {
      const parent = this.retrieve(_hash);
      if (!parent) {
        throw new Error('Invalid delegation chain');
      }
      chain.push(parent);
      _hash = parent.data.authority;
    }

    return chain;
  }

  /**
   * Deletes a delegation entrie from storage, along with any other entries
   * that are redelegated from it.
   *
   * @param hash - The hash of the delegation to delete.
   * @returns The number of entries deleted.
   */
  delete(hash: Hex): number {
    const root = this.retrieve(hash);
    if (!root) {
      return 0;
    }

    const list = Object.values(this.state.delegations);

    let count = 0;
    const nextHashes: Hex[] = [hash];

    while (nextHashes.length > 0) {
      const nextHash = nextHashes.pop();
      if (nextHash === undefined) {
        // this should never happen
        continue;
      }

      list.forEach((entry) => {
        if (entry.data.authority === nextHash) {
          nextHashes.push(entry.data.authority);
        }
      });

      this.update((state) => {
        delete state.delegations[nextHash];
      });
      count += 1;
    }

    return count;
  }
}
