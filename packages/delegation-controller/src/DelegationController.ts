import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import { hexToNumber } from '@metamask/utils';

import type {
  DelegationControllerMessenger,
  DelegationControllerState,
  DeleGatorEnvironment,
  Hex,
  UnsignedDelegation,
} from './types';
import { createTypedMessageParams } from './utils';

export const controllerName = 'DelegationController';

const MESSENGER_EXPOSED_METHODS = ['signDelegation'] as const;

const delegationControllerMetadata =
  {} satisfies StateMetadata<DelegationControllerState>;

/**
 * Constructs the default {@link DelegationController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link DelegationController} state.
 */
function getDefaultDelegationControllerState(): DelegationControllerState {
  return {};
}

/**
 * The {@link DelegationController} class.
 * This controller signs delegations via the keyring (typed-data signing).
 */
export class DelegationController extends BaseController<
  typeof controllerName,
  DelegationControllerState,
  DelegationControllerMessenger
> {
  readonly #getDelegationEnvironment: (chainId: Hex) => DeleGatorEnvironment;

  /**
   * Constructs a new {@link DelegationController} instance.
   *
   * @param params - The parameters for constructing the controller.
   * @param params.messenger - The messenger instance to use for the controller.
   * @param params.state - The initial state for the controller.
   * @param params.getDelegationEnvironment - A function to get the delegation environment for a given chainId.
   */
  constructor({
    messenger,
    state,
    getDelegationEnvironment,
  }: {
    messenger: DelegationControllerMessenger;
    state?: Partial<DelegationControllerState>;
    getDelegationEnvironment: (chainId: Hex) => DeleGatorEnvironment;
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
    this.#getDelegationEnvironment = getDelegationEnvironment;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Signs a delegation.
   *
   * @param params - The parameters for signing the delegation.
   * @param params.delegation - The delegation to sign.
   * @param params.chainId - The chainId of the chain to sign the delegation for.
   * @returns The signature of the delegation.
   */
  async signDelegation(params: {
    delegation: UnsignedDelegation;
    chainId: Hex;
  }) {
    const { delegation, chainId } = params;
    const { DelegationManager } = this.#getDelegationEnvironment(chainId);

    const data = createTypedMessageParams({
      chainId: hexToNumber(chainId),
      from: delegation.delegator,
      delegation: {
        ...delegation,
        signature: '0x',
      },
      verifyingContract: DelegationManager,
    });

    // TODO:: Replace with `SignatureController:newUnsignedTypedMessage`.
    // Waiting on confirmations team to implement this.
    const signature: string = await this.messenger.call(
      'KeyringController:signTypedMessage',
      data,
      SignTypedDataVersion.V4,
    );

    return signature;
  }
}
