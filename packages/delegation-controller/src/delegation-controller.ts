import { BaseController } from '@metamask/base-controller';
import type { StateMetadata } from '@metamask/base-controller';
import type { DelegationStruct } from '@metamask-private/delegator-core-viem';
import { getDelegationHashOffchain } from '@metamask-private/delegator-core-viem';

import type {
  Delegation,
  DelegationControllerMessenger,
  DelegationControllerState,
} from './types';

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

  /**
   * Adds a delegation to the controller state.
   *
   * @param delegation - The delegation to add.
   */
  addDelegation(delegation: Delegation) {
    const hash = getDelegationHashOffchain({
      ...delegation,
      salt: BigInt(delegation.salt),
    });
    this.update((state) => {
      state.delegations[hash] = {
        ...delegation,
        salt: delegation.salt.toString(),
      };
    });
  }
}
