import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { hexToNumber } from '@metamask/utils';

import { ROOT_AUTHORITY } from './constants';
import type {
  Address,
  Delegation,
  DelegationControllerMessenger,
  DelegationControllerState,
  DelegationEntry,
  DelegationFilter,
  Hex,
  UnsignedDelegation,
} from './types';
import { createTypedMessageParams, isHexEqual } from './utils';

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
function getDefaultDelegationControllerState(): DelegationControllerState {
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
  private readonly hashDelegation: (delegation: Delegation) => Hex;

  constructor({
    messenger,
    state,
    hashDelegation,
  }: {
    messenger: DelegationControllerMessenger;
    state?: Partial<DelegationControllerState>;
    hashDelegation: (delegation: Delegation) => Hex;
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
    this.hashDelegation = hashDelegation;
  }

  /**
   * Signs a delegation.
   *
   * @param params - The parameters for signing the delegation.
   * @param params.delegation - The delegation to sign.
   * @param params.chainId - The chainId of the chain to sign the delegation for.
   * @param params.verifyingContract - The address of the verifying contract (DelegationManager).
   * @returns The signature of the delegation.
   */
  async signDelegation(params: {
    delegation: UnsignedDelegation;
    chainId: Hex;
    verifyingContract: Address;
  }) {
    const { delegation, verifyingContract, chainId } = params;

    const account = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );

    const data = createTypedMessageParams({
      chainId: hexToNumber(chainId),
      from: account.address as Address,
      delegation: {
        ...delegation,
        signature: '0x',
      },
      verifyingContract,
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
   * @param params - The parameters for storing the delegation.
   * @param params.entry - The delegation entry to store.
   */
  store(params: { entry: DelegationEntry }) {
    const { entry } = params;
    const hash = this.hashDelegation(entry.delegation);

    // If the authority is not the root authority, validate that the
    // parent entry does exist.
    if (
      !isHexEqual(entry.delegation.authority, ROOT_AUTHORITY) &&
      !this.state.delegations[entry.delegation.authority]
    ) {
      throw new Error('Invalid authority');
    }
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
        isHexEqual(entry.delegation.delegator, filter.from as Address),
      );
    }

    if (
      !filter?.from ||
      (filter?.from && !isHexEqual(filter.from, requester))
    ) {
      list = list.filter((entry) =>
        isHexEqual(entry.delegation.delegate, requester),
      );
    }

    const filterChainId = filter?.chainId;
    if (filterChainId) {
      list = list.filter((entry) => isHexEqual(entry.chainId, filterChainId));
    }

    const tags = filter?.tags;
    if (tags && tags.length > 0) {
      // Filter entries that contain all of the filter tags
      list = list.filter((entry) =>
        tags.every((tag) => entry.tags.includes(tag)),
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

    for (let _hash = entry.delegation.authority; _hash !== ROOT_AUTHORITY; ) {
      const parent = this.retrieve(_hash);
      if (!parent) {
        throw new Error('Invalid delegation chain');
      }
      chain.push(parent);
      _hash = parent.delegation.authority;
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

    const entries = Object.entries(this.state.delegations);
    let count = 0;
    const nextHashes: Hex[] = [hash];
    const deletedHashes: Hex[] = [];

    while (nextHashes.length > 0) {
      const currentHash = nextHashes.pop() as Hex;

      // Find all delegations that have this hash as their authority
      const children = entries.filter(
        ([_, v]) => v.delegation.authority === currentHash,
      );

      // Add the hashes of all child delegations to be processed next
      children.forEach(([k]) => {
        nextHashes.push(k as Hex);
      });

      deletedHashes.push(currentHash);
      count += 1;
    }

    // Delete delegations
    this.update((state) => {
      deletedHashes.forEach((h) => {
        delete state.delegations[h];
      });
    });

    return count;
  }
}
